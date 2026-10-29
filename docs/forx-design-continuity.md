---
name: FORX — continuidad del módulo integrado
description: Sistema heredado de menús y recetas; evidencia del código integrado, con identidad propia junto a MiDespensa.
colors:
  dark-bg: "#05122F"
  dark-surface: "#0A1F4E"
  dark-surface-2: "#062350"
  dark-sidebar: "#000C22"
  dark-border: "#123063"
  dark-text: "#E9F0FC"
  dark-text-2: "#A9BCDD"
  dark-text-3: "#7C8FB4"
  light-bg: "#F3F6FC"
  light-surface: "#FFFFFF"
  light-surface-2: "#E9EFFA"
  light-sidebar: "#0C255C"
  light-border: "#D3DCEC"
  light-text: "#0B1B3A"
  light-text-2: "#3C4E73"
  light-text-3: "#59677F"
  accent-dark: "#16C0D2"
  accent-light: "#0E9FB0"
  accent-soft-dark: "rgba(22,192,210,.16)"
  accent-soft-light: "rgba(14,159,176,.12)"
  on-accent: "#05122F"
  status-ok: "#12A863"
  status-warn: "#F9C043"
  status-caution: "#EA7630"
  status-crit: "#D83021"
  on-warm: "#2A1206"
  on-crit: "#FFFFFF"
  ink-ok-dark: "#2ABF7B"
  ink-warn-dark: "#F9C043"
  ink-caution-dark: "#EA7630"
  ink-crit-dark: "#FF6B52"
  ink-ok-light: "#0C6339"
  ink-warn-light: "#6E4E00"
  ink-caution-light: "#8F3D00"
  ink-crit-light: "#A81F16"
typography:
  headline:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.015em"
  title:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "9.5px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0.13em"
rounded:
  control: "7px"
  recipe: "8px"
  panel: "9px"
  card: "11px"
  modal: "14px"
  pill: "99px"
spacing:
  tight: "6px"
  actions: "8px"
  group: "12px"
  panel: "14px"
  form: "16px"
  card: "18px"
  section: "20px"
  page: "24px"
components:
  button-primary-dark:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-primary-light:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-amber:
    backgroundColor: "{colors.status-warn}"
    textColor: "{colors.on-warm}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-danger:
    backgroundColor: "{colors.status-crit}"
    textColor: "{colors.on-crit}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  input-dark:
    backgroundColor: "{colors.dark-bg}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.card}"
    padding: "18px"
---

# Design System: FORX integrado

## Overview

Registro de continuidad, extraído el 2 de octubre de 2026. El usuario aprobó conservar FORX y MiDespensa dentro de una aplicación; no hay una nueva identidad ni un nuevo concepto visual. La dirección está en [forx-integration-surface.md](forx-integration-surface.md). Este documento gobierna exclusivamente el módulo FORX. [DESIGN.md](../DESIGN.md) y [.impeccable/design.json](../.impeccable/design.json) conservan su alcance de MiDespensa y no fueron modificados por esta documentación. No se genera otro sidecar: el límite autorizado de escritura es este archivo, no la regeneración del sistema raíz.

FORX conserva la barra lateral con marca y línea de contrato, tarjetas de día, catálogo por tipos y proteínas, formularios y editor contextual. La densidad es operativa, con contraste entre superficies marinas, interacción turquesa y estados cálidos. Se conservan tanto el tema oscuro como el claro y las marcas existentes.

**Key Characteristics:**

- Una sola familia Plex para lectura y títulos, con numerales tabulares en costos.
- Tarjetas elevadas, bordes finos, filtros en píldora y diálogos redondeados.
- Barra lateral siempre oscura; área operativa intercambiable entre temas.
- Estado de costo expresado con palabras y color, junto a sus pendientes.

### Evidencia y alcance

