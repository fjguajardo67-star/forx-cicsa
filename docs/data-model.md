# Modelo por entidad

Cada registro tiene ID propio. Los registros mutables llevan `_revision`
para impedir que una edición obsoleta sobrescriba otra.

| Entidad | Contenido |
| --- | --- |
| batches | Periodo mensual, carga, progreso y contadores |
| imports | Intento por archivo, hash, UUID, resultado y referencia al original |
| import_keys | Reserva única de UUID y hash del primer comprobante aceptado; las claves históricas se conservan |
| import_concepts | Conceptos de compras aceptadas y de cuarentena/conflictos; nuevos comprobantes no elegibles no se guardan |
| purchase_events | Compra inmutable por UUID e índice del concepto elegible |
| products | Identidad comercial proveedor/SKU, presentación, categoría y vínculo |
| ingredients | ID culinario, nombre, aliases, categoría, unidad y merma confirmada |
| ingredient_keys | Reserva única de nombres y aliases normalizados |
| categories | Categorías culinarias y no culinarias |
| reviews | Decisión vigente del concepto y observación actualmente aprobada |
| price_observations | Historia inmutable de cada validación y su fórmula |
| audit | Acciones, actor, fecha, motivo y estado anterior para trazabilidad |
| settings | Políticas explícitas |
| originals | Bytes en IndexedDB; en servidor solo hash, ruta privada, carga, vencimiento y estado |
| recipes | Receta por ID, código, tipo, origen, porciones base y renglones vinculados opcionalmente |
| recipe_names | Reserva de nombres normalizados para impedir duplicados concurrentes |
| recipe_versions | Copia inmutable de cada versión de receta |
| menus | Días, fechas, comensales, línea y espacios referenciados por ID de receta |
| generation_requests | Solicitud privada por actor, huella, contexto culinario acotado, estado, propuesta validada y receta guardada; si es OpenAI, tarifa versionada, reserva, tokens y conciliación estimada |
| generation_quotas | Contadores por usuario/día UTC, entorno/mes UTC y concurrencia; saldos OpenAI retenidos/estimados por día y mes |

## Precio

Política de este corte: MXN, importe del concepto menos descuento, sin impuestos.
Se comprueba cantidad × valor unitario contra importe (tolerancia de 0.02 MXN).
Cantidad y contenido deben ser positivos; merma entre 0 y menos de 100%.

```text
neto = importe − descuento
base = cantidad de presentaciones × contenido convertido
aprovechable = base × (1 − merma / 100)
precio = neto / aprovechable
```

El normalizador usa decimal.js: conserva cuatro decimales en `normalizedPrice`
para presentación y precisión completa en `calculationPrice` para costeo.
Al consultar una observación antigua con `priceBasis`, la precisión se vuelve a
derivar de esa evidencia sin modificar el registro histórico.
Masa/volumen/pieza no se mezclan sin conversión aprobada. La UI de este corte no
captura densidades: una incompatibilidad deja el precio pendiente.

El precio vigente usa la mayor fecha de comprobante entre observaciones cuya
revisión sigue aprobada y cuya presentación, vínculo y merma aún coinciden con
el catálogo. En empate usa fecha de validación y luego ID para resultado estable.
El importe mayor no influye. Cambiar la ficha obliga a revalidar los precios
afectados; nunca se recalcula ni se destruye una observación histórica.

La fecha del CFDI ordena observaciones, pero no limita la merma. El porcentaje
aprobado se aplica al importe neto de la compra al validarla, aunque el CFDI sea
anterior a la fecha en que se confirmó la merma. El campo histórico
`wasteEffectiveFrom` conserva esa fecha de confirmación por compatibilidad; no
participa en la clave de cálculo. Cambiar solo esa fecha no invalida observaciones
anteriores, incluidas las guardadas con la clave antigua de tres componentes.

Tras una primera validación humana, un CFDI posterior del mismo proveedor y SKU
puede crear una nueva observación inmutable durante la importación. Exige igual
descripción y unidad XML, presentación, vínculo y merma sin cambios, sin exclusión
ni evidencia activa divergente, y una normalización válida del nuevo importe.
`validationMode: automatic` y la bitácora distinguen esta actualización de la
validación manual. Si falla una condición, la compra conserva revisión pendiente
y el precio anterior no se altera.

Las observaciones retienen evento, importación, precio neto, cantidades, unidades,
merma, fórmula, fecha de comprobante, fecha de revisión y actor.

settings/kitchen conserva líneas de negocio, canasta, producción, objetivo e
identidad documental. settings/recipe_sequences asigna códigos sin colisiones.
El costo no es una autoridad persistida en receta: se deriva del catálogo vigente.

`settings/xml_period_policy` mantiene el último mes de comprobante aceptado y
el modo `block_older_months`. Se actualiza atómicamente junto con la compra;
una carga concurrente obliga a reevaluar el corte. Si aún no existe, se deriva
de las importaciones aceptadas por `invoiceDate`, no de la etiqueta del lote.
Un rechazo `blocked` deja metadata y bitácora, pero no compras, conceptos ni
otro original. El respaldo valida que el corte concuerde con los comprobantes.

settings/rule_* contiene reglas de clasificación explícitas: campo, operador,
texto literal, proveedor opcional (obligatorio para SKU), categoría, prioridad,
estado activo y revisión. La sugerencia no se guarda como precio ni decisión.
settings/local_recovery identifica una copia local recuperada y su procedencia;
se añade junto con el evento `backup.restored` sin reemplazar la bitácora anterior.

Los respaldos derivados conservan todas estas entidades y sus revisiones, pero
originals lleva bytes/path nulos y estado `not_included` o `expired`. No prolongan
uploadedAt/expiresAt ni permiten volver a descargar un XML del servidor de origen.

## Propuestas de recetas y cuotas

El ID de `generation_requests` deriva de actor + requestId. Repetirlo con el mismo
contenido devuelve estado, no otra generación; cambiar el contenido produce error.
Se guardan versión de prompt, proveedor/modelo, fechas y contexto culinario,
sin claves, XML, precios ni errores crudos. Estados: `pending`, `completed`, `failed`
o `uncertain`. Una propuesta completada puede consumirse una sola vez al guardar.

`recipes.generation` conserva solicitud, proveedor, modelo, versión y revisor.
El servidor lo deriva de la propuesta: el cliente no puede certificarlo ni
eliminarlo al editar. La primera versión siempre queda en borrador. La procedencia
no acredita inocuidad, calidad culinaria ni costo.

Las cuotas simuladas conservan sus límites de prueba: 10/día por usuario,
100/mes por entorno y 2 concurrentes. Las solicitudes OpenAI solo pueden
crearse con una política monetaria explícita; guardan tarifas y límites de su
propia versión, una reserva en nanodólares y, si hay tokens válidos, gasto
estimado. Día y mes separan saldo retenido y estimado. Una espera incierta
mantiene además su reserva concurrente. Nunca se llama al proveedor dentro de
una transacción reintentable. La conciliación administrativa exige evidencia y
no dispara otra generación. El inspector de respaldos comprueba las sumas del
libro y sigue aceptando respaldos anteriores sin registros OpenAI.

En la simulación local estos registros permanecen para trazabilidad hasta disponer
expresamente del entorno de prueba; no tienen purga automática. La política de
retención de producción se acuerda antes de activarla. Las reglas niegan acceso
directo incluso al administrador; comandos verifican dueño/rol y solo el respaldo
completo de administrador los exporta. El respaldo v2 comprueba referencias y
consistencia de cuotas; v1 sigue aceptado sin alterar su checksum original.
