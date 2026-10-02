# Changelog — STRUCTURA

Every entry gets an **Intent** and a **Result**. A Result is only marked
confirmed once actually verified, and can honestly say FAILED.

## 0.1.0-dev.32 — 2026-10-02 (Reset view, current location, full-screen controls) — NOT YET TESTED BY WALTER

**Intent:** Walter's screenshot: in full screen the tool bar covered the
map-layer list (D-022). He also asked for an obvious reset button and for
every map to open on the current location (DEC-043).

**Result:** In full screen the map's own controls sit below the tool bar.
Every map (Event map, Mapas editor, Event location picker) has a
**⟲ Reset view** button that returns it to its course / items / place, or the
current location. Maps with nothing of their own open on the current location
(the browser asks; refusing leaves the map as before). Checked by Claude:
type check, build, Docker dev.32 health, the button is on the map. Not seen on
screen: the layout and the location jump (browser pane hidden).
## 0.1.0-dev.31 — 2026-10-02 (My location, starting view) — NOT YET TESTED BY WALTER

**Intent:** Walter: a new map opens on a fixed place although he has a
location (DEC-042). The spec says maps must never require GPS permission.

**Result:** An optional **📍 My location** button on the Event map, the
Mapas editor and the Event location picker; the browser asks permission only
when it is pressed. New routes in Mapas open where the person last worked
(remembered in the browser). Checked by Claude: build, Docker, button present;
the remembered view and the jump were not seen on screen (browser pane hidden).
## 0.1.0-dev.27 to dev.30 — 2026-10-01 (native heights, compact lists) — NOT YET TESTED BY WALTER

**Intent:** Google's terms don't allow storing its heights; Walter: make
them native (open public data) and store them; compact lists.

**Result:**
- **dev.27** — Google heights shown on the chart but no longer stored.
- **dev.28** — compact route lists: tight rows (26 px instead of 54),
  foldable groups with counts, Fold all / Unfold all, small GPX icon
  (DEC-041).
- **dev.29** — **native heights** (DEC-040): open public elevation data
  (USGS 3DEP in the US, SRTM elsewhere) through OpenTopoData, stored in the
  course and its GPX; files' own heights kept as they are. The 6 preloaded
  courses that had Google heights got native ones (new version v2; US within
  0.5-4 m of Google, Panama within about 9-12 m).
- **dev.30** — elevation requests queued and spaced across users (the free
  service allows one a second).
- Checked by Claude: 138/138 server tests (native heights sampled,
  interpolated, Google not called); live: Newark 4.4 m (USGS), Panama City
  13 m (SRTM); 6/6 courses updated; compact list measured in the browser.
## 0.1.0-dev.26 — 2026-10-01 (Platform course library) — NOT YET TESTED BY WALTER

**Intent:** Walter: all organizations' courses are in our database and must
be visible, grouped, at his super-admin level (DEC-039); every item opens
zoomed onto itself.

**Result:**
- **Platform administrator** flag (migration 012), granted only with
  `cli/platform.js --grant <email>`; Walter's test account granted.
- **🌐 Platform** section (platform administrators only): every
  organization's courses, grouped country › area › place, with the
  organization shown; read-only; GPX download.
- Event map items open zoomed onto themselves.
- Found while checking (P-023): Google's terms don't allow storing Elevation
  API results, and Routes API paths only 30 days. 6 preloaded courses carry
  Google heights; no Google street paths are stored yet.
