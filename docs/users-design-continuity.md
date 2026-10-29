# Continuidad visual: Usuarios y roles

Registro del 5 de octubre de 2026 de la extensión de Administración de MiDespensa para gestionar membresías de FORX. Describe el código y las capturas terminadas; no introduce tokens, una identidad nueva ni una revisión del sistema global.

La autoridad visual sigue en [DESIGN.md](../DESIGN.md) y su [sidecar](../.impeccable/design.json), con los compromisos de [PRODUCT.md](../PRODUCT.md). Ambos archivos de sistema se conservan sin cambios. El [contrato de esta superficie](../.impeccable/surfaces/src-ui-access-panel-js.md) fija una extensión estrecha en modo Operate, code-led, bajo la exención §3: no hubo comp ni QUALITY BAR externa. El procedimiento operativo completo está en [la guía de usuario](user-guide.md).

## Overview

Usuarios y roles aparece dentro de Administración, antes de Ajustes de MiDespensa. El encabezado, las acciones Actualizar cuentas y Autorizar cuenta, la explicación del acceso y la tabla mantienen la organización de una consola operativa. La identidad Google se distingue del permiso para usar FORX; el panel no ofrece crear contraseñas.

El flujo construido permite leer las cuentas, comprobar UID y correo, elegir permisos, revisar y confirmar en el mismo contenido. Formulario y confirmación son bloques en línea. La confirmación de desactivación conserva la identidad visible, explica que los datos permanecen y ofrece Volver a editar antes de Confirmar cambio. El contrato THESIS/OWN-WORLD/STORY/FIRST VIEWPORT/FORM se mantiene; las adaptaciones estrechas descritas abajo no sustituyen su dirección.

## Colors

Se reutilizan la consola marina, las superficies frías del tema claro y los colores semánticos existentes. El CSS local toma tinta secundaria y separadores de las variables compartidas; no define una paleta. Autorizar cuenta y las confirmaciones positivas emplean el primario ámbar; desactivar usa el control de peligro coral. Activo y Desactivado se leen como texto, además de su tratamiento de chip. La demostración en memoria tiene un aviso ámbar explícito.

La evidencia conserva las reglas **Same Console**, **Amber Decision** y **Conflict Is Coral** del sistema. En claro cambian lienzo, tinta, campos y estados, mientras navegación marina, logo y geometría permanecen. Los logos originales se reutilizan; esta extensión no añade activos ni raster de producto.

## Typography

Se heredan IBM Plex Sans Variable para lectura operativa y la familia condensada del título de página. La jerarquía existente distingue Administración, Usuarios y roles, instrucciones, identidad, UID y estados. La sección reutiliza el título de 16px definido en la hoja global; no crea otra rampa.

Correo y UID ocupan líneas separadas, con la identidad en negrita y el identificador en tinta secundaria. Los identificadores admiten salto en cualquier punto para conservar su lectura en estrecho. Los párrafos del panel tienen un límite local de 72ch e interlineado 1.5; esto describe esa superficie, no reemplaza las medidas globales. Los 12px de etiquetas del editor y del bloque de sesión compacto permanecen decisiones locales.

## Layout

En escritorio la tabla plana conserva cuatro columnas: Cuenta / UID, Rol, Acceso y Acción. La primera dispone de la mitad del ancho. La cuenta de sesión y Cerrar sesión permanecen en la barra lateral amplia, igual que en la referencia incumbente.

A 1180px o menos se ocultan los bloques de cuenta y contexto de la barra lateral. Cuenta, rol y Cerrar sesión se presentan en el contenido de Administración, encima de Usuarios y roles, para evitar solaparse con la navegación compacta. La captura de 1024px confirma esta redistribución y conserva las cuatro columnas de la tabla.

A 620px o menos cada registro se apila: identidad a ancho completo, rol y estado en la siguiente línea, y Editar a ancho completo. El encabezado de tabla se oculta visualmente; el marcado conserva tabla, caption y encabezados de columna. La etiqueta visible «Rol:» acompaña al valor en móvil. No se elimina información ni acciones. Esta adaptación corresponde a cuentas; no redefine la regla de desplazamiento de las tablas de procedencia.

