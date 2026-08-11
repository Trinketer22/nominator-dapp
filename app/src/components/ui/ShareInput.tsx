import { fromNano } from '@ton/core';
import {
  SHARE_BASE,
  shareToPercent,
  percentToShare,
  parseBigInt,
} from '@/lib/pool';
import { Field } from './form';

// Reusable share input with a percent/raw toggle and an info line showing the
// resulting raw share value. Used by Deploy & Init (owner share), Add
// Validator (per-validator limit), and Individual Validator Limit.
//
// `share` is the raw share string (0..SHARE_BASE). `onShareChange` receives
// the new raw share string. `subject` is the banner noun shown after the
// percentage (e.g. "round profit" or "projected balance"). When
// `projectedBalance` is provided, the info line also shows the approximate
// GRAM value of the share.
export function ShareInput({
  share,
  onShareChange,
  mode,
  onModeChange,
  percentInput,
  onPercentInputChange,
  label,
  error,
  onClearError,
  subject,
  projectedBalance,
}: {
  share: string;
  onShareChange: (v: string) => void;
  mode: 'percent' | 'share';
  onModeChange: (mode: 'percent' | 'share') => void;
  percentInput: string;
  onPercentInputChange: (v: string) => void;
  label: string;
  error?: string;
  onClearError: () => void;
  subject: string;
  projectedBalance?: bigint;
}) {
  // Validate the value the user is actually looking at so the error message
  // matches the active input mode. Caller-supplied `error` is only used when
  // the displayed value is in bounds (e.g. for submit-time checks callers may
  // add later); an out-of-bounds value always shows the mode-aware message.
  const boundsError = (() => {
    if (mode === 'percent') {
      const n = Number(percentInput);
      if (
        percentInput.trim() !== '' &&
        Number.isFinite(n) &&
        (n < 0 || n > 100)
      ) {
        return 'Must be in 0..100%';
      }
      return undefined;
    }
    const raw = parseBigInt(share);
    if (raw !== null && (raw < 0n || raw > SHARE_BASE)) {
      return `Must be in 0..${SHARE_BASE}`;
    }
    return undefined;
  })();
  const fieldError = boundsError ?? error;

  return (
    <>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-muted-foreground text-[12px]">
          {label} input mode
        </span>
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as 'percent' | 'share';
            if (next === 'percent') {
              onPercentInputChange(shareToPercent(parseBigInt(share) ?? 0n));
            }
            onModeChange(next);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
        >
          <option value="percent">Percentage (%)</option>
          <option value="share">Raw share (0..{SHARE_BASE.toString()})</option>
        </select>
      </label>
      <Field
        label={
          mode === 'percent' ? `${label} (%)` : `${label} (0..${SHARE_BASE})`
        }
        type="number"
        value={mode === 'percent' ? percentInput : share}
        onChange={(v) => {
          if (mode === 'percent') {
            onPercentInputChange(v);
            onShareChange(percentToShare(v));
          } else {
            onShareChange(v);
          }
          onClearError();
        }}
        error={fieldError}
      />
      {(() => {
        const rawShare = parseBigInt(share) ?? 0n;
        const approx =
          projectedBalance !== undefined
            ? (rawShare * projectedBalance) / SHARE_BASE
            : undefined;
        return (
          <p className="text-muted-foreground text-[12px]">
            {shareToPercent(rawShare)}% of {subject}
            {' · '}
            <span className="font-mono">
              share {rawShare.toString()} / {SHARE_BASE.toString()}
            </span>
            {approx !== undefined && (
              <>
                {' · ≈ '}
                <span className="font-mono">{fromNano(approx)} GRAM</span>
              </>
            )}
          </p>
        );
      })()}
    </>
  );
}
