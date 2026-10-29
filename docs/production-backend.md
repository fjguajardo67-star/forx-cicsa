# Backend de producción — 5 de octubre de 2026

Francisco pidió desarrollar el bloque 2 antes de la revisión integral del bloque 1.
Este corte implementa la base del backend y la comprueba localmente; **no declara
la aplicación lista para publicar**. Se añadió después el acceso Google a la
interfaz existente, todavía deshabilitado para uso real. Sin cambios de recursos
cloud, facturación, datos actuales, despliegues ni acceso a sistemas ajenos.

## Implementado

| Pieza | Comportamiento |
| --- | --- |
| Arranque separado | Configuración explícita, destino aprobado, identidad administrada y marcador de propiedad. No crea datos ni cuentas al iniciar el API. La demo conserva sus protecciones. |
| Acceso | Verifica ID token y revocación con Auth; exige correo verificado y proveedor configurado. Consulta el permiso vigente en servidor, no confía en claims antiguos. |
| Roles | Consulta/editor/admin, activación/desactivación, revisión optimista, bitácora privada y protección del último administrador. |
| API | Orígenes HTTPS exactos, límites de tamaño/cuota/concurrencia y errores sin datos internos. No tiene `/session` de demo. |
| Retención | Vista previa, confirmación del plan, comparación de generación/metageneración, huérfanos, bitácora y reintento tras interrupción. No borra derivados. |
| Respaldo | Snapshot coherente, bucket privado separado, checksum y lectura posterior del objeto guardado. Excluye XML y permisos. |
| Recuperación | Solo base vacía, distinta del origen y aislada del API. Preserva IDs/revisiones y reanuda sin reemplazar registros diferentes. |
| Recuperación administrativa | Trabajo externo desactivado: aprobación temporal, identidad Google comprobada, plan con vencimiento, reemplazo atómico, recibo y revocación reanudable. Sin ruta pública. |
| Tareas privadas | Entradas programables de respaldo, retención de XML y texto intermedio de IA desactivadas por defecto. Requieren aprobación registrada y emiten eventos de éxito/fallo. No crean scheduler ni alertas automáticamente. |
| Conciliación IA | Trabajo técnico privado para listar reservas inciertas, revisar un plan de evidencia y aplicarlo sin clave OpenAI ni nueva generación. Desactivado por defecto; requiere ventana de aprobación y destino exacto. |

## Configuración y aislamiento

`config/deployment.example.json` contiene destinos ficticios. No es un proyecto
creado. Google quedó elegido como proveedor de acceso; sus límites son de
ensayo, no un presupuesto aceptado.

La generación de recetas con OpenAI queda incluida como requisito de la primera
publicación. El backend ya puede conectar su transporte y política monetaria
aprobados, pero el ejemplo mantiene `recipeGeneration.enabled=false`. El modo
real exige además `FORX_ENABLE_RECIPE_AI=true` y una clave
`FORX_OPENAI_API_KEY` provista como secreto de servidor. El piloto de modelo,
tarifas y topes quedó aprobado y registrado en
`config/recipe-ai-pilot.policy.json`, sin incorporarlo al ejemplo inactivo.
No se configuró clave ni cuenta/proyecto OpenAI; el arranque y `--check` fallan ante una política
habilitada incompleta. El navegador nunca recibe la clave.
Los trabajos de mantenimiento, recuperación y conciliación no crean transporte
OpenAI aunque la configuración del API lo habilite: no necesitan su clave.

- Proyecto exclusivo `forx-v2-*`; bases `forx-staging-*`, `forx-production-*` o
  `forx-recovery-*`. No se admite `(default)` ni una base legada.
- Buckets separados de originales y respaldos, etiquetados para aplicación y
  entorno, acceso uniforme y prevención de acceso público.
- Originales sin versiones, retención adicional, holds por defecto o soft delete
  activo. Una copia recuperable después del borrado prolongaría la retención.
- `FORX_CONFIG_PATH` identifica el archivo, sin claves. Conectar exige
  `FORX_ENABLE_CLOUD=true` y `FORX_APPROVED_TARGET=proyecto/base`, además de una
  identidad administrada de servicio/trabajo. Se rechaza
  `GOOGLE_APPLICATION_CREDENTIALS` y el descubrimiento de credenciales del equipo.
