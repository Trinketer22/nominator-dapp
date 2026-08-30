import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { WhitelistInput } from '@/components/ui/WhitelistInput';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  fmtAddr,
  getWhitelist,
  updateNominatorsWhitelist,
  validateGramInput,
} from '@/lib/pool';

export function UpdateWhitelistPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // Whitelist entries — local to this panel, so they reset whenever the user
  // switches away from the Nominator Whitelist tab.
  const [wlEntries, setWlEntries] = useState<string[]>([]);
  const [msgValue, setMsgValue] = useState('1');

  // Fetch the current nominator whitelist so it can be displayed alongside the
  // entries being composed.
  const { data: currentWhitelist } = useQuery({
    queryKey: ['pool-whitelist', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getWhitelist(network, poolAddress),
  });

  // Sync the editable whitelist from the on-chain state whenever it changes
  // (on load, after refresh, after an update transaction confirms). User
  // edits are local until submitted; after submission the on-chain state
  // becomes the source of truth again.
  useEffect(() => {
    if (currentWhitelist) {
      setWlEntries(currentWhitelist.map((a) => fmtAddr(a, network)));
    }
  }, [currentWhitelist, network]);

  function onUpdateWhitelist() {
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run('Update whitelist', async () => {
      await updateNominatorsWhitelist(network, sender, {
        poolAddress,
        whitelist: new Map(wlEntries.map((a) => [a, true])),
        value,
      });
    });
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Update nominators whitelist</h2>
      <p className="text-muted-foreground text-[12px]">
        An empty list clears the restriction (open to all). Adding entries
        restricts deposits to listed addresses only.
      </p>
      <WhitelistInput
        entries={wlEntries}
        onEntriesChange={setWlEntries}
        network={network}
      />
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button onClick={onUpdateWhitelist} disabled={busy || !isOwner}>
        {wlEntries.length === 0 ? 'Clear whitelist' : 'Update whitelist'}
        {!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
