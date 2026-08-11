import { useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  getOwnerShareInfo,
  ownerWithdrawal,
  validateGramInput,
} from '@/lib/pool';
import { waitForOwnerWithdrawal } from '@/lib/refund';

// Rounds a nano-amount to the given number of fractional GRAM digits and
// returns as a string. More precision than that doesn't work for the
// withdrawal input.
function roundToFrac(nano: bigint, frac: number): string {
  const drop = 9 - frac;
  const pow = 10n ** BigInt(drop);
  const rounded = (nano / pow) * pow;
  return fromNano(rounded);
}

export function OwnerWithdrawalPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();
  const [withdrawAmount, setWithdrawAmount] = useState('1');
  const [msgValue, setMsgValue] = useState('1');

  // Fetch the projected owner share info for the Owner Withdrawal tab.
  // Returns both the withdrawable amount and the total owner share.
  const { data: ownerShareInfo } = useQuery({
    queryKey: ['pool-owner-share', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getOwnerShareInfo(network, poolAddress),
  });

  function onOwnerWithdrawal() {
    const amount = validateGramInput(
      withdrawAmount,
      'withdrawAmount',
      setErr,
      clearErr,
    );
    if (amount === null) return;
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run(
      'Owner withdrawal',
      () => ownerWithdrawal(network, sender, { poolAddress, amount, value }),
      { waitFn: waitForOwnerWithdrawal },
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Owner withdrawal</h2>
      <p className="text-muted-foreground text-[12px]">
        Withdraws owner share from the pool. Use "Use max" to withdraw the full
        available amount.
      </p>
      {ownerShareInfo !== undefined && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-[12px]">
              Available to withdraw:
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px]">
                {roundToFrac(
                  ownerShareInfo.available < 0n ? 0n : ownerShareInfo.available,
                  2,
                )}{' '}
                GRAM
              </span>
              <button
                className="text-primary text-[12px] shrink-0"
                onClick={() =>
                  setWithdrawAmount(
                    roundToFrac(
                      ownerShareInfo.available < 0n
                        ? 0n
                        : ownerShareInfo.available,
                      2,
                    ),
                  )
                }
              >
                Use max
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-[12px]">
              Total owner share:
            </span>
            <span className="font-mono text-[13px] text-muted-foreground">
              {roundToFrac(ownerShareInfo.ownerShare, 2)} GRAM
            </span>
          </div>
        </div>
      )}
      <Field
        label="Amount (GRAM)"
        type="number"
        value={withdrawAmount}
        onChange={withClear(setWithdrawAmount, 'withdrawAmount')}
        error={fieldErrors.withdrawAmount}
      />
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button onClick={onOwnerWithdrawal} disabled={busy || !isOwner}>
        Withdraw{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