- Arranque preparado para Node en servicio/trabajo administrado de Google.
  Alojamiento, región, IAM y presupuesto se revisan antes de crear recursos.

Comprobar configuración **sin red ni activación**:

```sh
FORX_CONFIG_PATH=config/deployment.example.json npm run start:production -- --check
```

Sin `--check`, el comando está bloqueado hasta cumplir los requisitos anteriores.
No se ejecutó ese arranque ni se creó un contenedor/despliegue en este corte.

`npm run release:preflight -- --example` valida y enumera hashes del artefacto
local sin conectarse; `--candidate` añade cerrojos de configuración y Git
limpio. Ninguno certifica IAM, DNS, límite externo, datos o aceptación humana.
Ver `docs/release-operations.md` antes de considerarlo para publicación.

## Identidad y permisos

Crear una cuenta en Auth no da acceso a FORX: necesita membresía activa en
`_forx_access`. El primer administrador se registra explícitamente sobre una base
vacía, con UID concreto y correo verificado. La inicialización es reanudable para
ese mismo UID y mantiene el API cerrado hasta terminar. No se copian usuarios.

Rutas autenticadas: `/identity`, `/commands`, `/access/list`, `/access/lookup`, `/access/update`.
Las tres de acceso exigen administración vigente. La lista admite hasta 100 cuentas;
antes de superar ese volumen hay que incorporar paginación. Una revocación fallida
devuelve `sessionRevocationPending`, sin mantener el permiso dado de baja.
La protección del último administrador no sustituye un procedimiento de recuperación
de cuentas. Ese procedimiento técnico externo ya se implementó y probó: ver
`admin-recovery.md`; su identidad/IAM y aceptación reales siguen pendientes.
Google quedó elegido y la pantalla de acceso/cierre y transporte
autenticado y el panel de usuarios están implementados. El acceso
real no está habilitado. La prueba habitual continúa local. Ver `google-access.md`.

`firestore.production.rules` y `storage.production.rules` niegan acceso directo:
la autoridad es el API. Son archivos nuevos, **no desplegados**. No confundirlos
con las reglas demo. El SDK Admin requiere IAM propio; las reglas de cliente no
limitan ese SDK. Separar identidades de API, retención y respaldo/recuperación.

## Retención

Dos meses naturales UTC desde la carga original, no 60 días. Un duplicado no
renueva el plazo. Se rechaza reutilizar un objeto con fechas diferentes o retener
un original ya vencido.

La vista previa comprueba nombre/hash/metadatos y omite contradicciones. Aplicar
exige su digest y vuelve a comprobar vencimiento y versión del objeto. No elimina
una generación o metageneración distinta. Registra trabajo antes del borrado;
si Firestore falla después, un próximo recorrido retoma esa evidencia y termina
la bitácora sin duplicarla. Huérfanos solo se retiran con vencimiento comprobado.

Límites: 5000 objetos por recorrido y 200 trabajos pendientes. Superarlos detiene
el proceso sin iniciar borrados; falta paginación operativa para volúmenes mayores.
Objetos faltantes sin trabajo previo requieren reconciliación: no se afirma haber
borrado un archivo del que no hubo evidencia. Guardar planes en ubicación privada.

Comandos disponibles **después de autorizar/configurar el destino real**:

```text
npm run job:production -- initialize --admin UID --confirm PROYECTO/BASE
npm run job:production -- retention-preview
npm run job:production -- retention-apply --plan RUTA_PRIVADA --confirm DIGEST
npm run job:production -- generation-text-preview
npm run job:production -- generation-text-apply --plan RUTA_PRIVADA --confirm DIGEST
npm run job:production -- backup
npm run job:production -- restore --backup RUTA_PRIVADA --confirm CHECKSUM
npm run job:production -- scheduled-retention
npm run job:production -- scheduled-generation-text
npm run job:production -- scheduled-backup
```

