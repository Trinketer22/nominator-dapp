import { useState } from 'react';
import { Address, fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  evictNominator,
  getNominatorData,
  validateGramInput,
} from '@/lib/pool';
import { isValidAddress } from '@/lib/ton';

export function EvictNominatorPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // Nominator address to evict — local to this panel, so it resets whenever
  // the user switches away from the Evict Nominator tab.
  const [nominatorAddr, setNominatorAddr] = useState('');
  const [msgValue, setMsgValue] = useState('1');

  const addrValid = (() => {
    try {
      Address.parse(nominatorAddr);
      return true;
    } catch {
      return false;
    }
  })();

  // Preview the target nominator's state so the owner can verify the share
  // that will be queued as a pending withdrawal. The getter throws when the
  // address is not a pool nominator — surfaced as "Nominator not found".
  const {
    data: nominatorData,
    isLoading: nmLoading,
    error: nmError,
  } = useQuery({
    queryKey: ['pool-nominator-data', network, poolAddress, nominatorAddr],
    enabled: !!poolAddress && !!nominatorAddr && addrValid,
    queryFn: () => getNominatorData(network, poolAddress, nominatorAddr),
  });

  function onEvictNominator() {
    if (!nominatorAddr) {
      setErr('nominatorAddr', 'Nominator address is required.');
      return;
    }
    if (!isValidAddress(nominatorAddr)) {
      setErr('nominatorAddr', 'Invalid address format.');
      return;
    }
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run('Evict nominator', () =>
      evictNominator(network, sender, {
        poolAddress,
        nominator: nominatorAddr,
        value,
      }),
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Evict nominator</h2>
      <p className="text-muted-foreground text-[12px]">
        Forces a nominator to exit the pool at the end of the round. Their whole
        share is queued as a pending withdrawal and paid out via the pending
        payout chain.
      </p>
      <Field
        label="Nominator address"
        value={nominatorAddr}
        onChange={withClear(setNominatorAddr, 'nominatorAddr')}
        placeholder="UQ..."
        error={fieldErrors.nominatorAddr}
      />
      {nominatorAddr && !addrValid && (
        <p className="text-destructive text-[12px]">Invalid address.</p>
      )}
      {nominatorAddr && addrValid && nmLoading && (
        <p className="text-muted-foreground text-[12px]">
          Loading nominator...
        </p>
      )}
      {nominatorAddr && addrValid && !nmLoading && nmError && (
        <p className="text-destructive text-[12px]">Nominator not found.</p>
      )}
      {nominatorAddr &&
        addrValid &&
        !nmLoading &&
        !nmError &&
        nominatorData && (
          <p className="text-muted-foreground text-[12px]">
            amount: {fromNano(nominatorData.amount)} GRAM · reward:{' '}
            {fromNano(nominatorData.reward)} GRAM
            {nominatorData.pendingDepositAmount > 0n
              ? ` · pending deposit: ${fromNano(nominatorData.pendingDepositAmount)} GRAM`
              : ''}
            {nominatorData.withdrawFound ? ' · withdrawal already pending' : ''}
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
        onClick={onEvictNominator}
        disabled={busy || !isOwner || !nominatorData}
      >
        Evict nominator{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
