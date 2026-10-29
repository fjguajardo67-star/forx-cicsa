# Continuidad de MiDespensa — 2 de octubre de 2026

Modo: Operate. El usuario autorizó conservar arquitectura funcional y UI/UX de
MiDespensa y FORX, modificando su backend. Esta entrega recupera la superficie
original de MiDespensa sobre servicios por entidad; no declara terminada la
integración de recetas, menú, IA ni exportaciones de FORX.

Autoridad visual: segunda captura aportada por el usuario y `src/main.js` /
`src/styles.css` de MiDespensa en 7c6d838. La primera captura y la superficie
`pantry-app.js` del experimento 02080c8 no son referencias aprobadas.

## Direction contract

THESIS: Preservar la revisión por proveedor + SKU y su cadena de evidencia al
sustituir la persistencia, sin simplificar la tarea ni reintroducir publicación
entre aplicaciones.

OWN-WORLD: Sistema existente de MiDespensa, logo SVG, azul noche, tabla densa,
ámbar de validación, foco turquesa, ficha lateral y edición contextual.

STORY: Importar un lote mixto; reunir compras del mismo SKU; editar presentación,
crear o vincular ingrediente y categoría; validar el cálculo; consultar precios;
excluir o retirar de la cola y restablecer desde bitácora sin borrar evidencia.

FIRST VIEWPORT: Logo y navegación originales a la izquierda; búsqueda superior;
cola con pestañas y contadores; columnas Estado/Descripción/Proveedor/SKU/Unidad/
Precio/Sugerencia; ficha lateral con cuatro pasos y acciones al pie.

FORM: Extensión precisa, preservación de un mundo existente; no aplica seed.
La agrupación y selección conservan el desplazamiento de cola y evidencia.
La publicación externa se sustituye por consulta directa del catálogo.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Límites y evidencia

- Se heredan DESIGN.md y su sidecar, sin cambio de identidad ni tokens.
- `midespensa-integration.css` solo evita superposición del filtro en tablet.
- Datos de capturas y pruebas: CFDI sintéticos con proveedor ficticio. No son
  datos actuales ni precios utilizables por el usuario.
- Conservar un control antiguo inactivo no acredita una capacidad: las reglas
  de sugerencia siguen indicadas como pendientes.
- No hay conexión cloud, despliegue, aprovisionamiento ni migración. El módulo
  servidor de comandos y el adaptador Firestore se prueban aisladamente; faltan
  el transporte autenticado, Storage y retención programada antes de habilitarlos.
- Las capturas de este corte sustituyen las de la prueba anterior para revisión;
  no se usa su dictamen como aprobación de esta implementación.

## Apéndice de cierre — continuidad verificada

Folio de implementación: `4965e41`, rama `codex/forx-v2-xml-catalog`.
Este apéndice registra una extensión del sistema existente. `DESIGN.md` y
`.impeccable/design.json` se conservan byte por byte; no se regeneran tokens,
identidad, reglas ni lenguaje cualitativo. Sus SHA-256 al cierre documental son:

- `DESIGN.md`: `6ec110e62f80623a4a83503898232a2e446b5b9aa4af2ff1f7636bc14ce9a0fc`.
- `.impeccable/design.json`: `e17fd6958fe02252ac88c4a24e0ff9ae0fb519b9792fddf4ca80e58c002af679`.

`src/styles.css` no tiene diferencias respecto de `7c6d838`. La superficie
`src/ui/midespensa-app.js` recupera la UI original de `src/main.js` de esa base,
conectada a servicios por entidad mediante `src/data/pantry-store-adapter.js`.
`src/ui/midespensa-integration.css` añade únicamente el ajuste del título,
filtro y pestañas entre 901 y 1180 px para evitar su superposición.

