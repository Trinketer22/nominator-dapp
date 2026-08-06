import { Address, type Cell } from '@ton/core';
import { RefundMessage, OwnerWithdrawalSuccess } from '@wrappers/Pool.gen';

import { getTonClient } from './ton';
import {
  BOUNCED_PREFIX,
  INIT_POOL_SUCCESS_OPCODE,
  OWNER_WITHDRAWAL_SUCCESS_OPCODE,
  REFUND_OPCODE,
  describeOp,
  describePoolError,
} from './errors';
import type { Network } from './router';

// The pool reports the outcome of every owner operation (and of NewStake /
// RecoverStake) by sending a RefundMessage back to the message sender. The
// RefundContext carries the original op and a numeric errorCode (0 = success).
// InitPool instead replies with InitPoolSuccess on success, or bounces the
// message back on failure. These helpers poll the sender wallet's recent
// incoming transactions for that reply and decode it into a structured result.

export interface RefundResult {
  ok: boolean;
  op: number;
  opName: string;
  queryId: bigint;
  errorCode: number;
  errorLabel: string;
  // Hash of the wallet's outgoing send transaction (to the pool), captured
  // while polling for the refund. Used to deep-link to an explorer on timeout.
  sendTxHash: string | null;
}

// Outcome of waitForRefund: either a decoded refund result (success or
// contract-rejected), or a timeout carrying the send tx hash so the caller can
// deep-link to an explorer.
export type RefundOutcome =
  | RefundResult
  | { timeout: true; sendTxHash: string | null };

export type InitResult =
  | { status: 'success'; queryId: bigint; sendTxHash: string | null }
  | { status: 'bounced'; sendTxHash: string | null }
  | { status: 'timeout'; sendTxHash: string | null };

interface PoolIncoming {
  opcode: number;
  body: Cell;
  isBounced: boolean;
}

// Capture the wallet's latest transaction lt before sending, so the polling
// loop only considers messages that arrive *after* the send. Returns 0n if the
// wallet has no on-chain history yet (or the lookup fails), in which case every
// incoming message from the pool is considered.
export async function getWalletBaselineLt(
  network: Network,
  wallet: string,
): Promise<bigint> {
  try {
    const client = getTonClient(network);
    const txs = await client.getTransactions(Address.parse(wallet), {
      limit: 1,
    });
    return txs.length > 0 ? txs[0].lt : 0n;
  } catch {
    return 0n;
  }
}