Los trabajos programados requieren los indicadores `maintenance.retentionEnabled`,
`backupsEnabled` o `generationTextRetentionEnabled` y aprobación con
responsable/fecha en configuración. **No están
habilitados ni existe una tarea periódica registrada.** Frecuencia, identidad,
presupuesto y canal de alerta se acuerdan antes de activarlos.

## Respaldo y recuperación

Manifiesto del proyecto/base de origen y respaldo derivado v3. No contiene Auth,
`_forx_access`, auditoría de seguridad ni control operativo: restaurar no concede
permisos anteriores. Los nuevos respaldos tampoco incluyen texto intermedio de
generación de recetas, pero sí conservan recetas guardadas y el ledger de IA.
La conservación/exportación separada de auditoría de seguridad
se debe fijar en el plan operativo; el respaldo culinario no la cubre.

Restaurar exige entorno `recovery` vacío. Los lotes solo crean registros; reintentar
admite únicamente contenidos idénticos. El marcador permanece `restoring` hasta
verificar todas las entidades y termina `recovered`, **no `ready`**. No copia XML
ni reintroduce vencidos. Un destino recuperado no inicia API ni tareas periódicas.
Promoverlo a producción requiere otro procedimiento aprobado, no cambiar a mano
el marcador para eludir esta separación.

Límites actuales: 64 MB y 100000 registros. El snapshot sigue siendo lectura
completa: necesita prueba de volumen. Falta acordar frecuencia/retención de copias,
pérdida tolerable y tiempo esperado de recuperación. No hay purga automática.

## Límites y observabilidad

Cuotas por minuto compartidas en Firestore, más límites previos a autenticación
y concurrencia **por proceso**, no global entre réplicas. Al desplegar se debe
definir máximo de instancias y protección de entrada. Contadores sin tokens, IP,
XML o recetas; `firestore.production.indexes.json` prepara índice de trabajos y
TTL de contadores, todavía no desplegados.

Eventos con identificador, ruta conocida, estado y duración; nunca cuerpo ni error
crudo. `server.error`, `server.limit` y `job.failed` permiten conectar alertas;
**no existe un canal de notificación configurado**. La futura UI debe conservar
el identificador y no reintentar escrituras automáticamente ante un error incierto.

## Evidencia del corte

Actualización posterior de dependencias: auditoría completa y de ejecución sin
avisos conocidos, Node 24 LTS y lockfile corregido. Build y 244 pruebas generales,
backend (10), reglas/HTTP (16), recuperación (1) y 11 recorridos de navegador
aprobados. Ver `dependency-security.md` para los overrides y sus límites.
La evidencia siguiente conserva el historial previo; no autoriza cloud.

### Correcciones de auditoría — 5 de octubre

H01–H05 tienen regresiones en `tests/audit-regressions.test.js`,
`tests/viewer-ui.test.js`, `tests/e2e/viewer.spec.js` y el ensayo de backend.
Los valores se acotan antes de expandir decimales: 64 caracteres, 32 decimales
y máximos por campo. La escala admite las fracciones recuperadas sin redondearlas.

Se elimina el tope local de 450 operaciones, no una garantía de atomicidad.
Firestore retiró el límite de escrituras por transacción en marzo de 2023;
siguen sus límites de documento, petición, índices y tiempo.
Referencia: https://docs.cloud.google.com/firestore/docs/release-notes#March_29_2023.
El adaptador conserva UNA transacción por XML. Antes de Storage comprueba rutas
y presupuesto conservador: JSON UTF-8 por tres más margen, máximo estimado
768 KiB por documento y 8 MiB acumulados. No es el tamaño protobuf exacto ni
promete importar cualquier factura de 10 MB. Rechazos deterministas quedan por
archivo; errores de red, permisos, cuotas o confirmación incierta interrumpen.

Los reintentos adoptan originales intactos, vigentes y de idénticos bytes,
hash y metadata. Conservan uploadedAt/expiresAt de la primera carga, descargan
una generación concreta y comprueban generation/metageneration después.
La creación mantiene ifGenerationMatch=0; el emulador no acredita esa precondición
concurrente de Storage cloud. Se prueba con dobles que la respetan y con SDK
real emulado para la recuperación secuencial. Su aceptación cloud sigue pendiente.

