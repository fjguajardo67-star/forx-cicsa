# FORX integrado — fase 2

Modo Operate. El usuario aprobó integrar las pantallas existentes de FORX y
MiDespensa con catálogo interno único, sin rediseño ni publicación entre apps.
Autoridad: FORX a274255 (index.html, estilos.css, activos locales) y MiDespensa
7c6d838. Se conserva navegación de trabajo, formularios, catálogo y menú.

## Direction contract

THESIS: Una receta y un menú consumen ingredientes por ID desde MiDespensa;
guardar y utilizar no implica que su costo esté verificado.

OWN-WORLD: FORX conserva su barra lateral, logo, selector de línea, tipografía
Plex, temas, tarjetas de día, catálogo agrupado y editor contextual. MiDespensa
conserva su cola y evidencia. Se aíslan estilos, no se crea un tercer diseño.

STORY: Validar un XML, capturar receta, vincular ingrediente, guardar con un
faltante, generar menú, resolverlo en MiDespensa y consultar el recálculo.

FIRST VIEWPORT: Barra FORX y línea de contrato a la izquierda; parámetros,
filtros y tarjetas del menú en el área original. Catálogo conserva búsqueda,
tipos, proteínas y edición; nuevo vínculo explícito junto a cada renglón.

FORM: Extensión del sistema existente aprobada por el usuario. Seed no aplica.
Interacción central: resolver un ingrediente conserva identidad de receta y
menú y transforma su estado de costo, sin inventar datos.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Sustitución de marcas aprobada — 2 de octubre de 2026

Se reemplazan únicamente los logos activos con `Logo Forx Nuevo .svg` y
`Logo MiDespensa Nuevo .svg` entregados por el usuario. Se conserva el arte
vectorial y sus colores; se vuelve transparente el fondo dibujado y los huecos
de las letras, sin modificar los originales. Los márgenes del lienzo se ajustan
al arte para encajarlo sin recortes ni deformación en las cabeceras existentes.
No cambia la navegación, el sistema visual, el logo de Grill Express ni datos.

## Extensión aprobada: reglas y recuperación local

Se conserva el modo Operate y las pantallas existentes. Categorías y reglas
incorpora un formulario inline, prueba de coincidencia y pausa/edición de reglas.
Revisión explica la sugerencia junto al producto; una coincidencia no valida ni
crea ingredientes. SKU exige proveedor, las frases usan palabras completas y
las recomendaciones incompatibles quedan en conflicto. No había motor activo
en el original: se reutiliza su normalización, no se atribuye un motor probado.
Administración incorpora descarga, previsualización y apertura de una copia
recuperada aislada. La recuperación nunca reemplaza el origen y no incluye XML
temporales ni credenciales. Se conservan tokens, marcas y navegación; sin comp
nueva ni cambio de identidad. El cierre exige pruebas, capturas, revisión y
documentación del comportamiento real, todavía sin cloud ni llamadas IA.

## Restricciones de esta instancia

Sin acceder a infraestructura, datos o credenciales externos; sin despliegue.
La generación IA real requiere modelo y presupuesto aprobado. La extensión
aprobada el 4 de octubre permite un simulador explícito para probar el flujo;
no se presenta como una respuesta de OpenAI ni interpreta la idea/restricciones.
Su contrato específico está en `docs/recipe-generator-surface.md`.
Los originales de los repositorios y los registros existentes no se modifican.
Pruebas con XML y recetas sintéticos; no se precargan precios ni vínculos.

## Extensión aprobada: origen de precios

El usuario limita la consulta de trazabilidad a **Precios**, sin añadir acciones
a los editores de recetas ni Grill Express. Se conserva la tabla y se agregan
proveedor, SKU del producto que originó la observación vigente, fecha de compra
y **Ver origen**. El detalle de solo lectura se despliega en la misma página,
con concepto XML, cálculo guardado, validación y enlace al producto/observación
exactos en MiDespensa. No hay un SKU único inventado por ingrediente.

El servidor entrega la evidencia solo a editor/admin; consulta no gana acceso
a datos fiscales. Buscar incluye SKU y proveedor. Precio obsoleto exige recargar,
sin sustituir silenciosamente otra compra. La evidencia no depende del XML
temporal. Se mantienen paleta, Plex y controles heredados; no es un rediseño.

Cierre de esta extensión: el revisor independiente `prices_finish_review`
emitió `ship` sin correcciones materiales, limitado a la versión local/emulada.
Capturas: `.impeccable/review/prices-*.png` (1440, 1952 y 390; tabla, detalle,
tema claro y referencia en MiDespensa). Pruebas de este corte: `check` con 92
aprobadas y 10 omitidas por requerir emuladores, build aprobado, tres recorridos
de navegador aislado (MiDespensa, FORX, Precios) y un recorrido servidor de solo
lectura. No se reiniciaron ni vaciaron los emuladores compartidos. La consulta
de ambos backends devolvió los mismos registros derivados; no hubo migración.

## Cierre local verificado — 2 de octubre de 2026

El revisor independiente emitió `ship` limitado al alcance local/emulado.
Su pase final calificó como resueltas las tres correcciones: controles móviles,
promesa de escalado en captura y documentación de continuidad. No constituye
certificación de producción ni una nueva auditoría completa en ese pase.

- `npm run check`: 86 pruebas aprobadas, 10 omitidas por requerir emuladores;
  compilación Vite aprobada.
- `npm run test:rules`: 13 pruebas aprobadas con Auth, Firestore y Storage
  emulados, incluidos permisos, concurrencia y bytes originales de XML.
- `npm run test:e2e`: dos recorridos aprobados, MiDespensa y FORX integrado.
- `FORX_E2E_SERVER=1 npm run test:e2e -- tests/e2e/forx.spec.js`: recorrido
  integrado aprobado contra el servidor demo local.
- Tras retirar el campo de escalado de captura, se repitieron `check` y el
  recorrido FORX de navegador; conserva cuatro porciones y 400 g al pegar esa
  receta, sin transformar cantidades durante la captura.

Las capturas están en `.impeccable/review/phase2-*.png`: escritorio 1440,
resolución del usuario 1952, tablet 1024, móvil 390 y estados del flujo.
La comprobación de procedencia de activos reportó un raster y cero faltantes.
[forx-design-continuity.md](forx-design-continuity.md) registra el módulo FORX;
DESIGN.md y su sidecar conservan intacto el sistema de MiDespensa.

No se ensayó un lote mensual real. IA, eliminación programada de originales
en Storage y habilitación cloud siguen pendientes; los límites y avisos de
dependencias se detallan en [operations.md](operations.md).
