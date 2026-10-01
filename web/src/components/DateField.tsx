import { useContext, useEffect, useRef, useState } from "react";
import { LocaleContext } from "../i18n.js";

// A date box that shows the date the way the chosen language writes it
// (D-006): Spanish dd/mm/aaaa, English mm/dd/yyyy. The value stays
// YYYY-MM-DD. The calendar button opens the browser's date picker.

function format(iso: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return locale === "es" ? `${d}/${mo}/${y}` : `${mo}/${d}/${y}`;
}

function parse(text: string, locale: string): string | null {
  const parts = text.trim().split(/[/.\-\s]+/);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts.map((p) => p.trim());
  if (!a || !b || !c || c.length !== 4) return null;
  const [d, mo] = locale === "es" ? [a, b] : [b, a];
  const iso = `${c}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null;
}

export function DateField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const locale = useContext(LocaleContext);
  const [text, setText] = useState(() => format(value, locale));
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(format(value, locale));
  }, [value, locale]);

  const placeholder = locale === "es" ? "dd/mm/aaaa" : "mm/dd/yyyy";

  return (
    <div className="date-field">
      <input
        aria-label={label}
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const iso = parse(e.target.value, locale);
          // Anything not yet a valid date is passed on as typed, so the
          // form shows "invalid date" instead of silently keeping the old one.
          onChange(e.target.value.trim() === "" ? "" : (iso ?? e.target.value));
        }}
      />
      <button
        type="button"
        className="icon"
        aria-label={label}
        disabled={disabled}
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          if (typeof el.showPicker === "function") el.showPicker();
          else el.click();
        }}
      >
        📅
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden-picker"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
