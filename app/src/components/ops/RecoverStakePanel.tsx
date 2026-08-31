import { useMemo, useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  fmtAddr,
  computeRecoveryEligibility,
  getValidatorInfo,
  getValidators,
  recoverStakeUnrestricted,
  validateGramInput,
} from '@/lib/pool';
import { isValidAddress } from '@/lib/ton';

export function RecoverStakePanel() {
  const { network, poolAddress, sender, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // Selected validator — local to this panel, so it resets whenever the user
  // switches away from the Recover Stake tab.
  const [validatorAddr, setValidatorAddr] = useState('');
  const [recoverAmount, setRecoverAmount] = useState('1');
  const [msgValue, setMsgValue] = useState('2');

  const { data: validatorsData } = useQuery({
    queryKey: ['pool-validators', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getValidators(network, poolAddress),
  });
  const validators = validatorsData?.validators;

  // Fetch detailed validator info (rotation data) for the recover-stake tab.
  // get_validator_info may advance round state, so it's only called when a
  // validator is selected. (This panel only mounts on the recover-stake tab,
  // so the previous tab-gating is implicit.)
  const { data: recoverValidatorInfo, isLoading: rviLoading } = useQuery({
    queryKey: [
      'pool-recover-validator-info',
      network,
      poolAddress,
      validatorAddr,
    ],
    enabled: !!poolAddress && !!validatorAddr,
    queryFn: () => getValidatorInfo(network, poolAddress, validatorAddr),
    retry: false,
  });

  // Compute recovery eligibility for the selected validator, mirroring the
  // contract's checkRecoverRequirements.
  const recovery = useMemo(() => {
    if (!recoverValidatorInfo) return null;
    const usageState =
      validators?.find((x) => x.address === validatorAddr)?.usageState ?? 0n;
    return computeRecoveryEligibility(recoverValidatorInfo, usageState);
  }, [recoverValidatorInfo, validators, validatorAddr]);
  const recoverEligible = recovery?.eligible ?? false;

  function onRecoverStake() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    if (!isValidAddress(validatorAddr)) {
      setErr('validatorAddr', 'Invalid address format.');
      return;
    }
    const amount = validateGramInput(
      recoverAmount,
      'recoverAmount',
      setErr,
      clearErr,
    );
    if (amount === null) return;
    if (amount <= 0n) {
      setErr('recoverAmount', 'Recovery value must be greater than 0.');
      return;
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    if (value < amount) {
      setErr('msgValue', 'Must cover the recovery value plus gas fees.');
      return;
    }
    clearAllErr();
    run(
      'Recover stake',
      () =>
        recoverStakeUnrestricted(network, sender, {
          poolAddress,
          validator: validatorAddr,
          amount,
          value,
        }),
      { ownerOnly: false },
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Recover stake</h2>
      <p className="text-muted-foreground text-[12px]">
        Owner-only unrestricted stake recovery. Forwards the specified amount to
        the validator's proxy to recover its stake from the elector. The
        contract enforces the recovery timing window; ensure enough message
        value to cover the amount plus gas.
      </p>
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
        <div className="flex flex-col gap-1 text-[12px] text-muted-foreground">
          {(() => {
            const v = validators.find((x) => x.address === validatorAddr);
            if (!v) return null;
            return (
              <p>
                {v.isBanned ? 'banned' : 'active'} · usage state:{' '}
                {v.usageState.toString()}
              </p>
            );
          })()}
          {rviLoading && (
            <p className="text-muted-foreground">Loading rotation...</p>
          )}
          {recoverValidatorInfo &&
            recovery &&
            (() => {
              if (!recovery.closest) {
                return (
                  <p>
                    No usage record for the closest round (stake may already be
                    recovered).
                  </p>
                );
              }
              const closest = recovery.closest;
              const rot = closest.usage.rotation;
              const rotTime = Number(rot.rotationTime);
              return (
                <>
                  <p>
                    closest round: {recovery.usePrev ? 'prev' : 'cur'} · ton
                    used: {fromNano(closest.usage.tonUsed)} GRAM
                  </p>
                  <p>
                    rotation count: {rot.rotationCount.toString()} · rotation
                    time:{' '}
                    {rotTime > 0
                      ? new Date(rotTime * 1000).toLocaleString()
                      : '—'}
                  </p>
                  <p
                    className={
                      recovery.eligible ? 'text-success' : 'text-warning'
                    }
                  >
                    {recovery.eligible
                      ? recovery.timeLeft > 0
                        ? `eligible in ${Math.ceil(recovery.timeLeft / 60)} min`
                        : 'eligible for recovery'
                      : 'not yet eligible (needs 2 rotations)'}
                  </p>
                </>
              );
            })()}
        </div>
      )}
      <Field
        label="Recovery message value (GRAM, max 1)"
        type="number"
        value={recoverAmount}
        onChange={withClear(setRecoverAmount, 'recoverAmount')}
        error={fieldErrors.recoverAmount}
      />
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button
        onClick={onRecoverStake}
        disabled={
          busy ||
          !validatorAddr ||
          (recoverValidatorInfo !== undefined && !recoverEligible)
        }
      >
        Recover stake
      </Button>
    </>
  );
}
