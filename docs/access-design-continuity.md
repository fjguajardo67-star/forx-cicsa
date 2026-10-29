# Continuidad visual del acceso a FORX

Registro del 5 de octubre de 2026. Extensión funcional del mundo existente, basada en el código terminado y las capturas locales; no introduce un sistema visual ni reemplaza identidades. Se conservan íntegros [DESIGN.md](../DESIGN.md) y su [sidecar](../.impeccable/design.json). No se generan tokens ni otro sidecar para esta superficie.

## Overview

La autoridad de producto es [PRODUCT.md](../PRODUCT.md); la dirección específica está en [el contrato de acceso](../.impeccable/surfaces/src-ui-session-js.md). FORX conserva su [sistema de módulo](forx-design-continuity.md) y MiDespensa el sistema raíz. La extensión sigue la secuencia identificar FORX → entrar con Google → comprobar membresía → continuar; Google acredita identidad y gestiona recuperación, mientras FORX autoriza acceso. La interfaz declara que FORX no guarda ni copia contraseñas.

El alcance es una demostración local configurada pero deshabilitada para Google y cloud reales. [google-access.md](google-access.md) registra configuración, comportamiento y límites. La revisión de acabado comunicó **SHIP exclusivamente para este alcance local**, sin correcciones visuales materiales. Los señalamientos iniciales de logo ausente y seed requerido fueron retirados al volver a abrir las mismas capturas; no motivaron cambios de UI.

## Colors

El acceso usa las variables heredadas de lienzo, tinta, tinta secundaria, divisores, azul de interacción y conflicto. El cambio claro/oscuro conserva la cabecera marina y el SVG FORX aprobado. El separador frío organiza la ayuda; el enlace de recuperación usa la tinta de interacción del tema. Los estados de error añaden texto explícito y color de conflicto.

**Regla de continuidad de tema.** Cambiar superficies y tintas mediante las variables existentes; conservar la identidad marina de cabecera y los sistemas propios de ambos módulos.

El botón Google mantiene fondo blanco, tinta oscura, borde gris y el icono oficial multicolor en ambos temas. Sus valores locales (`#747775`, `#1f1f1f`, blanco y hover `#f2f2f2`) describen el proveedor; no son nuevos colores de producto. El hover marino `#12356d` ya existe en los controles heredados.

## Typography

La pantalla hereda IBM Plex Sans Variable de [styles.css](../src/styles.css). El título de acceso es una variante local sans de 28px, peso 650 e interlínea 1.25; no sustituye los rótulos condensados del sistema de MiDespensa. Los párrafos tienen interlínea 1.6. Ayuda y referencia usan 14px; el pie de cuenta, 12px; la franja de demostración, 13px. Son medidas de esta extensión, no una ampliación de la escala raíz.

El botón Google usa Arial a 14px, peso 500 e interlínea 20px, con icono de 20px. Esta excepción pertenece al control del proveedor. Los controles propios reutilizan la tipografía de botón existente.

## Layout

La cabecera contiene logo a la izquierda y cambio de tema a la derecha. El bloque de lectura se centra horizontalmente, con ancho máximo de 440px y margen lateral mínimo de 20px; su separación superior varía entre 40 y 100px. Título, explicación, acciones, estado y recuperación siguen el orden de lectura del contrato. No se añade tarjeta envolvente ni una composición promocional.

En el breakpoint local de 600px la cabecera reduce sus márgenes y el logo pasa de 152 a 120px; el control de tema admite dos líneas. El bloque comienza a 36px de su límite superior y las acciones ocupan todo el ancho. Correo y UID pueden partirse en cualquier punto para evitar desbordes; las referencias se pueden seleccionar completas. Estos ajustes no reemplazan los breakpoints de los módulos.

## Elevation & Depth

La pantalla de acceso se organiza con superficies planas y bordes de un píxel. La separación entre cabecera, prueba local y ayuda procede del tono y los divisores; no se incorpora sombra propia. Esto describe únicamente el acceso: el módulo FORX conserva sus tarjetas y diálogos heredados.

