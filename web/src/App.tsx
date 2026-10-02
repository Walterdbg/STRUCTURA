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
import { DateRulesCard } from "./pages/DateRulesCard.js";
import { VersionTag } from "./components/VersionTag.js";
import { RepositoryList, RepositoryRouteEditor } from "./pages/RepositoryPage.js";
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
    else if (route.name === "platform" && me.user.platformAdmin) body = <RepositoryList canEdit={false} features={me.tenant.features ?? []} platform />;
    else if (route.name === "platformRoute" && me.user.platformAdmin)
      body = <RepositoryRouteEditor key={`p-${route.id}`} routeId={route.id} canEdit={false} features={me.tenant.features ?? []} platform />;
    else if (route.name === "maps") body = <RepositoryList canEdit={can("map.edit")} features={me.tenant.features ?? []} />;
    else if (route.name === "mapNew") body = <RepositoryRouteEditor key={`new-${route.category ?? ""}`} newCategory={route.category} canEdit={can("map.edit")} features={me.tenant.features ?? []} />;
    else if (route.name === "map") body = <RepositoryRouteEditor key={route.id} routeId={route.id} canEdit={can("map.edit")} features={me.tenant.features ?? []} />;
    else if (route.name === "members" && can("tenant.admin")) body = <Members />;
    else if (route.name === "dateRules" && can("tenant.admin")) body = <DateRulesCard />;
    else if (route.name === "account") body = <MyAccount me={me} onSaved={refresh} onLocale={setLocale} />;
    else body = <EventsList canCreate={can("event.manage")} />;
  }

  // Left menu (Walter, 2026-10-01): the main sections, Inventory first;
  // tabs inside a section when its pages serve a common purpose.
  const section =
    route.name === "inventory" || route.name.startsWith("item") || route.name.startsWith("movement") || route.name === "locations"
      ? "inventory"
      : route.name === "maps" || route.name === "mapNew" || route.name === "map"
        ? "maps"
        : route.name === "platform" || route.name === "platformRoute"
        ? "platform"
        : route.name === "members" || route.name === "dateRules"
        ? "organization"
        : route.name === "account"
          ? "account"
          : "events";
  const tabs: { href: string; label: string; active: boolean }[] =
    section === "inventory"
      ? [
          { href: "#/inventory", label: t("nav.products"), active: route.name === "inventory" || route.name.startsWith("item") },
          { href: "#/movements", label: t("nav.movements"), active: route.name.startsWith("movement") },
          { href: "#/locations", label: t("nav.locations"), active: route.name === "locations" },
        ]
      : section === "organization"
        ? [
            { href: "#/members", label: t("nav.members"), active: route.name === "members" },
            { href: "#/settings/date-rules", label: t("rules.title"), active: route.name === "dateRules" },
          ]
        : [];

  return (
    <LocaleContext.Provider value={locale}>
      {session.kind !== "signedIn" ? (
        <div className="page">
          <header className="top">
            <div>
              <h1>STRUCTURA</h1>
              <VersionTag />
              <p className="tagline">{t("app.tagline")}</p>
            </div>
            {languagePicker}
          </header>
          <main>{body}</main>
          <SystemStatus />
        </div>
      ) : (
        <div className="shell">
          <aside className="side">
            {/* The name is the home button (Walter, 2026-10-01). */}
            <a href="#/events" className="home-link brand" title={t("nav.home")}>
              STRUCTURA
            </a>
            <VersionTag />
            <p className="tagline">{session.me.tenant.name}</p>
            <nav className="side-nav">
              <a href="#/inventory" className={section === "inventory" ? "active" : ""}>
                📦 {t("nav.inventory")}
              </a>
              <a href="#/events" className={section === "events" ? "active" : ""}>
                📅 {t("nav.events")}
              </a>
              <a href="#/maps" className={section === "maps" ? "active" : ""}>
                🗺 {t("nav.maps")}
              </a>
              {/* DEC-039: only platform administrators. */}
              {session.me.user.platformAdmin && (
                <a href="#/platform" className={section === "platform" ? "active" : ""}>
                  🌐 {t("nav.platform")}
                </a>
              )}
              {session.me.capabilities.includes("tenant.admin") && (
                <a href="#/members" className={section === "organization" ? "active" : ""}>
                  ⚙️ {t("nav.organization")}
                </a>
              )}
            </nav>
            <div className="side-foot">
              <a href="#/account" className={section === "account" ? "active" : ""} title={t("account.title")}>
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
              {languagePicker}
            </div>
          </aside>
          <div className="content">
            {tabs.length > 0 && (
              <nav className="tabs">
                {tabs.map((tb) => (
                  <a key={tb.href} href={tb.href} className={tb.active ? "active" : ""}>
                    {tb.label}
                  </a>
                ))}
              </nav>
            )}
            <main>{body}</main>
            <SystemStatus />
          </div>
        </div>
      )}
    </LocaleContext.Provider>
  );
}