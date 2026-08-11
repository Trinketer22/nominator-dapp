import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react';
import { Address } from '@ton/core';

import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/lib/router';
import type { Network } from '@/lib/router';
import { prettyError } from '@/lib/errors';
import { invalidatePoolQueries } from '@/lib/query-keys';
import { getPoolOwner, makeSender, requireOwner } from '@/lib/pool';
import { tonscanTxUrl } from '@/lib/ton';
import {
  getWalletBaselineLt,
  waitForRefund,
  type RefundOutcome,
} from '@/lib/refund';

export interface RunOptions {
  ownerOnly?: boolean;
  awaitRefund?: boolean;
  waitFn?: (
    network: Network,
    wallet: string,
    poolAddress: string,
    baselineLt: bigint,
  ) => Promise<RefundOutcome>;
}

export interface PoolOpsApi {
  network: Network;
  poolAddress: string;
  wallet: string;
  sender: NonNullable<ReturnType<typeof makeSender>>;
  isOwner: boolean;
  busy: boolean;
  run: (
    name: string,
    fn: () => Promise<void>,
    opts?: RunOptions,
  ) => Promise<void>;
}

const PoolOpsContext = createContext<PoolOpsApi | null>(null);

export function usePoolOps(): PoolOpsApi {
  const ctx = useContext(PoolOpsContext);
  if (!ctx) throw new Error('usePoolOps must be used within PoolOpsProvider');
  return ctx;
}

// Renders the "connect wallet" prompt while there is no sender, otherwise
// provides the operation runner + owner check to all sub-panels. Keeping
// `run` (and its toast/refund/invalidation logic) here means each sub-panel
// stays focused on its own form state.
export function PoolOpsProvider({
  poolAddress,
  children,
}: {
  poolAddress: string;
  children: ReactNode;
}) {
  const { network } = useRouter();
  const wallet = useTonAddress();
  const restored = useIsConnectionRestored();
  const queryClient = useQueryClient();
  const [tc] = useTonConnectUI();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const sender = useMemo(
    () => (tc && wallet && tc.account ? makeSender(tc, network) : null),
    [tc, network, wallet],
  );

  // getPoolOwner's get-method throws when the contract is not deployed, so a
  // failed query means the pool doesn't exist at this address. Surfaced here
  // (centrally, like the wallet-not-connected check below) so every operation
  // panel is gated at once instead of each one showing "(not owner)".
  const {
    data: poolOwner,
    isError: poolNotDeployed,
    isPending: poolOwnerPending,
  } = useQuery({
    queryKey: ['pool-owner', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getPoolOwner(network, poolAddress),
  });
  const isOwner = !!(
    poolOwner &&
    wallet &&
    poolOwner.equals(Address.parse(wallet))
  );

  // Runs an operation. Owner-only operations are gated on requireOwner and
  // wait for the pool's RefundMessage reply, decoding the errorCode into a
  // human-readable report. Add Funds just tops up the balance (no refund, not
  // owner-only), so it only confirms the send. OwnerWithdrawal sends
  // OwnerWithdrawalSuccess on success instead of RefundMessage, so a custom
  // waitFn can be passed to handle that.
  async function run(
    name: string,
    fn: () => Promise<void>,
    opts: RunOptions = {},
  ) {
    const { ownerOnly = true, awaitRefund = true } = opts;
    if (!sender) {
      toast.error('Connect your wallet first.');
      return;
    }
    if (!poolAddress) {
      toast.error('Pool address is required.');
      return;
    }
    setBusy(true);
    const pendingId = toast.pending(`Working: ${name}...`);
    try {
      if (ownerOnly) {
        await requireOwner(network, poolAddress, wallet);
      }
      // Snapshot the wallet's latest tx lt before sending so the refund poll
      // only picks up messages that arrive after this send.
      const baselineLt = awaitRefund
        ? await getWalletBaselineLt(network, wallet)
        : 0n;
      await fn();

      if (!awaitRefund) {
        toast.dismiss(pendingId);
        toast.info(
          `${name} transaction sent. The pool balance will update once the network confirms.`,
        );
      } else {
        toast.update(
          pendingId,
          `${name} transaction sent. Waiting for the pool to confirm on-chain...`,
        );
        const wait = opts.waitFn ?? waitForRefund;
        const result = await wait(network, wallet, poolAddress, baselineLt);
        toast.dismiss(pendingId);
        if ('timeout' in result) {
          toast.warn(
            <>
              {`${name} transaction sent, but no refund was received within the timeout. `}
              {result.sendTxHash ? (
                <a
                  href={tonscanTxUrl(network, result.sendTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary break-all"
                >
                  {tonscanTxUrl(network, result.sendTxHash)}
                </a>
              ) : (
                'Verify the result in a block explorer.'
              )}
            </>,
          );
        } else if (result.ok) {
          toast.info(
            `${name} succeeded on-chain (${result.opName}, queryId ${result.queryId}).`,
          );
        } else {
          toast.error(
            <>
              {`${name} was rejected by the contract: ${result.errorLabel} ` +
                `(code ${result.errorCode}, op ${result.opName}). `}
              {result.sendTxHash && (
                <a
                  href={tonscanTxUrl(network, result.sendTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary break-all"
                >
                  {tonscanTxUrl(network, result.sendTxHash)}
                </a>
              )}
            </>,
          );
        }
      }
      // The transaction has been sent and confirmed on-chain (the refund
      // poller above awaits the pool's reply before reaching here), so a
      // single immediate invalidation is enough to refetch updated state.
      invalidatePoolQueries(queryClient, network, poolAddress);
    } catch (e) {
      toast.dismiss(pendingId);
      toast.error(prettyError(name, e));
    } finally {
      setBusy(false);
    }
  }

  if (!sender) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">
          {restored
            ? 'Connect your wallet to perform pool operations.'
            : 'Restoring wallet connection...'}
        </p>
      </div>
    );
  }

  if (poolNotDeployed) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">
          No pool is deployed at this address. Use the Deploy &amp; Init tab to
          create one.
        </p>
      </div>
    );
  }

  if (poolOwnerPending) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">Loading pool...</p>
      </div>
    );
  }

  const api: PoolOpsApi = {
    network,
    poolAddress,
    wallet,
    sender,
    isOwner,
    busy,
    run,
  };

  return (
    <PoolOpsContext.Provider value={api}>{children}</PoolOpsContext.Provider>
  );
}
