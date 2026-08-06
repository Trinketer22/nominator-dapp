import { useMemo, type ReactNode } from 'react';
import {
  tonscanAddrUrl,
  formatAddressForNetwork,
  isValidAddress,
} from '@/lib/ton';
import type { Network } from '@/lib/router';

export function AddrLink({
  addr,
  network,
  display,
  bounceable = false,
}: {
  addr: string;
  network: Network;
  display?: string;
  bounceable?: boolean;
}) {
  // Guard against invalid input so a bad address never throws during render
  // and crashes the component tree. Callers should validate upstream, but
  // AddrLink is used widely so it stays defensive.
  const valid = isValidAddress(addr);
  const href = valid ? tonscanAddrUrl(network, addr) : undefined;
  const text =
    display ??
    (valid ? formatAddressForNetwork(addr, network, bounceable) : addr);
  if (!href) {
    return <span className="font-mono text-[13px] break-all">{text}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[13px] break-all underline text-primary hover:text-primary/80"
    >
      {text}
    </a>
  );
}

export function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[12px]">{label}</span>
      <span className="font-mono text-[13px] break-all">{value}</span>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
}) {
  const isNumber = type === 'number';
  // Derive a stable id/name from the label so the input is addressable by
  // autofill, password managers, and accessibility tooling without callers
  // having to pass one explicitly.
  const fieldId = useMemo(
    () =>
      `field-${label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`,
    [label],
  );
  const fieldName = useMemo(
    () =>
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, ''),
    [label],
  );
  return (
    <label className="flex flex-col gap-1 text-left" htmlFor={fieldId}>
      <span className="text-muted-foreground text-[12px]">{label}</span>
      <input
        id={fieldId}
        name={fieldName}
        type={type}
        value={value}
        placeholder={placeholder}
        min={isNumber ? '0' : undefined}
        step={isNumber ? 'any' : undefined}
        onChange={(e) => {
          const next = e.target.value;
          if (isNumber && next !== '' && Number(next) < 0) return;
          onChange(next);
        }}
        className={
          'h-9 rounded-md border bg-background px-3 text-[13px] font-mono outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
          (error ? 'border-destructive' : 'border-input')
        }
      />
      {error && (
        <span className="text-destructive text-[11px] leading-tight">
          {error}
        </span>
      )}
    </label>
  );
}

export type Step = 'idle' | 'pending' | 'done' | 'warn' | 'error';

export function StatusBox({
  status,
  message,
}: {
  status: Step;
  message: ReactNode;
}) {
  if (!message) return null;
  return (
    <div
      className={
        status === 'error'
          ? 'rounded-md border border-destructive/50 bg-destructive/10 p-3 text-[13px]'
          : status === 'done'
            ? 'rounded-md border border-success/50 bg-success/10 p-3 text-[13px]'
            : status === 'warn'
              ? 'rounded-md border border-warning/50 bg-warning/10 p-3 text-[13px]'
              : 'rounded-md border p-3 text-[13px]'
      }
    >
      {message}
    </div>
  );
}

// A small-screen card layout for table data. Each entry is a stacked row of
// label/value pairs. Pair with a table that is hidden on small screens:
//
//   <div className="hidden sm:block"><table>…</table></div>
//   <div className="sm:hidden flex flex-col gap-2">
//     <DataCard pairs={[{label, value}, …]} onClick={…} selected={…} />
//   </div>
export function DataCard({
  pairs,
  onClick,
  selected,
  accent,
}: {
  pairs: { label: string; value: ReactNode }[];
  onClick?: () => void;
  selected?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={
        'rounded-md border p-3 flex flex-col gap-1 ' +
        (selected
          ? 'bg-accent/60 '
          : onClick
            ? 'cursor-pointer hover:bg-accent/30 '
            : '') +
        (accent ? 'bg-warning/5 ' : '')
      }
    >
      {pairs.map((p, i) => (
        <div key={i} className="flex justify-between gap-3 text-[13px]">
          <span className="text-muted-foreground shrink-0">{p.label}</span>
          <span className="font-mono text-right break-all">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