La continuidad conserva el lienzo azul noche, los paneles contiguos y bordes
finos, ámbar para decisiones, turquesa para foco y navegación, y estados
textuales con marcadores. Mantiene encabezados condensados, cuerpo IBM Plex
Sans, numerales tabulares y la escala compacta de títulos, cuerpo y etiquetas.
Siguen aplicándose las reglas existentes Amber Decision, Stable Numbers,
Evidence Beside Queue y Flat Ledger: decisión reconocible, comparación de
importes, evidencia junto a la cola y profundidad mediante tonos y divisores.
Este registro no convierte el ajuste puntual de tablet en un nuevo token global.

Los cambios autorizados sustituyen la publicación entre aplicaciones por
consulta del catálogo interno, conservan la revisión por proveedor y SKU y
trasladan las escrituras al servicio por entidad, actualmente local. La acción superior ahora es
“Consultar catálogo”, con icono `tag` y nombre accesible explícito, también
cuando el texto visual se oculta en móvil. Autenticación y transporte cloud
siguen pendientes; la presencia de módulos servidor no acredita conexión real.

### Dictamen y correcciones

El finish reviewer emitió **SHIP limitado al primer flujo local de MiDespensa**,
sin nuevas regresiones visibles en el alcance revisado. Ambos hallazgos quedaron
**RESOLVED**:

- La validación se deshabilita mientras está abierto el editor de producto o de
  ingrediente. La misma condición protege el comando de teclado `v`; muestra
  “Guarda o cancela los cambios antes de validar.” y conserva el borrador.
  El E2E cubre ambos editores y verifica el valor pendiente del producto.
- “Consultar catálogo” usa icono y nombre accesible acordes con su destino,
  incluyendo la presentación móvil.

El dictamen no abarca FORX completo, recetas, menús, IA, exportaciones ni servidor
cloud. Motion no se probó: las capturas E2E usan `reducedMotion: 'reduce'`.
El reviewer no leyó `craft-floor.md` por su restricción de ejecución; el agente
principal informó haberlo leído antes de los cambios. Esa lectura no se presenta
como una revisión adicional del reviewer.

### Comprobaciones y procedencia

Resultados de ejecución comunicados por el agente principal para este corte:
`npm run check`: 74 pruebas aprobadas, 7 omitidas por falta de Java 21 para los
emuladores y build aprobado. `npm run test:e2e`: 1 prueba aprobada en Chrome,
16.2 s. El detector de Impeccable se ejecutó una sola vez y devolvió `[]`.
La documentación no repitió esas comprobaciones ni amplía su cobertura.

`tests/e2e/midespensa.spec.js` recorre importación sintética, edición y vínculo,
validación con merma, consulta del precio, persistencia tras recarga, compra
histórica agrupada por SKU, retiro y restauración desde bitácora, exclusión y
selección en una cola densa sin perder desplazamiento. Comprueba ausencia de
errores de página, solicitudes externas y desbordamiento horizontal del
documento en los cuatro tamaños capturados; la tabla conserva su scroll propio.

Las capturas vigentes de QA son:

| Archivo | Viewport |
| --- | --- |
| `.impeccable/review/desktop.png` | 1440 × 1050 |
| `.impeccable/review/user-1952.png` | 1952 × 1269 |
| `.impeccable/review/tablet.png` | 1024 × 768 |
| `.impeccable/review/mobile.png` | 390 × 844 |

Son capturas `fullPage` de la prueba con CFDI y proveedor ficticios, no datos
reales ni evidencia de un lote mensual de producción. No se entregaron nuevos
raster de producto; el logo y los iconos son los SVG existentes. Las otras
capturas del directorio no se añaden a la evidencia de este dictamen.

La autoridad visual aportada por el usuario es la segunda captura,
`/var/folders/20/mthyt3g15g11x33btzy1r_5h0000gn/T/codex-clipboard-bc9e9c0d-f3b6-451f-bc82-cc07d8adb690.png`.
La primera captura,
`/var/folders/20/mthyt3g15g11x33btzy1r_5h0000gn/T/codex-clipboard-df39a0a0-8412-4b33-85ec-bafa3926f5e3.png`,
permanece como antirreferencia, no como fuente de nuevos estilos.

