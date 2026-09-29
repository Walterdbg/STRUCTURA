import { DEFAULT_LOCALE, isLocale, type Locale } from "@structura/domain";

// Every screen text exists in Spanish and English (DEC-012). The English
// table is typed against the Spanish one, so a missing translation fails
// the build instead of showing a blank.
const es = {
  "app.tagline": "Inventario, servicios y operaciones de eventos",
  "language.label": "Idioma",
  "status.title": "Estado del sistema",
  "status.checking": "Comprobando…",
  "status.ok": "Conectado",
  "status.degraded": "Base de datos no disponible",
  "status.unreachable": "Sin conexión con el servidor",
  "status.version": "Versión",
  "status.engine": "Motor",
  "status.deployment": "Instalación",
  "engine.cloud": "En línea (nube)",
  "engine.local": "Local (en sitio)",
  "status.retry": "Reintentar",
} as const;

type Key = keyof typeof es;

const en: Record<Key, string> = {
  "app.tagline": "Event inventory, services and operations",
  "language.label": "Language",
  "status.title": "System status",
  "status.checking": "Checking…",
  "status.ok": "Connected",
  "status.degraded": "Database unavailable",
  "status.unreachable": "Cannot reach the server",
  "status.version": "Version",
  "status.engine": "Engine",
  "status.deployment": "Installation",
  "engine.cloud": "Online (cloud)",
  "engine.local": "Local (onsite)",
  "status.retry": "Retry",
};

const TABLES: Record<Locale, Record<Key, string>> = { es, en };

export function translate(locale: Locale, key: Key): string {
  return TABLES[locale][key];
}

const STORAGE_KEY = "structura.locale";

// The chosen language is a per-browser convenience; if storage is blocked
// the app simply starts in Spanish.
export function loadLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_LOCALE;
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

export type { Key as TextKey };