La autoridad implementada es [legacy.css](../src/ui/forx/legacy.css), seguida por [integration.css](../src/ui/forx/integration.css) en la cascada. [app.js](../src/ui/forx/app.js) monta ambas en un Shadow DOM, usa el tema del host y modifica parte del texto y estructura de [legacy-templates.js](../src/ui/forx/legacy-templates.js). Por ello, una plantilla sin sus ajustes de montaje no describe por sí sola la interfaz final. [midespensa-app.js](../src/ui/midespensa-app.js) mantiene la cola y evidencia propias del otro módulo.

La referencia original, leída sin ejecutarla ni modificarla, es `menu-cicsa` en `/Users/franciscoguajardo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/work/menu-cicsa`: `estilos.css`, `DESIGN.md` e `index.html`; la dirección identifica su versión como `a274255`. La comparación de CSS confirma que la copia integrada conserva sus reglas, cambiando los selectores de documento por host y la familia autoalojada por Plex Variable compartida. Los ajustes de integración se documentan abajo, no se atribuyen al original.

Existen capturas de revisión en `.impeccable/review/phase2-*.png` para escritorio, tablet, móvil y superficies principales. Este registro verifica valores y comportamiento definido en fuente; no constituye una nueva certificación visual o de contraste de todas sus variantes.

## Colors

### Primary

El turquesa `accent-*` identifica la interacción general, el foco y la navegación activa. Su versión translúcida se usa en selección y filtros. Las acciones de captura, guardado y exportación también reutilizan el botón ámbar heredado; el código no sigue una prohibición global de acciones cálidas.

### Secondary

Los cuatro rellenos `status-*` son estables entre temas. Sus tintas `ink-*-dark` y `ink-*-light` cambian para poder leer estados sobre superficies distintas. Los rellenos verde y ámbar usan tinta `on-warm`; el crítico usa `on-crit`.

**The Fill and Ink Rule.** El relleno de un botón de estado y la tinta de una etiqueta son papeles distintos: no intercambiar sus tokens al cambiar de tema.

### Neutral

Los grupos `dark-*` y `light-*` describen lienzo, superficie, superficie secundaria, borde y tres niveles de texto. El selector de tema cambia estos papeles completos; la barra lateral permanece oscura. El tema se establece antes de insertar las hojas y se conserva en `sessionStorage` bajo `forx-v2-theme`.

**The Module Boundary Rule.** Los valores de FORX viven en el host de su módulo. No sustituirlos por los tokens similares de MiDespensa: ni sus fondos, ni su ámbar, ni sus reglas de elevación son equivalentes exactos.

## Typography

**Body and heading font:** IBM Plex Sans Variable con la pila sans del sistema. FORX no utiliza los encabezados condensados de MiDespensa. La escala es compacta y funcional, no una progresión matemática única.

Los encabezados de página y grupo usan `headline`; los nombres de receta usan `title`. Los títulos de día son de 15px, peso 700 e interlínea 1.1; los nombres de platillo, 13.5px y peso 600. El cuerpo base usa `body`; las celdas de tabla, campos y botones se reducen a 13px. Las ayudas y estados son de 11–12px. Las etiquetas compactas usan `label`, mayúsculas y tracking abierto; las etiquetas de día usan 10px. Los botones estándar usan peso 650 y los pequeños, 12px.

**The Comparable Costs Rule.** Importes, cantidades, tablas y códigos conservan cifras tabulares; los costos pendientes mantienen texto explicativo en lugar de un importe que aparente precisión.

## Layout

En escritorio, el marco es una retícula de `264px 1fr`. La barra lateral es sticky, ocupa la altura de la ventana y desplaza su propio contenido. El contenedor central se limita a 1400px, se centra y usa padding `20px 24px 40px`. Las tarjetas separan secciones con margen inferior de 18px. La retícula de días usa columnas automáticas con mínimo de 300px y gap de 14px.

El ritmo combina separación estrecha en líneas de ingredientes, grupos de acciones de 8px, listas de 12px, filtros de 8px y formularios de 16px. No se fuerza una escala de ocho puntos: estos valores provienen del uso existente. Las filas de platillos usan padding `9px 14px` y las cabeceras de día `12px 14px`.

