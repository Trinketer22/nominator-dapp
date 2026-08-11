import { useEffect, useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  getLimitsPerValidator,
  getNetworkStakingLimits,
  updateValidatorLimits,
  validateGlobalGramLimits,
  validateGramInput,
} from '@/lib/pool';

export function UpdateValidatorLimitsPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // validator limits (global)
  const [gMinTon, setGMinTon] = useState('300000');
  const [gMaxTon, setGMaxTon] = useState('10000000');
  const [gRefundBonus, setGRefundBonus] = useState('3');
  const [msgValue, setMsgValue] = useState('1');

  // Fetch the pool's global validator limits so the form can show the valid
  // range and validate against it.
  const { data: globalLimits } = useQuery({
    queryKey: ['pool-limits', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getLimitsPerValidator(network, poolAddress),
  });

  // Populate the global validator limits form with the pool's current values
  // when they're first loaded, so the user sees what's on-chain rather than
  // hardcoded placeholders.
  useEffect(() => {
    if (globalLimits) {
      setGMinTon(fromNano(globalLimits[0]));
      setGMaxTon(fromNano(globalLimits[1]));
      setGRefundBonus(fromNano(globalLimits[2]));
    }
  }, [globalLimits]);

  // Fetch the network staking limits (config param 17) so we can validate
  // global pool limits against them. These differ between testnet and mainnet.
  const { data: networkLimits } = useQuery({
    queryKey: ['network-staking-limits', network],
    queryFn: () => getNetworkStakingLimits(network),
  });
  const networkMinStake = networkLimits?.minStake;
  const networkMaxStake = networkLimits?.maxStake;

  function onUpdateValidatorLimits() {
    const min = validateGramInput(gMinTon, 'gMinTon', setErr, clearErr);
    if (min === null) return;
    const max = validateGramInput(gMaxTon, 'gMaxTon', setErr, clearErr);
    if (max === null) return;
    const err = validateGlobalGramLimits(min, max, {
      minStake: networkMinStake,
      maxStake: networkMaxStake,
    });
    if (err) {
      setErr(err.field === 'min' ? 'gMinTon' : 'gMaxTon', err.msg);
      return;
    }
    const refundBonus = validateGramInput(
      gRefundBonus,
      'gRefundBonus',
      setErr,
      clearErr,
    );
    if (refundBonus === null) return;
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run('Update global validator limits', () =>
      updateValidatorLimits(network, sender, {
        poolAddress,
        minTonPerValidator: min,
        maxTonPerValidator: max,
        refundBonus,
        value,
      }),
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">
        Update global validator limits
      </h2>
      {networkMinStake && networkMaxStake && (
        <p className="text-muted-foreground text-[12px]">
          Network range:{' '}
          <span className="font-mono">
            {fromNano(networkMinStake)} – {fromNano(networkMaxStake)} GRAM
          </span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 items-start">
        <Field
          label="Min GRAM/validator"
          type="number"
          value={gMinTon}
          onChange={withClear(setGMinTon, 'gMinTon')}
          error={fieldErrors.gMinTon}
        />
        <Field
          label="Max GRAM/validator"
          type="number"
          value={gMaxTon}
          onChange={withClear(setGMaxTon, 'gMaxTon')}
          error={fieldErrors.gMaxTon}
        />
      </div>
      <Field
        label="Refund bonus (GRAM)"
        type="number"
        value={gRefundBonus}
        onChange={withClear(setGRefundBonus, 'gRefundBonus')}
        error={fieldErrors.gRefundBonus}
      />
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button onClick={onUpdateValidatorLimits} disabled={busy || !isOwner}>
        Update limits{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
