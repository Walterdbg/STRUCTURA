# STRUCTURA — User guide (version 0.1.0)

Every screen is in Spanish and English. Choose the language at the top
right (**🌐 Idioma / Language**), or in **My account**, where it's saved to your account
and applies every time you sign in.

What 0.1.0 covers: users, Events, inventory, locations, movements and
reservations. Quotes, invoices, deliveries, maps, the customer portal and
the onsite engine come in later phases (ROADMAP).

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

**Eventos → + Crear evento**. Only a name (it can be provisional, e.g.
"Evento interno — octubre"), the responsible person and the timezone are
required. No customer is needed.

Dates follow the timeline: **warehouse departure → event date → expected return**,
written dd/mm/aaaa in Spanish (mm/dd/yyyy in English).

- The event date must be between the departure and the expected return.
- The event date and the expected return can't be in the past. The departure can be:
  you can record an Event a week into its rental.
- Once an Event is created, it stays editable after its dates pass (notes, responsible…).

**Location:** type the place name, then mark it on the map: click the map, or search a
place (when place search is switched on), and drag the pin to adjust it. The name and the
exact point are saved.

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

## Change history

People with the audit permission see **Historial de cambios** at the
bottom of each Event and product. It shows who did what and when, with
the details. Nobody can edit or delete it.
