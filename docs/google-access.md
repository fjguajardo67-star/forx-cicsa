# Acceso de FORX con Google

Decisión de Francisco, 5 de octubre de 2026: Google como proveedor de identidad.
Implementado y probado localmente; **Google real y la publicación no están activados**.

## Qué hace la aplicación

- `Continuar con Google` abre el selector de cuenta mediante Firebase Auth.
  Solo identidad básica: no se solicitan Gmail, Drive, contactos ni contraseñas.
- Google administra contraseña y recuperación. El enlace de FORX lleva a
  `https://accounts.google.com/signin/recovery`. No es un respaldo de contraseñas
  ni garantiza recuperar una cuenta. En Workspace puede intervenir su administrador.
- La cuenta necesita una membresía activa en FORX; iniciar sesión puede crear
  su identidad en Auth, **nunca** la autoriza automáticamente.
- La pantalla de acceso denegado muestra correo y UID para pedir autorización.
  Permite revisar de nuevo o cambiar de cuenta; no expone catálogo ni recetas.
- Consulta, edición y administración siguen siendo permisos del servidor.
  No se confía en un rol enviado por el navegador ni en claims antiguos.
- Hay cierre de sesión en ambos módulos. Quita la vista, cierra conexiones y
  descarta respuestas tardías antes de esperar al proveedor. Una operación ya
  recibida por el servidor puede terminar: salir no la revierte.
- Firebase conserva la sesión por pestaña (`browserSessionPersistence`), no
  indefinidamente. FORX no copia tokens manualmente a localStorage. Los datos de
  negocio del modo autenticado no se guardan en IndexedDB ni se leen desde la demo.
- Se comprueba acceso al volver a la pestaña y cada minuto mientras está visible;
  cada petición de datos vuelve a comprobarlo en el servidor. La salida no cierra
  Google ni las demás pestañas de FORX. En equipos compartidos hay que cerrar
  también las otras sesiones del navegador.
- Los errores de red no repiten escrituras automáticamente. Actualizar y comprobar
  el resultado antes de repetir evita duplicar cambios inciertos.

## Configuración pendiente, no ejecutar todavía

`config/client.example.json` está deshabilitado y tiene referencias ficticias.
`VITE_FORX_PUBLIC_CONFIG` recibe ese JSON como configuración pública **al compilar**.
No se carga configuración desde parámetros URL ni almacenamiento del navegador.
No incluir secretos, credenciales Admin, tokens ni claves OpenAI en variables VITE.

Antes de habilitarlo, se debe aprobar y verificar:

1. Proyecto exclusivo `forx-v2-*`, aplicación web y API HTTPS. No usar recursos
   del FORX anterior, MiDespensa staging ni de otras aplicaciones por conveniencia.
2. Proveedor Google habilitado solo en el proyecto aprobado; dominio de la app
   autorizado, pantalla de consentimiento y políticas correspondientes.
3. `signInProvider: "google.com"` en servidor, proyecto del token coincidente,
   origen exacto permitido en API. Auth domain propio `PROYECTO.firebaseapp.com`.
4. Primer UID de administrador verificado e inicialización explícita del backend
   vacío. Designar responsables y aceptar en el entorno real el procedimiento
   implementado de recuperación administrativa; Google recupera identidad, no
   reasigna permisos de FORX.
5. Prueba real autorizada de popup, cancelación, recuperación y cierre en Safari,
   Chrome y dispositivo móvil. Si el popup está bloqueado se explica cómo
   habilitarlo; no hay redirección OAuth automática ni acceso alternativo sin permiso.
6. Configurar las cuentas iniciales y aceptar la gestión de usuarios real.
   El panel de altas/cambios/desactivación ya está implementado en Administración
   de MiDespensa y probado localmente. No autoriza cuentas cloud en este corte.

Una compilación publicada sin configuración válida muestra **Acceso todavía no
habilitado**, aun cuando su URL incluya `backend=emulator`, `backend=indexeddb` o
`authPreview=1`. Tampoco arranca automáticamente una base local.

## Prueba sin cuentas reales

En Vite local: `http://127.0.0.1:4174/?authPreview=1#/forx/precios`.
La franja indica **cuenta ficticia, sin Google ni datos compartidos**. Se usa un
repositorio nuevo solo en memoria; salir o recargar descarta ese ejemplo. No
importar datos reales allí. Este simulador no se incluye en el bundle de producción.
La URL local habitual de emuladores y sus datos no cambian.

En Administración → Usuarios y roles se puede usar **preview-new** para ensayar
comprobación de UID → correo → rol → confirmación. Es una identidad ficticia.
`previewRole=viewer` o `previewRole=editor`, junto con `authPreview=1`, permiten
comprobar que esos roles no ven la lista. Solo existen en el preview DEV localhost.

## Administración de membresías

`/access/list`, `/access/lookup` y `/access/update` requieren administración vigente.
Lookup recibe únicamente UID y devuelve identidad mínima y membresía, no secretos.
La autorización exige una identidad Google disponible y correo verificado. No
se crea una cuenta ni se envían correos. El rol inicial propuesto es Consulta.
Desactivar solo cambia la membresía: se permite incluso si Auth fue deshabilitado,
sin borrar datos. El servidor protege al último administrador mediante transacción.

La UI confirma cuenta, rol y acceso; envía revisión esperada y no reintenta errores.
El servidor vuelve a comprobar la identidad al activar y el permiso de quien edita
en la transacción. Conflictos o respuestas inciertas exigen consultar antes de
editar otra vez. Un cambio propio termina la sesión; una revocación incompleta se
advierte sin presentar la modificación como fallida. La lista sigue limitada a
100 miembros; falta paginación para superar ese volumen. La auditoría es privada,
no forma parte de los respaldos culinarios y aún no tiene visor de administración.
El procedimiento técnico de recuperación del administrador está implementado y
probado localmente: sustituye la cuenta perdida con vista previa, confirmación y
bitácora, fuera de las rutas públicas. No está habilitado ni aceptado en cloud;
ver `admin-recovery.md`. Google recupera identidad, no reasigna estos permisos.

Pruebas: configuración cerrada, transporte sin reintentos, token SDK, cambio de
cuenta, respuestas tardías, popup bloqueado, UID escapado, revocación, cierre en
ambos módulos y variantes clara/oscura. La suite aislada comprueba además
Google emulado → token SDK → API → membresía y deniega password/externos/escritura
de consulta. **No equivale a certificar OAuth, IAM o seguridad integral en cloud.**

## Fuentes y activos

[Firebase: Google para web](https://firebase.google.com/docs/auth/web/google-signin),
[persistencia de sesión](https://firebase.google.com/docs/auth/web/auth-state-persistence),
[identidades ficticias en emulador](https://firebase.google.com/docs/emulator-suite/connect_auth),
[recuperación de Google](https://support.google.com/accounts/answer/7682439?hl=es).
Logo de FORX: SVG aprobado del usuario, sin cambios. `public/google-g.svg` proviene
del configurador HTML oficial de [Google Identity](https://developers.google.com/identity/branding-guidelines),
consultado el 5 de octubre; icono sin alteración geométrica ni recolor. No se
generaron imágenes ni se sustituyeron las identidades de los módulos.