Guardar un menú solo bloquea optimistamente sus recetas referidas, no todo el
catálogo. Se probó con 1,200 recetas y con edición concurrente de la seleccionada.
Consulta usa kitchenSnapshot filtrado; nunca monta el snapshot privado de MiDespensa.

Los resultados siguientes son el corte histórico anterior; el corte corregido
se registra en `operations.md`. Ninguno acredita por sí solo producción.

- `npm run check`: **228 aprobadas, 23 omitidas** (casos de emuladores), build correcto.
- `npm run test:rules`: **16 aprobadas**; `test:recovery`: **1 aprobada**,
  repetidas para este corte. Las suites aisladas cubren las 23 omitidas del
  comando general; algunos casos no dependientes de emuladores se repiten.
- `npm run test:backend`: **9 aprobadas** con Auth, Firestore y objetos Storage
  emulados: permisos, revocación, cuotas, mantenimiento, respaldo/recuperación con
  costo idéntico, retención, reglas directas cerradas, acceso Google ficticio con SDK/API
  y gestión de membresías por HTTP. Incluye sustitución administrativa de cuenta
  Google ficticia, revocación, conservación del conjunto culinario y ausencia de
  ruta pública para recuperar permisos.
- Navegador: **6 casos aprobados en el corte anterior** de acceso/usuarios;
  no se repitió navegador para estas herramientas sin cambios de interfaz. Incluía
  incluidos roles sin administración, alta/cambio/desactivación/reactivación,
  cierre móvil y matriz visual. Dos regresiones (XML → receta → menú y revisión)
  aprobaron antes del ajuste final de ubicación de cuenta/cierre en pantallas estrechas;
  no se repitió toda la batería. La captura visual se repitió después de corregir
  un artefacto del compositor, sin otro cambio de interfaz.
- Respaldo del conjunto de trabajo capturado el 5 de octubre y restaurado en
  IndexedDB simulado aislado: 2183 registros, 329 recetas, 221 compras y 2 menús,
  con registros/revisiones y costos iguales. No restaura XML, permisos ni cloud.
- `--check` aprobó el ejemplo sin red. Pruebas de fallos inyectados cubren objeto
  reemplazado, interrupción después del borrado y restauración divergente.

Solo proyecto ficticio `demo-forx-v2`, puertos 8188/9098/9298 y temporales propios.
La respuesta de IAM/política de bucket se sustituye en el ensayo: el emulador no
acredita políticas cloud. La CI incorpora recuperación/backend en secuencia;
no se ejecutaron GitHub Actions ni un push. La extensión de acceso tiene revisión
visual propia; no rediseña las interfaces de los módulos.

Estas pruebas **no sustituyen la auditoría integral pospuesta**, ni acreditan
IAM, TLS, programación, alertas o rendimiento reales.

## Para cerrar el bloque 2

1. Aceptar en el entorno real el procedimiento de recuperación administrativa:
   designar responsables e identidad/IAM del trabajo exclusivo. Implementación,
   pruebas aisladas, Google, login/cierre y panel de usuarios ya están preparados.
2. Aprobar proyecto, servicios, región, IAM, límites y presupuesto.
3. Configurar/aceptar entorno de ensayo real: reglas, índices, buckets, trabajos y alertas.
4. Acordar conservación de copias/auditoría y objetivos de recuperación.
5. Probar desde navegador con usuarios autorizados; trasladar datos actuales solo
   después de seleccionar y aprobar expresamente el conjunto.

Después corresponden la revisión integral del bloque 1 y el cierre funcional
restante, incluida IA real, antes de publicar en la URL de FORX.

## Referencias

[Firebase: verificar ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
y [revocar sesiones](https://firebase.google.com/docs/auth/admin/manage-sessions).
El borrado usa la versión exacta: [Cloud Storage, precondiciones](https://docs.cloud.google.com/storage/docs/request-preconditions).
La retención recuperable se revisa por separado: [Cloud Storage, soft delete](https://docs.cloud.google.com/storage/docs/soft-delete).
