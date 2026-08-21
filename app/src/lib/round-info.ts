import { Cell, type Address } from '@ton/core';

import { RoundInfoMessage, StakeReturned } from '@wrappers/Pool.gen';
import { getToncenterV3, toRawAddress, type V3Message } from './toncenter-v3';
import { getPoolData } from './pool';
import type { Network } from './router';

// Opcodes for the pool's round/validator log messages — see
// contracts/messages.tolk. The pool sends a RoundInfoMessage to the owner when
// a round rotates, and a StakeReturned to each validator when its stake is
// recovered. Both carry `used`/`returned` totals the admin panel surfaces.
export const ROUND_INFO_OPCODE = 0xe4649054; // RoundInfoMessage
export const STAKE_RETURNED_OPCODE = 0xd6d1ff31; // StakeReturned

// How deep the round history goes: ~100 rounds (~2 months) is far deeper than
// anyone needs. One RoundInfoMessage per round; StakeReturned is one per
// validator recovery (max 32 validators per round, plus rotation re-stakes).
export const MAX_ROUND_INFO_ROWS = 100;
export const MAX_STAKE_RETURNED_ROWS = 3200;

export interface RoundInfoEntry {
  roundIndex: bigint;
  used: bigint; // nanoTON
  returned: bigint; // nanoTON
  queryId: bigint;
  createdAt: number; // unix seconds
  lt: bigint;
  txHash: string;
  // `true` for the pool's live cur/prev rounds read from storage, which have
  // not yet been finalized into a RoundInfoMessage (so no tx/lt/timestamp).
  live?: boolean;
}

export interface StakeReturnedEntry {
  validator: Address;
  used: bigint; // nanoTON
  returned: bigint; // nanoTON
  queryId: bigint;
  createdAt: number; // unix seconds
  lt: bigint;
  txHash: string;
}

// Aggregate per-validator totals derived from StakeReturned events.
export interface ValidatorRoundStats {
  validator: string; // raw address
  events: number;
  totalUsed: bigint;
  totalReturned: bigint;
  lastEventAt: number;
}

// Decode a message body cell from a toncenter v3 `Message.message_content`.
// `body` is a base64-encoded BOC; fall back to hex for robustness. Returns null
// if the body is missing or undecodable so callers can skip the row.
function bodyCell(msg: V3Message): Cell | null {
  const body = msg.message_content?.body;
  if (!body) return null;
  try {
    return Cell.fromBase64(body);
  } catch {
    try {
      return Cell.fromHex(body);
    } catch {
      return null;
    }
  }
}

// Fetch RoundInfoMessage events sent by the pool to the owner. These are
// emitted by Storage.finalizeRound (contracts/Pool.tolk) when a round rotates,
// one per completed round, carrying the round's aggregate used/returned totals.
// Fetched newest-first so that, if history exceeds maxRows, the recent events
// are kept; the result is reversed to chronological order for downstream use.
export async function getRoundInfos(
  network: Network,
  poolAddress: string,
  ownerAddress: string,
  maxRows = MAX_ROUND_INFO_ROWS,
): Promise<RoundInfoEntry[]> {
  const client = getToncenterV3(network);
  const messages = await client.getMessagesAll(
    {
      source: toRawAddress(poolAddress),
      destination: toRawAddress(ownerAddress),
      opcode: `0x${ROUND_INFO_OPCODE.toString(16)}`,
      sort: 'desc',
      limit: 1000,
    },
    maxRows,
  );
  const out: RoundInfoEntry[] = [];
  for (const msg of messages) {
    const cell = bodyCell(msg);
    if (!cell) continue;
    try {
      const parsed = RoundInfoMessage.fromSlice(cell.beginParse());
      out.push({
        roundIndex: parsed.info.roundIndex,
        used: parsed.info.used,
        returned: parsed.info.returned,
        queryId: parsed.queryId,
        createdAt: Number(msg.created_at),
        lt: BigInt(msg.created_lt),
        txHash: msg.in_msg_tx_hash ?? msg.out_msg_tx_hash ?? msg.hash,
      });
    } catch {
      // Skip malformed/bounced bodies silently — they cannot contribute stats.
    }
  }
  return out.reverse();
}

