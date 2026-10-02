# STRUCTURA — User guide (version 0.1.0)

Every screen is in Spanish and English. Choose the language at the top
right (**🌐 Idioma / Language**), or in **My account**, where it's saved to your account
and applies every time you sign in.

What 0.1.0 covers: users, Events, inventory, locations, movements and
reservations. Quotes, invoices, deliveries, maps, the customer portal and
the onsite engine come in later phases (ROADMAP).

## Moving around

The menu on the left has the main sections: **Inventario** (tabs *Productos*, *Movimientos*,
*Ubicaciones*), **Eventos**, **Mapas** and, for administrators, **Organización** (tabs *Usuarios*,
*Reglas de fechas*). Your name (My account), *Cerrar sesión* and the language are at the bottom.
Click **STRUCTURA** at the top to go home.

## Signing in

Use the email and password your administrator gave you. After 5 wrong
attempts, sign-in is blocked for 15 minutes. A session lasts 12 hours.

## My account

Click your name (👤) at the top: change your name, your language, or your
password (type the current one first; your other open sessions are signed
out).

## Users (administrators only)

**Usuarios → Agregar usuario**: name, email, initial password (at least
10 characters) and a profile:

| Profile | Can do |
| --- | --- |
| Administrador | Everything, including adding users |
| Gerente de operaciones | Events, inventory, reservations, movements, corrections |
| Operador de inventario | Record movements and photos; look at everything |
| Consulta / auditoría | Look, and read the change history |

In the list, the administrator can change a person's profile, **switch them off**
(they can no longer sign in, but their name stays in the history; nobody is ever
deleted) or give them a **new password** if they forgot theirs. The last active
administrator can't be switched off.

## Locations

**Ubicaciones**: create each place where stock can be. The type matters,
because it decides how stock is counted:

- **Almacén**: counted as "En almacén"
- **Evento**: counted as "En eventos" (for example "Tarima uno")
- **Reparación**: owned, but never available to book
- **Otra**

There is no required hierarchy. A location's type can only change while
it holds no stock.

## Products

**Inventario → + Nuevo producto**. Fill in the name, type (alquilable,
consumible, repuesto) and unit.

- The unit sets how many decimals are allowed (Unidad 0, Galón 3,
  Metro 2).
- The barcode is kept exactly as typed, leading zeros included. A barcode
  already used by another product is refused, and the message names that
  product.
- **Cantidad inicial** + its location records what is on hand now, as an
  "opening balance" movement.
- Totals can't be typed: *Total actual, En almacén, En eventos* and *En
  reparación* are always calculated from the movements.

**Photo:** open the saved product, then **Seleccionar foto** (JPEG, PNG or
WebP, up to 10 MB). The screen says *Foto guardada* only after the photo
is really stored. If saving fails, it says so and the previous photo stays.

**Search** by name, internal reference, barcode or category. Two products
can have the same name; the reference tells them apart.

## Movements

**Inventario → Registrar movimiento** (or the same button on a product):

| Type | From | To |
| --- | --- | --- |
| Ingreso de inventario | — | a location |
| Cambio de ubicación | a location | another location. No trip needed. |
| A reparación | a location | a repair location |
| Retorno de reparación | a repair location | a non-repair location |
| Consumo / Baja | a location | — (leaves the inventory) |
| Ajuste (entrada / salida) | — or a location | a location or — |

- Adjustments and write-offs need a note explaining why.
- The form shows what's available at the source. If you ask for more,
  nothing moves and the screen says so.
- Sending stock to an event location? Choose the Event in *Evento
  (opcional)*. That way it isn't counted twice against the Event's
  reservation.

**Mistakes are corrected, never erased:** in the history, press
**Corregir** and explain what was wrong. STRUCTURA records a linked
opposite movement. The original stays, marked *Corregido*. Then record
the right movement.

## Events

**Eventos → + Crear evento**. First choose the **type**, which can't be changed later:

- **📦 Alquiler y entregas / Rental & deliveries** (the default): rented equipment, a location,
  deliveries and pickups. Its map has points and delivery / pickup routes, no race courses.
- **🏁 Carrera / Race**: everything a rental has, plus race courses (with the courses add-on).

Then only a name (it can be provisional, e.g.
"Evento interno — octubre"), the responsible person and the timezone are
required. No customer is needed.

Dates follow the timeline: **warehouse departure → event date → expected return**,
written dd/mm/aaaa in Spanish (mm/dd/yyyy in English).

- The event date must be between the departure and the expected return.
- The event date and the expected return can't be in the past. The departure can be:
  you can record an Event a week into its rental.