// Polls the wallet's recent transactions for the first incoming internal
// message from the pool that is newer than `baselineLt`. Bounced messages are
// detected by the 0xFFFFFFFF prefix and report the *original* opcode. While
// scanning, also captures the wallet's outgoing send tx to the pool (the tx
// that originated this operation) so callers can deep-link to an explorer even
// when no refund arrives. Returns null on timeout.
async function pollIncomingFromPool(
  network: Network,
  wallet: string,
  poolAddress: string,
  baselineLt: bigint,
  timeoutMs: number,
  intervalMs = 4000,
): Promise<{ incoming: PoolIncoming | null; sendTxHash: string | null }> {
  const client = getTonClient(network);
  const poolAddr = Address.parse(poolAddress);
  const walletAddr = Address.parse(wallet);
  const deadline = Date.now() + timeoutMs;

  let sendTxHash: string | null = null;

  while (Date.now() < deadline) {
    try {
      const txs = await client.getTransactions(walletAddr, { limit: 10 });

      // First pass: capture the wallet's outgoing send tx to the pool.
      // Transactions are returned newest-first, so the refund tx (if present)
      // is iterated before the older send tx. We must scan the whole page for
      // the send tx before returning on a refund match, otherwise we'd miss it.
      if (sendTxHash === null) {
        for (const tx of txs) {
          if (tx.lt <= baselineLt) break;
          for (const out of tx.outMessages.values()) {
            if (
              out.info.type === 'internal' &&
              out.info.dest?.equals(poolAddr)
            ) {
              sendTxHash = tx.hash().toString('hex');
              break;
            }
          }
          if (sendTxHash !== null) break;
        }
      }

      // Second pass: look for the pool's incoming refund/reply message.
      for (const tx of txs) {
        if (tx.lt <= baselineLt) continue;
        const inMsg = tx.inMessage;
        if (!inMsg || inMsg.info.type !== 'internal') continue;
        const src = inMsg.info.src;
        if (!src || !src.equals(poolAddr)) continue;

        const slice = inMsg.body.beginParse();
        const first = Number(slice.loadUint(32));
        if (first === BOUNCED_PREFIX) {
          // Bounced body: 0xFFFFFFFF followed by the original message body
          // (truncated). The next 32 bits are the original opcode.
          const originalOp =
            slice.remainingBits >= 32 ? Number(slice.loadUint(32)) : 0;
          return {
            incoming: { opcode: originalOp, body: inMsg.body, isBounced: true },
            sendTxHash,
          };
        }
        return {
          incoming: { opcode: first, body: inMsg.body, isBounced: false },
          sendTxHash,
        };
      }
    } catch {
      // Transient toncenter / network errors are retried until the deadline.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { incoming: null, sendTxHash };
}

// After an owner operation is sent, wait for the pool's RefundMessage reply and
// decode its errorCode into a human-readable label. On timeout returns
// `{ timeout: true, sendTxHash }` so the caller can deep-link to the send tx
// in an explorer instead of showing a generic "check the explorer" message.
export async function waitForRefund(
  network: Network,
  wallet: string,
  poolAddress: string,
  baselineLt: bigint,
  timeoutMs = 60_000,
): Promise<RefundOutcome> {
  const { incoming, sendTxHash } = await pollIncomingFromPool(
    network,
    wallet,
    poolAddress,
    baselineLt,
    timeoutMs,
  );
  if (!incoming || incoming.isBounced || incoming.opcode !== REFUND_OPCODE) {
    return { timeout: true, sendTxHash };
  }
  const slice = incoming.body.beginParse();
  const refund = RefundMessage.fromSlice(slice);
  const code = Number(refund.context.errorCode);
  const op = Number(refund.context.op);
  return {
    ok: code === 0,
    op,
    opName: describeOp(op),
    queryId: refund.context.queryId,
    errorCode: code,
    errorLabel: code === 0 ? '' : describePoolError(code),
    sendTxHash,
  };
}

// OwnerWithdrawal is special: on success the pool sends OwnerWithdrawalSuccess
// (not RefundMessage), and on error it sends RefundMessage. This waits for
// either message and decodes the result accordingly.
export async function waitForOwnerWithdrawal(
  network: Network,
  wallet: string,
  poolAddress: string,
  baselineLt: bigint,
  timeoutMs = 60_000,
): Promise<RefundOutcome> {
  const { incoming, sendTxHash } = await pollIncomingFromPool(
    network,
    wallet,
    poolAddress,
    baselineLt,
    timeoutMs,
  );
  if (!incoming) return { timeout: true, sendTxHash };

  // Bounced = the original message was rejected (shouldn't normally happen
  // since OwnerWithdrawal handles its own errors via refundError).
  if (incoming.isBounced) return { timeout: true, sendTxHash };

  if (incoming.opcode === OWNER_WITHDRAWAL_SUCCESS_OPCODE) {
    try {
      const slice = incoming.body.beginParse();
      const msg = OwnerWithdrawalSuccess.fromSlice(slice);
      return {
        ok: true,
        op: 0x11c31b99,
        opName: describeOp(0x11c31b99),
        queryId: msg.queryId,
        errorCode: 0,
        errorLabel: '',
        sendTxHash,
      };
    } catch {
      return {
        ok: true,
        op: 0x11c31b99,
        opName: describeOp(0x11c31b99),
        queryId: 0n,
        errorCode: 0,
        errorLabel: '',
        sendTxHash,
      };
    }
  }

  if (incoming.opcode === REFUND_OPCODE) {
    const slice = incoming.body.beginParse();
    const refund = RefundMessage.fromSlice(slice);
    const code = Number(refund.context.errorCode);
    const op = Number(refund.context.op);
    return {
      ok: false,
      op,
      opName: describeOp(op),
      queryId: refund.context.queryId,
      errorCode: code,
      errorLabel: describePoolError(code),
      sendTxHash,
    };
  }

  return { timeout: true, sendTxHash };
}

// InitPool does not use RefundMessage: it replies with InitPoolSuccess on
// success, or bounces the original InitPoolMessage back on failure (the bounce
// body does not carry the exit code, so only success/timeout/bounced is
// distinguished here — pre-send validation covers the specific error cases).
export async function waitForInitResult(
  network: Network,
  wallet: string,
  poolAddress: string,
  baselineLt: bigint,
  timeoutMs = 60_000,
): Promise<InitResult> {
  const { incoming, sendTxHash } = await pollIncomingFromPool(
    network,
    wallet,
    poolAddress,
    baselineLt,
    timeoutMs,
  );
  if (!incoming) return { status: 'timeout', sendTxHash };
  if (incoming.isBounced) return { status: 'bounced', sendTxHash };
  if (incoming.opcode === INIT_POOL_SUCCESS_OPCODE) {
    try {
      const slice = incoming.body.beginParse();
      slice.loadUint(32); // opcode
      const queryId = slice.loadUintBig(64);
      return { status: 'success', queryId, sendTxHash };
    } catch {
      return { status: 'success', queryId: 0n, sendTxHash };
    }
  }
  return { status: 'timeout', sendTxHash };
}
