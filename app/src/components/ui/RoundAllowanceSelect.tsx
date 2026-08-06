// Reusable round allowance dropdown. Used by Deploy & Init (main validator)
// and Add Validator. `value` is the string "1" (odd), "2" (even), or "3"
// (all rounds).
export function RoundAllowanceSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-left">
      <span className="text-muted-foreground text-[12px]">Round allowance</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
      >
        <option value="3">All rounds</option>
        <option value="1">Odd rounds only</option>
        <option value="2">Even rounds only</option>
      </select>
    </label>
  );
}
