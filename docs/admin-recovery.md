# Recuperación administrativa de FORX

Diseño aprobado por Francisco el 5 de octubre de 2026: procedimiento técnico
fuera de la aplicación, sin contraseña maestra ni ruta pública. Implementado y
probado localmente; **no habilitado en cloud ni ejecutado sobre cuentas reales**.
No es recuperación de contraseña Google ni restauración de datos culinarios.

## Autoridad y límites

Si hay otro administrador disponible, usar primero Usuarios y roles. Este
procedimiento sustituye una membresía administradora activa cuya cuenta se perdió
por una cuenta Google distinta, existente, disponible y con correo verificado.
No crea identidades, cambia contraseñas ni elimina compras/recetas. La cuenta
perdida queda desactivada en FORX, no borrada en Google. Puede faltar o estar
deshabilitada en Auth. Las demás membresías permanecen iguales.

La autoridad técnica será una identidad administrada y un trabajo **exclusivos**,
con acceso restringido por IAM a los responsables autorizados. Ni un rol de la
aplicación, ni el digest, ni el texto `approvedBy` conceden permisos cloud. Las
variables de entorno son barreras de ejecución, no sustitutos de IAM ni prueba de
aprobación humana. La configuración y ejecución del trabajo deben quedar bajo
control de un responsable distinto del acceso cotidiano a FORX.

El trabajo no está desplegado. Antes de activarlo se debe aprobar destino,
presupuesto, responsables, identidad/IAM, conservación de recibos y procedimiento
de verificación de la persona sustituta. Probar recuperación real en el nuevo
entorno de ensayo antes de darla por aceptada. No usar recursos ajenos ni claves
JSON descargadas al equipo.

## Controles implementados

- Desactivado por defecto: `adminRecovery.enabled: false`.
- Solo Google y destino staging/production explícito, con marcador de instancia
  lista y control de administradores consistente. No inicializa ni repara controles.
- Solo el trabajo aprobado (`CLOUD_RUN_JOB`), nunca el servidor web (`K_SERVICE`).
  Además de las barreras cloud existentes, exige `FORX_ADMIN_RECOVERY_TARGET` con
  el proyecto/base exactos. Se comprueba antes de inicializar SDK o conectar.
- Aprobación temporal con `jobName`, `approvedBy`, `approvedAt` y `expiresAt`:
  ventana máxima de una hora. Vista previa válida durante un máximo de 15 minutos,
  sin exceder esa aprobación. Renovarla exige volver a revisar el plan.
- La vista previa solo lee: UID/correo de ambas cuentas, rol anterior, motivo,
  destino, vencimiento y digest. Archivo privado nuevo; no se sobrescribe otro.
- Aplicar exige confirmar el digest completo y vuelve a comprobar identidad,
  aprobación, vencimiento y el estado de las membresías/control/instancia. Cambios
  concurrentes obligan a revisar de nuevo. El digest detecta alteraciones;
  **no es una firma ni una contraseña de recuperación**.
- Cambio atómico: desactiva al administrador perdido y activa al sustituto, conserva
  el número de administradores y aumenta revisiones. Recibo y bitácora se guardan
  en la misma transacción. No hay un estado intermedio sin administrador.
- Invalidación posterior de sesiones de ambas cuentas; nuevas peticiones ya
  comprueban la membresía modificada. Las operaciones previamente aceptadas pueden
  concluir. Fallos de Auth dejan constancia, sin deshacer ni repetir los permisos.
- Repetir el mismo plan devuelve su recibo sin otra modificación. La invalidación
  pendiente tiene un reintento separado y explícito. No generar otro plan para
  resolver una respuesta incierta: consultar primero su operación.
- Lista limitada a 100 miembros. Un contador incoherente, más miembros o una
  instancia no lista bloquean el procedimiento; no se corrigen automáticamente.

## Procedimiento del responsable — aún no ejecutar en cloud

1. Confirmar pérdida, alcance, persona sustituta y aprobación por un canal
   independiente. Verificar UID/correo exactos; no aceptar solo nombre visible o
   un mensaje recibido. Si existe sospecha de compromiso, revisar también las
   acciones previas y accesos cloud; reemplazar la membresía no resuelve todo el incidente.
2. La persona sustituta entra con Google y comparte su UID de acceso no autorizado.
   La aplicación todavía no le concede acceso. No solicitar su contraseña.
3. Preparar la configuración privada temporal del trabajo autorizado, manteniendo
   las barreras de `docs/production-backend.md`. No modificar configuración del
   servidor público para este fin ni poner secretos/planes en variables VITE.
4. Ejecutar vista previa; abrir el archivo privado y comprobar destino, cuenta
   que se desactiva, sustituto y motivo. Confirmar dentro de su ventana.
5. Consultar recibo, completar revocaciones pendientes y probar acceso nuevo;
   comprobar que la cuenta anterior ya no entra y que no cambiaron datos culinarios.
6. Desactivar de nuevo la autorización temporal y conservar la evidencia privada
   según la política aprobada. La herramienta no cambia por sí sola IAM ni la
   configuración del trabajo al finalizar.

Comandos preparados (destino real todavía deshabilitado):

```text
npm run admin:recovery -- preview --lost-uid UID_PERDIDO --replacement-uid UID_NUEVO --reason "Motivo sin secretos" --out /ruta/privada/plan-nuevo.json
npm run admin:recovery -- apply --plan /ruta/privada/plan-nuevo.json --confirm DIGEST_COMPLETO
npm run admin:recovery -- status --operation ID_OPERACION
npm run admin:recovery -- retry-revocations --operation ID_OPERACION --confirm DIGEST_COMPLETO
```

La consulta o el reintento después de vencer la ventana requieren una nueva
aprobación temporal para el mismo destino, no recrear el cambio de permisos.
`_forx_admin_recoveries` conserva el recibo; `_forx_security_audit` la decisión.
Ambos permanecen privados y **fuera del respaldo culinario**. No hay visor ni
purga automática; conservación/exportación deben acordarse antes de producción.

## Respaldo local y trabajo en paralelo

El enlace de trabajo con las recetas recuperadas sigue siendo
`http://127.0.0.1:4174/?backend=emulator&serverPort=8788#/forx/cat`.
Se puede continuar verificando allí. `authPreview=1` es solo una demostración
ficticia en memoria, no otra versión de la base real ni un destino de traslado.

Para un corte local consistente sin reiniciar servicios:

```text
npm run backup:local -- /ruta/privada/directorio-nuevo-fuera-del-repositorio
npm run verify:backup -- /ruta/privada/directorio-nuevo-fuera-del-repositorio/backup.json
```

La herramienta permite únicamente sesión del emulador `demo-forx-v2` en 8788 y
`exportBackup`. Guarda `backup.json` y `verification.json`, sin tokens, con permisos
privados y sin sobrescribir archivos. Relee el archivo, valida checksum y
referencias y restaura usando una fábrica IndexedDB aislada **en memoria**, no el
navegador del usuario. Compara registros/revisiones y costos de recetas/menús.
No restaura al servidor ni cambia el origen. La captura admite trabajo concurrente;
los cambios guardados después del corte pertenecen al siguiente respaldo.

La copia local conserva derivados e historial, no XML originales, Auth, permisos
ni auditoría de seguridad. No prolonga la retención de XML. Un archivo en este
equipo no sustituye una copia externa ni un ensayo de recuperación cloud. Mientras
se usan emuladores, no detenerlos y descargar una copia completa al terminar cada
sesión de verificación. No hay respaldo periódico local configurado.