### Adaptación por ancho

| Umbral | Comportamiento implementado |
| --- | --- |
| Hasta 900px | Marco de una columna; barra superior de altura natural, navegación horizontal que envuelve; menú de una columna; formularios de dos columnas; margen del diálogo de 8px. |
| Hasta 900px, integración | Marca visible de 115px con tagline; pie visible y flexible con tema y actualización; identificación del entorno en línea completa; tarjetas de receta apilan cabecera y acciones. |
| Hasta 680px, Precios | Búsqueda y detalle de origen pasan a una columna; la tabla se transforma en filas de dos columnas con etiquetas por dato, ingrediente y acción a ancho completo. |
| Hasta 600px | Duración del menú pasa de dos columnas a una; el pie del editor permite envolver acciones. |
| Hasta 480px | Formularios de una columna; padding de página de 12px y tarjetas de 14px; navegación de 12px; resumen de costos se apila. |

Las líneas del editor conservan un ancho mínimo de 670px dentro de una región desplazable horizontalmente. La estructura usa nombre, cantidad, unidad, vínculo y retiro; el detalle ocupa toda la fila. Las tablas se desplazan dentro de sus contenedores. Ese desplazamiento local conserva datos comparables y no justifica desbordar la página.

**The Visible Mobile Controls Rule.** La composición estrecha conserva marca, navegación, selector de línea, cambio de tema y actualización de datos. El cambio de ancho reorganiza el trabajo sin suprimir esos controles.

## Elevation & Depth

FORX combina niveles tonales, bordes de 1px y sombras reales en tarjetas y días. Su elevación forma parte de la referencia original: la regla plana de MiDespensa no se aplica aquí.

- **Tarjeta oscura:** `0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35)`.
- **Tarjeta clara:** `0 1px 2px rgba(11,27,58,.06),0 8px 24px rgba(11,27,58,.07)`.
- **Diálogo:** `0 24px 70px rgba(0,0,0,.45)` en ambos temas.

El diálogo integrado usa velo `rgba(0,0,0,.55)`, panel de hasta 1080px, máximo de 90vh y cabecera sticky del color de superficie. Esta capa sustituye los tamaños anteriores del modal en la cascada.

La entrada de página dura `.3s ease`, con opacidad y traslación vertical de 5px. `prefers-reduced-motion: reduce` elimina animaciones y transiciones. No se amplía esta transición a otras interacciones sin evidencia.

## Shapes

Los radios de frontmatter distinguen controles, recetas integradas, paneles informativos, tarjetas y modales. Los filtros y badges usan píldoras completas. Los bordes de 1px separan filas, superficies y estados de control. Las marcas no se sustituyen por texto nuevo; Grill Express conserva su placa blanca de 9px, borde y padding de 3px para presentar su raster original.

**The Native Shapes Rule.** Conservar las tarjetas de 11px, diálogos de 14px y píldoras de FORX. El límite de radio de MiDespensa no es una restricción del módulo FORX.

## Components

### Buttons

Botón general turquesa; secundario transparente con borde; ámbar para acciones heredadas; verde y rojo con rellenos semánticos. Los tamaños pequeños usan padding `6px 10px`. El hover general aumenta brillo a 1.08; el secundario cambia a superficie secundaria sin filtro. El foco visible global es un contorno de 2px en acento con separación de 2px. Un control deshabilitado reduce opacidad a .5.

### Chips

Los filtros llevan padding `6px 12px`, texto de 12px/peso 600, borde neutro y forma de píldora. La selección añade superficie de acento translúcido y borde de acento. Los badges de costo usan padding `3px 9px`, 11px/peso 700 y tinta semántica; el estado integrado incluye la banda o el texto «Costo no verificable». Las clases heredadas contienen formas para glifos, pero el generador actual no inserta esos glifos: no se documentan como una garantía implementada.

### Cards / Containers

