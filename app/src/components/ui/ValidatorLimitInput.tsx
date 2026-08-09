import { fromNano } from '@ton/core';
import { Field } from './form';
import { ShareInput } from './ShareInput';

// The per-validator limit types. 'global' means the validator uses the pool's
// global GRAM range (no individual override). It is only offered when
// `allowGlobal` is true — e.g. Add Validator and Deploy & Initialize expose it,
// while Update individual validator limit does not (a limit, once set, can only
// be changed to another Ton/Share value, not removed).
export type ValidatorLimitType = 'global' | 'ton' | 'share';

// Unified per-validator limit selector used by Deploy & Initialize (main
// validator), Add Validator, and Update individual validator limit. Renders the
// type dropdown plus the matching input (a GRAM max Field or a ShareInput) and
// shows the pool/network ranges the GRAM max is validated against, so the
// behaviour is identical across every panel. Validation itself runs in each
// panel's submit handler via the shared `validateValidatorGramLimit` helper so
// it stays consistent with the contract's checks.
export function ValidatorLimitInput({
  allowGlobal = true,
  type,
  onTypeChange,
  tonMax,
  onTonMaxChange,
  shareMax,
  onShareMaxChange,
  shareMode,
  onShareModeChange,
  percentInput,
  onPercentInputChange,
  globalMinTon,
  globalMaxTon,
  networkMinStake,
  networkMaxStake,
  projectedBalance,
  errorTon,
  errorShare,
  onClearError,
  typeLabel = 'Per-validator limit',
}: {
  allowGlobal?: boolean;
  type: ValidatorLimitType;
  onTypeChange: (t: ValidatorLimitType) => void;
  tonMax: string;
  onTonMaxChange: (v: string) => void;
  shareMax: string;
  onShareMaxChange: (v: string) => void;
  shareMode: 'percent' | 'share';
  onShareModeChange: (m: 'percent' | 'share') => void;
  percentInput: string;
  onPercentInputChange: (v: string) => void;
  globalMinTon?: bigint;
  globalMaxTon?: bigint;
  networkMinStake?: bigint;
  networkMaxStake?: bigint;
  projectedBalance?: bigint;
  errorTon?: string;
  errorShare?: string;
  onClearError: () => void;
  typeLabel?: string;
}) {
  const hasPoolRange = globalMinTon !== undefined && globalMaxTon !== undefined;
  const hasNetworkRange =
    networkMinStake !== undefined && networkMaxStake !== undefined;
  return (
    <>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-muted-foreground text-[12px]">{typeLabel}</span>
        <select
          value={type}
          onChange={(e) => {
            onTypeChange(e.target.value as ValidatorLimitType);
            onClearError();
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
        >
          {allowGlobal && (
            <option value="global">Global (use pool limits)</option>
          )}
          <option value="ton">GRAM max</option>
          <option value="share">Share max</option>
        </select>
      </label>

      {type === 'global' && allowGlobal && hasPoolRange && (
        <p className="text-muted-foreground text-[12px]">
          Validator will use the pool's global range:{' '}
          <span className="font-mono">
            {fromNano(globalMinTon!)} – {fromNano(globalMaxTon!)} GRAM
          </span>
        </p>
      )}

      {type === 'ton' && (
        <>
          <Field
            label="Max GRAM"
            type="number"
            value={tonMax}
            onChange={(v) => {
              onTonMaxChange(v);
              onClearError();
            }}
            error={errorTon}
          />
          {(hasPoolRange || hasNetworkRange) && (
            <p className="text-muted-foreground text-[12px]">
              {hasPoolRange && (
                <>
                  Pool range:{' '}
                  <span className="font-mono">
                    {fromNano(globalMinTon!)} – {fromNano(globalMaxTon!)} GRAM
                  </span>
                </>
              )}
              {hasPoolRange && hasNetworkRange && ' · '}
              {hasNetworkRange && (
                <>
                  Network range:{' '}
                  <span className="font-mono">
                    {fromNano(networkMinStake!)} – {fromNano(networkMaxStake!)}{' '}
                    GRAM
                  </span>
                </>
              )}
            </p>
          )}
        </>
      )}

      {type === 'share' && (
        <ShareInput
          share={shareMax}
          onShareChange={onShareMaxChange}
          mode={shareMode}
          onModeChange={onShareModeChange}
          percentInput={percentInput}
          onPercentInputChange={onPercentInputChange}
          label="Max share"
          subject="projected balance"
          error={errorShare}
          onClearError={onClearError}
          projectedBalance={projectedBalance}
        />
      )}
    </>
  );
}