- The **warehouse departure** can be at most **15 days before** the event, and the **expected
  return** at most **7 business days after** it (Monday to Friday). The form shows the allowed
  range; if a date is outside it, the message gives the earliest or latest allowed date. An
  administrator can change these numbers under **Usuarios → Reglas de fechas**.
- **Equipment still out:** 3 days after the event, if equipment sent for it hasn't come back, the
  Event shows a warning (also in the Events list). After the expected return it shows **Retorno
  vencido**: return it or go and pick it up.
- Once an Event is created, it stays editable after its dates pass (notes, responsible…).

**Location:** type the place or address in *Lugar del evento*. Suggestions appear
underneath; choose one and the pin drops on the map. You can also just click the map,
and drag the pin to adjust it. The name and the exact point are saved. (The free place
search knows streets, areas and well-known places, not every building; if a building
isn't found, search its street or area and drag the pin.)

**Timezone:** each option shows its UTC offset and the time it is there now.

### Products and reservations

On the Event, **Productos del evento → Editar**: add the products and
quantities, then **Guardar**. The table shows for each product:

- **Solicitado**: what the Event asks for
- **Reservado**: what is currently held for it
- **Disponible**: what could still be held for these dates

**Confirmar (reservar)** holds the stock for the whole rental period. If something is
missing (products, dates) the button says what to do. A rental period that is already
over can't be confirmed. Both
the departure day and the expected return day are included: a return on
the 14th keeps the 14th reserved, and the stock is free again from the
15th. If anything doesn't fit, nothing is reserved and the screen lists
each product with its requested and available quantity.

While confirmed, the products or dates can still be changed. STRUCTURA
checks again, and refuses the change if it doesn't fit, keeping the
previous reservation.

**Cancelar evento** (draft or confirmed only) frees its reservations.
Nothing is deleted.

### What counts as available

Everything owned, except:

- what is in repair
- what other confirmed Events hold on those dates
- stock sitting at an event location that no reservation explains
- stock still out after its Event's expected return date, which keeps
  blocking until it is actually brought back

## Event map

At the bottom of each Event, **Mapa del evento** holds what the team needs on site:

- **📍 Punto**: click where it goes, then choose its type and name it (a stage platform or bar
  storage is a point too, no corners to draw), e.g.
  🎤 "Tarima uno", 💧 "Agua km 5", 🚻 "Baños norte", 🍹 "Bodega de bebidas", ⛑️ first aid,
  🚪 entrance, 🅿️ parking.
- **〰 Ruta**: drawn piece by piece (see *Drawing a route* below). Mark *Ruta preferida* for
  the delivery path to use. Its length is shown.

### Drawing a route or a course

**You draw the route.** Every click on the map adds one piece, made with the tool chosen at that
moment. **✏️ Dibujar / Draw is selected by default**: the line goes exactly through your clicks.
The street tools only help: they fit the piece to the street between your two clicks, and if the
street path would stray from your points, the piece stays straight as you drew it.

| Tool | The piece |
| --- | --- |
| 👣 **A pie / On foot** | follows streets and paths you can walk (start of courses) |
| 🚲 **En bici / By bike** | follows bike-friendly streets |
| 🚗 **En auto / By car** | follows roads (start of delivery routes) |
| ✏️ **Dibujar / Draw** | a straight line exactly where you click, for paths the map doesn't know |

Change the tool at any click: along the avenue on foot, across the park path with Draw, on foot
again. **↶ Deshacer** (or Ctrl+Z) takes back one step; **🧽 Borrar todo** starts again; **✓ Listo**
ends the drawing.

**Adding the details:** zoom in (the mouse wheel zooms while drawing) and:

- drag the **small handle in the middle of a piece** to add a point there and bend the line;
- drag any **point** to move it;
- **right-click or double-click** a point to remove it.

The pieces touching the point you changed are remade with the tool chosen at that moment, so
choose ✏️ Draw before placing a point on a hidden path. To change a saved route, open it and press
**✎ Editar forma**: its points and pieces come back.

If you leave the name empty, STRUCTURA names it (e.g. "Recorrido (carrera) 1"); rename it any
time. Starting another drawing before saving asks first, so nothing is lost by accident.

**⛶ Full screen:** the button under + / − on every map. On the Event map the tools come along.
While drawing, and in full screen, the mouse wheel zooms the map. The Event map is also shown
while the Event's details are being edited.

Click any item on the map or in the list to rename it, change its shape or remove it.
Removed items stay in the history. The map never moves stock and never creates
inventory locations.

### Running courses (paid add-on)

On **race** Events, organizations with the *Recorridos* add-on also get:

- **🏃 Recorrido**: draw a race course, with km markers on the map and the total distance.
- **⤒ GPX**: import a course from Strava, Garmin or plotaroute. If the file has heights,
  the elevation profile and total climb are shown.
- **⤓ GPX** in the list: export a course for runners or timing companies.

Without the add-on these buttons show 🔒 *Recorridos (complemento)*.

**Course tools (add-on):**

- **Follow streets (every organization):** the 👣 / 🚲 / 🚗 tools above. **🛣 Ajustar a calles**
  remakes every piece of a route along the streets. (Needs the Google key.)
- **Elevation:** a drawn course gets its heights automatically (or press **⛰ Obtener
  elevación**). A GPX without heights gets them too. (Needs the Google key.)
- **Stations on the course:** on a point, choose **Ubicar en el recorrido**, pick the course
  and type the km (e.g. 2.5). The point sits exactly on the line and follows the course if
  its shape changes. The list shows each point's km.
- **Start, finish, laps:** courses show ▶ start and 🏁 finish. Set **Vueltas** (laps) and
  **Ida y vuelta** (out and back); the total distance is calculated, e.g. 2 × 5 km out and
  back = 20 km.
- **📄 Hoja del recorrido:** a printable page with the map, distance, climb, elevation chart
  and the stations by km. **🖨 Imprimir / Guardar PDF** to print it or save a PDF.

**Race tools (race Events):**

- The **distance** is always shown while drawing. Choose **km** or **mi** above the map.
- **Distance markers** every 0.5, 1 or 5 km (or miles); tick or untick *Marcas de distancia*.
- While drawing a course: **↻ Volver al inicio** closes it back to the start, **⇆ Ida y vuelta**
  adds the way back over the same path (markers continue on it), **⇄ Invertir** swaps start and
  finish.
- **🔒 Recorrido bloqueado:** tick it on a final course and save; its shape can't change until
  it's unticked. Both are recorded in the history.
- **⊙ Centrar** shows the whole route; **🔍 Ir a un lugar** moves the map to any address.
- Move the mouse over the **elevation chart**: the spot shows on the map with its distance and
  height.

**📍 My location:** the button under + / − moves the map to where you are. The browser asks
permission the first time; it's optional and nothing else depends on it. A new course in Mapas
opens where you last worked.

**Map / Satellite:** with the Google key, every map has a **🗺 Mapa / 🛰 Satélite** switch at
the top right, and place search finds buildings (e.g. "PH Palmas Bellas").

## Maps: the route repository

**Mapas** keeps race courses and delivery / pickup routes made ahead of time, for any Event.

- **⤒ Cargar GPX** on the Mapas list saves a GPX file (Strava, Garmin, plotaroute, RunningAhead…)
  straight into the repository and opens it. Only the line and its place are loaded: choose its
  **type** afterwards (course, delivery, pickup, other). The type can be changed any time, so a race
  map can be reused, e.g. as the delivery route for water stations and course signs.
- The list is **grouped by Country › Area › Place** (e.g. USA › New Jersey › Liberty State Park) and
  can be filtered by type. Set a route's Country, Area and Place on its page; **📍 Guardar ubicación**
  saves only that (no new GPX version).
- A GPX's **points of interest** (start, finish, water stations, restrooms, medical, U-turns…) come
  with it, shown on the map with their full names. Racemap's hidden timing points are left out. Used
  in an Event, they become the Event's points.
- Courses show small **arrows** along the line: the running direction.
- **Ruta guía**: while drawing in Mapas, show another route as a faint guide line and draw along it.
- **+ Nuevo recorrido / Nueva ruta de entrega / Nueva ruta de recogida**: draw it (courses by hand
  with ✏️; deliveries and pickups with 🚗 car, 🏍 motorcycle or ✏️), or **⤒ Cargar GPX** at the top
  of the page, at any moment.
- Every **Guardar** keeps a **new version as a GPX file** (v1, v2, ...). The *Versiones* list
  downloads any of them. Earlier versions are never lost.
- **⧉ Duplicar** starts a new route from this one (e.g. next year's course). **🔒** locks a final
  course.
- In an Event's map, **📚 Del repositorio** adds a route **as the Event's own copy**: later changes
  in the repository don't change that Event. A rental Event isn't offered race courses.
- On an Event route, **📚 Guardar en el repositorio** keeps it for other Events.

## Change history

People with the audit permission see **Historial de cambios** at the
bottom of each Event and product. It shows who did what and when, with
the details. Nobody can edit or delete it.