- Checked by Claude: 138/138 server tests (other organizations and
  non-administrators can't see the platform library); browser: Platform
  menu, 52 courses in 17 groups with their organization.
## 0.1.0-dev.21 to dev.25 — 2026-10-01 (Walter's course files) — NOT YET TESTED BY WALTER

**Intent:** Walter's GPX files work on Racemap but not here; keep the
points Racemap shows; read the point texts in full; show the direction;
version visible; group the library; preload all his courses.

**Result:**
- **dev.21** — Racemap files read (D-019): undeclared rmx: fields
  declared before reading, plus a forgiving fallback reader. Waypoints kept
  (DEC-037): only those Racemap shows (hidden timing points left out); full
  labels instead of plotaroute's 10-letter cuts (D-020). Direction arrows
  along courses. POIs become Event points when a route is used in an
  Event or a GPX is loaded into an Event. Migration 010.
- **dev.22** — the running version shown under the STRUCTURA name.
- **dev.23 / dev.25** — a course opens on its own line (D-021).
- **dev.24** — library grouped by type and Country > Area > Place
  (DEC-038), type filter, location fields with suggestions, location change
  without a new GPX version. Migration 011.
- **Preload (data, not code):** 48 courses from 00-Walter_Main_Data (all
  folders except 00-Legacy) and the 4 Panama courses found in 00-Legacy, as
  courses with heights and 362 POIs, grouped: USA > New York / New Jersey >
  folder; Panama > Panamá (> Parque Omar). Notes name the folder and the
  STRUCTURA version that loaded them.
- Checked by Claude: 137/137 server tests; all 95 GPX files in Walter's
  folder read in the browser; preload 52/52; Bay Ridge 10K shows 13 POIs
  with full labels and 40 direction arrows; grouped list with 17 groups.
## 0.1.0-dev.20 — 2026-10-01 (reusable routes) — NOT YET TESTED BY WALTER

**Intent:** Walter: a loaded map is only a location that may be repurposed,
e.g. a race map reused for the delivery route to the water stations and
course signs (DEC-036).

**Result:**
- Uploading a GPX loads only the line and its place, as a plain route.
- The type (course, delivery, pickup, other) can be changed any time; each
  change is a new GPX version; a course gets its heights when saved.
- **Guide route**: in Mapas, another repository route can be shown as a
  faint guide line to draw along.
- Browser-checked by Claude: upload -> plain route; changed to course ->
  v2 with heights; new delivery route with the course as guide line.
## 0.1.0-dev.19 — 2026-10-01 (GPX upload in Mapas) — NOT YET TESTED BY WALTER

**Intent:** Walter: "in new course I cannot upload maps?" (D-018): the GPX
button was hidden while drawing, and a new course opens in drawing mode.

**Result:** **⤒ Upload GPX** is always at the top of a course page (also
while drawing) and at the bottom. The Mapas list has **⤒ Upload GPX** too:
the file is saved straight to the repository as version 1 (a course, with
heights) and opened. Browser-checked by Claude with a GPX file (2.52 km,
climb 12 m).
## 0.1.0-dev.18 — 2026-10-01 (full screen map) — NOT YET TESTED BY WALTER

**Intent:** Walter: wheel zoom in full screen is good, but "the controls
must be over the map at that moment, not using 40% of the screen" (D-017).

**Result:** In full screen the map fills the screen. The drawing tools float
in a slim bar at the top (instructions hidden); units, markers and *Go to
a place* at the bottom left; the open item's panel (Event map) or the Save
buttons (Mapas) at the bottom right; everything else is hidden until full
screen ends. Layout checked by Claude with a simulation (a real full screen
needs a click).
## 0.1.0-dev.17 — 2026-10-01 (place search fix) — NOT YET TESTED BY WALTER

**Intent / Result:** D-016: after choosing a place in *Go to a place*, the
suggestion list no longer opens again. Browser-checked by Claude.

## 0.1.0-dev.16 — 2026-10-01 (ArcGIS Imagery fixed, key live)

**Intent:** With Walter's ArcGIS key in place, the live check showed
ArcGIS Imagery failing (D-015): the Static Basemap Tiles service only has
imagery labels, not the photos.

**Result:** ArcGIS Imagery now comes from ArcGIS World Imagery (256 px;
the key goes server to server as a token and is never logged or shown).
Live: Topo, Streets and Imagery all served through our server; Central
Park shown with leafless trees on a course map. 136/136 server tests.
## 0.1.0-dev.15 — 2026-10-01 (ArcGIS for race courses) — NOT YET TESTED BY WALTER

**Intent:** B-005, the base maps RunningAhead offers, limited by Walter to
race course work, with Google kept as the main map (DEC-035).

**Result:**
- With `ARCGIS_KEY` in `.env`, the layer switch on **Race Event maps,
  course routes in Mapas and the course sheet** offers **ArcGIS Topo,
  ArcGIS Streets and ArcGIS Imagery** besides Google and OSM. Other maps
  (rentals, deliveries, the Event location) show Google and OSM only.
- Pictures come through our server; the key goes in a header and never
  reaches the browser. Esri attribution shown. The last choice is
  remembered in the browser.
- Without the key nothing changes (P-022).
- Checked by Claude: 136/136 server tests (tiles through our server, key in
  the header only, unknown styles refused, hidden without key); browser
  with a placeholder key: ArcGIS offered on the race map and repository
  course, not on the rental map, location map or repository delivery.
  The real pictures are NOT seen yet (no key).
## 0.1.0-dev.14 — 2026-10-01 (Maps repository, left menu, motorcycle) — NOT YET TESTED BY WALTER

**Intent:** Walter: routes and race courses made ahead of time in their own
Maps section, "saved as GPX maps always" (DEC-033); navigation moved to
the left with tabs where pages belong together (DEC-034); STRUCTURA as the
home button; "Google paths are for cars / delivery, and delivery must add
motorcycle".

**Result:**
- **🗺 Mapas**: a repository of race courses and delivery / pickup routes.
  Draw a route or import a GPX; every save is a new **GPX version** (v1,
  v2, ...), each downloadable; Duplicate; lock courses; remove (versions
  kept). Migration 009 (versions can never be changed).
- **Events**: 📚 *From repository* adds a route as the Event's own copy
  (noting route and version; rental Events aren't offered courses);
  📚 *Save to repository* keeps an Event route for other Events.
- **Left menu**: Inventario (tabs Productos / Movimientos / Ubicaciones),
  Eventos, Mapas, Organización (tabs Usuarios / Reglas de fechas); account,
  sign out and language at the bottom; STRUCTURA goes home.
- **Route tools**: courses are drawn by hand (✏️ only); delivery and pickup
  routes offer 🚗 By car, 🏍 By motorcycle and ✏️. Where Google has no
  motorcycle paths, the car path is used and the screen says so.
- Checked by Claude: 134/134 server tests (repository versions, GPX
  content, append-only, add-on, lock, permissions; motorcycle with car
  fallback); browser: menu and tabs, repository list / open / save v2 with
  heights / duplicate, rental vs race picker, copy into a race Event with
  source and heights, save an Event route to the repository; delivery
  tools 🚗 🏍 ✏️ and course ✏️ only; Docker dev.14 with migration 009.
## 0.1.0-dev.13 — 2026-10-01 (you draw the route) — NOT YET TESTED BY WALTER

**Intent:** Walter: street tools "even on foot take a wild route around
the map"; "you don't need to find the route, I'm creating it" (D-014).

**Result:**
- **✏️ Draw is the default tool** for every route: the line goes exactly
  through the clicks.
- **👣 / 🚲 / 🚗** only fit a piece to the street between two clicks. If
  Google's path is longer than 1.5 times the direct way (and more than
  60 m extra), it is ignored and the piece stays straight, with a quiet
  note. "Fit to streets" keeps a long piece as it was rather than turning
  it into a detour.
- The red "No street route was found" error is gone; at most a quiet note.
- Checked by Claude: 129/129 server tests; Draw selected by default in the
  browser; Docker health. The detour check itself was not seen on screen
  (browser pane hidden); it is a length comparison in the route editor.
## 0.1.0-dev.12 — 2026-10-01 (Race vs Rental, date limits, race tools) — NOT YET TESTED BY WALTER

**Intent:** Walter's approved changes: separate races from rentals
(DEC-031), logistics limits and equipment-out warnings (DEC-028), and race
tools closer to RunningAhead (DEC-032).

**Result:**
- **Event type** chosen at creation, never changed: **📦 Rental &
  deliveries** (default) or **🏁 Race**. Rentals have no course tools; the
  server refuses courses on them. New **↩ Pickup** route next to **🚚
  Delivery**. Migration 008 (existing Events with a course become races).
- **Date limits** (per organization, Usuarios page, recorded in the
  history): departure at most 15 days before the event, return at most 7
  business days after; the form shows the allowed range and, if broken,
  the earliest / latest allowed date. Checked only when dates change.
- **Equipment still out**: warning 3 days after the event, **overdue**
  after the expected return, on the Event page and the Events list; it
  clears when everything is back.
- **Race tools**: live distance while drawing; km / mi; distance markers
  every 0.5 / 1 / 5 (show / hide); Back to start; Out and back drawn on the
  map; Reverse; Lock course; Centre; elevation chart that shows the spot
  on the map; Go to a place search. The course sheet uses the same units
  and markers.
- Events list: type icon, event date column, dates in the language's
  format.
- Checked by Claude: 129/129 server tests (types, limits with business
  days, settings, warnings over time, races-only courses, locked courses);
  browser run: limit messages with dates, race creation, drawing with
  out-and-back / undo / back to start / reverse, miles and markers,
  elevation hover on the map, lock, rental map without course tools, date
  rules card; Docker dev.12 with migration 008.
## 0.1.0-dev.11 — 2026-10-01 (routes drawn piece by piece) — NOT YET TESTED BY WALTER

**Intent:** Walter's main need for courses (DEC-030): draw the main route
fast, then add the small details by hand, zoomed in, like RunningAhead's
"on foot" and "draw" tools.

**Result:**
- Each click adds one piece, made with the chosen tool: **👣 On foot**,
  **🚲 By bike**, **🚗 By car** (follow streets and paths) or **✏️ Draw**
  (straight, exactly where clicked). The tool can change at any click.
- **↶ Undo** (or Ctrl+Z) one step at a time; **🧽 Clear**; **✓ Done**.
- Details: drag the small handle in the middle of a piece to add a point
  there; drag a point; right-click or double-click a point to remove it.
  The pieces touching a changed point are remade with the chosen tool.
- Saved routes keep their points and each piece's tool, so **✎ Edit
  shape** brings the pieces back. Older routes and GPX files open as
  pieces kept exactly as they were until changed. Courses get their
  heights again after a change.
- **🛣 Fit to streets** now remakes every piece along the streets and
  leaves the route open for details.
- Checked by Claude: 122/122 server tests (piece data validated; walking,
  cycling and driving routes); browser run with the live Google key:
  on-foot piece + straight piece, middle handle dragged, undo, done,
  saved with heights (1.33 km), reopened, a point dragged with On foot,
  saved again with new heights (1.68 km); Docker health.
## 0.1.0-dev.10 — 2026-10-01 (map fixes from Walter's tests) — NOT YET TESTED BY WALTER

**Intent:** Fix what Walter found testing the Google maps (T-011..T-013):
a route he couldn't save and lost, no full-screen view, zooming while
drawing, the Map / Satellite switch, and the Area tool he doesn't need.

**Result:**
- **Saving map items (D-010):** a missing name no longer blocks saving;
  STRUCTURA names the item, e.g. "Recorrido (carrera) 1". An unsaved
  drawing is never thrown away without asking.
- **Course elevation (D-012):** changing a line's type to Course gets its
  heights right away; no Save + Fit to streets needed.
- **Full screen and zoom (D-013):** ⛶ button on every map; the Event map
  goes full screen with its tools. The mouse wheel zooms while drawing and
  in full screen. The Event map stays visible while the Event is edited.
- **Map / Satellite switch (D-011):** compact, in the screen's colours and
  language.
- **No Area tool (DEC-029):** stage, bar storage and the like are points.
  Areas drawn before still show.
- The Event's name status box now reads *Name status* / *¿Nombre
  definitivo?* instead of a second *Name*.
- Checked by Claude: 120/120 server tests; browser run with the live
  Google key (course with heights by itself, saved with no name, warning
  before discarding); Docker health and live search. Full screen not
  checked (browsers allow it only from a real click).
## 0.1.0-dev.9 — 2026-09-30 (Google maps, course tools 1–5) — PARTLY TESTED BY WALTER (T-011..T-013, 2026-10-01)

**Intent:** Walter chose Google for maps (DEC-026) and ordered the course
tools 1–5 (DEC-027): follow streets, elevation for drawn courses, points
at a distance on a course, start/finish + laps + out-and-back, course
sheet.

**Result:**
- **Google connection** (switches on by itself when `GOOGLE_MAPS_KEY` is
  set in `.env`; until then OpenStreetMap keeps working):
  - place search that finds buildings, e.g. "PH Palmas Bellas", billed
    once per search
  - map pictures with a **🗺 Mapa / 🛰 Satélite** switch, and Google's
    copyright text for the area on screen
  - street routing and elevation
  - everything goes through our server; the key never reaches browsers
    (tested)
- **(1) Follow streets:** while drawing a route, **Seguir calles** makes
  the line follow real streets (driving for delivery, walking for
  courses). **🛣 Ajustar a calles** re-fits an existing route. Available
  to every organization.
- **(2) Elevation for drawn courses:**
  - heights are added automatically after drawing a course, or with
    **⛰ Obtener elevación**
  - a GPX without heights also gets them
  - courses add-on
- **(3) Points at a distance on a course** (migration
  `007_map_feature_props.sql`):
  - a point can be placed "on the course at km X", and the server puts
    it exactly on the line
  - placed points follow the course when its shape changes; if the
    course is removed they stay where they are, no longer tied to it
  - the map list shows each point's km ("km 2.00"), or "≈ km" for points
    within 30 m of a course
- **(4) Start, finish, laps, out-and-back:**
  - ▶ and 🏁 markers on courses
  - a laps setting (1–50) and an out-and-back option
  - total distance = one pass × (2 if out-and-back) × laps, e.g.
    "20.07 km (2 × 5.02 km ↔)"
- **(5) Course sheet:** **📄 Hoja del recorrido** opens a printable page
  with the map, km markers, start/finish and stations, the distance
  breakdown, the climb (per pass), the elevation chart, and the stations
  table by km. **🖨 Imprimir / Guardar PDF** uses the browser's print,
  formatted for paper.
- Tests: 130/130 (domain 10, server 120), including the Google services
  against a simulated Google, and the route-line format checked against
  Google's own published example.
- Checked in the browser (dev run, OpenStreetMap):
  - GPX course with 2 laps, out-and-back: total 20.07 km, start and
    finish markers
  - "Agua km 2" placed at km 2.00
  - course sheet with title, date, place, distance breakdown, elevation,
    map, station at km 2.00, print button
- **Not yet checked live, needs Walter's Google key:** Google search,
  map pictures/satellite, street routing, elevation of drawn courses.
- Checked in Docker dev.9: migration 007 applied, the OpenStreetMap
  fallback is active.

## 0.1.0-dev.8 — 2026-09-30 (event maps, running courses add-on, plans, place search, timezones) — NOT YET TESTED BY WALTER

**Intent:** Walter asked for event maps with routes and small points of
interest, running courses like Strava as a paid feature, control over
which features belong to which tier, working place search, and timezones
that show their time.

**Result:**
- **Event map** on every Event (migration `006_event_maps.sql`; UC-05,
  AT-07; DEC-022):
  - points with a type and a name: stage, water station, portable
    toilets, bar or drinks storage, first aid, entrance, parking, other
  - small areas with the same types
  - routes, either delivery or other; one per type can be marked
    preferred, and each shows its length
  - drawing: choose the tool, click on the map, press **Terminar** for
    routes and areas; click an item to rename it, change its shape or
    remove it (removal stays in the history)
  - the drawing tool's own hints follow the screen's language
  - never creates locations, never moves stock (checked by test)
- **Running courses, paid add-on "courses"** (DEC-023):
  - course routes with km markers, total distance, an elevation profile
    and the climb, taken from the GPX file's own heights
  - **GPX import and export** (Strava, Garmin, plotaroute)
  - enforced by the server: an organization without it gets "add-on not
    active" and the screen shows 🔒
- **Plans (tiers) and add-ons** (DEC-024):
  - a `plans` table: code, name, which features each plan includes
  - each organization has one plan, plus add-ons on top
  - what it can use = plan + add-ons, controlled with the operator tool
    `server/dist/cli/features.js` (list, define a plan, assign it, add or
    remove an add-on, `--full`)
  - nothing about plan contents is hard-coded, and no plans or prices
    were invented (gap G-07)
- **Full access for Walter's test organization:** every add-on is on, and
  the dev starter turns everything on by default. The new `map.edit`
  permission was granted to existing administrators and operations
  managers.
- **Place search switched on** with OpenStreetMap's search through our
  server (DEC-025):
  - one box: typing the place shows suggestions underneath, choosing one
    drops the pin
  - places nearest the map's current view come first
  - limit: the free search knows streets, areas and well-known places,
    not every building (e.g. "edificio palmas bellas" isn't found; "palmas
    bellas" is)
- **Timezones** show their UTC offset and the current local time, sorted
  by offset, e.g. "(UTC−05:00) America/Panama · 10:06 p. m.".
- Tests: 117/117 (domain 10, server 107).
- Checked in the browser (dev run):
  - typed "Playa Coronado" and Panama came first; choosing it dropped the
    pin
  - placed "Tarima uno"; drew a 457 m preferred delivery route ending at
    it with **Terminar**
  - imported a GPX: course of 5.02 km, elevation 2–15 m, ↑13 m, km
    markers 1–5, GPX export button shown
- Found and fixed during that check, before the build:
  - clicking an existing item while drawing opened it instead of
    continuing the drawing
  - finishing a route by clicking its last point failed when that point
    sat under another icon, hence the **Terminar** button
- Checked in Docker dev.8:
  - migration 006 applied
  - the test admin has all 10 permissions, and the organization can use
    "courses"
  - place search answers

## 0.1.0-dev.7 — 2026-09-30 (fixes from Walter's testing; My account; map location) — NOT YET TESTED BY WALTER

**Intent:** fix everything Walter found while testing dev.6 (D-002 to
D-009), apply his date rules (DEC-019, DEC-020), and make the Event
location a searchable map point instead of text.

**Result:**
- **Date rules:**
  - The event date must lie between the warehouse departure and the
    expected return (D-003).
  - The event date and the expected return can't be in the past; the
    departure can be, so an Event can be recorded a week into its rental
    (DEC-019/020, D-005).
  - "Today" is the day in the Event's timezone, and the rules apply to
    dates being entered or changed, so finished Events stay editable.
  - Confirming is refused once the rental period is over.
  - Every date problem shows on its field at once.
- **Messages:**
  - The general red message disappears as soon as something is changed
    (D-004).
  - The browser's English "Please fill out this field" bubble is replaced
    by STRUCTURA's own messages in the chosen language (D-002).
  - **Confirmar (reservar)** is never a silent button: it says what's
    missing, products or dates (D-007).
- **Dates** show as dd/mm/aaaa in Spanish and mm/dd/yyyy in English, with
  a calendar button (D-006). Dates are now in timeline order: departure,
  event, return.
- **Timezone:** a full drop-down (418 timezones, the organization's own
  first) instead of a type-to-search list that only showed the current
  value (D-008).
- **My account (D-009):**
  - name, language (saved to the account, so it applies at every sign-in)
    and password change (needs the current one; signs out other sessions)
  - **Users:** administrators change a profile, switch a user off or on
    (never deleted), and set a new password for someone who forgot theirs
  - the last active administrator can't be removed
  - the language box at the top reads "🌐 Idioma / Language"
- **Map location** (migration `005_event_location_point.sql`):
  - The Event location is a point on a map (Leaflet + OpenStreetMap map
    pictures). Click the map or search for a place, then drag the pin to
    adjust it; the place name and its coordinates are saved.
  - Place search goes only through our server, and stays **off** until
    Walter chooses the provider (P-016). Until then the map works by
    clicking.
- **Tests** run on a fixed "today" (30 Sep 2026), so they never depend on
  the real date.
- Tests: 108/108 (domain 10, server 98).
- Checked in the browser (dev run) for each defect:
  - Walter's exact entry (departure 06/08, event 26/07, return 02/12/2025,
    then 22/09/2026) is refused, with the reason on each field.
  - A rental started a week ago, with an event and return ahead, saves
    with its map point.
  - Confirm with no products explains what to do.
  - The account language switches the whole screen and survives a fresh
    sign-in.
  - Switching off the last administrator is refused.
- Checked in Docker dev.7: migration 005 applied, a past rental is refused
  on PostgreSQL 17, and place search is off.

## 0.1.0-dev.6 — 2026-09-29 (change history, guides; 0.1.0 ready for testing) — NOT YET TESTED BY WALTER

**Intent:** make the audit trail readable (AT-18), and give Walter what
he needs to install and test 0.1.0.

**Result:**
- `GET /api/audit` (needs `audit.read`): who, what, when, from which
  installation, the command ID and the change details for each record.
  Only this organization's entries are returned, and there is no write
  path.
- **Historial de cambios** panel on each Event and product page, shown
  only to people with `audit.read`.
- Fix: photos now need `attachment.manage`, the permission meant for
  them, which the inventory operator profile includes. They previously
  needed `inventory.manage`, which contradicted that profile. Tested: an
  operator can set a photo, a viewer can't.
- New `docs/INSTALL.md` and `docs/USER_GUIDE.md` (ROADMAP B-001, B-002).
- Tests: 89/89 (domain 10, server 79).
- Checked in the browser (dev run): the history shows "Evento creado" and
  "Evento modificado" with the user and time.
- Checked in Docker dev.6: health ok, the history API answers.

## 0.1.0-dev.5 — 2026-09-29 (step 2c: Event products and reservations) — NOT YET TESTED BY WALTER

**Intent:** an Event lists the products it needs (the workbook's
"NUEVO ALQUILER" lines), checks availability for its dates (VALIDAR), and
confirming it commits the stock, with both the departure and the return
day included (UC-21, AT-04, AT-31).

**Result:**
- Migration `004_reservations.sql`: Event inventory lines and
  reservations. A reservation never moves stock. The database refuses
  deleting a reservation or changing it, except to close it (released /
  cancelled / fulfilled, with who and when).
- Availability for [departure, expected return], both days included:
  - Capacity is everything owned except what is in repair.
  - Subtracted: the largest daily total of other Events' reservations.
  - Also subtracted: stock sitting at an event location that no
    reservation explains, and stock still out for an Event whose expected
    return has passed. An expected return date never creates a receipt.
  - Stock moved to an event location *for* an Event is covered by that
    Event's reservation, so it is not counted twice.
- Confirm (Borrador → Confirmado) needs both rental dates and at least
  one product. It refuses and lists every product that doesn't fit, and
  nothing is reserved. Commitments per product are serialized, so two
  people confirming at once can't overbook.
- Editing the products or the rental dates of a confirmed Event re-checks
  availability. If the change doesn't fit it is refused and the previous
  reservations stand.
- Cancel (Borrador/Confirmado only) releases the reservations. History is
  kept. A cancelled Event can't be cancelled again.
- Dates are local calendar days; checked across the New York
  daylight-saving change (2026-11-01).
- Screens (Spanish/English): "Productos del evento" on the Event page,
  with requested / reserved / available per product,
  **Confirmar (reservar)** and **Cancelar evento**.
- Tests: 84/84 (domain 10, server 74).
- Checked in the browser (dev run): with 5 of 7 mics reserved for 10–14
  October, an Event starting on the 14th shows 2 available, is refused at
  3 (listing requested 3 / available 2) and confirms at 2.
- Checked in Docker dev.5: migration 004 applied, and the day-14 case is
  refused on real PostgreSQL 17.

## 0.1.0-dev.4 — 2026-09-29 (step 2b: catalog, photos, locations, movement ledger) — NOT YET TESTED BY WALTER

**Intent:** standard inventory entry, search and location tracking
through ordinary screens (INV-01, UC-03, UC-08), product photos that
always stay with the right product (UC-12, AT-05), and a movement ledger
where mistakes are corrected, never erased (AT-03).

**Result:**
- Migration `003_inventory.sql` adds:
  - locations: a flat list typed as warehouse, event, repair or other
  - a catalog with the 27TS workbook fields
  - attachments
  - an append-only movement ledger (movements and lines)
  - stock positions that can never go negative
- Catalog: barcodes are stored as text, so leading zeros are kept. A
  category change never recodes a barcode (AT-36). A duplicate barcode is
  refused, naming the product that already has it. Distinct products can
  share a name and are found by reference. Every product has a unit and
  the decimals it allows (Unidad 0, Galón 3…). A price needs a currency.
- The "Cantidad inicial" is recorded as an opening-balance movement,
  never as an editable total. Total / en almacén / en eventos / en
  reparación are calculated from stock positions.
- Movement types map to the workbook's list: receipt, adjustment in and
  out (written reason required), location change (UC-03, no Trip), to
  repair, back from repair, consumption, write-off. A correction posts a
  linked reverse movement once, and the original is kept.
- Movements refuse to take more than is at the source and change nothing
  when refused, including the other lines. A retry with the same command
  ID moves the stock only once.
- Photos (UC-12):
  - only JPEG, PNG or WebP up to 10 MB, checked by content, not by name
  - stored before being recorded; a storage failure reports an error and
    the product keeps its previous photo
  - each photo is bound to its product's ID
  - another organization gets "not found"
- Docker: photos go on a new `structura-files` volume. The nightly backup
  now writes the database dump plus a files archive (spec 18.3).
- Screens (Spanish/English): Inventory (search, photo thumbnails, the
  four stock figures), product page (photo, stock by location, history
  with Corregir), Locations, New movement (shows what's available at the
  source) and the Movements list.
- Development only: `server/dist/cli/dev.js` runs the app on an in-memory
  database for checking screens without spending a version number.
- Tests: 70/70 (domain 10, server 60).
- Checked in the browser (dev run, synthetic data):
  - the list shows the correct stock figures and the barcode's leading
    zero
  - the product page shows its photo, stock by location and history
  - a transfer of 9 with 6 available is refused in Spanish and nothing
    moves
  - a transfer of 2 then shows 4 in the warehouse and 2 at the event
- Checked in Docker dev.4: health ok, migration 003 applied, the photo is
  still served after an app restart, and the backup wrote both parts.

## 0.1.0-dev.3 — 2026-09-29 (step 2a: accounts, permissions, Events) — NOT YET TESTED BY WALTER

**Intent:** staff sign in with STRUCTURA's own accounts (DEC-013), and
permitted staff can create Events directly (UC-13, AT-01).

**Result:**
- Migration `002_identity_events.sql`: passwords (scrypt), sessions
  (only a SHA-256 of the token is stored), capabilities per membership,
  and Events with separate event / departure / expected-return / closure
  dates, a provisional or final designation, and no customer required.
- Sign-in: HttpOnly + SameSite=Strict cookie, 12-hour sessions checked on
  every request, one message for any wrong email/password, and a block
  after 5 failures for 15 minutes. Organization chooser when a person
  belongs to several.
- Permissions from spec 7 (capabilities, with presets: administrator,
  operations manager, inventory operator, viewer/auditor). The
  administrator adds users with an initial password. Passwords never
  reach the audit, command log or outbox (tested).
- Events: create, edit with version check (a stale edit is refused and
  the input stays on screen), search, and tenant isolation (another
  organization gets "not found").
- Setup command for a new installation: `server/dist/cli/bootstrap.js`
  (password via the `ADMIN_PASSWORD` variable, never the command line).
- Screens (Spanish/English): sign-in, Events list with a visible **Crear
  evento** button, Event form with field-level errors, Users.
- Tests: 51/51 (domain 10, server 41).
- Checked in the browser on dev.3 (Docker, synthetic account):
  - sign-in works
  - a return date before departure is caught on the right field, with the
    input kept
  - saving opens the saved record
  - the list shows both Events with separate dates
  - no sideways page scroll at 375px wide

**Version note:** `0.1.0-dev.2` was built twice: the second build added
the fix that makes a saved Event open as the saved record. Nobody
received it. dev.3 is the code of that second build, rebuilt under a new
number as the version rule requires. dev.2 is superseded.

## 0.1.0-dev.1 — 2026-09-29 (skeleton: 0.1.0 step 1) — NOT YET TESTED BY WALTER

**Intent:** lay the foundation from ARCHITECTURE.md sections 1–5 so the
Phase 1 features have somewhere correct to live. No business features yet.

**Result:**
- Three parts: `domain` (shared rules), `server` (Fastify API), `web`
  (React screen). One Docker image; `ENGINE_MODE` picks cloud or local.
- Migration `001_foundation.sql`: tenants, users, memberships, command
  log, audit entries, outbox. The database itself refuses UPDATE, DELETE
  and TRUNCATE on the command log and audit (confirmed on real PostgreSQL
  17 in Docker). Composite keys stop cross-tenant references.
- Command handling (`executeCommand`): the change, its audit entry, its
  outbox row and its command-log row commit together or not at all. A
  retry with the same command ID returns the stored result; the same ID
  with different data is refused.
- Exact decimals (`decimal.js`; NUMERIC stays text end to end), UUID v7
  IDs, and error kinds from spec 18.1, each with its own HTTP status.
- Screen: Spanish by default, English switch (remembered per browser),
  system status (version, engine, installation).
- Docker Compose: database, app, nightly backup (keeps 14).
- GitHub Actions CI: typecheck, tests, Docker build.
- Tests: 32/32 (domain 10, server 22), run on in-memory PostgreSQL
  (PGlite). Typecheck and build clean.
- Verified in Docker on this PC: `/api/health` → `0.1.0-dev.1`, database
  ok; migration applied; first backup written; screen checked in both
  languages.
- Local port: 8095 in this PC's `.env` (8080 is taken by another Docker
  app and 8090 by Wondershare).

