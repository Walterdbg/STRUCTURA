# Manual de usuario — Inventario 27TS Panamá

## Instalación inicial

1. Extraiga todo el contenido del archivo ZIP en una carpeta normal de Windows.
2. Mantenga juntos estos archivos:
   - `27TS_Inventario_Base.xlsx`
   - `27TS_Inventario_VBA.bas`
   - `CREAR_INVENTARIO_27TS.cmd`
   - `INSTALAR_27TS.ps1`
   - La carpeta `Imagenes`
3. Cierre Excel.
4. Haga doble clic en `CREAR_INVENTARIO_27TS.cmd`.
5. Espere el mensaje: `LISTO: se creó 27TS_Inventario.xlsm`.
6. Abra `27TS_Inventario.xlsm`.
7. Si Excel muestra una advertencia amarilla, pulse **Habilitar contenido**.

La instalación se realiza una sola vez. Después trabajará únicamente con `27TS_Inventario.xlsm`.

## Reglas importantes

- Use el archivo en Excel de escritorio para Microsoft 365.
- Una sola persona debe modificar el archivo a la vez.
- No cambie los nombres de las hojas, tablas o columnas.
- No separe el archivo `27TS_Inventario.xlsm` de la carpeta `Imagenes`.
- Guarde el archivo después de registrar productos, alquileres, salidas o retornos.
- Haga copias de respaldo periódicas del archivo completo y de la carpeta `Imagenes`.

## Menú principal

- **PRODUCTOS:** abre el formulario para consultar, crear o modificar productos.
- **NUEVO ALQUILER:** crea o modifica un evento de alquiler.
- **RETORNOS:** registra lo que regresó, se consumió o pasó a reparación.
- **CALENDARIO:** muestra las fechas de los eventos.
- **TABLA DE PRODUCTOS:** abre el inventario completo.
- **EVENTOS:** abre la tabla con todos los alquileres.
- **MARCAR SALIDA:** confirma que un evento salió del almacén.
- **CANCELAR EVENTO:** cancela una reserva que todavía no ha salido.
- **ACTUALIZAR TODO:** recalcula inventario, disponibilidad y calendario.

## Consultar o modificar un producto

1. Abra **PRODUCTOS**.
2. Seleccione el producto en la lista superior.
3. Pulse **CARGAR**.
4. Modifique los campos amarillos necesarios.
5. Pulse **GUARDAR PRODUCTO**.

La categoría, unidad, tipo, marca, modelo, código, ubicación, estado, foto y demás datos del producto se pueden modificar desde el formulario.

## Crear un producto

1. Abra **PRODUCTOS**.
2. Pulse **NUEVO**.
3. Complete el nombre, la categoría, la cantidad inicial y los demás campos.
4. Pulse **GUARDAR PRODUCTO**.

El sistema asigna automáticamente el ID interno del producto.

## Agregar inventario

1. Cargue el producto desde **PRODUCTOS**.
2. Indique la cantidad que está ingresando.
3. Revise la fecha y escriba una nota si es necesario.
4. Pulse **AGREGAR INVENTARIO**.

El ingreso queda registrado en la tabla **Movimientos**. No modifique manualmente el total calculado del producto.

## Asignar o cambiar una foto

1. Cargue el producto.
2. Pulse **SELECCIONAR FOTO**.
3. Busque la imagen en su computadora.
4. Seleccione la imagen.
5. Pulse **GUARDAR PRODUCTO**.

El sistema copia la imagen a la carpeta `Imagenes` y guarda solamente su nombre en el inventario. Si un producto no tiene foto, el espacio queda vacío.

## Crear un alquiler

1. Abra **NUEVO ALQUILER**.
2. Pulse **NUEVO**.
3. Complete:
   - Nombre del evento.
   - Ubicación del evento.
   - Fecha del evento.
   - Fecha de salida del almacén.
   - Fecha prevista de retorno.
   - Responsable y notas, si corresponden.
4. En la tabla inferior, seleccione cada producto y escriba la cantidad solicitada.
5. Pulse **VALIDAR**.
6. Corrija cualquier línea marcada como insuficiente o inválida.
7. Cuando todas las líneas estén disponibles, pulse **GUARDAR ALQUILER**.