// Read the pool's live cur/prev rounds directly from storage. These are the
// in-progress rounds that have not yet been finalized into a RoundInfoMessage
// (the current round always, and the previous round until all stakes are
// recovered). Their `used` is what the admin needs to see before any returns
// land. Returns at most two entries (cur first, then prev), deduped by
// roundIndex (cur and prev may temporarily share the same roundIndex right
// after a rotation).
export async function getLiveRounds(
  network: Network,
  poolAddress: string,
): Promise<RoundInfoEntry[]> {
  const data = await getPoolData(network, poolAddress);
  const vd = data.validators.ref;
  const cur = vd.curRound.ref;
  const prev = vd.prevRound.ref;
  const out: RoundInfoEntry[] = [];
  const seen = new Set<bigint>();
  for (const r of [cur, prev]) {
    if (seen.has(r.roundIndex)) continue;
    seen.add(r.roundIndex);
    out.push({
      roundIndex: r.roundIndex,
      used: r.used,
      returned: r.returned,
      queryId: 0n,
      createdAt: 0,
      lt: 0n,
      txHash: '',
      live: true,
    });
  }
  return out;
}

// Merge finalized RoundInfoMessage entries with the pool's live cur/prev
// rounds. Live rounds fill in any roundIndex not present in the indexed set
// (i.e. rounds that haven't rotated/closed yet). Finalized entries take
// precedence for rounds that already have a RoundInfoMessage. Result is sorted
// by roundIndex descending (newest first) for display.
export function mergeRoundInfos(
  indexed: RoundInfoEntry[],
  live: RoundInfoEntry[],
): RoundInfoEntry[] {
  const byIndex = new Map<bigint, RoundInfoEntry>();
  for (const r of indexed) byIndex.set(r.roundIndex, r);
  for (const r of live) {
    if (!byIndex.has(r.roundIndex)) byIndex.set(r.roundIndex, r);
  }
  return [...byIndex.values()].sort((a, b) =>
    a.roundIndex > b.roundIndex ? -1 : a.roundIndex < b.roundIndex ? 1 : 0,
  );
}

