# FORX v2 · MiDespensa integrado

> Registro histórico del experimento `02080c8`, cuya interfaz fue rechazada por
> el usuario. No es la dirección vigente. Véase `docs/ui-continuity.md`.

Modo: Operate. Extensión del flujo existente de MiDespensa dentro de FORX.
El contrato de construcción y la confirmación de la base del 2 de octubre de 2026
fijan la tarea. Se conserva el sistema visual vigente de DESIGN.md; no se abre
una nueva identidad ni una ronda de conceptos.

## Direction contract

THESIS: Convertir un lote mensual mixto en un catálogo consultable, con cada
decisión explicable desde su concepto de compra.

OWN-WORLD: Se heredan el azul noche, los paneles contiguos, el ámbar de acción,
el foco turquesa, la tipografía y los controles de MiDespensa.

STORY: Cargar XML; ver resultados por archivo; revisar cada concepto; guardar
producto y vincular ingrediente; confirmar presentación y merma; validar precio;
consultar precio vigente y observaciones históricas.

FIRST VIEWPORT: Navegación de FORX a la izquierda, entorno local visible arriba,
cola con filtros y detalle de evidencia contiguo. La importación vacía ofrece
selección múltiple y explica la retención de dos meses desde la carga.

FORM: Extensión precisa de la superficie existente; no aplica concept-seed.
La interacción de firma conserva los cuatro pasos original → producto →
ingrediente → precio. Los errores mantienen el formulario y las selecciones.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Alcance

Primera entrega local, almacenamiento separado por entidad, pruebas y reglas en
emulador. Recetas, menús, IA y exportaciones se portarán en los siguientes cortes;
la ausencia de ingrediente nunca deberá bloquear la existencia de una receta.
No incluye infraestructura cloud, facturación, migración ni despliegue.

## Evidencia de la extensión · 2 de octubre de 2026

Se preservaron `DESIGN.md` y `.impeccable/design.json`: esta entrega extiende
el sistema existente. Este registro describe la superficie construida y no
actualiza los tokens ni reemplaza las reglas del sistema.

Fuentes contrastadas: `PRODUCT.md`, el sistema y su sidecar,
`src/styles.css`, `src/ui/vertical.css`, `src/ui/pantry-app.js` y
`src/app.js`. Se inspeccionaron las capturas de revisión en
`.impeccable/review/`: `desktop.png`, `desktop-price.png`, `mobile.png`,
`mobile-price.png`, `desktop-import.png`, `mobile-import.png`,
`desktop-catalog.png` y `mobile-catalog.png`.

### Sistema conservado

- Azul noche y paneles contiguos con divisores fríos; ámbar para la decisión
  principal, turquesa para foco y navegación, coral para retirar una validación.
  Las capturas muestran el texto oscuro del botón primario y estados textuales.
- IBM Plex Sans Variable autoalojada para lectura, títulos de página con la
  pila condensada existente y numerales tabulares para importes y fórmulas.
- Se mantienen controles de radio contenido, fichas de evidencia de 9px y
  superficies de trabajo planas. Las reglas Amber Decision, Conflict Is Coral,
  Stable Numbers, Flat Ledger y Evidence Beside Queue siguen siendo aplicables.
- La revisión conserva los cuatro pasos numerados: original, producto,
  ingrediente y observación de precio. En escritorio aparecen junto a la cola;
  en móvil se apilan. Importación y catálogo reutilizan botones, campos y tablas.
- El precio muestra unidad, fórmula y merma; el código distingue «Vista previa ·
  falta confirmar» de «Observación validada. Registrar otra revisión es
  opcional». Las capturas de precio muestran el segundo estado y la acción
  coral «Retirar validación y reabrir».

### Diferencias locales respecto del registro vigente

| Aspecto | Superficie FORX v2 construida | Relación con el sistema registrado |
| --- | --- | --- |
| Identidad | Rótulo textual FORX v2 y subtítulo MiDespensa integrado en escritorio; indicador FORX · local en la barra superior. | Cumple la jerarquía de producto de PRODUCT.md. La descripción anterior del logo MiDespensa y su X no representa esta cabecera. |
| Navegación | Barra de 206px, 180px bajo 1180px; bajo 900px, banda horizontal de 52px con etiquetas y desplazamiento. | Sustituye aquí las medidas 12vw/72px y la ocultación de etiquetas descritas para la superficie anterior. |
| Revisión | Cola y evidencia en dos columnas; la evidencia ocupa 46% y 48% en el intervalo compacto, antes de apilarse bajo 900px. | Conserva la relación cola–evidencia, con medidas específicas de esta extensión. |
| Lectura compacta | Tabla de 13px, cabeceras y chips de 11px, ayudas de 12px; título de página mantiene 27px con tracking local de -.035em. | Amplía varios textos auxiliares del registro anterior; no define una nueva escala global. |
| Formularios y tablas móviles | Formularios de dos columnas pasan a una bajo 480px; la cola ajusta sus tres columnas y el catálogo conserva mínimo de 660px con desplazamiento horizontal. | Son reglas locales; el breakpoint 620px y la tabla de 820px del registro anterior no describen estos componentes. |
| Procedencia | Pasos conectados por flechas visibles y numeración. | La superficie usa `v2-chain`, no la clase que activa la hebra animada antigua; no se declara esa animación como comportamiento verificado aquí. |

### Drift preexistente y límites del registro

`src/styles.css` no presenta cambios respecto de la base durante esta inspección.
Su botón primario ya usa texto oscuro `#201704`, igual que el snippet del sidecar
y la prosa de Components. Sin embargo, el frontmatter de `DESIGN.md` apunta a
`colors.ink` claro para `button-primary` y `button-primary-hover`. Esa
contradicción es preexistente; se reporta sin corregir el sistema ni cambiar el
runtime para ajustarlo al token erróneo.

La cabecera, navegación y medidas anteriores son diferencias frente a la
extensión actual; no se clasifican como errores preexistentes del CSS. Tampoco
se canonizan tamaños aislados ni el ámbar del mensaje de observación ya validada.
La aparente repetición de navegación al pie de la primera `mobile.png` fue un
artefacto transitorio de captura: tras estabilizar las capturas esperando dos
`requestAnimationFrame` después de cada cambio de viewport, la imagen regenerada
se inspeccionó nuevamente y ya no muestra esa repetición. La corrección afectó
solo al timing de captura, sin cambios de runtime; no queda un defecto pendiente
por esta observación.

El arranque inspeccionado utiliza IndexedDB local y la interfaz lo indica.
Las capturas son evidencia de revisión, no imágenes distribuidas por la UI;
la superficie inspeccionada usa iconos SVG existentes, sin raster nuevo que
requiera procedencia de producción. Este registro no certifica funcionamiento,
accesibilidad completa, conexión Firebase, seguridad cloud ni despliegue; el
veredicto de cierre corresponde a la revisión final y a las pruebas de la entrega.
