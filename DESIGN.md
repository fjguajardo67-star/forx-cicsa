---
name: MiDespensa
description: La consola de insumos de FORX, con variantes oscura y clara del mismo sistema operativo.
colors:
  paper: "#071a3d"
  paper-strong: "#0b2858"
  paper-muted: "#061531"
  spruce: "#020f27"
  ink: "#f3f7ff"
  ink-soft: "#9eb0cf"
  line: "#1b4278"
  line-dark: "#31578a"
  citrus: "#ffc246"
  citrus-hover: "#ffad28"
  sage-selection: "#0b365f"
  conflict-rust: "#ff6854"
  conflict-soft: "#3b2234"
  success: "#16c586"
  warning: "#ffc246"
  focus: "#16cde5"
  field: "#081d43"
  light-paper: "#f3f6fc"
  light-paper-strong: "#ffffff"
  light-paper-muted: "#e9effa"
  light-ink: "#0b1b3a"
  light-ink-soft: "#435575"
  light-line: "#c9d5e6"
  light-line-dark: "#7488a6"
  light-sage-selection: "#dcecf8"
  light-focus: "#006c80"
  light-warning: "#8a5b00"
  light-conflict-rust: "#b83224"
  light-conflict-soft: "#fcece8"
  light-success: "#08734f"
  light-field: "#ffffff"
  light-surface-hover: "#e2ebf8"
  light-badge: "#e1eaf7"
  light-success-soft: "#e4f4ed"
  light-success-ink: "#075b3e"
  light-warning-soft: "#fff3d6"
  light-warning-ink: "#704900"
  light-error-ink: "#992b20"
typography:
  display:
    fontFamily: "Arial Narrow, Aptos Narrow, Helvetica Neue Condensed, ui-sans-serif, sans-serif"
    fontSize: "27px"
    fontWeight: 850
    lineHeight: 1.1
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Arial Narrow, Aptos Narrow, Helvetica Neue Condensed, ui-sans-serif, sans-serif"
    fontSize: "18px"
    fontWeight: 850
    lineHeight: 1.2
    letterSpacing: "0.025em"
  title:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans Variable, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xs: "5px"
  sm: "6px"
  md: "7px"
  lg: "9px"
  round: "50%"
spacing:
  compact: "8px"
  control: "12px"
  cluster: "14px"
  section: "22px"
components:
  theme-toggle-light:
    backgroundColor: "{colors.light-paper-strong}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.citrus}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.citrus-hover}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.paper-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 11px"
  chip:
    backgroundColor: "{colors.paper-muted}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "0 7px"
    height: "24px"
---

# Design System: MiDespensa

## Overview

**Creative North Star: "La Consola FORX"**

MiDespensa continúa el lenguaje visual de la aplicación FORX: un lienzo azul marino profundo, paneles azules contiguos, bordes fríos y acentos turquesa, ámbar y naranja. La interfaz sigue siendo sobria, técnica y legible; la procedencia de cada dato se presenta como una secuencia visible, no como una automatización opaca.

La densidad es intencional. Tablas, pestañas de índice y fichas apiladas permiten comparar evidencia, interpretación y costo en el mismo campo visual. El amarillo queda reservado para decisiones primarias, el turquesa orienta navegación y foco, y el coral aparece únicamente cuando existe conflicto o una acción destructiva.

La variante clara extiende este mismo mundo: lienzo frío, paneles blancos y tinta marina, con estados más oscuros sobre fondos suaves. Conserva densidad, tipografía, geometría, navegación marina y logo; el tema oscuro sigue siendo el predeterminado cuando no existe una preferencia guardada.

**Key Characteristics:**

- Lienzo azul marino con paneles azules y navegación casi negra.
- Variante clara de superficies y estados, con la misma navegación marina y jerarquía operativa.
- Retícula operativa, hairlines fríos y controles de radio contenido.
- Jerarquía tipográfica compacta con encabezados condensados y numerales tabulares.
- Estados explícitos que combinan texto, color y marcadores.
- Hebra de procedencia numerada para original → producto → ingrediente → precio real.
- Logo MiDespensa sobre la navegación, con su X naranja y amarilla como firma de producto.

## Colors

La paleta proviene de la aplicación FORX de referencia: azul noche, paneles azul profundo, turquesa de interacción y ámbar de acción. El naranja del logo MiDespensa se conserva en la identidad sin competir con los estados operativos.

Los tokens sin prefijo registran la variante oscura. Los tokens `light-*` registran sus equivalentes bajo `data-theme="light"`, definidos en `src/ui/midespensa-light.css`; el prefijo distingue variantes en este documento, no renombra las variables CSS. `light-sage-selection`, `light-conflict-rust`, `light-conflict-soft`, `light-success` y `light-warning` corresponden a `--sage`, `--rust`, `--rust-soft`, `--green` y `--amber`. `light-focus` sirve también al azul de interacción (`--blue`). El resto conserva su nombre al quitar el prefijo.

