import { useContext, useMemo } from "react";
import { LocaleContext } from "../i18n.js";

// Full list of timezones (D-008), each shown with its UTC offset and the
// time it is there now, e.g. "(UTC−05:00) America/Panama · 14:32",
// ordered by offset. The organization's own timezone and the current
// value come first.

let all: string[] = [];
try {
  all = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
} catch {
  all = [];
}

interface Zone {
  id: string;
  offsetMinutes: number;
  label: string;
}

function describe(id: string, now: Date, locale: string): Zone {
  let offsetText = "+00:00";
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part ?? "");
    if (m) offsetText = `${m[1]}:${m[2] ?? "00"}`;
  } catch {
    /* keep +00:00 */
  }
  const sign = offsetText.startsWith("-") ? -1 : 1;
  const [h, min] = offsetText.slice(1).split(":").map(Number);
  const time = new Intl.DateTimeFormat(locale === "es" ? "es-PA" : "en-US", { timeZone: id, hour: "2-digit", minute: "2-digit" }).format(now);
  return {
    id,
    offsetMinutes: sign * ((h ?? 0) * 60 + (min ?? 0)),
    label: `(UTC${offsetText.replace("-", "−")}) ${id.replace(/_/g, " ")} · ${time}`,
  };
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
  const locale = useContext(LocaleContext);
  const zones = useMemo(() => {
    const now = new Date();
    return all.map((z) => describe(z, now, locale)).sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.id.localeCompare(b.id));
  }, [locale]);
  const topIds = [...new Set([...preferred, value].filter(Boolean))];
  const top = topIds.map((id) => zones.find((z) => z.id === id) ?? describe(id, new Date(), locale));
  const rest = zones.filter((z) => !topIds.includes(z.id));
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <optgroup label="★">
        {top.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="UTC">
        {rest.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