Tarjetas principales con superficie, borde y sombra; los días tienen cabecera tonal, filas separadas y borde de acento al hover. Las recetas integradas usan radio `recipe`, cabecera `12px 16px` y cuerpo `8px 16px`. Los avisos recurren a superficie secundaria y 12px de padding. No todos los contenedores comparten la misma elevación.

### Inputs / Fields

Campos y selects con fondo del lienzo, borde neutro y radio `control`; el foco cambia borde y contorno a acento, con separación de 1px. Textareas admiten expansión vertical. Los vínculos de ingredientes son explícitos, conservan nombre y detalle de pendiente, y conviven con cantidad y unidad en el editor. Guardar no elimina los avisos de un costo que todavía no se puede verificar.

### Navigation

La marca encabeza la barra, seguida de la línea de contrato y botones de icono y texto. La pestaña activa usa acento translúcido, borde turquesa y texto blanco. En escritorio los botones usan padding `9px 11px`, texto de 13.5px/peso 600 y radio de 9px. En ancho reducido envuelven según Layout. MiDespensa es una entrada del mismo producto; al entrar conserva su propio marco, cola de revisión y panel de evidencia.

### Editor contextual

El diálogo conserva contexto de receta, líneas editables, vínculo por ingrediente, costo y pendientes. El montaje usa `showModal()`, foco inicial dentro del diálogo y restauración del foco al cerrar. Los formularios y el pie de acciones se adaptan al ancho; la región de ingredientes desplaza localmente.

### Precios y origen de la observación vigente

La extensión aprobada conserva la tabla y añade proveedor, SKU de origen, fecha de compra y «Ver origen» junto al ingrediente/producto y su precio vigente. La búsqueda incluye ingrediente, proveedor y SKU; el CSV conserva también producto, fecha e identificador de observación. El SKU pertenece al producto de esa compra, no se presenta como identificador único del ingrediente. Los estados sin precio, sin SKU o sin acceso muestran texto explícito.

«Ver origen» abre un detalle de lectura dentro de la misma página, separado por un borde superior de 1px y espacio de 20px. Compra de origen y cálculo validado ocupan dos columnas con gap de 24px; la validación aparece después. Encabezados de 18px/14px, datos de 13px, cifras tabulares, bordes y tintas reutilizan Plex y los tokens existentes en ambos temas. Las listas de términos y valores muestran concepto XML, proveedor, cantidades, importe, conversión, merma, ecuación y validación guardadas. El encabezado recibe foco al abrir; cerrar devuelve el foco al botón de origen. Hasta 680px, el detalle y la búsqueda se apilan; la tabla oculta su cabecera visual y repite cada etiqueta junto al dato, conservando dos columnas internas por registro.

El botón «Abrir producto y compra en MiDespensa» lleva el ID de producto y de observación exactos. MiDespensa presenta esa compra como referencia de lectura con sus propios componentes e indica cuando ya es histórica. Esta acción pertenece exclusivamente a Precios; no se añade a los editores de recetas ni Grill Express. Evidencia implementada: [price-evidence-view.js](../src/ui/forx/price-evidence-view.js), montaje y acciones en [app.js](../src/ui/forx/app.js), reglas de [integration.css](../src/ui/forx/integration.css) y referencia en [midespensa-app.js](../src/ui/midespensa-app.js). Capturas de revisión: `.impeccable/review/prices-{desktop,user-1952,mobile,origin-desktop,origin-mobile,origin-light,midespensa-reference}.png`. La extensión conserva el marco y material heredados; no introduce tokens, familias ni una identidad nueva.

## Do's and Don'ts

### Do:

- **Do** ampliar FORX mediante sus superficies, temas y componentes existentes y respetar el límite de estilos del módulo.
- **Do** conservar las palabras de estado junto al color, especialmente el costo no verificable y su causa.
- **Do** leer el resultado de la cascada y los ajustes de montaje antes de atribuir una regla a la plantilla heredada.
- **Do** conservar las identidades y navegaciones FORX/MiDespensa dentro del producto compartido.

### Don't:

- **Don't** imponer la paleta, fuente condensada, planitud o límite de radio de MiDespensa sobre FORX.
- **Don't** rediseñar marcas, colores, tarjetas o navegación como efecto secundario de integrar datos.
- **Don't** convertir una declaración sin uso o un valor aislado en una regla general.

### Deriva y valores deliberadamente no canonizados

El `DESIGN.md` original registra tinta terciaria clara `#5F6E8B`, pero su propia hoja y la copia integrada ya usan `light-text-3`; la diferencia antecede a esta integración. También registra interlíneas de título/etiqueta distintas de la herencia efectiva de 1.45. El encabezado original de 19px recibe ahora el override integrado de 20px. Este documento registra el código final y no copia esas discrepancias como autoridad.

El comentario inicial de la hoja heredada que remite a «DESIGN.md» pertenecía al repositorio original; no significa que el DESIGN.md de MiDespensa reemplace ahora las reglas FORX. Los aliases transitorios `bd`, `bm`, `bl`, `gold` y `cream` tampoco constituyen nuevos papeles del sistema.

No se canonizan promesas de generación IA, escalado automático presentes en texto heredado sustituido al montar, glifos ausentes del badge actual, métricas aisladas de widgets sin uso comprobado ni mínimos tipográficos como garantía de accesibilidad. Las etiquetas pequeñas se registran como continuidad observada, no como prueba de legibilidad en todo dispositivo. Las diferencias requieren evidencia propia si se revisan posteriormente; no se resuelven cambiando la identidad en este registro.

### Apéndice: sustitución de logos — 2 de octubre de 2026

Por solicitud expresa del usuario se sustituyen los dos activos de marca utilizados por la interfaz. [forx-logo-dark.svg](../public/forx/forx-logo-dark.svg) procede de `/Users/franciscoguajardo/Downloads/Logo Forx Nuevo .svg` (SHA-256 `ffe5231ee54603c3fda8a423f32241f910e1d8b6af8e42ef6f26b72d54409271`); [midespensa-logo.svg](../public/midespensa-logo.svg) procede de `/Users/franciscoguajardo/Downloads/Logo MiDespensa Nuevo .svg` (SHA-256 `da4122c2d77796b76e9f8b7391f76d9c1b8a7d6b1fa4f3e757db0eaa99234467`). Los originales permanecen inalterados. Las copias usan máscaras vectoriales para transparentar fondo y huecos de letras, conservan blancos, colores y zonas oscuras de la X, y no incorporan rasterización. Sus viewBox son `38 135 843 384` y `30 62 828 398`, respectivamente.

Ambos logos se presentan completos y proporcionales en todos los anchos revisados. FORX elimina el margen de su imagen; MiDespensa usa un marco flex de hasta 180px y conserva los anchos responsivos de 54px y 76px sin recorte al símbolo. El favicon utiliza el mismo SVG de MiDespensa. Los activos heredados `forx-logo.svg` y `forx-logo-mono.svg`, sin referencias en la interfaz, y Grill Express permanecen intactos. Esta sustitución corrige únicamente la antigua regla de recorte en la sección Navigation de [DESIGN.md](../DESIGN.md); el sidecar no contiene esa regla y permanece intacto, al igual que todos los tokens.

Evidencia de cierre: `.impeccable/review/logos-{forx,midespensa}-{desktop,user-1952,tablet,mobile}.png` registra 1440, 1952, 1024 y 390px; `logos-transparency.png` registra la transparencia. El pase de implementación reportó build aprobado y las dos pruebas de [logos.spec.js](../tests/e2e/logos.spec.js) aprobadas: transparencia de esquinas y huecos, conservación de blancos y colores, ausencia de contenido raster o ejecutable, y carga, proporción y encaje de ambos logos. La revisión visual independiente aprobó los activos y solicitó la corrección documental del recorte, resuelta arriba. Este apéndice registra esa verificación del alcance local y no certifica legibilidad del texto pequeño del logo en todos los tamaños.

### Apéndice: vista previa del respaldo anterior — 3 de octubre de 2026

