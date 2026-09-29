import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@structura/domain";

// Every screen text exists in Spanish and English (DEC-012). The English
// table is typed against the Spanish one, so a missing translation fails
// the build instead of showing a blank.
const es = {
  "app.tagline": "Inventario, servicios y operaciones de eventos",
  "language.label": "Idioma",
  "nav.events": "Eventos",
  "nav.members": "Usuarios",
  "nav.signOut": "Cerrar sesión",

  "login.title": "Iniciar sesión",
  "login.email": "Correo electrónico",
  "login.password": "Contraseña",
  "login.submit": "Entrar",
  "login.chooseTenant": "Elija la organización",
  "login.wrong": "Correo o contraseña incorrectos",
  "login.throttled": "Demasiados intentos fallidos. Espere 15 minutos.",

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

  "common.save": "Guardar",
  "common.saving": "Guardando…",
  "common.saved": "Guardado",
  "common.cancel": "Cancelar",
  "common.edit": "Editar",
  "common.back": "Volver",
  "common.search": "Buscar",
  "common.loading": "Cargando…",
  "common.none": "—",
  "common.noResults": "No hay resultados.",

  "events.title": "Eventos",
  "events.create": "Crear evento",
  "events.searchPlaceholder": "Buscar por nombre o lugar",
  "events.empty": "Todavía no hay eventos. Use «Crear evento» para empezar.",
  "events.newTitle": "Nuevo evento",
  "events.editTitle": "Editar evento",
  "event.designation": "Nombre o designación",
  "event.designationHint": "Puede ser provisional, por ejemplo «Evento interno — octubre». No se necesita cliente.",
  "event.designationStatus": "Nombre",
  "event.provisional": "Provisional",
  "event.final": "Definitivo",
  "event.responsible": "Responsable",
  "event.timezone": "Zona horaria",
  "event.location": "Lugar del evento",
  "event.eventDate": "Fecha del evento",
  "event.departureDate": "Salida del almacén",
  "event.expectedReturnDate": "Retorno previsto",
  "event.closureDate": "Cierre real",
  "event.notes": "Notas",
  "event.state": "Estado",
  "event.version": "Versión del registro",
  "state.draft": "Borrador",
  "state.confirmed": "Confirmado",
  "state.delivered": "Entregado",
  "state.partial_return": "Retorno parcial",
  "state.closed": "Cerrado",
  "state.cancelled": "Cancelado",

  "members.title": "Usuarios",
  "members.add": "Agregar usuario",
  "members.name": "Nombre",
  "members.email": "Correo electrónico",
  "members.password": "Contraseña inicial (mínimo 10 caracteres)",
  "members.role": "Perfil",
  "members.permissions": "Permisos",
  "preset.tenant_administrator": "Administrador",
  "preset.operations_manager": "Gerente de operaciones",
  "preset.inventory_operator": "Operador de inventario",
  "preset.viewer_auditor": "Consulta / auditoría",

  "err.field.designation": "Indique un nombre (puede ser provisional).",
  "err.field.expectedReturnDate": "El retorno previsto no puede ser antes de la salida.",
  "err.field.date": "Fecha no válida.",
  "err.field.timezone": "Zona horaria desconocida.",
  "err.field.responsibleUserId": "Elija un responsable de esta organización.",
  "err.field.email": "Correo no válido o ya registrado.",
  "err.field.password": "La contraseña debe tener al menos 10 caracteres.",
  "err.field.displayName": "Indique un nombre.",
  "err.validation": "Revise los campos marcados.",
  "err.permission_denied": "No tiene permiso para esta acción.",
  "err.stale_version": "Otra persona cambió este registro. Recárguelo e intente de nuevo; sus cambios siguen en pantalla.",
  "err.not_found": "El registro no existe o no tiene acceso.",
  "err.invalid_state": "El registro ya no se puede modificar en su estado actual.",
  "err.unauthenticated": "Su sesión terminó. Inicie sesión de nuevo.",
  "err.unreachable": "Sin conexión con el servidor. No se guardó nada; puede reintentar.",
  "err.internal": "Error inesperado del servidor. No se guardó nada.",
} as const;

