import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import { updateVset, validateGramInput } from '@/lib/pool';

export function UpdateVsetPanel() {
  const { network, poolAddress, sender, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();
  const [msgValue, setMsgValue] = useState('1');

  function onUpdateVset() {
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run(
      'Update vset',
      () => updateVset(network, sender, { poolAddress, value }),
      { ownerOnly: false },
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Update validator set</h2>
      <p className="text-muted-foreground text-[12px]">
        Advances the pool's validator set to the current round. Anyone can send
        this — it's not owner-only.
      </p>
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button onClick={onUpdateVset} disabled={busy}>
        Update vset
      </Button>
    </>
  );
}
