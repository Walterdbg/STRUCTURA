import { useCallback, useEffect, useState } from "react";
import { LOCALES, type Locale } from "@structura/domain";
import { ApiError, api, newCommand, send, type Me } from "./api.js";
import { LocaleContext, loadLocale, saveLocale, translate } from "./i18n.js";
import { useRoute } from "./router.js";
import { EventForm } from "./pages/EventForm.js";
import { CourseSheet } from "./pages/CourseSheet.js";
import { EventsList } from "./pages/EventsList.js";
import { InventoryList } from "./pages/InventoryList.js";
import { ItemForm } from "./pages/ItemForm.js";
import { Locations } from "./pages/Locations.js";
import { MovementForm } from "./pages/MovementForm.js";
import { MovementsList } from "./pages/MovementsList.js";
import { Login } from "./pages/Login.js";
import { Members } from "./pages/Members.js";
import { MyAccount } from "./pages/MyAccount.js";
import { SystemStatus } from "./pages/SystemStatus.js";

type Session = { kind: "loading" } | { kind: "signedOut" } | { kind: "signedIn"; me: Me };

export function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const [session, setSession] = useState<Session>({ kind: "loading" });
  const route = useRoute();
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      // The account's language wins once signed in (D-009).
      if (me.user.locale === "es" || me.user.locale === "en") setLocale(me.user.locale);
      setSession({ kind: "signedIn", me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSession({ kind: "signedOut" });
      else setSession({ kind: "signedOut" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale);
  }, [locale]);

  const languagePicker = (
    <label className="lang">
      <span>🌐 Idioma / Language</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setLocale(next);
          // Signed in: remember it on the account too, for every device.
          if (session.kind === "signedIn") {
            void send("PUT", "/api/me", newCommand({ displayName: session.me.user.displayName, locale: next })).catch(() => {});
          }
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l === "es" ? "Español" : "English"}
          </option>
        ))}
      </select>
    </label>
  );

  let body: JSX.Element;
  if (session.kind === "loading") body = <p>{t("common.loading")}</p>;
  else if (session.kind === "signedOut") body = <Login onSignedIn={refresh} />;
  else {
    const me = session.me;
    const can = (c: string) => me.capabilities.includes(c as never);
    // key: a different Event (or "new") always starts from a fresh form.
    if (route.name === "eventNew") body = <EventForm key="new" me={me} />;
    else if (route.name === "event") body = <EventForm key={route.id} me={me} eventId={route.id} />;
    else if (route.name === "courseSheet") body = <CourseSheet key={route.courseId} eventId={route.eventId} courseId={route.courseId} />;
    else if (route.name === "inventory") body = <InventoryList canManage={can("inventory.manage")} canMove={can("movement.post")} />;
    else if (route.name === "itemNew") body = <ItemForm key="new" canManage={can("inventory.manage")} canMove={can("movement.post")} canCorrect={can("movement.correct")} />;
    else if (route.name === "item")
      body = <ItemForm key={route.id} itemId={route.id} canManage={can("inventory.manage")} canMove={can("movement.post")} canCorrect={can("movement.correct")} canAudit={can("audit.read")} canPhoto={can("attachment.manage")} />;
    else if (route.name === "locations") body = <Locations canManage={can("inventory.manage")} />;
    else if (route.name === "movements") body = <MovementsList canMove={can("movement.post")} canCorrect={can("movement.correct")} />;
    else if (route.name === "movementNew") body = <MovementForm key={route.itemId ?? "any"} presetItemId={route.itemId} />;
    else if (route.name === "members" && can("tenant.admin")) body = <Members />;
    else if (route.name === "account") body = <MyAccount me={me} onSaved={refresh} onLocale={setLocale} />;
    else body = <EventsList canCreate={can("event.manage")} />;
  }

  return (
    <LocaleContext.Provider value={locale}>
      <div className="page">
        <header className="top">
          <div>
            <h1>STRUCTURA</h1>
            <p className="tagline">
              {session.kind === "signedIn" ? session.me.tenant.name : t("app.tagline")}
            </p>
          </div>
          {languagePicker}
        </header>

        {session.kind === "signedIn" && (
          <nav className="nav">
            <a href="#/events" className={route.name.startsWith("event") ? "active" : ""}>
              {t("nav.events")}
            </a>
            <a href="#/inventory" className={route.name === "inventory" || route.name.startsWith("item") ? "active" : ""}>
              {t("nav.inventory")}
            </a>
            <a href="#/movements" className={route.name.startsWith("movement") ? "active" : ""}>
              {t("nav.movements")}
            </a>
            <a href="#/locations" className={route.name === "locations" ? "active" : ""}>
              {t("nav.locations")}
            </a>
            {session.me.capabilities.includes("tenant.admin") && (
              <a href="#/members" className={route.name === "members" ? "active" : ""}>
                {t("nav.members")}
              </a>
            )}
            <span className="spacer" />
            <a href="#/account" className={`who ${route.name === "account" ? "active" : ""}`} title={t("account.title")}>
              👤 {session.me.user.displayName}
            </a>
            <button
              type="button"
              onClick={async () => {
                await api.logout().catch(() => {});
                setSession({ kind: "signedOut" });
              }}
            >
              {t("nav.signOut")}
            </button>
          </nav>
        )}

        <main>{body}</main>
        <SystemStatus />
      </div>
    </LocaleContext.Provider>
  );
}
