import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field, AddrLink } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  fmtAddr,
  getWhitelist,
  updateNominatorsWhitelist,
  validateGramInput,
} from '@/lib/pool';
import { isValidAddress } from '@/lib/ton';

export function UpdateWhitelistPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // whitelist
  const [wlInput, setWlInput] = useState('');
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
      {wlEntries.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[12px]">
            Whitelist ({wlEntries.length}):
          </span>
          {wlEntries.map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border px-3 py-1.5 text-[12px] font-mono"
            >
              <AddrLink
                addr={a}
                network={network}
                display={fmtAddr(a, network)}
              />
              <button
                className="text-destructive ml-2 shrink-0"
                onClick={() => {
                  setWlEntries(wlEntries.filter((_, j) => j !== i));
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {wlEntries.length === 0 && (
        <p className="text-muted-foreground text-[12px]">
          Whitelist is empty (open to all).
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={wlInput}
          onChange={(e) => {
            setWlInput(e.target.value);
            clearErr('wlInput');
          }}
          placeholder="UQ..."
          className={
            'h-9 flex-1 rounded-md border bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
            (fieldErrors.wlInput ? 'border-destructive' : 'border-input')
          }
        />
        <Button
          variant="outline"
          onClick={() => {
            const trimmed = wlInput.trim();
            if (!trimmed) return;
            if (!isValidAddress(trimmed)) {
              setErr('wlInput', 'Invalid address format');
              return;
            }
            clearErr('wlInput');
            const normalized = fmtAddr(trimmed, network);
            if (!wlEntries.includes(normalized)) {
              setWlEntries([...wlEntries, normalized]);
            }
            setWlInput('');
          }}
        >
          Add
        </Button>
      </div>
      {fieldErrors.wlInput && (
        <span className="text-destructive text-[11px] leading-tight">
          {fieldErrors.wlInput}
        </span>
      )}
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
