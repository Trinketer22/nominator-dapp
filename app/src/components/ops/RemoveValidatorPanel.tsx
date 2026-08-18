import { useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  SHARE_BASE,
  fmtAddr,
  getValidators,
  removeValidator,
  roundParityLabel,
  validateGramInput,
} from '@/lib/pool';
import { isValidAddress } from '@/lib/ton';

export function RemoveValidatorPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // Selected validator — local to this panel, so it resets whenever the user
  // switches away from the Remove Validator tab.
  const [validatorAddr, setValidatorAddr] = useState('');
  const [msgValue, setMsgValue] = useState('1');

  const { data: validatorsData } = useQuery({
    queryKey: ['pool-validators', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getValidators(network, poolAddress),
  });
  const validators = validatorsData?.validators;

  function onRemoveValidator() {
    if (!validatorAddr) {
      setErr('validatorAddr', 'Validator address is required.');
      return;
    }
    if (!isValidAddress(validatorAddr)) {
      setErr('validatorAddr', 'Invalid address format.');
      return;
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run('Remove validator', () =>
      removeValidator(network, sender, {
        poolAddress,
        validator: validatorAddr,
        value,
      }),
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Remove validator</h2>
      <p className="text-muted-foreground text-[12px]">
        Validators with outstanding stake are banned and purged after recovery.
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
        <p className="text-muted-foreground text-[12px]">
          {(() => {
            const v = validators.find((x) => x.address === validatorAddr);
            if (!v) return null;
            return (
              <>
                round allowance: {roundParityLabel(v.roundParity)} ·{' '}
                {v.isBanned ? 'banned' : 'active'}
                {v.limit
                  ? ` · limit: ${v.limit.$ === 'ValidatorLimitTon' ? `${fromNano(v.limit.maxTon)} GRAM` : `share ${v.limit.maxShare}/${SHARE_BASE}`}`
                  : ' · no individual limit'}
              </>
            );
          })()}
        </p>
      )}
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button
        onClick={onRemoveValidator}
        disabled={busy || !isOwner || !validatorAddr}
      >
        Remove validator{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