## Shapes

Los controles de aplicación conservan sus radios contenidos. Google usa un radio local de 4px y borde fino. Los botones de las acciones de acceso tienen altura mínima de 44px; el pie de cuenta de FORX reutiliza su botón de módulo con mínimo de 40px.

## Components

- **Acceso:** `Continuar con Google`, estado de comprobación y mensajes concretos de cancelación, popup bloqueado o conexión fallida. El botón se deshabilita durante el inicio de sesión. La fuente es [session-view.js](../src/ui/session-view.js), [session.js](../src/ui/session.js) y [session.css](../src/ui/session.css).
- **Membresía denegada:** conserva la misma composición; presenta correo y UID, `Revisar acceso` como acción primaria y `Cambiar de cuenta` como secundaria. No muestra datos del catálogo. **Regla de identidad y autorización:** la confirmación de Google no implica membresía en FORX.
- **Recuperación:** enlace a Google que anuncia apertura en otra pestaña; la ayuda distingue recuperación de identidad y permiso de FORX. No hay formulario ni respaldo de contraseñas propio.
- **Estado y foco:** mensajes con `status`/`alert` y región viva; encabezado enfocado programáticamente al cambiar de pantalla. El foco de controles procede del estilo global existente; el título no interactivo omite su contorno programático.
- **Cuenta en módulos:** correo o nombre y cierre de sesión al pie de navegación; MiDespensa añade el rol en texto. FORX reutiliza sus botones dentro del Shadow DOM; MiDespensa, sus controles de aplicación. Implementación en [FORX app.js](../src/ui/forx/app.js), [integration.css](../src/ui/forx/integration.css) y [midespensa-app.js](../src/ui/midespensa-app.js).

### Evidencia y procedencia

Capturas en [.impeccable/review](../.impeccable/review/): `access-dark-desktop.png` y `access-light-desktop.png` (1440 × 1000); `access-dark-mobile.png` y `access-light-mobile.png` (390 × 844); `access-dark-user-1952.png` y `access-light-user-1952.png` (1952 × 1269); `access-denied-mobile.png`; `access-forx-account-desktop.png` y `access-pantry-account-desktop.png` (1440 × 1050). Representan cuenta ficticia sin Google ni datos compartidos. La documentación cotejó directamente las capturas oscura de escritorio, clara móvil y denegada móvil; la revisión de acabado cubrió el conjunto y confirmó continuidad de identidad, composición, controles de acceso, tipografía, material e integración de cuenta de escritorio.

No se certificó visualmente el pie de cuenta de los módulos en móvil ni el popup real de Google/Safari. La evidencia local no acredita OAuth ni funcionamiento cloud.

El SVG FORX aprobado permanece intacto. [google-g.svg](../public/google-g.svg) incluye su procedencia: configurador HTML oficial de Google Identity, consultado el 5 de octubre de 2026. No se recoloreó ni alteró su geometría. No se incorporan nuevos raster de producto; las capturas son evidencia de revisión.

## Do's and Don'ts

- Conservar las reglas de tema y las identidades de FORX y MiDespensa; esta extensión no autoriza homogeneizar sus módulos.
- Mantener visible la diferencia entre identidad, membresía y demostración local.
- No convertir la composición de 440px, el breakpoint de 600px, las medidas locales 28/14/12px ni los colores oficiales de Google en tokens globales.
- No interpretar las variantes clara y oscura como deriva por sí mismas.

### Discrepancia preexistente conservada

El frontmatter raíz asigna a `button-primary` y su hover `colors.ink` y `typography.label` (10px); el CSS existente usa tinta `#201704` sobre ámbar y botones de 12px. El snippet del sidecar coincide con ese CSS. Esta discrepancia documental precede a la extensión y se registra sin reparar ni cambiar la apariencia para hacerla coincidir con el documento. Los avisos del detector sobre el hover heredado, la identidad de Google y medidas locales tampoco autorizan ampliar el sistema raíz.