## Validación de disponibilidad

La disponibilidad se verifica para todos los días desde la salida hasta el retorno, incluyendo ambos días.

Si varios eventos se cruzan en las mismas fechas, el sistema suma las cantidades reservadas. No permite guardar una solicitud mayor que la cantidad libre durante ese período.

Un producto previsto para retornar el día 14 continúa reservado durante ese día y queda disponible para otro evento desde el día 15.

## Modificar un alquiler

1. Abra **NUEVO ALQUILER**.
2. Seleccione el evento en la lista superior.
3. Pulse **CARGAR EVENTO**.
4. Modifique los datos o productos.
5. Pulse **VALIDAR**.
6. Pulse **GUARDAR ALQUILER**.

Solo se pueden modificar eventos en estado **Borrador** o **Confirmado**.

## Confirmar la salida del almacén

1. Desde el menú, pulse **MARCAR SALIDA**.
2. Escriba el ID del evento, por ejemplo `E0001`.
3. Confirme la salida.

Los productos pasan de **Almacén** a **Evento** y el estado cambia a **Entregado**.

## Registrar un retorno

1. Abra **RETORNOS**.
2. Seleccione el evento.
3. Pulse **CARGAR EVENTO**.
4. Para cada producto, distribuya la cantidad pendiente entre:
   - **Retornado:** volvió al almacén en condición utilizable.
   - **Consumido:** se usó y no volverá al inventario.
   - **Reparación:** regresó, pero no está disponible para alquilar.
5. Pulse **GUARDAR RETORNO**.

La suma de retornado, consumido y reparación no puede superar la cantidad pendiente.

Si todavía quedan unidades pendientes, el evento cambia a **Retorno parcial**. Cuando todo queda procesado, cambia a **Cerrado**.

## Consumibles

Los consumibles pueden regresar completamente, parcialmente o no regresar. Registre cada parte en las columnas correspondientes del formulario de retorno.

La cantidad marcada como **Consumido** reduce permanentemente el inventario total.

## Cancelar un evento

1. Desde el menú, pulse **CANCELAR EVENTO**.
2. Escriba el ID del evento.
3. Confirme la cancelación.

Solo se pueden cancelar eventos en estado **Borrador** o **Confirmado**. Al cancelarlos, sus cantidades reservadas quedan disponibles nuevamente.

## Calendario

La hoja **CALENDARIO** muestra los eventos dentro de su período de alquiler.

- **MES ANTERIOR:** retrocede un mes.
- **ACTUALIZAR:** vuelve a generar la vista.
- **MES SIGUIENTE:** avanza un mes.
- **MENÚ:** regresa al menú principal.

## Estados de los eventos

- **Borrador:** evento todavía en preparación.
- **Confirmado:** reserva guardada y disponibilidad comprometida.
- **Entregado:** los artículos salieron del almacén.
- **Retorno parcial:** una parte regresó o fue procesada, pero queda inventario pendiente.
- **Cerrado:** todas las cantidades fueron procesadas.
- **Cancelado:** evento anulado antes de la salida.

## Si los botones no funcionan

1. Confirme que abrió `27TS_Inventario.xlsm`, no `27TS_Inventario_Base.xlsx`.
2. Cierre y vuelva a abrir el archivo.
3. Pulse **Habilitar contenido** si Excel lo solicita.
4. Si Windows bloqueó el archivo, cierre Excel, haga clic derecho sobre `27TS_Inventario.xlsm`, abra **Propiedades**, marque **Desbloquear** y pulse **Aceptar**.
5. Si `27TS_Inventario.xlsm` nunca fue creado, cierre Excel y ejecute nuevamente `CREAR_INVENTARIO_27TS.cmd`.

## Alcance actual

- La hoja está diseñada para un usuario activo a la vez.
- Las fotos permanecen fuera del archivo para evitar que el libro se vuelva demasiado pesado.
- El inventario enviado a reparación queda excluido de la disponibilidad.
- El retorno desde reparación se registra directamente en la tabla **Movimientos** hasta que se agregue un formulario específico para reparación.