### Primary

- **Azul Noche FORX** (`spruce`, #020f27): navegación y estructura permanente.
- **Ámbar de Decisión** (`citrus`, #ffc246): acción primaria y selección de texto; señala el siguiente paso sin teñir superficies completas.
- **Ámbar Activo** (`citrus-hover`, #ffad28): respuesta de hover exclusiva de la acción primaria.

### Secondary

- **Selección Clara** (`light-sage-selection`): filas seleccionadas y zonas de carga activas.
- **Verde Validado Claro** (`light-success`): marcadores y bordes positivos; `light-success-soft` y `light-success-ink` forman el par de fondo y texto de chips y avisos positivos.

- **Azul de Selección** (`sage-selection`, #0b365f): renglón de tabla seleccionado y zonas de carga activas.
- **Verde Validado** (`success`, #16c586): puntos de estado, sugerencias y confirmaciones positivas.

### Tertiary

- **Turquesa Legible** (`light-focus`): foco, vínculos e interacción sobre superficies claras. La barra marina conserva su foco turquesa original.
- **Conflicto Claro** (`light-conflict-rust`, `light-conflict-soft`, `light-error-ink`): borde o acción de peligro, fondo suave y texto de error en avisos y chips.
- **Advertencia Clara** (`light-warning`, `light-warning-soft`, `light-warning-ink`): borde, fondo y texto de avisos provisionales; la acción primaria conserva el ámbar original.

- **Coral de Conflicto** (`conflict-rust`, #ff6854): conflictos, errores y acciones peligrosas.
- **Ámbar Provisional** (`warning`, #ffc246): estados temporales o aún no confirmados.
- **Turquesa de Foco** (`focus`, #16cde5): foco de teclado, navegación activa y vínculos; no compite con el ámbar como llamada a la acción.

### Neutral

- **Lienzo Claro** (`light-paper`), **Panel Blanco** (`light-paper-strong`) y **Carril Claro** (`light-paper-muted`): fondo general, lectura principal y evidencia lateral o fórmulas.
- **Tinta Marina** (`light-ink`) y **Tinta Secundaria Clara** (`light-ink-soft`): lectura y metadatos sobre fondos claros.
- **Divisores Claros** (`light-line`, `light-line-dark`): separación y límite firme de controles.
- **Campo Blanco** (`light-field`), **Hover Frío** (`light-surface-hover`) e **Insignia Clara** (`light-badge`): campos, respuesta al puntero y chips o contadores neutrales.

- **Lienzo Profundo** (`paper`, #071a3d): fondo general.
- **Panel Operativo** (`paper-strong`, #0b2858): tablas, controles secundarios y superficies de lectura.
- **Carril Nocturno** (`paper-muted`, #061531): navegación, scrollbars y capas profundas.
- **Tinta Principal** (`ink`, #f3f7ff): texto de máxima jerarquía.
- **Tinta Secundaria** (`ink-soft`, #9eb0cf): explicación, metadatos y etiquetas.
- **Hairline Azul** (`line`, #1b4278) y **Hairline Firme** (`line-dark`, #31578a): separación y límites de control.

### Named Rules

**The Amber Decision Rule.** El ámbar identifica la acción principal; el turquesa se reserva para foco y navegación activa. Ninguno se usa como relleno decorativo de una sección completa.

**The Conflict Is Coral Rule.** El coral se reserva para conflicto, error o peligro y siempre aparece acompañado de texto o iconografía comprensible.

**The Same Console Rule.** El tema claro cambia superficies, tintas y estados; conserva la navegación marina, el logo, el ámbar de acción y la geometría de trabajo.

## Typography

**Display Font:** Arial Narrow con Aptos Narrow, Helvetica Neue Condensed y sans-serif como respaldo.
**Body Font:** IBM Plex Sans Variable, autoalojada, con la pila sans-serif del sistema como respaldo.
**Label/Mono Font:** La pila de cuerpo; los identificadores y montos conservan numerales tabulares en lugar de introducir otra familia.

**Character:** Los encabezados condensados evocan índices impresos y rótulos de gabinete. IBM Plex Sans aporta una voz técnica editorial al cuerpo y sostiene tablas densas, unidades, importes y evidencia fiscal sin perder ritmo.

### Hierarchy

- **Display** (850, 27px, 1.1): títulos de página y encabezado de la cola, con tracking cerrado.
- **Headline** (850, 18px, 1.2): títulos de ficha y paneles de evidencia.
- **Title** (700, 16px, 1.3): encabezados de sección y formularios.
- **Body** (400, 13px, 1.5): navegación, búsquedas, descripciones y celdas principales; los textos explicativos se limitan aproximadamente a 68ch.
- **Label** (700, 10px, 1.4): metadatos, chips, encabezados compactos y ayudas.

### Named Rules

**The Cabinet Label Rule.** Usa la familia condensada solo para títulos, wordmark y encabezados de tabla; la lectura operativa larga permanece en la sans funcional.

**The Stable Numbers Rule.** Montos, cantidades, métricas e identificadores usan numerales tabulares para que las comparaciones verticales no salten.

## Layout

La composición de escritorio es un gabinete de dos niveles: una barra lateral de 12vw y una franja superior de 64px enmarcan el área operativa. La vista de revisión divide el espacio restante entre una cola flexible con mínimo de 620px y una ficha de evidencia de aproximadamente 30.6vw, con mínimo de 390px. Los límites de 1px sustituyen el espacio vacío excesivo y mantienen visibles las relaciones entre registros.

El ritmo recurrente utiliza 8px para ajustes compactos, 12–14px dentro de controles y 22px en márgenes de sección. Los renglones de revisión miden 76px y el encabezado fijo 53px, lo suficiente para leer sin perder densidad. Los paneles generales usan 22px de margen lateral; las fichas de procedencia reducen ese margen para favorecer la comparación.

A 1180px la navegación colapsa a 72px y esconde las etiquetas. A 900px se transforma en una banda horizontal fija de 58px; la cola y la ficha se apilan y la tabla conserva su ancho de 820px mediante desplazamiento horizontal. A 620px los formularios, resúmenes y acciones pasan a una columna, mientras el desglose de precio real mantiene dos columnas por fila.

**The Evidence Beside Queue Rule.** En escritorio, la cola y la procedencia conviven; en pantallas estrechas se apilan sin simplificar ni esconder la evidencia.

El selector de tema se sitúa después de Consultar catálogo en la barra superior y mide al menos 44px de alto. A 1180px o menos oculta su etiqueta visible y ocupa 44px de ancho, conservando icono, nombre accesible y tooltip. La barra incorpora una columna automática para este control; a 620px mantiene tres columnas al desaparecer la cuenta según el comportamiento existente.

## Elevation & Depth

El sistema es plano por defecto. La jerarquía se construye con capas de azul, bordes de 1px y superficies contiguas; no se usan sombras para elevar tablas, fichas o paneles. La única elevación ambiental persistente pertenece a mensajes flotantes, mientras que el foco usa un anillo turquesa y la tabla activa una barra interior.

### Shadow Vocabulary

- **Toast ambiental** (`0 14px 34px rgba(0, 8, 24, .32)`): separa confirmaciones flotantes del contenido sin convertirlas en tarjetas pesadas.
- **Toast ambiental claro** (`0 14px 34px rgba(11, 27, 58, .16)`): reduce la opacidad de elevación en el lienzo claro; las notificaciones conservan su tinta blanca sobre fondo oscuro.
- **Anillo de foco** (`0 0 0 2px color-mix(in srgb, #16cde5 18%, transparent)`): acompaña al borde turquesa del campo activo.
- **Barra de fila enfocada** (`inset 3px 0 #16cde5`): conserva la alineación del registro y añade una señal de teclado.

### Named Rules

**The Flat Ledger Rule.** Las superficies de trabajo permanecen planas; usa hairlines y cambios de hoja antes que sombras.

## Shapes

La forma es recta y contenida, con radios pequeños que suavizan controles sin volverlos amigables en exceso. Chips y contadores usan 5px, controles primarios 6–7px y fichas o notificaciones 9px. Los círculos se reservan para avatares, puntos de estado e índices numerados. Las tablas y grupos métricos conservan esquinas rectas para reforzar la retícula de gabinete.

**The Contained Radius Rule.** Nunca incrementes el radio para fabricar tarjetas blandas: 9px es el límite de las superficies recurrentes y 50% pertenece solo a marcadores verdaderamente circulares.

## Components

### Buttons

En claro, secundarios y campos usan panel blanco con tinta marina; el hover secundario usa Hover Frío. Los primarios conservan ámbar y texto oscuro. Foco, borde y peligro toman el equivalente semántico del tema.

- **Shape:** control compacto de 40px de alto con esquinas contenidas (7px); la variante compacta mide 32px y las decisiones de evidencia 53px.
- **Primary:** fondo ámbar, texto azul casi negro y padding horizontal de 14px; la acción superior amplía el padding a 22px.
- **Hover / Focus:** el primario profundiza al ámbar activo; todas las variantes reciben el foco turquesa global de 3px con separación de 2px.
- **Secondary / Quiet / Danger:** el secundario usa panel azul y borde firme; quiet elimina el borde; danger conserva fondo transparente y usa coral en borde y texto.

### Chips

En claro, chips neutrales usan Insignia Clara; los positivos, provisionales y de error comparten con los avisos sus pares de fondo suave y tinta oscura.

- **Style:** etiquetas de 24px, radio de 5px, cuerpo de 9px en negrita y relleno horizontal de 7px.
- **State:** neutral azul, validado verde, provisional ámbar y conflicto coral; el estado nunca depende solo del color.

### Cards / Containers

En claro, tablas y fichas son blancas, la evidencia lateral y las fórmulas usan Carril Claro y las filas seleccionadas usan Selección Clara. Se conserva la regla Flat Ledger.

- **Corner Style:** las fichas de evidencia usan esquinas suavemente curvas (9px); paneles, tablas y resúmenes permanecen rectos.
- **Background:** panel azul o azul translúcido sobre el lienzo profundo.
- **Shadow Strategy:** sin sombra en reposo; ver la regla Flat Ledger.
- **Border:** hairline claro de 1px; el firme se reserva para controles y separadores de mayor jerarquía.
- **Internal Padding:** 12–14px en fichas, 18–22px en formularios y paneles secundarios.

### Inputs / Fields

- **Style:** fondo azul profundo, borde firme de 1px, radio de 6–7px y padding de 10px × 11px; etiquetas pequeñas encima del control.
- **Focus:** borde turquesa y anillo exterior translúcido.
- **Error / Disabled:** error en coral; controles deshabilitados reducen opacidad a .46 y eliminan la expectativa de interacción.

### Navigation

La barra marina y el logo conservan su tratamiento en ambos temas. La navegación mantiene el turquesa original de foco y texto claro aunque el área operativa use tinta marina.

La navegación principal usa azul casi negro y botones de 48px con icono más etiqueta. El nuevo SVG de MiDespensa entregado por el usuario, con fondo y huecos transparentes, encabeza la barra completo en escritorio, tablet y móvil; conserva su proporción sin recortarse al símbolo X. El activo suma un fondo turquesa translúcido, peso 700 y una pestaña turquesa de 4px al borde izquierdo. En tablet se ocultan las etiquetas; en móvil la navegación gira a una banda horizontal y la pestaña pasa al borde inferior.

### Selector de tema

Botón semántico con icono y etiqueta de destino: «Cambiar a tema claro» o «Cambiar a tema oscuro». `aria-label`, `title` y texto visible se sincronizan al alternar. El foco visible sigue la regla global. MiDespensa y el selector existente de FORX comparten `forx-v2-theme`: primero se recupera `localStorage`, después `sessionStorage` como respaldo y finalmente oscuro. La elección persiste entre módulos y recargas cuando el almacenamiento está disponible; si ambos almacenes están bloqueados, alternar sigue funcionando durante la sesión en memoria. La preferencia es de presentación y no pertenece a los datos de negocio.

### Ficha de procedencia

Cuatro fichas numeradas conectan el dato original, el producto comercial, el ingrediente maestro y el precio real con merma. Una hebra de 1px anima su entrada durante 550ms con una curva de salida rápida; `prefers-reduced-motion` elimina la animación. Los pasos interpretados ofrecen un control Editar, y la decisión primaria queda inmediatamente después del cálculo.

### Cola de revisión

La tabla usa un encabezado fijo, filas de 76px y selección en azul medio. Cada estado combina un punto, una etiqueta textual y, cuando hay conflicto, color de texto. El foco de teclado añade una barra interior turquesa; la selección conserva el registro completo como una sola unidad visual.

## Do's and Don'ts

### Do:

- **Do** conserva la secuencia original → producto → ingrediente → precio real cuando una decisión dependa de evidencia.
- **Do** usa divisores de 1px y cambios tonales para estructurar información densa.
- **Do** reserva el ámbar para una única decisión primaria y el turquesa para foco o navegación activa.
- **Do** presenta estado con texto, marcador e iconografía cuando corresponda.
- **Do** mantiene las tablas desplazables en móvil antes que eliminar columnas de procedencia.

### Don't:

- **Don't** conviertas el catálogo en un tablero de tarjetas independientes o métricas decorativas.
- **Don't** uses sombras en fichas, tablas o paneles estáticos.
- **Don't** uses coral para decoración, énfasis neutral o acciones positivas.
- **Don't** redondees contenedores recurrentes por encima de 9px ni uses píldoras para controles que no sean marcadores compactos.
- **Don't** ocultes merma, rendimiento o la fórmula que produce el precio real.