## Project setup — 2026-09-29 (documentation only, no application version)

**Intent:** turn the delivered specification package into a project folder
that follows the standard documentation set.

**Result:**
- `STRUCTURA_Documentation_Package.zip` (spec v1.3, 25 use cases,
  integration contract, reference library) extracted to
  `docs/STRUCTURA_Documentation_Package/`. The ZIP itself is kept
  unchanged. Confirmed: 44 files extracted; SHA-256 of all 8 reference
  files (S7a–S7h) matches `SOURCE_MANIFEST.json`.
- The older loose spec (v1.1) at the project root was removed by Walter
  before setup; v1.3 inside the package is the current specification.
- Created `README.md`, `CHANGELOG.md`, `ROADMAP.md`,
  `docs/BUSINESS_RULES.md` and `docs/daily-logs/Working_Log_2026-09-29.txt`.
- Added STRUCTURA to `~/.claude/GENERAL_ROADMAP.md`.
- Walter approved the names and created `Walterdbg/STRUCTURA`. Docs
  committed on `main`, and `development/0.1.0` was created from it. Both
  pushed and confirmed on the remote with `git ls-remote`.
- Walter's decision: STRUCTURA is standalone, not built on CITYTRI Hub
  (ROADMAP DEC-006). Solution type is Docker + JavaScript/Node (DEC-007).
