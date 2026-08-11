import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import { addFunds, validateGramInput } from '@/lib/pool';

export function AddFundsPanel() {
  const { network, poolAddress, sender, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();
  const [fundsAmount, setFundsAmount] = useState('10');

  function onAddFunds() {
    const amount = validateGramInput(
      fundsAmount,
      'fundsAmount',
      setErr,
      clearErr,
    );
    if (amount === null) return;
    clearAllErr();
    // Add Funds is not owner-only and produces no RefundMessage (the pool just
    // accepts the attached GRAM), so we skip the owner check and refund wait.
    run('Add funds', () => addFunds(network, sender, { poolAddress, amount }), {
      ownerOnly: false,
      awaitRefund: false,
    });
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Add funds</h2>
      <p className="text-muted-foreground text-[12px]">
        Tops up the pool balance. The sent amount is added directly.
      </p>
      <Field
        label="Amount (GRAM)"
        type="number"
        value={fundsAmount}
        onChange={withClear(setFundsAmount, 'fundsAmount')}
        error={fieldErrors.fundsAmount}
      />
      <Button onClick={onAddFunds} disabled={busy}>
        Add funds
      </Button>
    </>
  );
}
