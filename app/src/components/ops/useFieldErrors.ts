import { useCallback, useState } from 'react';

// Per-panel inline field-error management. Each sub-panel gets its own
// independent error scope, so errors from one panel never leak into another
// when the user switches tabs (the previous panel unmounts and its state,
// including these errors, is discarded).
export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setErr = useCallback((field: string, msg: string) => {
    setFieldErrors((p) => ({ ...p, [field]: msg }));
  }, []);

  const clearErr = useCallback((field: string) => {
    setFieldErrors((p) => {
      if (!(field in p)) return p;
      const n = { ...p };
      delete n[field];
      return n;
    });
  }, []);

  const withClear = useCallback(
    (setter: (v: string) => void, field: string) => (v: string) => {
      setter(v);
      clearErr(field);
    },
    [clearErr],
  );

  const clearAllErr = useCallback(() => setFieldErrors({}), []);

  return { fieldErrors, setErr, clearErr, withClear, clearAllErr };
}