export type TextKey = keyof typeof es;

const en: Record<TextKey, string> = {
  "app.tagline": "Event inventory, services and operations",
  "language.label": "Language",
  "nav.events": "Events",
  "nav.members": "Users",
  "nav.signOut": "Sign out",

  "login.title": "Sign in",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.chooseTenant": "Choose the organization",
  "login.wrong": "Wrong email or password",
  "login.throttled": "Too many failed attempts. Wait 15 minutes.",

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

  "common.save": "Save",
  "common.saving": "Saving…",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.edit": "Edit",
  "common.back": "Back",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.none": "—",
  "common.noResults": "No results.",

  "events.title": "Events",
  "events.create": "Create event",
  "events.searchPlaceholder": "Search by name or place",
  "events.empty": "No events yet. Use “Create event” to start.",
  "events.newTitle": "New event",
  "events.editTitle": "Edit event",
  "event.designation": "Name or designation",
  "event.designationHint": "Can be provisional, e.g. “Internal event — October”. No customer needed.",
  "event.designationStatus": "Name",
  "event.provisional": "Provisional",
  "event.final": "Final",
  "event.responsible": "Responsible",
  "event.timezone": "Timezone",
  "event.location": "Event location",
  "event.eventDate": "Event date",
  "event.departureDate": "Warehouse departure",
  "event.expectedReturnDate": "Expected return",
  "event.closureDate": "Actual closure",
  "event.notes": "Notes",
  "event.state": "Status",
  "event.version": "Record version",
  "state.draft": "Draft",
  "state.confirmed": "Confirmed",
  "state.delivered": "Delivered",
  "state.partial_return": "Partial return",
  "state.closed": "Closed",
  "state.cancelled": "Cancelled",

  "members.title": "Users",
  "members.add": "Add user",
  "members.name": "Name",
  "members.email": "Email",
  "members.password": "Initial password (at least 10 characters)",
  "members.role": "Profile",
  "members.permissions": "Permissions",
  "preset.tenant_administrator": "Administrator",
  "preset.operations_manager": "Operations manager",
  "preset.inventory_operator": "Inventory operator",
  "preset.viewer_auditor": "Viewer / auditor",

  "err.field.designation": "Enter a name (it can be provisional).",
  "err.field.expectedReturnDate": "Expected return cannot be before departure.",
  "err.field.date": "Invalid date.",
  "err.field.timezone": "Unknown timezone.",
  "err.field.responsibleUserId": "Choose a responsible person from this organization.",
  "err.field.email": "Invalid or already registered email.",
  "err.field.password": "Password must have at least 10 characters.",
  "err.field.displayName": "Enter a name.",
  "err.validation": "Check the highlighted fields.",
  "err.permission_denied": "You don't have permission for this action.",
  "err.stale_version": "Someone else changed this record. Reload it and try again; your changes are still on screen.",
  "err.not_found": "The record doesn't exist or you don't have access.",
  "err.invalid_state": "The record can no longer be changed in its current state.",
  "err.unauthenticated": "Your session ended. Sign in again.",
  "err.unreachable": "Cannot reach the server. Nothing was saved; you can retry.",
  "err.internal": "Unexpected server error. Nothing was saved.",
};

const TABLES: Record<Locale, Record<TextKey, string>> = { es, en };

export function translate(locale: Locale, key: TextKey): string {
  return TABLES[locale][key];
}

export function hasKey(key: string): key is TextKey {
  return key in es;
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

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useT(): (key: TextKey) => string {
  const locale = useContext(LocaleContext);
  return (key) => translate(locale, key);
}

// Maps a failed request to one localized sentence.
export function errorKey(kind: string): TextKey {
  const key = `err.${kind}`;
  return hasKey(key) ? key : "err.internal";
}
