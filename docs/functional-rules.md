# Cierre funcional — reglas y evidencia

Corte del 4 de octubre de 2026. Cambios locales; no certificación de producción.
No se reescribieron datos cargados ni se regeneraron menús del usuario.

## Menús

| Regla | Comportamiento y prueba |
| --- | --- |
| Rotación | Ventana `max(duración,15)` **selecciones por familia**, conservando el criterio de `pickFrom` legado. Guisados y garnachas no se expulsan mutuamente del historial; los extras tampoco. Caso del séptimo día corregido. |
| Especiales | Pozole jueves; garnacha de jueves por nombre normalizado exacto “Tacos dorados de papa”; Barbacoa/Menudo desde el primer domingo del menú. Nunca restringidos en otro día. |
| Proteínas | Diversificar los dos guisados si hay candidatos; normalizar mayúsculas/acentos y Cerdo/Puerco. Garnachas no alteran ese filtro. |
| Sin proteína | Evitar dos guisados vegetarianos en el día y días consecutivos cuando hay alternativas. Si todo el catálogo es vegetariano, generar y advertir la excepción, no inventar platos. |
| Disponibilidad | Generación y nuevas sustituciones excluyen borradores, archivadas, omitidas y Grill. Los ingredientes/precios pendientes no excluyen una receta activa. |
| Catálogo escaso | Repeticiones y espacios vacíos se explican; faltante de especial no produce un candado falso. |
| Sustitución manual | Permite excepciones manuales de especial/proteína con advertencia, como el flujo legado; no admite tipo/día restringido incorrecto. Recalcula avisos y candados en servidor. |
| Integridad temporal | Fechas consecutivas desde el inicio; etiqueta de día derivada. Advertencias también se actualizan al consultar, sin editar el menú guardado. |

Pruebas: `tests/menu-rules.test.js`, `tests/kitchen.test.js`,
`tests/legacy-recipe-import.test.js`. La alternancia se reinicia en cada menú;
no se añadió una historia global entre menús distintos sin acuerdo.
Falta la aceptación de un menú real por Francisco (F02/D02), no otra migración.

## Costeo

Pruebas con resultados de referencia en `tests/costing-regression.test.js`:

- $768 − $48 de descuento = $720; dos cajas de 12 kg y 10 % de merma dejan
  21.6 kg aprovechables. Precio de cálculo $720/21.6, sin truncarlo a $33.3333.
  Tres porciones de 100 g suman $10, dentro de la precisión decimal; no $9.99999.
- g/kg, ml/l y pz; conversión de pieza a masa únicamente documentada;
  rendimiento servido/seco explícito. Cantidad/precio/rendimiento inválido no
  acredita un costo. Nunca inferir densidad, contenido ni gramaje por nombre.
- Tres espacios principales + canasta + producción una vez. Extras se muestran
  sin doble cargo; sus faltantes siguen impidiendo verificar el total.
- Grill de cuatro porciones: $8 de materia / 4 + $24 de desechables / 4 + $5 de
  producción por platillo = $13; sin sumar la canasta/producción del comedor.
- Tope $(77 × .85 − 20 − 21.16)/2 = $12.145; redondeo solo al presentar.
  Bandas por objetivo, límites exactos, venta ausente y tope negativo.
- Canasta incompleta: total `null`, subtotal conocido aparte. Falta de espacio,
  línea o parámetros confirmados tampoco acredita un menú.
- Compras escaladas por comensales/base; merma una sola vez para obtener cantidad
  bruta. CSV/XLSX/impresión conservan costos faltantes; CSV/XLSX también avisos
  de reglas. No se certifican por ello los parámetros reales de negocio (D04).

No se modifica la composición de negocio para reconciliar supuestos distintos:
la suma de menú conserva los tres espacios del código legado y el tope usa el
divisor configurado. Cambiar porciones comerciales exige decisión explícita.

## XML y jerarquía de precios

Decisión de Francisco: bloquear meses anteriores al último aceptado. Corte
derivado del XML, no de la etiqueta del lote. Archivos del mismo mes sí entran;
UUID/hash resuelve duplicado/conflicto antes del bloqueo. Un comprobante inválido,
no elegible, en cuarentena o rechazado no adelanta el corte. Las cargas mixtas se
procesan secuencialmente: presentar meses en orden, del antiguo al reciente.

El rechazo conserva metadata/motivo y bitácora, no otra copia del XML ni conceptos,
compras o revisiones. La comparación y el avance del periodo son atómicos con la
compra; se reevalúan ante concurrencia. Copias existentes sin política usan sus
importaciones aceptadas, sin migración. Respaldo/restauración conserva el corte.

La selección de precio es independiente del bloqueo de carga:

1. Solo observaciones asociadas a revisión validada vigente y a la presentación,
   vínculo y merma actuales.
2. Fecha de comprobante descendente.
3. En empate, fecha de revisión descendente y luego ID ascendente estable.
4. Precio mayor, orden de llegada, texto coincidente o valor manual no tienen
   prioridad. Sin observación compatible: costo no verificable.

La fecha del CFDI determina cuál observación válida es la más reciente, no si se
puede aplicar la merma. El porcentaje confirmado del ingrediente se aplica una
vez al importe neto de la compra al validarla. La fecha de confirmación de esa
merma es metadata; cambiarla sin cambiar el porcentaje no altera el precio ni
invalida una observación. Si cambia el porcentaje, se exige revalidación; la
observación anterior permanece inmutable.

La primera observación de proveedor + SKU se valida manualmente, incluyendo
presentación, vínculo, unidad y merma. En XML posteriores con fecha de comprobante
mayor, la importación crea otra observación validada solo si conserva ese SKU,
descripción y unidad XML, no hay exclusiones ni evidencia activa divergente, y
las claves de producto/ingrediente siguen idénticas a la observación aprobada.
Se recalcula desde el importe neto del XML y se registra `price.auto_validated`
en bitácora. Si falta una condición, la compra entra a Revisión sin nuevo precio;
ningún XML previo se valida retroactivamente por esta regla.

Pruebas: `tests/import-policy.test.js`, `tests/costing-regression.test.js`,
`tests/vertical-flow.test.js`, `tests/security/server.test.js` y recorrido
`tests/e2e/midespensa.spec.js`. El cliente bloquea una nueva carga si el servidor
local anterior aún no informa esta política; no aparenta tenerla por mostrar UI.

## Generación con OpenAI

Proveedor y flujo confirmados. [Diseño y estado](openai-recipe-generator.md):
propuesta estructurada, validación, revisión humana y guardado inicial en borrador
implementados con un simulador explícito, sin red ni consumo. Solo MiDespensa
acredita precios; una sugerencia exacta no confirma el vínculo.

Pruebas en `tests/recipe-generation.test.js`, `tests/recipe-generator-ui.test.js`,
`tests/security/{rules,server}.test.js` y `tests/e2e/recipe-generator.spec.js`:
roles, esquema cerrado, cantidad/unidad/tipo/porciones, doble envío, límites
atómicos, timeout sin reintento, revisión obligatoria, procedencia y respaldo.
El recorrido de dominio verifica propuesta → borrador → activación humana →
menú no verificable → vínculo/precio de MiDespensa → mismo ID con costo resuelto.

Los seis ejemplos simulados no interpretan idea/restricciones ni certifican
calidad culinaria. F05 sigue abierto: faltan transporte OpenAI, control monetario,
conciliación, reglas culinarias acordadas y ensayo real con presupuesto autorizado.
