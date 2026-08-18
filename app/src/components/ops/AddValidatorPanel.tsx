import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field, AddrLink } from '@/components/ui/form';
import { ValidatorLimitInput } from '@/components/ui/ValidatorLimitInput';
import { RoundAllowanceSelect } from '@/components/ui/RoundAllowanceSelect';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  SHARE_BASE,
  addValidator,
  fmtAddr,
  getLimitsPerValidator,
  getNetworkStakingLimits,
  getPoolInvariants,
  getValidators,
  makeLimitShare,
  makeLimitTon,
  validateBigIntInput,
  validateGramInput,
  validateValidatorGramLimit,
} from '@/lib/pool';
import { isValidAddress } from '@/lib/ton';

export function AddValidatorPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // Selected validator — local to this panel, so it resets whenever the user
  // switches away from the Add Validator tab.
  const [validatorAddr, setValidatorAddr] = useState('');
  const [roundAllowance, setRoundAllowance] = useState('3');

  // add-validator: per-validator limit applied at add time
  // 'global' = no individual limit (use pool's global limits)
  const [addValLimitType, setAddValLimitType] = useState<
    'global' | 'ton' | 'share'
  >('global');
  const [addValLimitTonMax, setAddValLimitTonMax] = useState('1000000');
  const [addValLimitShareMax, setAddValLimitShareMax] = useState('8388608');
  const [addValShareMode, setAddValShareMode] = useState<'share' | 'percent'>(
    'percent',
  );
  const [addValPercentInput, setAddValPercentInput] = useState('50.00');
  const [addValMsgValue, setAddValMsgValue] = useState('250');

  // Fetch the pool's global validator limits so the form can show the valid
  // range and validate against it. The contract rejects individual GRAM limits
  // outside [minTonPerValidator, maxTonPerValidator].
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

  function onAddValidator() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    if (!isValidAddress(validatorAddr)) {
      setErr('validatorAddr', 'Invalid address format.');
      return;
    }
    if (validators) {
      const exists = validators.some(
        (v) => fmtAddr(v.address, network) === fmtAddr(validatorAddr, network),
      );
      if (exists) {
        setErr('validatorAddr', 'This validator is already in the pool.');
        return;
      }
    }
    const ra = validateBigIntInput(
      roundAllowance,
      'roundAllowance',
      setErr,
      clearErr,
    );
    if (ra === null) return;
    if (ra < 1n || ra > 3n) {
      setErr('roundAllowance', 'Must be 1 (odd), 2 (even), or 3 (all).');
      return;
    }
    let limit = null;
    if (addValLimitType === 'ton') {
      if (!globalMinTon || !globalMaxTon) {
        setErr(
          'addValLimitTonMax',
          'Pool limits not loaded yet. Wait a moment and retry.',
        );
        return;
      }
      const maxTon = validateGramInput(
        addValLimitTonMax,
        'addValLimitTonMax',
        setErr,
        clearErr,
      );
      if (maxTon === null) return;
      const err = validateValidatorGramLimit(maxTon, 'Add validator', {
        globalMinTon,
        globalMaxTon,
        networkMinStake,
        networkMaxStake,
      });
      if (err) {
        setErr('addValLimitTonMax', err);
        return;
      }
      limit = makeLimitTon(maxTon);
    } else if (addValLimitType === 'share') {
      const ms = validateBigIntInput(
        addValLimitShareMax,
        'addValLimitShareMax',
        setErr,
        clearErr,
      );
      if (ms === null) return;
      if (ms < 0n || ms > SHARE_BASE) {
        setErr('addValLimitShareMax', `Max share must be in 0..${SHARE_BASE}.`);
        return;
      }
      limit = makeLimitShare(ms);
    }
    const valMsgValue = validateGramInput(
      addValMsgValue,
      'addValMsgValue',
      setErr,
      clearErr,
    );
    if (valMsgValue === null) return;
    clearAllErr();
    run('Add validator', () =>
      addValidator(network, sender, {
        poolAddress,
        validator: validatorAddr,
        roundAllowance: ra,
        limit,
        value: valMsgValue,
      }),
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Add validator</h2>
      {validators && validators.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[12px]">
            Current validators:
          </span>
          <div className="flex flex-col gap-1">
            {validators.map((v) => (
              <div
                key={v.address}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-[12px] font-mono"
              >
                <span className="break-all">
                  <AddrLink
                    addr={v.address}
                    network={network}
                    display={fmtAddr(v.address, network)}
                  />
                </span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {v.isBanned ? 'banned' : 'active'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Field
        label="Validator address"
        value={validatorAddr}
        onChange={withClear(setValidatorAddr, 'validatorAddr')}
        placeholder="UQ..."
        error={fieldErrors.validatorAddr}
      />
      <RoundAllowanceSelect
        value={roundAllowance}
        onChange={(v) => {
          setRoundAllowance(v);
          clearErr('roundAllowance');
        }}
      />
      <ValidatorLimitInput
        allowGlobal
        type={addValLimitType}
        onTypeChange={setAddValLimitType}
        tonMax={addValLimitTonMax}
        onTonMaxChange={setAddValLimitTonMax}
        shareMax={addValLimitShareMax}
        onShareMaxChange={setAddValLimitShareMax}
        shareMode={addValShareMode}
        onShareModeChange={setAddValShareMode}
        percentInput={addValPercentInput}
        onPercentInputChange={setAddValPercentInput}
        globalMinTon={globalMinTon}
        globalMaxTon={globalMaxTon}
        networkMinStake={networkMinStake}
        networkMaxStake={networkMaxStake}
        projectedBalance={projectedBalance}
        errorTon={fieldErrors.addValLimitTonMax}
        errorShare={fieldErrors.addValLimitShareMax}
        onClearError={() => {
          clearErr('addValLimitTonMax');
          clearErr('addValLimitShareMax');
        }}
      />
      <Field
        label="Message value (GRAM)"
        type="number"
        value={addValMsgValue}
        onChange={withClear(setAddValMsgValue, 'addValMsgValue')}
        error={fieldErrors.addValMsgValue}
      />
      <Button
        onClick={onAddValidator}
        disabled={busy || !isOwner || !validatorAddr}
      >
        Add validator{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