El editor tiene un máximo local de 760px y divisores superior e inferior, con espacio vertical de 18px. Los grupos de acciones se envuelven con separación de 8px; controles del panel y cierre compacto tienen altura mínima de 44px. Son ajustes de esta extensión, no nuevos tokens obligatorios para otras pantallas.

## Elevation & Depth

Se conserva **Flat Ledger**: filas, formularios y confirmación se organizan con separadores y tono, sin sombras añadidas ni contenedores flotantes. La confirmación en línea conserva el contexto de la tabla por debajo.

## Shapes

Botones, campos y chips reutilizan la geometría compartida y los radios contenidos del sistema. La extensión no declara radios nuevos. El apilado móvil mantiene registros separados por líneas y no convierte las cuentas en tarjetas elevadas.

## Components

La implementación reutiliza botones primarios, secundarios y de peligro, campos y selects etiquetados, chips, avisos y tabla simple. El controlador declara estados de carga, resultado y error, deshabilita acciones mientras espera y mueve el foco hacia el encabezado, campo o mensaje pertinente. Los errores de sesión o permiso retiran las cuentas de la vista; los conflictos o respuestas inciertas exigen actualizar antes de otra escritura. Estas observaciones describen el comportamiento de interfaz presente en el código, sin certificar la autorización del servidor.

La [fixture de acceso](../src/dev/access-preview.js) usa direcciones ficticias `example.invalid`, UID de prueba y datos en memoria. Su entrada en [app.js](../src/app.js) y [auth-preview.js](../src/dev/auth-preview.js) está restringida al modo DEV local. Las capturas muestran el aviso de ensayo y el entorno sin Google ni servidor. Esta documentación no activa Google, cloud ni datos compartidos; la demostración no acredita seguridad o preparación para producción.

## Evidencia y cierre

Se contrastaron [access-panel.js](../src/ui/access-panel.js), [access-panel.css](../src/ui/access-panel.css), su integración en [midespensa-app.js](../src/ui/midespensa-app.js) y las reglas heredadas en [styles.css](../src/styles.css) y [midespensa-light.css](../src/ui/midespensa-light.css). Se abrieron como imágenes las siguientes capturas:

| Evidencia | Continuidad observada |
| --- | --- |
| [Incumbente](../.impeccable/review/access-pantry-account-desktop.png) | Consola marina, logo, navegación, barra superior y cuenta de sesión. |
| [Escritorio oscuro, 1440px](../.impeccable/review/users-dark-desktop.png) | Sección y tabla integradas antes de ajustes, sin cambio del marco visual. |
| [Escritorio claro, 1440px](../.impeccable/review/users-light-desktop.png) | Misma estructura, navegación marina y estados adaptados al tema. |
| [Escritorio amplio, 1952px](../.impeccable/review/users-user-1952.png) | Tabla distribuida en el ancho disponible y continuidad de ajustes y respaldo. |
| [Tablet, 1024px](../.impeccable/review/users-tablet.png) | Cuenta y cierre en el contenido, navegación compacta y tabla íntegra. |
| [Móvil oscuro, 390px](../.impeccable/review/users-dark-mobile.png) | Filas apiladas con identidad, rol, estado y acción completa. |
| [Móvil claro, 390px](../.impeccable/review/users-light-mobile.png) | Mismo orden y acciones con el tema claro heredado. |
| [Confirmación móvil, 390px](../.impeccable/review/users-confirm-mobile.png) | Identidad, resumen, advertencia y acción coral en línea. |

El cierre comunicado por el revisor independiente `users_finish_review` fue **ship**, con fidelidad al contrato y sin arreglos materiales pendientes. La pasada de detector reportada no encontró hallazgos principales y dejó dos avisos locales de 12px en las líneas 8 y 22 de `access-panel.css`; no se añadieron exclusiones ni se cambió el sistema para silenciarlos. Este cierre es una revisión de interfaz, no una auditoría de seguridad o producción.

Se observó una discrepancia documental preexistente: el frontmatter de `DESIGN.md` asigna `{colors.ink}` al texto del primario, pero `src/styles.css` usa texto oscuro `#201704`, coincidente con las capturas, la prosa de Components y el snippet del sidecar. Se registra sin corregir porque este corte no autoriza cambios del sistema. No se canonizan los 12px locales, las medidas particulares del editor ni el aviso ficticio como reglas globales.
