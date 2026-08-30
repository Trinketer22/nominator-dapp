import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { AddrLink } from '@/components/ui/form';
import { fmtAddr } from '@/lib/pool';
import type { Network } from '@/lib/router';
import { isValidAddress } from '@/lib/ton';

// Controlled nominator-whitelist editor shared by the Update nominators
// whitelist panel and the Deploy & Initialize form (the init message accepts a
// whitelist via NominatorsSettings). The entries live in the parent's state;
// this component owns only the add-input text and its inline validation
// (invalid format / duplicates). Entries are stored normalized (fmtAddr) so
// duplicates compare by the same representation the parent submits.
export function WhitelistInput({
  entries,
  onEntriesChange,
  network,
  label = 'Nominator whitelist',
}: {
  entries: string[];
  onEntriesChange: (entries: string[]) => void;
  network: Network;
  label?: string;
}) {
  const [wlInput, setWlInput] = useState('');
  const [inputError, setInputError] = useState('');

  function onAdd() {
    const trimmed = wlInput.trim();
    if (!trimmed) return;
    if (!isValidAddress(trimmed)) {
      setInputError('Invalid address format');
      return;
    }
    setInputError('');
    const normalized = fmtAddr(trimmed, network);
    if (!entries.includes(normalized)) {
      onEntriesChange([...entries, normalized]);
    }
    setWlInput('');
  }

  return (
    <div className="flex flex-col gap-2 text-left">
      <span className="text-muted-foreground text-[12px]">{label}</span>
      {entries.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[12px]">
            Whitelist ({entries.length}):
          </span>
          {entries.map((a, i) => (
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
                  onEntriesChange(entries.filter((_, j) => j !== i));
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {entries.length === 0 && (
        <p className="text-muted-foreground text-[12px]">
          Whitelist is empty (open to all).
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={wlInput}
          onChange={(e) => {
            setWlInput(e.target.value);
            setInputError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="UQ..."
          className={
            'h-9 flex-1 rounded-md border bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
            (inputError ? 'border-destructive' : 'border-input')
          }
        />
        <Button variant="outline" onClick={onAdd}>
          Add
        </Button>
      </div>
      {inputError && (
        <span className="text-destructive text-[11px] leading-tight">
          {inputError}
        </span>
      )}
    </div>
  );
}