## Extensión verificada — reglas y recuperación local

Este corte sustituye el estado pendiente de reglas descrito en el registro
histórico anterior. No modifica la identidad: `DESIGN.md` y su sidecar se
conservan sin regeneración. Las marcas SVG transparentes vigentes, la paleta,
las familias tipográficas y las reglas visuales existentes siguen siendo la
autoridad; la antigüedad del timestamp del sidecar no implica nuevos tokens.

### Patrones conservados

Categorías y reglas prolonga la pantalla con una sección de sugerencias, una
tabla compacta y formularios inline de edición y prueba. Reutiliza las
superficies azules con hairline, campos de etiqueta superior y acciones
secundarias junto a la confirmación ámbar. La cuadrícula de dos columnas se
convierte en una en móvil. La tabla conserva sus columnas mediante scroll
horizontal propio; no se transforma en tarjetas ni oculta el proveedor.

Administración incorpora el respaldo dentro de su flujo vertical, antes de
la bitácora. Seleccionar archivo, comprobarlo, leer su nombre/fecha/contenido
y confirmar la creación de una copia son estados separados y visibles en la
misma pantalla. El error permanece junto al formulario; la confirmación solo
aparece después de una comprobación válida. La copia se describe como local e
independiente, sin sugerir que reemplaza el servidor. Las advertencias de
privacidad y exclusión de XML son texto operativo, no iconos sin explicación.

Ambas extensiones aplican las reglas existentes **Amber Decision**, **Flat
Ledger** y **Stable Numbers**: acción principal identificable, paneles sin
elevación decorativa y comparación de cantidades en estructura tabular. No se
introduce una escala de tipografía, color o espaciado adicional. El regreso a
FORX comparte ahora la lista de navegación y mantiene nombre accesible cuando
la banda móvil oculta su etiqueta; el contexto de entorno se consulta en
Administración sin superponerse a búsqueda en móvil.

### Evidencia y alcance del cierre

Fuentes del registro: `src/ui/rules-and-backup.js`, los componentes reutilizados
de `src/styles.css`, los ajustes acotados de
`src/ui/midespensa-integration.css` y las capturas de este corte. El revisor
independiente `rules_backup_finish_review` emitió **ship**, sin correcciones
materiales, limitado a estas extensiones locales/emuladas. El documento no
amplía ese dictamen a producción, IA o un lote mensual real.

Capturas del pase: `.impeccable/review/rules-desktop.png`,
`rules-user-1952.png`, `rules-mobile.png`, `backup-desktop.png`,
`backup-user-1952.png` y `backup-mobile.png`, todas en el mismo directorio.
Representan anchos de 1440, 1952 y 390 px; las vistas de escritorio enfocan la
sección dentro del scroll de trabajo y las móviles muestran la página completa.
Se usan registros sintéticos. No se entregan nuevos activos raster de producto.

La documentación no convierte el mínimo de ancho de esta tabla ni los ajustes
puntuales del selector de archivo y de la navegación móvil en tokens globales.
Tampoco convierte la sugerencia en validación: la interfaz conserva la decisión
humana y los conflictos explícitos. Las garantías de datos y las instrucciones
de recuperación pertenecen a los manuales de operación, no a reglas visuales.

## Ajuste acotado — bloqueo de periodos XML

El corte del 4 de octubre conserva la composición de Importar XML. Añade el
periodo real aceptado y la explicación del bloqueo, y una séptima métrica de
resultado, «Bloqueados por periodo». Reutiliza tipografía, colores y estados
existentes; la cuadrícula se adapta a tres/dos columnas y la tabla conserva
scroll propio. El input de archivo oculto ocupa 1 px para no ampliar el ancho
del documento en móvil. No cambia navegación, identidad ni tokens de diseño.
La prueba sintética aislada valida importación y rechazo, y comprueba el ancho
en 1440/1024/390 px. No extiende a este corte dictámenes de revisores anteriores.