La extensión de lectura conserva el sistema FORX: tarjeta existente, Plex, temas oscuro y claro, controles secundarios, bordes finos y numerales tabulares. La selección reutiliza `accent-soft`, las advertencias `warn-ink` y los errores `crit-ink`, siempre acompañados de texto. Se mantienen las reglas **Module Boundary**, **Fill and Ink** y **Comparable Costs**: la ausencia de alertas de formato no valida cantidades ni costo. No incorpora tokens, fuentes ni activos de marca. El encabezado de página conserva el nivel de 20px; los títulos internos de esta vista son de 17px y 14px, con ayudas y datos compactos de 12px. Estas variantes locales no amplían la escala normativa del frontmatter.

La tabla y el detalle comparten una retícula de dos columnas y separación de 24px. Hasta 1180px el detalle pasa debajo, con divisor superior en lugar de lateral; hasta 480px los filtros se apilan y cada resultado distribuye nombre, advertencias y acción sin perder contenido. Abrir una receta enfoca su encabezado; «Volver a resultados» devuelve el foco al botón de esa receta. Cambiar búsqueda, filtro, copia o página limpia selección y detalle. La paginación muestra 30 registros y, al cambiar de página, enfoca el primer botón de detalle disponible. Son comportamientos propios de esta superficie, no nuevos umbrales globales del módulo.

El aviso de solo lectura acompaña la consulta: las copias local y de nube se comparan por separado, sin fusionarse. Cantidades por porción, procedimiento literal, omisiones y borradores Grill permanecen identificables; coincidencias con el catálogo y advertencias se consultan antes de cualquier recuperación futura. No hay acción de importar o guardar. Los límites del lector son 10 MB y 5000 recetas por copia; limpiar la vista, recargar o desmontar el módulo descarta el respaldo de memoria. El contenido del archivo se presenta como texto escapado, sin copiar precios ni credenciales y sin enviarlo al servidor. La comparación no convierte coincidencias en vínculos de ingredientes ni en costos verificados.

Evidencia: [legacy-preview.js](../src/ui/forx/legacy-preview.js), su montaje en [app.js](../src/ui/forx/app.js), reglas de [integration.css](../src/ui/forx/integration.css) y lector [legacy-recipe-preview.js](../src/domain/legacy-recipe-preview.js). La dirección está en [legacy-recipe-preview.md](../.impeccable/surfaces/legacy-recipe-preview.md). Las capturas `.impeccable/review/legacy-preview-{desktop,user-1952,tablet,mobile,light}.png` fueron revisadas por implementación y revisión independiente. El cierre reportó 114 pruebas unitarias aprobadas, 12 condicionales de emulador omitidas, tres pruebas de navegador específicas y dos de regresión FORX/Precios aprobadas. El único hallazgo del revisor, navegación de paginación, quedó resuelto y cubierto por prueba; las recapturas de escritorio y móvil no mostraron regresiones de composición y el veredicto final fue `ship`. Se registra ese alcance local, no una certificación global de FORX.

No se canonizan tamaños aislados como tokens ni la densidad heredada como garantía universal de legibilidad. El contexto detecta además un sidecar raíz anterior a la edición de DESIGN.md y ausencia de `buildPath` en configuración: son derivas preexistentes, ajenas a esta extensión. Se preservan el sistema MiDespensa y su sidecar, así como los tokens FORX, sin reparar esas diferencias en este apéndice.

### Apéndice: generador de propuestas simuladas — 4 de octubre de 2026

La extensión aprobada de «Generar receta» conserva el marco FORX, Plex, temas oscuro y claro, campos, avisos y editor contextual existentes. Las acciones «Generar propuesta simulada» y «Revisar en editor» reutilizan el botón ámbar; consultar estado e iniciar otra solicitud usan secundarios. Superficies, bordes, tintas de ayuda y errores proceden de las variables existentes. Se mantienen **Module Boundary**, **Fill and Ink**, **Comparable Costs** y **Visible Mobile Controls**: una coincidencia de nombre sigue siendo una sugerencia, y un costo pendiente conserva explicación textual. No se añaden tokens, familias, imágenes ni una identidad nueva; [DESIGN.md](../DESIGN.md) y [.impeccable/design.json](../.impeccable/design.json) permanecen intactos y mantienen su alcance MiDespensa.