// Attribute StakeReturned events to rounds by time window. A finalized round N
// closes at its RoundInfoMessage.createdAt; round N is "open" from the close of
// round N-1 until its own close. The latest live round spans from the last
// finalized round's close time to now. Returns a map keyed by roundIndex.
export function attributeEventsToRounds(
  rounds: RoundInfoEntry[],
  events: StakeReturnedEntry[],
): Map<bigint, StakeReturnedEntry[]> {
  const result = new Map<bigint, StakeReturnedEntry[]>();
  // Build round close-time boundaries, sorted by roundIndex ascending.
  const closed = rounds
    .filter((r) => !r.live)
    .sort((a, b) =>
      a.roundIndex < b.roundIndex ? -1 : a.roundIndex > b.roundIndex ? 1 : 0,
    );
  for (const r of rounds) result.set(r.roundIndex, []);

  for (const e of events) {
    // Find the first closed round whose close time is >= event time — that's
    // the round the event belongs to. If none, it belongs to the latest live
    // round (events after the last close).
    let assigned = false;
    for (const r of closed) {
      if (e.createdAt <= r.createdAt) {
        const list = result.get(r.roundIndex);
        if (list) list.push(e);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      // Assign to the highest roundIndex (the current live round).
      let maxIdx: bigint | null = null;
      for (const r of rounds) {
        if (maxIdx === null || r.roundIndex > maxIdx) maxIdx = r.roundIndex;
      }
      if (maxIdx !== null) {
        const list = result.get(maxIdx);
        if (list) list.push(e);
      }
    }
  }
  return result;
}

// Per-validator aggregate for a single round's StakeReturned events.
export interface RoundValidatorSplit {
  validator: string; // raw address
  events: number;
  used: bigint;
  returned: bigint;
}

export function aggregateRoundSplit(
  events: StakeReturnedEntry[],
): RoundValidatorSplit[] {
  const map = new Map<string, RoundValidatorSplit>();
  for (const e of events) {
    const key = e.validator.toRawString();
    const existing = map.get(key);
    if (existing) {
      existing.events += 1;
      existing.used += e.used;
      existing.returned += e.returned;
    } else {
      map.set(key, {
        validator: key,
        events: 1,
        used: e.used,
        returned: e.returned,
      });
    }
  }
  return [...map.values()].sort((a, b) => (b.returned > a.returned ? 1 : -1));
}

// Fetch StakeReturned messages sent by the pool (optionally to a specific
// validator). These are emitted by the RecoverStake handler (contracts/Pool.tolk)
// when a validator's stake is recovered from the elector, carrying that
// validator's used/returned totals for the just-closed stake. Fetched
// newest-first so that, if history exceeds maxRows, the recent events are kept;
// the result is reversed to chronological order for downstream use. When
// `startUtime` (the close time of the round preceding the displayed window) is
// given, only events strictly after it are returned, so events from rounds
// older than the displayed window are never fetched nor attributed.
export async function getStakeReturneds(
  network: Network,
  poolAddress: string,
  validatorAddress?: string,
  maxRows = MAX_STAKE_RETURNED_ROWS,
  startUtime?: number,
): Promise<StakeReturnedEntry[]> {
  const client = getToncenterV3(network);
  const messages = await client.getMessagesAll(
    {
      source: toRawAddress(poolAddress),
      ...(validatorAddress
        ? { destination: toRawAddress(validatorAddress) }
        : {}),
      opcode: `0x${STAKE_RETURNED_OPCODE.toString(16)}`,
      sort: 'desc',
      limit: 1000,
      ...(startUtime !== undefined ? { start_utime: startUtime } : {}),
    },
    maxRows,
  );
  const out: StakeReturnedEntry[] = [];
  for (const msg of messages) {
    if (startUtime !== undefined && Number(msg.created_at) <= startUtime) {
      continue;
    }
    const cell = bodyCell(msg);
    if (!cell) continue;
    try {
      const parsed = StakeReturned.fromSlice(cell.beginParse());
      out.push({
        validator: parsed.validator,
        used: parsed.used,
        returned: parsed.returned,
        queryId: parsed.queryId,
        createdAt: Number(msg.created_at),
        lt: BigInt(msg.created_lt),
        txHash: msg.in_msg_tx_hash ?? msg.out_msg_tx_hash ?? msg.hash,
      });
    } catch {
      // Skip malformed/bounced bodies silently.
    }
  }
  return out.reverse();
}

// Group StakeReturned events by validator and sum used/returned. Used by the
// panel's per-validator table.
export function aggregateValidatorStats(
  events: StakeReturnedEntry[],
): ValidatorRoundStats[] {
  const map = new Map<string, ValidatorRoundStats>();
  for (const e of events) {
    const key = e.validator.toRawString();
    const existing = map.get(key);
    if (existing) {
      existing.events += 1;
      existing.totalUsed += e.used;
      existing.totalReturned += e.returned;
      if (e.createdAt > existing.lastEventAt)
        existing.lastEventAt = e.createdAt;
    } else {
      map.set(key, {
        validator: key,
        events: 1,
        totalUsed: e.used,
        totalReturned: e.returned,
        lastEventAt: e.createdAt,
      });
    }
  }
  // Most recently active first.
  return [...map.values()].sort((a, b) => b.lastEventAt - a.lastEventAt);
}
