import { Fragment, useMemo, useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { AddrLink, DataCard } from '@/components/ui/form';
import { useRouter } from '@/lib/router';
import { POOL_REFETCH_INTERVAL_MS } from '@/lib/query-keys';
import { fmtAddr, fmtAddrCompact, getPoolOwner } from '@/lib/pool';
import {
  aggregateRoundSplit,
  aggregateValidatorStats,
  attributeEventsToRounds,
  getLiveRounds,
  getRoundInfos,
  getStakeReturneds,
  mergeRoundInfos,
  type RoundInfoEntry,
  type RoundValidatorSplit,
  type StakeReturnedEntry,
  type ValidatorRoundStats,
} from '@/lib/round-info';

function roundToFrac(nano: bigint, frac: number): string {
  const drop = 9 - frac;
  const pow = 10n ** BigInt(drop);
  const rounded = (nano / pow) * pow;
  return fromNano(rounded);
}

function fmtTon(nano: bigint): string {
  return `${roundToFrac(nano, 2)} GRAM`;
}

function fmtDate(unix: number): string {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Colored profit: green for positive, red for negative, muted for zero.
function Profit({ used, returned }: { used: bigint; returned: bigint }) {
  const delta = returned - used;
  const sign = delta > 0n ? '+' : '';
  const cls =
    delta > 0n
      ? 'text-success'
      : delta < 0n
        ? 'text-destructive'
        : 'text-muted-foreground';
  return (
    <span className={cls}>
      {sign}
      {fmtTon(delta)}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[13px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-2 py-2 text-[12px] font-semibold text-muted-foreground whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = true,
  wrap = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  wrap?: boolean;
}) {
  return (
    <td
      className={`px-2 py-2 text-[13px] border-t overflow-hidden text-ellipsis ${wrap ? 'whitespace-normal' : 'whitespace-nowrap'} ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'font-mono' : ''}`}
    >
      {children}
    </td>
  );
}

// Lightweight inline SVG bar chart — no charting dependency. Each round is a
// pair of bars (used vs returned) scaled to the max value across all visible
// rounds. Live rounds are tinted with the warning color.
// Compact GRAM formatting for axis labels (e.g. "1.2", "0.05", "0").
function fmtAxis(nano: bigint): string {
  const s = fromNano(nano);
  // Trim to at most 4 significant digits to keep labels short.
  const num = Number(s);
  if (!Number.isFinite(num)) return '0';
  if (num === 0) return '0';
  if (Math.abs(num) >= 1000) return num.toFixed(0);
  if (Math.abs(num) >= 100) return num.toFixed(1);
  if (Math.abs(num) >= 10) return num.toFixed(2);
  return num.toFixed(3);
}

// Lightweight inline SVG bar chart — no charting dependency. One profit bar
// per finalized round (returned - used), with a zero baseline. Positive bars
// rise above the baseline (success), negative bars drop below (destructive).
// Live rounds are excluded — their `returned` is incomplete so profit is
// undefined, mirroring the table's `—` for live net.
function RoundsBarChart({ rounds }: { rounds: RoundInfoEntry[] }) {
  const W = 640;
  const H = 200;
  const padL = 48; // room for y-axis labels
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Only finalized rounds have a settled profit; live rounds are skipped.
  const rows = rounds
    .filter((r) => !r.live)
    .sort((a, b) =>
      a.roundIndex > b.roundIndex ? -1 : a.roundIndex < b.roundIndex ? 1 : 0,
    );

  if (rows.length === 0) return null;

  const groupW = plotW / rows.length;

  const profits = rows.map((r) => r.returned - r.used);
  const maxAbs = profits.reduce((m, p) => {
    const a = p < 0n ? -p : p;
    return a > m ? a : m;
  }, 0n);
  const barW = Math.min(groupW * 0.6, 34);
  // Thin x-axis labels when bars are narrow: show one label every `labelStep`
  // bars, keep tick marks for all. Firefox renders SVG text overflow visibly
  // (Chromium clips it), so unlabeled ticks get a short mark instead of text.
  const labelStep = Math.ceil(28 / groupW);
  const labelY = padT + plotH + 16;

  // Zero baseline sits at the vertical midpoint; positive bars go up,
  // negative bars go down. Scale: half-plotH represents maxAbs.
  const baselineY = padT + plotH / 2;
  const scale = maxAbs === 0n ? 0 : plotH / 2 / Number(maxAbs);
  const maxProfit = maxAbs;
  const maxLoss = -maxAbs;

  // y-axis tick positions: top (max profit), zero, bottom (max loss).
  const axisTicks = [
    { y: padT, value: maxProfit, label: `+${fmtAxis(maxProfit)}` },
    { y: baselineY, value: 0n, label: '0' },
    { y: padT + plotH, value: maxLoss, label: fmtAxis(maxLoss) },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Per-round profit bar chart"
    >
      {/* y-axis */}
      <line
        x1={padL}
        y1={padT}
        x2={padL}
        y2={padT + plotH}
        stroke="currentColor"
        className="text-border"
        strokeWidth={1}
      />
      {axisTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL - 4}
            y1={t.y}
            x2={padL}
            y2={t.y}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />
          <text
            x={padL - 6}
            y={t.y + 3}
            textAnchor="end"
            className="fill-muted-foreground font-mono"
            fontSize={9}
          >
            {t.label}
          </text>
        </g>
      ))}
      {/* zero baseline (emphasized) */}
      <line
        x1={padL}
        y1={baselineY}
        x2={padL + plotW}
        y2={baselineY}
        stroke="currentColor"
        className="text-border"
        strokeWidth={1}
      />
      {/* y-axis title */}
      <text
        x={10}
        y={padT + plotH / 2}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={10}
        transform={`rotate(-90 10 ${padT + plotH / 2})`}
      >
        Profit (GRAM)
      </text>
      {rows.map((r, i) => {
        const groupX = padL + i * groupW + groupW / 2;
        const profit = profits[i];
        const label = r.roundIndex.toString();
        const h = Math.abs(Number(profit)) * scale;
        const x = groupX - barW / 2;
        const cls =
          profit > 0n
            ? 'fill-success/80'
            : profit < 0n
              ? 'fill-destructive/80'
              : 'fill-muted-foreground/40';
        const y = profit >= 0n ? baselineY - h : baselineY;
        return (
          <g key={`${r.roundIndex}-${r.lt}`}>
            <rect x={x} y={y} width={barW} height={h} rx={2} className={cls}>
              <title>
                {`Round ${label} profit: ${profit > 0n ? '+' : ''}${fmtTon(profit)}`}
              </title>
            </rect>
            {i % labelStep === 0 ? (
              <text
                x={groupX}
                y={labelY}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                fontSize={10}
              >
                {label.length > 6 ? `${label.slice(0, 5)}…` : label}
              </text>
            ) : (
              <line
                x1={groupX}
                y1={padT + plotH + 4}
                x2={groupX}
                y2={padT + plotH + 8}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Dependency-free SVG donut chart showing each validator's share of total
// positive profit (returned - used). Validators with zero/loss net are
// excluded — a pie can't represent negative slices. Each slice is colored
// from a fixed palette and labeled with its percentage of the total.
const PIE_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f43f5e',
  '#8b5cf6',
  '#14b8a6',
  '#eab308',
  '#6366f1',
];

interface PieSlice {
  validator: string;
  profit: bigint;
  pct: number; // 0..1
  color: string;
}

function ValidatorProfitPie({
  stats,
  network,
}: {
  stats: ValidatorRoundStats[];
  network: 'mainnet' | 'testnet';
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const innerR = r * 0.6;

  const slices: PieSlice[] = useMemo(() => {
    const positive = stats
      .map((v) => ({ v, profit: v.totalReturned - v.totalUsed }))
      .filter((x) => x.profit > 0n)
      .sort((a, b) => (b.profit > a.profit ? 1 : -1));
    const total = positive.reduce((s, x) => s + x.profit, 0n);
    if (total === 0n) return [];
    return positive.map((x, i) => ({
      validator: x.v.validator,
      profit: x.profit,
      pct: Number(x.profit) / Number(total),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [stats]);

  if (slices.length === 0) {
    return (
      <p className="text-muted-foreground text-[13px]">
        No positive-profit validators to chart yet.
      </p>
    );
  }

  // Build arc paths. Each slice spans [startAngle, endAngle] in radians,
  // measured clockwise from 12 o'clock (top).
  let acc = 0;
  const paths = slices.map((s) => {
    const start = acc;
    acc += s.pct;
    const end = acc;
    const a0 = start * 2 * Math.PI - Math.PI / 2;
    const a1 = end * 2 * Math.PI - Math.PI / 2;
    const largeArc = s.pct > 0.5 ? 1 : 0;
    const ox = cx + r * Math.cos(a0);
    const oy = cy + r * Math.sin(a0);
    const ix = cx + innerR * Math.cos(a0);
    const iy = cy + innerR * Math.sin(a0);
    const ox2 = cx + r * Math.cos(a1);
    const oy2 = cy + r * Math.sin(a1);
    const ix2 = cx + innerR * Math.cos(a1);
    const iy2 = cy + innerR * Math.sin(a1);
    const d = [
      `M ${ox} ${oy}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${ox2} ${oy2}`,
      `L ${ix2} ${iy2}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix} ${iy}`,
      'Z',
    ].join(' ');
    const labelAngle = (a0 + a1) / 2;
    const labelR = (r + innerR) / 2;
    const lx = cx + labelR * Math.cos(labelAngle);
    const ly = cy + labelR * Math.sin(labelAngle);
    return { d, s, lx, ly, pctLabel: (s.pct * 100).toFixed(1) };
  });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-[200px] h-[200px] shrink-0"
        role="img"
        aria-label="Validator profit share donut chart"
      >
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.s.color}
            stroke="hsl(var(--background))"
            strokeWidth={1}
          >
            <title>
              {`${fmtAddr(p.s.validator, network)}: ${fmtTon(p.s.profit)} (${p.pctLabel}%)`}
            </title>
          </path>
        ))}
        {paths.map((p, i) =>
          p.s.pct >= 0.06 ? (
            <text
              key={`t-${i}`}
              x={p.lx}
              y={p.ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              className="fill-background font-mono pointer-events-none"
            >
              {p.pctLabel}%
            </text>
          ) : null,
        )}
      </svg>
      <ul className="flex flex-col gap-1.5 text-[12px] min-w-0">
        {paths.map((p, i) => (
          <li key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ background: p.s.color }}
            />
            <span className="font-mono text-muted-foreground truncate">
              <AddrLink
                addr={p.s.validator}
                network={network}
                display={fmtAddr(p.s.validator, network)}
              />
            </span>
            <span className="font-mono ml-auto pl-2 shrink-0">
              {p.pctLabel}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoundInfoPanel({ poolAddress }: { poolAddress: string }) {
  const { network } = useRouter();
  const [selectedValidator, setSelectedValidator] = useState('');
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  // The owner address is required to scope the RoundInfoMessage query (the pool
  // sends RoundInfoMessage to the owner). StakeReturned goes to each validator,
  // so it is scoped only by the pool as source.
  const { data: owner } = useQuery({
    queryKey: ['pool-owner', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getPoolOwner(network, poolAddress),
  });

  const ownerRaw = owner ? owner.toRawString() : '';

  const {
    data: roundInfos,
    isLoading: riLoading,
    error: riError,
  } = useQuery({
    queryKey: ['pool-round-infos', network, poolAddress],
    enabled: !!poolAddress && !!ownerRaw,
    refetchInterval: POOL_REFETCH_INTERVAL_MS,
    queryFn: () => getRoundInfos(network, poolAddress, ownerRaw),
  });

  const {
    data: stakeReturneds,
    isLoading: srLoading,
    error: srError,
  } = useQuery({
    queryKey: ['pool-stake-returneds', network, poolAddress],
    enabled: !!poolAddress,
    refetchInterval: POOL_REFETCH_INTERVAL_MS,
    queryFn: () => getStakeReturneds(network, poolAddress),
  });

  // The pool's live cur/prev rounds read from storage — these cover rounds
  // that have not yet been finalized into a RoundInfoMessage (the current
  // round always, and the previous round until all stakes are recovered).
  const { data: liveRounds } = useQuery({
    queryKey: ['pool-live-rounds', network, poolAddress],
    enabled: !!poolAddress,
    refetchInterval: POOL_REFETCH_INTERVAL_MS,
    queryFn: () => getLiveRounds(network, poolAddress),
  });

  // Merged round list: finalized RoundInfoMessage entries plus any live round
  // whose roundIndex is not yet in the indexed set.
  const allRounds = useMemo(
    () =>
      roundInfos ? mergeRoundInfos(roundInfos, liveRounds ?? []) : undefined,
    [roundInfos, liveRounds],
  );

  const validatorStats = useMemo(
    () => (stakeReturneds ? aggregateValidatorStats(stakeReturneds) : []),
    [stakeReturneds],
  );

  // Attribute StakeReturned events to rounds by time window so each round row
  // can expand to show its per-validator split.
  const roundSplits = useMemo(() => {
    if (!allRounds || !stakeReturneds) return null;
    return attributeEventsToRounds(allRounds, stakeReturneds);
  }, [allRounds, stakeReturneds]);

  // Per-validator event list for the selected validator (raw address key).
  const selectedEvents = useMemo<StakeReturnedEntry[]>(() => {
    if (!selectedValidator || !stakeReturneds) return [];
    return stakeReturneds
      .filter((e) => e.validator.toRawString() === selectedValidator)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [selectedValidator, stakeReturneds]);

  // Round-level totals across finalized rounds only. Live (in-progress)
  // rounds are excluded because their `returned` is incomplete — they would
  // understate the net result while a round is still settling.
  const totals = useMemo(() => {
    if (!roundInfos || roundInfos.length === 0) return null;
    let used = 0n;
    let returned = 0n;
    for (const r of roundInfos) {
      used += r.used;
      returned += r.returned;
    }
    return { used, returned, count: roundInfos.length };
  }, [roundInfos]);

  if (!poolAddress) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">
          Enter a pool address to view round stats.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 text-left">
      {expandedRound && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setExpandedRound(null)}
          aria-hidden
        />
      )}
      <div>
        <span className="text-muted-foreground text-[12px]">
          Stats are indexed from the pool's on-chain log messages
          (RoundInfoMessage &amp; StakeReturned) via toncenter v3.
        </span>
      </div>

      {(riError || srError) && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-[13px]">
          Failed to load round stats:{' '}
          {((riError as Error) ?? (srError as Error))?.message}
        </div>
      )}

      {totals && (
        <section className="rounded-xl border p-5 flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold mb-2">Round totals</h2>
          <Row label="Rounds indexed" value={String(totals.count)} />
          <Row label="Total used" value={fmtTon(totals.used)} />
          <Row label="Total returned" value={fmtTon(totals.returned)} />
          <div className="flex justify-between gap-4 py-1 text-[13px]">
            <span className="text-muted-foreground shrink-0">Net result</span>
            <span className="font-mono text-right break-all">
              <Profit used={totals.used} returned={totals.returned} />
            </span>
          </div>
        </section>
      )}

      {allRounds && allRounds.some((r) => !r.live) && (
        <section className="rounded-xl border p-5 flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold mb-1">Round chart</h2>
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-success/80" />
              Profit
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-destructive/80" />
              Loss
            </span>
            <span>Live rounds excluded (profit not yet settled)</span>
          </div>
          <RoundsBarChart rounds={allRounds} />
        </section>
      )}

      <section className="rounded-xl border p-5 flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold mb-1">Per-round stats</h2>
        <p className="text-muted-foreground text-[12px]">
          One row per completed round (<code>RoundInfoMessage</code> to the
          owner) plus the live current/previous rounds read from pool storage
          (marked <span className="text-warning">live</span>).
        </p>
        {!allRounds || allRounds.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            {riLoading
              ? 'Loading...'
              : 'No round data available yet for this pool.'}
          </p>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto -mx-2 px-2">
              <table className="w-full border-collapse table-fixed">
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[16%]" />
                  <col className="w-[9%]" />
                  <col className="w-[23%]" />
                  <col className="w-[4%]" />
                </colgroup>
                <thead>
                  <tr>
                    <Th>Round</Th>
                    <Th align="right">Used</Th>
                    <Th align="right">Returned</Th>
                    <Th align="right">Net</Th>
                    <Th>Status</Th>
                    <Th>Closed at</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {allRounds.map((r: RoundInfoEntry) => {
                    const rowKey = `${r.roundIndex}-${r.lt}`;
                    const isExpanded = expandedRound === rowKey;
                    const split = roundSplits?.get(r.roundIndex) ?? [];
                    const splitAggregated = isExpanded
                      ? aggregateRoundSplit(split)
                      : [];
                    return (
                      <Fragment key={rowKey}>
                        <tr
                          className={
                            r.live
                              ? 'bg-warning/5'
                              : 'hover:bg-accent/30 cursor-pointer'
                          }
                          onClick={() =>
                            r.live
                              ? undefined
                              : setExpandedRound(isExpanded ? null : rowKey)
                          }
                        >
                          <Td>{r.roundIndex.toString()}</Td>
                          <Td align="right">{fmtTon(r.used)}</Td>
                          <Td align="right">{fmtTon(r.returned)}</Td>
                          <Td align="right">
                            {r.live ? (
                              '—'
                            ) : (
                              <Profit used={r.used} returned={r.returned} />
                            )}
                          </Td>
                          <Td mono={false}>
                            {r.live ? (
                              <span className="text-warning">live</span>
                            ) : (
                              <span className="text-muted-foreground">
                                closed
                              </span>
                            )}
                          </Td>
                          <Td wrap>{r.live ? '—' : fmtDate(r.createdAt)}</Td>
                          <Td mono={false}>
                            {!r.live && (
                              <span className="text-muted-foreground text-[11px]">
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            )}
                          </Td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-accent/20 relative z-50">
                            <td colSpan={7} className="px-3 py-3 border-t">
                              {splitAggregated.length === 0 ? (
                                <p className="text-muted-foreground text-[12px]">
                                  No per-validator StakeReturned events
                                  attributed to this round.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="border-collapse w-full">
                                    <thead>
                                      <tr>
                                        <Th>Validator</Th>
                                        <Th align="right">Rounds</Th>
                                        <Th align="right">Used</Th>
                                        <Th align="right">Returned</Th>
                                        <Th align="right">Net</Th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {splitAggregated.map(
                                        (v: RoundValidatorSplit) => (
                                          <tr
                                            key={v.validator}
                                            className="hover:bg-accent/40"
                                          >
                                            <Td>
                                              <AddrLink
                                                addr={v.validator}
                                                network={network}
                                                display={fmtAddrCompact(
                                                  v.validator,
                                                  network,
                                                )}
                                              />
                                            </Td>
                                            <Td align="right">{v.events}</Td>
                                            <Td align="right">
                                              {fmtTon(v.used)}
                                            </Td>
                                            <Td align="right">
                                              {fmtTon(v.returned)}
                                            </Td>
                                            <Td align="right">
                                              <Profit
                                                used={v.used}
                                                returned={v.returned}
                                              />
                                            </Td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Small-screen card layout */}
            <div className="sm:hidden flex flex-col gap-2">
              {allRounds.map((r: RoundInfoEntry) => {
                const rowKey = `${r.roundIndex}-${r.lt}`;
                const isExpanded = expandedRound === rowKey;
                const split = roundSplits?.get(r.roundIndex) ?? [];
                const splitAggregated = isExpanded
                  ? aggregateRoundSplit(split)
                  : [];
                return (
                  <Fragment key={rowKey}>
                    <DataCard
                      accent={r.live}
                      onClick={
                        r.live
                          ? undefined
                          : () => setExpandedRound(isExpanded ? null : rowKey)
                      }
                      pairs={[
                        { label: 'Round', value: r.roundIndex.toString() },
                        { label: 'Used', value: fmtTon(r.used) },
                        { label: 'Returned', value: fmtTon(r.returned) },
                        {
                          label: 'Net',
                          value: r.live ? (
                            '—'
                          ) : (
                            <Profit used={r.used} returned={r.returned} />
                          ),
                        },
                        {
                          label: 'Status',
                          value: r.live ? (
                            <span className="text-warning">live</span>
                          ) : (
                            <span className="text-muted-foreground">
                              closed
                            </span>
                          ),
                        },
                        {
                          label: 'Closed at',
                          value: r.live ? '—' : fmtDate(r.createdAt),
                        },
                      ]}
                    />
                    {isExpanded && (
                      <div className="bg-accent/20 rounded-md border p-3 flex flex-col gap-2">
                        {splitAggregated.length === 0 ? (
                          <p className="text-muted-foreground text-[12px]">
                            No per-validator StakeReturned events attributed to
                            this round.
                          </p>
                        ) : (
                          splitAggregated.map((v: RoundValidatorSplit) => (
                            <DataCard
                              key={v.validator}
                              pairs={[
                                {
                                  label: 'Validator',
                                  value: (
                                    <AddrLink
                                      addr={v.validator}
                                      network={network}
                                      display={fmtAddrCompact(
                                        v.validator,
                                        network,
                                      )}
                                    />
                                  ),
                                },
                                { label: 'Rounds', value: v.events.toString() },
                                { label: 'Used', value: fmtTon(v.used) },
                                {
                                  label: 'Returned',
                                  value: fmtTon(v.returned),
                                },
                                {
                                  label: 'Net',
                                  value: (
                                    <Profit
                                      used={v.used}
                                      returned={v.returned}
                                    />
                                  ),
                                },
                              ]}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border p-5 flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold mb-1">Per-validator stats</h2>
        <p className="text-muted-foreground text-[12px]">
          Aggregated from <code>StakeReturned</code> messages the pool sends to
          each validator when its stake is recovered. Select a validator to see
          the per-event breakdown.
        </p>
        {!validatorStats || validatorStats.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">
            {srLoading
              ? 'Loading...'
              : 'No stake-returned messages indexed yet for this pool.'}
          </p>
        ) : (
          <>
            <div className="rounded-md border p-3 bg-card/30">
              <h3 className="text-[13px] font-semibold mb-2">
                Profit share by validator
              </h3>
              <ValidatorProfitPie stats={validatorStats} network={network} />
            </div>
            <div className="hidden sm:block overflow-x-auto -mx-2 px-2">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Validator</Th>
                    <Th align="right">Rounds</Th>
                    <Th align="right">Total used</Th>
                    <Th align="right">Total returned</Th>
                    <Th align="right">Net</Th>
                    <Th>Last event</Th>
                  </tr>
                </thead>
                <tbody>
                  {validatorStats.map((v: ValidatorRoundStats) => (
                    <tr
                      key={v.validator}
                      onClick={() =>
                        setSelectedValidator(
                          selectedValidator === v.validator ? '' : v.validator,
                        )
                      }
                      className={
                        selectedValidator === v.validator
                          ? 'bg-accent/60 cursor-pointer'
                          : 'cursor-pointer hover:bg-accent/30'
                      }
                    >
                      <Td>
                        <AddrLink
                          addr={v.validator}
                          network={network}
                          display={fmtAddrCompact(v.validator, network)}
                        />
                      </Td>
                      <Td align="right">{v.events}</Td>
                      <Td align="right">{fmtTon(v.totalUsed)}</Td>
                      <Td align="right">{fmtTon(v.totalReturned)}</Td>
                      <Td align="right">
                        <Profit used={v.totalUsed} returned={v.totalReturned} />
                      </Td>
                      <Td>{fmtDate(v.lastEventAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Small-screen card layout */}
            <div className="sm:hidden flex flex-col gap-2">
              {validatorStats.map((v: ValidatorRoundStats) => (
                <DataCard
                  key={v.validator}
                  selected={selectedValidator === v.validator}
                  onClick={() =>
                    setSelectedValidator(
                      selectedValidator === v.validator ? '' : v.validator,
                    )
                  }
                  pairs={[
                    {
                      label: 'Validator',
                      value: (
                        <AddrLink
                          addr={v.validator}
                          network={network}
                          display={fmtAddrCompact(v.validator, network)}
                        />
                      ),
                    },
                    { label: 'Rounds', value: v.events.toString() },
                    { label: 'Total used', value: fmtTon(v.totalUsed) },
                    { label: 'Total returned', value: fmtTon(v.totalReturned) },
                    {
                      label: 'Net',
                      value: (
                        <Profit used={v.totalUsed} returned={v.totalReturned} />
                      ),
                    },
                    { label: 'Last event', value: fmtDate(v.lastEventAt) },
                  ]}
                />
              ))}
            </div>

            {selectedValidator && (
              <div className="mt-2 rounded-md border p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold">
                    Rounds for{' '}
                    <AddrLink
                      addr={selectedValidator}
                      network={network}
                      display={fmtAddr(selectedValidator, network)}
                    />
                  </h3>
                  <button
                    onClick={() => setSelectedValidator('')}
                    className="text-muted-foreground text-[12px] hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                {selectedEvents.length === 0 ? (
                  <p className="text-muted-foreground text-[12px]">
                    No rounds for this validator.
                  </p>
                ) : (
                  <>
                    <div className="hidden sm:block overflow-x-auto -mx-2 px-2">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <Th align="right">Used</Th>
                            <Th align="right">Returned</Th>
                            <Th align="right">Net</Th>
                            <Th>Recovered at</Th>
                            <Th>Query ID</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedEvents.map((e, i) => (
                            <tr key={`${e.lt}-${i}`}>
                              <Td align="right">{fmtTon(e.used)}</Td>
                              <Td align="right">{fmtTon(e.returned)}</Td>
                              <Td align="right">
                                <Profit used={e.used} returned={e.returned} />
                              </Td>
                              <Td>{fmtDate(e.createdAt)}</Td>
                              <Td>{e.queryId.toString()}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="sm:hidden flex flex-col gap-2">
                      {selectedEvents.map((e, i) => (
                        <DataCard
                          key={`${e.lt}-${i}`}
                          pairs={[
                            { label: 'Used', value: fmtTon(e.used) },
                            { label: 'Returned', value: fmtTon(e.returned) },
                            {
                              label: 'Net',
                              value: (
                                <Profit used={e.used} returned={e.returned} />
                              ),
                            },
                            {
                              label: 'Recovered at',
                              value: fmtDate(e.createdAt),
                            },
                            { label: 'Query ID', value: e.queryId.toString() },
                          ]}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <div className="text-muted-foreground text-[12px] flex flex-col gap-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[12px]">Pool</span>
          <AddrLink addr={poolAddress} network={network} bounceable />
        </div>
      </div>
    </div>
  );
}