Los títulos de página y propuesta usan el nivel de 20px existente; el procedimiento usa un subtítulo local de 16px. Campos y tabla mantienen el cuerpo compacto heredado, las ayudas usan 12px y las cantidades conservan cifras tabulares. La propuesta aparece bajo la captura, separada por un borde superior y espacio de 20px; el procedimiento conserva saltos de línea y un ancho máximo local de 72ch. El formulario reutiliza tres columnas con separación de 16px, dos hasta 900px y una hasta 480px. Hasta 600px, cada ingrediente de la propuesta distribuye nombre y cantidad en una fila y su referencia MiDespensa debajo. El editor conserva su región de ingredientes desplazable. Estas medidas describen la superficie construida, sin ampliar la escala normativa.

El aviso de simulación precede al formulario y vuelve a aparecer en la propuesta y el editor. Las preferencias de ingredientes están en un desplegable nativo; la ayuda aclara que no son existencias ni vínculos aprobados. El envío bloquea los campos mientras existe una solicitud, presenta progreso mediante estado anunciado y conserva la captura ante errores. Consultar estado recupera esa misma solicitud; la propuesta completada recibe foco en su título. «Nueva solicitud» conserva los campos y devuelve foco a la idea. Salir o recargar advierte sobre captura sin guardar. «Revisar en editor» exige confirmar revisión humana y mantiene el primer guardado como borrador «En pruebas»; no acredita precio ni activa la receta. Son comportamientos del ensayo aprobado, no una promesa de generación OpenAI real ni de interpretación de restricciones.

La corrección de acabado del tema claro hace que la identificación del entorno y «Actualizar datos» hereden la tinta del pie de navegación, ya definida en la hoja heredada (`#8EA3C9`), en lugar de la tinta oscura del área operativa. Se reutiliza ese color para mantener legibilidad sobre la barra azul; no se incorpora como nuevo token ni se legitima el contraste anterior.

Evidencia de código: [recipe-generator.js](../src/ui/forx/recipe-generator.js), montaje y revisión en [app.js](../src/ui/forx/app.js), reglas de [integration.css](../src/ui/forx/integration.css) y primitivas de [legacy.css](../src/ui/forx/legacy.css). Dirección y alcance: [recipe-generator-surface.md](recipe-generator-surface.md) y [openai-recipe-generator.md](openai-recipe-generator.md). Capturas finales: `.impeccable/review/generator-{desktop,user-1952,tablet,mobile,light}.png`. El cierre de implementación reportó 169 pruebas de check aprobadas y 14 condicionales omitidas, build aprobado, 11 pruebas E2E aprobadas y dos opt-in omitidas, tres recapturas aprobadas, 16 pruebas aisladas de reglas/servidor y una de recuperación aprobadas. La revisión independiente emitió `ship` limitado al acabado del flujo simulado; su único hallazgo fue la tinta del pie claro, corregida antes de las recapturas. El revisor no pudo leer `craft-floor` por su restricción de herramientas; el implementador sí lo leyó y aplicó. Este registro no amplía ese veredicto a la integración OpenAI real ni a toda la aplicación.

No se canonizan el alto aislado del campo de restricciones, los límites de ensayo, la densidad heredada como garantía universal de legibilidad ni promesas del proveedor real. La excepción de detector `broken-image=*` está limitada a `tests/recipe-generator-ui.test.js`, cuyo fixture XSS comprueba que no se renderice una imagen; no autoriza activos rotos. La ausencia preexistente de `buildPath` y las discrepancias históricas de tipografía/tinta ya registradas arriba permanecen fuera de este alcance; tampoco se regenera el sidecar raíz como efecto secundario de documentar FORX.
