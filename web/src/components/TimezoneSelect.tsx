// Full list of timezones (D-008). The organization's own timezone and the
// current value come first; then every timezone the browser knows.
let all: string[] = [];
try {
  all = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
} catch {
  all = [];
}

export function TimezoneSelect({
  value,
  onChange,
  disabled,
  preferred,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  preferred: string[];
  label: string;
}) {
  const top = [...new Set([...preferred, value].filter(Boolean))];
  const rest = all.filter((z) => !top.includes(z));
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <optgroup label="★">
        {top.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </optgroup>
      <optgroup label="—">
        {rest.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
