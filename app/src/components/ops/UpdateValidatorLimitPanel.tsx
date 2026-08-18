import { useEffect, useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { ValidatorLimitInput } from '@/components/ui/ValidatorLimitInput';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  SHARE_BASE,
  fmtAddr,
  getLimitsPerValidator,
  getNetworkStakingLimits,
  getPoolInvariants,
  getValidators,
  makeLimitShare,
  makeLimitTon,
  roundParityLabel,
  shareToPercent,
  updateValidatorLimit,
  validateBigIntInput,
  validateGramInput,
  validateValidatorGramLimit,
} from '@/lib/pool';

export function UpdateValidatorLimitPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // Selected validator — local to this panel, so it resets whenever the user
  // switches away from the Individual Validator Limit tab.
  const [validatorAddr, setValidatorAddr] = useState('');

  // per-validator limit
  const [limitType, setLimitType] = useState<'ton' | 'share'>('ton');
  const [limitTonMax, setLimitTonMax] = useState('1000000');
  const [limitShareMax, setLimitShareMax] = useState('8388608');
  const [limitShareMode, setLimitShareMode] = useState<'share' | 'percent'>(
    'percent',
  );
  const [limitPercentInput, setLimitPercentInput] = useState('50.00');
  const [msgValue, setMsgValue] = useState('1');

  const { data: globalLimits } = useQuery({
    queryKey: ['pool-limits', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getLimitsPerValidator(network, poolAddress),
  });
  const globalMinTon = globalLimits?.[0];
  const globalMaxTon = globalLimits?.[1];

  const { data: networkLimits } = useQuery({
    queryKey: ['network-staking-limits', network],
    queryFn: () => getNetworkStakingLimits(network),
  });
  const networkMinStake = networkLimits?.minStake;
  const networkMaxStake = networkLimits?.maxStake;

  const { data: validatorsData } = useQuery({
    queryKey: ['pool-validators', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getValidators(network, poolAddress),
  });
  const validators = validatorsData?.validators;

  // Fetch the pool invariants for showing the projected balance and approx
  // GRAM amounts when a share-based limit is selected.
  const { data: poolInvariants } = useQuery({
    queryKey: ['pool-invariants', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getPoolInvariants(network, poolAddress),
  });
  const projectedBalance = poolInvariants?.projectedBalance;

  // When a validator is selected, populate the per-validator limit form with
  // that validator's current individual limit (type + values) so the user sees
  // what's on-chain rather than hardcoded placeholders.
  useEffect(() => {
    if (!validators || !validatorAddr) return;
    const v = validators.find((x) => x.address === validatorAddr);
    if (!v) return;
    if (v.limit) {
      if (v.limit.$ === 'ValidatorLimitTon') {
        setLimitType('ton');
        setLimitTonMax(fromNano(v.limit.maxTon));
      } else {
        setLimitType('share');
        setLimitShareMax(v.limit.maxShare.toString());
        setLimitPercentInput(shareToPercent(v.limit.maxShare));
      }
    } else {
      // No individual limit — the validator falls back to the pool's global
      // range. Pre-fill the GRAM max with the pool's global max so the form
      // reflects what's effectively applied on-chain, rather than a hardcoded
      // placeholder. The other fields are reset to defaults so the previously
      // selected validator's limit doesn't bleed through.
      setLimitType('ton');
      setLimitTonMax(
        globalMaxTon !== undefined ? fromNano(globalMaxTon) : '1000000',
      );
      setLimitShareMax('8388608');
      setLimitShareMode('percent');
      setLimitPercentInput('50.00');
    }
  }, [validators, validatorAddr, globalMaxTon]);

  function onUpdateValidatorLimit() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    let limit;
    if (limitType === 'ton') {
      const maxTon = validateGramInput(
        limitTonMax,
        'limitTonMax',
        setErr,
        clearErr,
      );
      if (maxTon === null) return;
      limit = makeLimitTon(maxTon);
    } else {
      const ms = validateBigIntInput(
        limitShareMax,
        'limitShareMax',
        setErr,
        clearErr,
      );
      if (ms === null) return;
      limit = makeLimitShare(ms);
    }
    if (limit.$ === 'ValidatorLimitShare') {
      if (limit.maxShare < 0n || limit.maxShare > SHARE_BASE) {
        setErr('limitShareMax', `Max share must be in 0..${SHARE_BASE}.`);
        return;
      }
    } else {
      const err = validateValidatorGramLimit(
        limit.maxTon,
        'Update per-validator limit',
        { globalMinTon, globalMaxTon, networkMinStake, networkMaxStake },
      );
      if (err) {
        setErr('limitTonMax', err);
        return;
      }
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run('Update per-validator limit', () =>
      updateValidatorLimit(network, sender, {
        poolAddress,
        validator: validatorAddr,
        limit,
        value,
      }),
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">
        Update individual validator limit
      </h2>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-muted-foreground text-[12px]">Validator</span>
        {validators && validators.length > 0 ? (
          <select
            value={validatorAddr}
            onChange={(e) => {
              setValidatorAddr(e.target.value);
              clearErr('validatorAddr');
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono"
          >
            <option value="">Select a validator...</option>
            {validators.map((v) => (
              <option key={v.address} value={v.address}>
                {fmtAddr(v.address, network)}
                {v.isBanned ? ' (banned)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={validatorAddr}
            onChange={(e) => {
              setValidatorAddr(e.target.value);
              clearErr('validatorAddr');
            }}
            placeholder={poolAddress ? 'No validators loaded' : 'UQ...'}
            className="h-9 rounded-md border border-input bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        )}
      </label>
      {validatorAddr && validators && (
        <p className="text-muted-foreground text-[12px]">
          {(() => {
            const v = validators.find((x) => x.address === validatorAddr);
            if (!v) return null;
            return (
              <>
                round allowance: {roundParityLabel(v.roundParity)} ·{' '}
                {v.isBanned ? 'banned' : 'active'}
                {v.limit
                  ? ` · current limit: ${v.limit.$ === 'ValidatorLimitTon' ? `${fromNano(v.limit.maxTon)} GRAM` : `share ${v.limit.maxShare}/${SHARE_BASE}`}`
                  : ' · no individual limit'}
              </>
            );
          })()}
        </p>
      )}
      <ValidatorLimitInput
        allowGlobal={false}
        type={limitType}
        onTypeChange={(t) => setLimitType(t as 'ton' | 'share')}
        tonMax={limitTonMax}
        onTonMaxChange={setLimitTonMax}
        shareMax={limitShareMax}
        onShareMaxChange={setLimitShareMax}
        shareMode={limitShareMode}
        onShareModeChange={setLimitShareMode}
        percentInput={limitPercentInput}
        onPercentInputChange={setLimitPercentInput}
        globalMinTon={globalMinTon}
        globalMaxTon={globalMaxTon}
        networkMinStake={networkMinStake}
        networkMaxStake={networkMaxStake}
        projectedBalance={projectedBalance}
        errorTon={fieldErrors.limitTonMax}
        errorShare={fieldErrors.limitShareMax}
        onClearError={() => {
          clearErr('limitTonMax');
          clearErr('limitShareMax');
        }}
        typeLabel="Limit type"
      />
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button
        onClick={onUpdateValidatorLimit}
        disabled={busy || !isOwner || !validatorAddr}
      >
        Update limit{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
