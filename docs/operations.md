# Operación y límites · fase 2

## Corte vigente — dependencias, 5 de octubre de 2026

Se resolvieron las 21 entradas iniciales de npm (incluidas propagaciones) sin
silenciar avisos. Auditoría completa y `--omit=dev`: cero vulnerabilidades
conocidas en este corte. Firebase CLI 15.32.1, Vitest 4.1.11 y cinco overrides
acotados; razones, restricciones y fuentes en `dependency-security.md`.
La interfaz y las reglas de negocio no cambiaron: no requiere cambios del manual
de operación del usuario. Se actualiza el checklist técnico, no se declara
lista para publicar toda la aplicación.

Node 24 LTS homologado en `.nvmrc`/CI; ejecución local con 24.19.0 sin reemplazar
Node 26 del sistema. Instalación sin scripts y `npm ci --dry-run` aprobados.
Auditoría obligatoria añadida a CI después de instalar; sin push ni ejecución
remota del workflow.

Pruebas: 244 generales aprobadas, build correcto; 24 casos omitidos del comando
general cubiertos por backend (10), reglas/HTTP (16), recuperación (1), con tres
casos comunes repetidos. Once recorridos de navegador aprobados con datos
sintéticos, incluidos XML, revisión, precios/evidencia, receta/menú, respaldo,
generador simulado y roles. Cuatro nuevas pruebas de compatibilidad transitiva.

Los emuladores de ensayo usaron sus puertos/temporales propios. Firebase descargó
Firestore 1.22.0 y retiró su archivo antiguo de caché (recuperable descargándolo);
NO borró datos de negocio, XML ni los temporales de la sesión compartida.
Firestore 8180 (PID 85508), HTTP 8788 (68846) y Auth/Storage (92395) siguieron
encendidos. No se reiniciaron servicios del usuario para este trabajo.
No hubo acceso a Egresos, migración, reimportación, despliegue, DNS ni facturación.

Próximo control antes de publicación: aceptación funcional/datos, OpenAI real
según presupuesto, infraestructura/identidad, respaldo/alertas y ensayo cloud.
Los apartados siguientes son evidencia histórica.

## Corte anterior — correcciones de auditoría, 5 de octubre de 2026

Código de H01–H05: commit `47fd995`, rama `codex/forx-v2-xml-catalog`.
Se corrigieron expansión decimal, originales huérfanos que impedían reintentar,
tope artificial de importación, transacciones de menú dependientes de todo el
catálogo y navegación de Consulta hacia un snapshot privado. Se escapó además
la identidad de renglones en el editor de recetas para evitar inyección HTML.

Pruebas ejecutadas:

- `npm run check`: 240 aprobadas, 24 omitidas por requerir emuladores; build correcto.
- Backend: 10 aprobadas; reglas/HTTP: 16; recuperación aislada: 1.
  Esas suites cubren las 24 omitidas; tres casos comunes se repiten.
- Navegador sintético: 11 aprobadas para XML, revisión, precios/evidencia,
  receta, menú, respaldo, generador simulado y roles. Consulta comprobada en
  escritorio oscuro y móvil claro; sin desbordamiento horizontal.
- Ensayo adicional de navegación local de solo lectura, tras actualizar HTTP:
  catálogo/recetario, MiDespensa y política histórica, sin comandos de escritura.
- El ensayo opt-in de evidencia sobre los datos de trabajo NO aprobó su
  precondición: no hay precio vigente compatible. Las dos observaciones se
  conservan, pero ambas compras ya estaban archivadas en el respaldo previo.
  No se inventó ni validó un precio para hacer pasar la prueba.
  El recorrido equivalente con datos sintéticos sí aprobó.

El respaldo previo al reinicio está fuera del repositorio servido:
`../forx-backup-2026-10-05-audit-fixes-verified/backup.json` y
`verification.json`, capturado a las 19:04:55 UTC. Contiene 2183 registros:
329 recetas, 331 versiones, 221 compras, 2 productos, 2 ingredientes, 2 menús.
La primera comprobación detectó fracciones heredadas de 16 decimales: se ajustó
el límite de seguridad a 32, sin redondearlas, y se repitió con éxito.
El primer directorio de intento quedó vacío; no se sobrescribió una copia previa.

Se actualizó SOLO HTTP 8788 (PID anterior 92586, nuevo 68846), contra los mismos
emuladores; Firestore 8180 PID 85508 y Auth/Storage PID 92395 permanecieron vivos.
OpenAI real sigue desactivado. La sesión administrativa sintética local se
renovó como parte del arranque; no se modificaron cuentas reales.
La comparación posterior por identidad y contenido confirmó TODOS los registros
idénticos, incluidas revisiones y bitácora. El formato de exportación nuevo agrega
dos colecciones de generación vacías; el inspector normaliza ese cambio de esquema
solo en memoria. No hubo migración ni escrituras en colecciones de negocio.
Huella del contenido normalizado:
`bfc97e95cc8c407810b3865217c1de474b65a7e307ee41430fd44c1388d7fb2c`.
La recuperación en IndexedDB simulado conserva registros y costos. La copia no
incluye bytes XML, cuentas ni auditoría privada de seguridad y no está fuera
de este equipo: NO es protección absoluta ni certifica restauración cloud.

Impeccable se utilizó para endurecer permisos/estados preservando el diseño
vigente. Inspección visual acotada: texto de Consulta, estados vacíos y contraste
de cierre de sesión en tema claro. El detector señaló desviaciones heredadas
de tipografía/radios respecto de DESIGN.md; no se rediseñaron ni se actualizaron
tokens ajenos al alcance. La referencia visual registrada no cubre el estado
actual completo; conciliarla queda para revisión de diseño, no bloquea estas
correcciones de seguridad.

No hubo push, despliegue, DNS, facturación, llamadas pagadas, borrado de XML,
reimportación ni contacto con Egresos. La verificación de productos/recetas puede
retomarse tras recargar, manteniendo los emuladores encendidos.
Sigue sin ser candidata de producción: quedan dependencias, OpenAI real con
presupuesto, aceptación culinaria/comercial y ensayo/configuración cloud.
Los apartados siguientes conservan evidencia HISTÓRICA, no reemplazan este corte.

La salida y el retiro posterior se rigen por
[production-checklist.md](production-checklist.md): conservar la URL de FORX,
aceptar primero la aplicación nueva y solo después retirar recursos exclusivos
del FORX anterior y staging legado de MiDespensa. Los apartados siguientes
describen el entorno local; no autorizan ninguna acción cloud o destructiva.

Solo desarrollo local: IndexedDB o emuladores Auth/Firestore/Storage del proyecto
ficticio `demo-forx-v2`. No se crearon recursos cloud ni se hicieron despliegues.
Las cuentas demo y el certificado en memoria no corresponden a usuarios reales.

## Retención

Dos meses naturales desde la primera carga UTC; fin de mes limitado al último
día del mes destino. Duplicar un XML no renueva el plazo.
IndexedDB retira bytes/ruta y registra auditoría al abrir la aplicación.
Mientras el navegador permanece cerrado no hay un proceso que lo haga ese día.

En Storage se guardan objeto privado y vencimiento. El worker separado del
5 de octubre resuelve vencidos, huérfanos, reintentos y bitácora con pruebas
sintéticas, pero no está activado. No presentar el código como cumplimiento
de eliminación programada cloud; falta configurar y verificar el entorno real.

## Ensayos y conservación

No usar datos únicos: navegador y emuladores son entornos de ensayo.
El servidor demo es efímero; una parada elimina su conjunto de prueba.
`test:rules` limpia exclusivamente su instancia desechable en 8188/9098/9298.
Los tests comprueban proyecto, puertos y carpeta temporal antes de escribir o
limpiar fixtures; rechazan la demo de trabajo. No omitir este control.
El archivo JSON de FORX exporta recetas, menús y configuración; no restaura
ni sustituye un respaldo de XML, catálogo e historia.

Administración de MiDespensa ya ofrece **Descargar respaldo completo** para los
datos derivados de ambos módulos: catálogo, categorías, reglas, compras,
observaciones, revisiones, recetas/versiones, menús, configuración e historia.
Es una lectura consistente: una transacción de lectura de IndexedDB o Firestore,
no una sucesión de exportaciones independientes. Incluye los registros ya
confirmados al corte; un lote en curso puede estar incompleto.

Los XML no se incluyen: solo su metadata y fecha original de vencimiento, sin
bytes ni rutas reutilizables. El JSON contiene datos de proveedores/compras,
no está cifrado y debe guardarse en una ubicación privada. Su SHA-256 detecta
alteraciones accidentales; no es firma de autoría ni garantía de procedencia.
No se guardan credenciales o tokens de sesión.

**Recuperar una copia local** verifica formato/versión, suma de integridad,
identidades, revisiones y referencias antes de crear una base. Muestra un
resumen; solo el botón de confirmación crea y abre una base IndexedDB nueva,
con ID aleatorio y enlace propio `?recovery=...`. La fuente no se reemplaza.
La copia conserva revisiones para continuar editando y recalcula costos; los
faltantes siguen siendo faltantes. Cada restauración crea una copia distinta.
El enlace funciona únicamente en ese navegador y origen. Conserva el archivo
descargado fuera del navegador; limpiar sus datos también elimina las copias.
No hay importación de respaldo al servidor desde esta UI ni fusión automática con
registros existentes. La herramienta operativa nueva admite únicamente recuperación
a una base de servidor vacía y aislada; ver `production-backend.md`.
La exportación completa en servidor exige admin; en modo navegador
es una operación local. Máximo 64 MB y 100000 registros por archivo.

El servidor compartido sigue siendo efímero: esta función permite recuperar
sus datos derivados en una copia local, no convierte los emuladores en un
servicio persistente ni recupera los XML originales cuando se apagan.

## Importación asistida de recetario legado

`scripts/import-legacy-recipes.js` es una herramienta local de mantenimiento,
no un botón de la vista previa. Solo con autorización explícita para importar:

```sh
node scripts/import-legacy-recipes.js preview /ruta/ForX-respaldo.json
node scripts/import-legacy-recipes.js apply /ruta/ForX-respaldo.json /ruta/privada/directorio-nuevo
```

Usa exclusivamente `127.0.0.1:8788`, exige la sesión admin del proyecto
`demo-forx-v2` y llama a los comandos autenticados existentes. No inicializa SDK,
no arranca o detiene emuladores y no tiene modo cloud. La vista previa no escribe.
Si las copias difieren, se detiene para decidir el origen; no elige por su fecha.

Antes de escribir crea `before.json` y `plan.json` en un directorio privado nuevo
fuera del repositorio servido. Después de cada alta añade un recibo a
`receipts.jsonl`. El fallo de una petición detiene el lote sin reintentar ni borrar
nada; para continuar hay que inspeccionar el catálogo y crear un nuevo ensayo.
Una repetición omite nombres ya existentes, nunca reemplaza recetas. Cada alta
pasa por `saveRecipe`, con autorización, índice de nombre, versión y bitácora.

Al finalizar guarda `after.json` y `result.json`: comprueba el contenido completo
contra el plan, todos los registros previos (excepto el avance de secuencias) y
un menú en memoria de 14 días. No guarda ese menú ni modifica ingredientes,
productos, precios, XML, reglas o configuración de negocio. Los respaldos son de
datos derivados, sin originales XML ni credenciales; contienen información
privada sin cifrar. Mantenerlos fuera de Git y del servidor web.

## Reglas de sugerencia

El MiDespensa original tenía la pantalla prevista, pero no un motor activo.
Se reutiliza su normalización de texto; el motor nuevo aplica coincidencias
literales, sin expresiones regulares ni similitud aproximada. Descripción permite
frase de palabras completas o igualdad; SKU exige igualdad y RFC de proveedor.
Sin RFC, una regla de descripción aplica a todos los proveedores. La prioridad
ordena evidencia; recomendaciones de categorías diferentes generan conflicto.

Las reglas se crean, editan, pausan y prueban en Categorías y reglas. Cada cambio
se registra en bitácora y exige revisión vigente, también en servidor. Son
documentos por regla dentro de `settings`; no se migra la base ni se reemplaza
una instantánea completa. Al consultar Revisión se recalculan sugerencias para
conceptos existentes y recién importados. Categoría sugerida se ofrece en el
formulario, pero solo Guardar producto confirma la decisión. Precio, ingrediente,
contenido y equivalencias no se inventan ni validan por regla.

Una clasificación humana ya guardada para proveedor/producto tiene precedencia
sobre reglas posteriores. La compra nueva del mismo SKU sigue pendiente de
validar su precio; cambios de descripción/unidad siguen marcando conflicto.
Pausar o editar reglas no reescribe decisiones, compras ni observaciones previas.

## Prueba servidor de recuperación sin tocar la demo

`firebase.verification.json` usa puertos separados: Firestore 8188, Auth 9098,
Storage 9298, hub 4408 y logging 4508. El lanzador `scripts/local-emulators.js`
crea un `TMPDIR` privado por ejecución, habilita `FORX_ISOLATED_TESTS=1` y
elimina endpoints heredados de otra suite. Los tests comprueban esos hosts y
el temporal antes de escribir. Con Java 21 disponible, ejecutar en secuencia:

```
npm run test:rules
npm run test:recovery
```

La prueba crea datos sintéticos únicamente en esos emuladores, verifica reglas,
respaldo sin modificación del origen y costo idéntico tras recuperación local.
No ejecuta limpieza sobre los puertos de la demo (8180/9099/9299).

## Aislamiento temporal y recuperación parcial del entorno

Firebase CLI 14.17.0 usa una carpeta fija bajo `os.tmpdir()` para los blobs de
Storage. Al parar una suite, elimina esa carpeta. Dos procesos con distintos
puertos pero el mismo temporal pueden interferir: la siguiente escritura del
proceso superviviente falla y puede terminar también su Auth. Separar solo
puertos, como hacía el primer ensayo de recuperación, era insuficiente.

Todos los comandos npm de emuladores pasan ahora por el lanzador: cada proceso
obtiene `TMPDIR`, `TMP` y `TEMP` nuevos, privados y distintos. También se aísla el
archivo de descubrimiento del hub. No se modifica Firebase CLI ni las reglas.
Una prueba usa la implementación real de persistencia de Firebase para verificar
que detener el Storage de una suite no elimina blobs ni impide nuevas escrituras
en el otro. No volver a usar comandos Firebase crudos con el temporal compartido.

Si Firestore sigue escuchando en 8180 pero Auth/Storage están caídos, **no parar
Firestore ni lanzar `dev:server`**. Con Java 21, `npm run dev:services` levanta
solo Auth/Storage (9099/9299), sin Firestore. Después hay que reiniciar únicamente
el proceso HTTP de `scripts/local-server.js`, con sus variables de emulador, para
recrear la cuenta sintética. Verificar antes y después la huella de todas las
entidades; mantener la bitácora del lote interrumpido. No se reenvía una carga
fallida automáticamente. El usuario vuelve a seleccionar los XML y el periodo.

Reiniciar Storage no recupera por sí mismo sus objetos previos. En la corrección
de este incidente solo había dos XML sintéticos: se recuperaron desde los fixtures
del ensayo únicamente tras comprobar sus hashes exactos, manteniendo los mismos
metadatos y vencimientos. No se fabricó contenido ni se reescribió Firestore.
Los 32 XML del intento del usuario no llegaron a procesarse. Para archivos reales
no disponibles, no presentar metadatos supervivientes como originales recuperados.

Este aislamiento no convierte los emuladores en almacenamiento durable. Los
respaldos derivados de Administración siguen siendo necesarios; el cierre de
Firestore continúa perdiendo el estado de prueba no respaldado.

La carga servidor admite 64 MB por solicitud, 10 MB por XML, hasta 500 archivos.
La carga empieza al seleccionar. No cerrar mientras se procesa; si se interrumpe,
consultar Importaciones antes de repetir. UUID/hash evita duplicar las compras.

## Verificación de este corte

Se ejecutaron pruebas reales de Auth, reglas Firestore/Storage, comandos HTTP,
originales privados y dos editores concurrentes, además de pruebas de dominio y
recorrido de navegador. Java 21 portátil quedó en `work/runtime`; no se instaló
en el sistema. Los originales de los repositorios no se modificaron.

## Dependencias

Consulta npm del 2 de octubre de 2026: `firebase-admin` 14.5.0 es dependencia
exclusiva del servidor; no integra el bundle del navegador.
La auditoría de ejecución reportó 2 avisos moderados transitivos (gaxios/uuid).
La auditoría completa reportó 19: 8 moderados, 10 altos y 1 crítico.
No se aplicó un arreglo forzado ni un cambio mayor indiscriminado.
Antes de cualquier liberación deben resolverse y repetirse las pruebas;
los servicios demo solo escuchan en 127.0.0.1.

## Decisiones antes de cloud o IA

Aprobar proyecto propio, usuarios/roles, volumen mensual, almacenamiento,
respaldo, modelo IA, límites de uso y presupuesto. OpenAI ya fue elegido como
proveedor y el flujo de revisión está aprobado/implementado con simulador en
`openai-recipe-generator.md`; falta la integración real y el control monetario.
El consentimiento general
a Blaze no autoriza activar facturación ni desplegar ahora.
No hace falta resolver esas decisiones para revisar esta integración local.

## Actualización local de la trazabilidad de Precios

El backend actualizado puede coexistir con otro proceso sobre los mismos
emuladores usando `FORX_LOCAL_PORT=8788` al ejecutar `scripts/local-server.js`,
con las variables de emuladores requeridas. La interfaz admite únicamente
127.0.0.1 en desarrollo y el parámetro `serverPort=8788`; no admite hosts remotos.
Cada puerto adicional usa su propia cuenta sintética para no invalidar la sesión
del proceso anterior. Ningún proceso borra o importa datos al arrancar.

Demo de esta revisión: `http://127.0.0.1:4174/?backend=emulator&serverPort=8788#/forx/precios`.
Mantener los emuladores actuales encendidos: detener el comando que los inició
eliminaría su conjunto efímero aunque otro backend siga abierto.

`FORX_E2E_READONLY_PORT=8788 npm run test:e2e -- tests/e2e/price-server.spec.js`
comprueba únicamente consultas sobre un precio ya existente. No carga fixtures
ni limpia colecciones. Las pruebas de `prices.spec.js` usan IndexedDB aislado
en su propio contexto de navegador, nunca la sesión de la demo compartida.

## Cierre de reglas del 4 de octubre de 2026

Cambios y evidencia funcional en `functional-rules.md`: rotación por familia,
validación de menús en servidor, precisión de cálculo sin redondeo intermedio,
canasta parcial no verificable y bloqueo de XML de meses anteriores al último
aceptado. No se modificaron las compras, recetas, precios ni menús del usuario.

**El HTTP compartido no se reinició en este corte.** Un proceso Node ya iniciado
no recarga estos cambios de dominio por actualizar el archivo. Antes de volver a
cargar XML, actualizar únicamente el proceso HTTP de forma controlada, comprobando
sus variables y que el snapshot anuncie `importPolicy.mode=block_older_months`.
El cliente rechaza nuevas cargas si el backend todavía no anuncia esa política.
No detener el lanzador padre de emuladores ni reiniciar Firestore/Storage/Auth.
Si el HTTP depende del lanzador, usar un nuevo puerto HTTP sin terminar el padre.
Esto es una actualización local pendiente, no un despliegue autorizado.

Pruebas de reglas/servidor: **14 aprobadas** en emuladores exclusivos de prueba.
Recuperación: **1 aprobada**, incluyendo consistencia de datos derivados y costo
tras restaurar a una copia local; nunca restauración sobre la demo compartida.
Los originales solo fueron sintéticos. Java portátil usado desde `work/runtime`.

Última regresión completa del corte: `npm run check` **153 aprobadas, 12 omitidas**
(dependientes de emuladores, cubiertas por las dos ejecuciones anteriores), y
compilación Vite correcta. `npm run test:e2e`: **8 aprobadas, 2 omitidas**. Estas
dos son opt-in de consulta al servidor/archivo real y se dejaron deshabilitadas;
no son fallos ocultos ni se contaron como aprobadas.

En navegador se detectó desbordamiento móvil del selector XML oculto; se corrigió
su tamaño y se añadió una aserción de ancho a 390 px. El caso de importación usa
`backend=indexeddb`, contexto nuevo, y bloquea toda petición no GET o a otro
origen: no puede enviar compras al servidor compartido. Un diagnóstico ad hoc
sin esa garantía fue rechazado por permisos y no se ejecutó. No hay una
excepción de seguridad pendiente ni se eludió ese rechazo.

OpenAI: solo diseño con documentación oficial; sin claves, llamadas, envío de
datos ni consumo. F05 permanece abierto.

## Generador aprobado — implementación simulada del 4 de octubre de 2026

Este registro actualiza el estado anterior de «solo diseño». Ya funciona el
recorrido de propuesta → revisión explícita en editor → borrador, con procedencia
simulada protegida. Los seis ejemplos fijos escalan por porciones, pero no
interpretan idea, proteína preferida ni restricciones. No son una prueba de
calidad culinaria ni de un modelo OpenAI.

Preview de datos sintéticos independientes:
`http://127.0.0.1:4174/?backend=indexeddb&recipeGenerator=simulated#/forx/generar`.
La base es `forx-v2-simulation`; nunca copia ni toca `forx-v2-local` ni los
emuladores del lote de agosto. El indicador de entorno identifica esta separación.

El HTTP demo acepta únicamente `FORX_RECIPE_PROVIDER=disabled` (predeterminado)
o `simulated`; cualquier otro valor se rechaza. La URL no activa proveedores en
servidor. No hay SDK, clave, transporte o consumo de OpenAI habilitado: solo un
constructor/parser del contrato Responses probado sin red. Antes de uso real
faltan modelo/presupuesto, cálculo/conciliación monetaria y evaluación culinaria.
**No se reinició el HTTP compartido ni los emuladores para esta entrega.**

Las cuotas del simulador son 10/usuario/día UTC, 100/entorno/mes UTC y 2 concurrentes.
La espera máxima es 10 segundos. Las invocaciones ocurren fuera de transacciones
reintentables; consultar estado usa el mismo ID y no invoca proveedor. Los estados
pendientes/inciertos conservan su reserva y no tienen reset administrativo en UI.
No borrar contadores para «desbloquear»: eso rompe la evidencia. La conciliación
operativa y retención de producción deben diseñarse antes del transporte real.
Nota histórica de este corte: los respaldos v2 incluían el texto de propuestas.
Desde el corte de retención aprobado el 6 de octubre, los nuevos respaldos v3
lo excluyen y el texto intermedio vence a los 30 días; las cuotas permanecen.
Se mantiene lectura de respaldos v1 y v2 para recuperación aislada.

Verificación de este corte:

- `npm run check`: **169 aprobadas, 14 omitidas** por depender de emuladores;
  compilación correcta. Incluye esquema, autorización, límites concurrentes,
  doble envío, timeout, revisión obligatoria, inyección HTML y migración aditiva
  IndexedDB v2→v3 con fixtures. No se ejecutó una migración de datos del usuario.
- `npm run test:rules`: **16 aprobadas** en emuladores/temporales aislados,
  incluyendo HTTP real, Auth, reglas privadas, cuotas y exportación completa.
- `npm run test:recovery`: **1 aprobada**, recuperación a destino aislado.
- Suite completa de navegador: **11 aprobadas, 2 omitidas** (opt-in sobre
  servidor/archivo real); tras la corrección final de contraste, los **3 casos
  del generador** se repitieron y aprobaron, con recaptura de la misma matriz.
- Capturas en 1440, 1952, 1024 y 390 px, además de tema claro. Veredicto visual
  independiente `ship` limitado al generador y su hallazgo de contraste resuelto;
  no acredita preparación para producción. No cambió la identidad visual.

El detector visual interpretó el HTML malicioso de una prueba XSS como un asset
roto. Se registró una excepción `broken-image=*` exclusivamente para
`tests/recipe-generator-ui.test.js`; la prueba verifica que no exista un elemento
img ejecutable. No se excluyó la UI ni se deshabilitó una regla global.

Un intento de recaptura no pudo acceder al puerto local bajo sandbox (`EPERM`);
se repitió con el permiso de ejecución local correspondiente y aprobó. No hubo
ampliación a servicios externos. Sin push, despliegue, facturación ni consumo.

## Backend primero — corte del 5 de octubre de 2026

Por instrucción de Francisco se desarrolla el backend antes de la auditoría
integral. Implementación y límites en `production-backend.md`: arranque real
inactivo, membresías/roles, API sin cuenta demo, retención con precondiciones,
respaldo y recuperación a servidor vacío, trabajos programables desactivados.
La interfaz, HTTP compartido y emuladores del usuario no se modificaron/reiniciaron.

Resultados: `npm run check` **181 aprobadas y 20 omitidas**, build correcto;
`test:rules` **16**, `test:recovery` **1**, `test:backend` **6** aprobadas, en secuencia
y con temporales privados. Las 20 omitidas del comando común se ejercitan en
esas suites separadas. `start:production -- --check` comprobó configuración
sin red. No se repitió la batería visual: no hay cambios de interfaz ni activos.

El ensayo del backend usa operaciones reales contra Auth/Firestore/Storage
emulados; la política/IAM del bucket es un fixture, no evidencia cloud. Las pruebas
de fallos inyectados cubren reanudación de retención y restauración divergente.
La CI queda preparada para ejecutar recuperación/backend; no se disparó un run remoto.
Faltan login/gestión en la UI, configuración aprobada y validación real de IAM,
TLS, retención, scheduler, alertas y volumen. La revisión integral permanece pendiente.

## Acceso Google — extensión del 5 de octubre de 2026

Francisco eligió Google para identidad y recuperación de cuenta. La aplicación
no respalda contraseñas: enlaza la recuperación de Google y mantiene permisos
propios. Implementados acceso/cierre en ambos módulos, estados sin autorización,
sesión por pestaña y transporte con ID token del SDK. Sin configuración aprobada,
el build publicado no abre demo ni base local por parámetros URL.

La prueba `?authPreview=1` existe únicamente en desarrollo localhost, con cuenta
ficticia y repositorio nuevo en memoria. No usa los XML, recetas, cuentas o bases
compartidos. Su salida descarta el ejemplo. El emulador compartido y HTTP 8788 no
se reiniciaron ni recibieron escrituras de ensayo.

Evidencia de implementación:

- `npm run check`: **196 aprobadas, 21 omitidas** por requerir emuladores;
  compilación correcta. Incluye configuración cerrada, token/transportes,
  cancelación, cambio de cuenta, respuestas tardías, revocación y cierre.
- `npm run test:backend`: **7 aprobadas** en emuladores aislados, incluida una
  identidad Google ficticia del SDK, autorización posterior explícita y rechazo
  de password o escritura por cuenta de consulta. No prueba OAuth real.
- Navegador: **4 aprobadas**, dos de acceso más las regresiones de MiDespensa y
  XML → receta → menú. No se repitió toda la batería de navegador.
- Reglas (16) y recuperación (1) conservan la evidencia del corte previo; no se
  contaron como ejecuciones nuevas. Tampoco se ejecutó la auditoría integral.

Capturas de acceso claro/oscuro a 1440, 1952 y 390 px, denegación móvil y pie de
cuenta de ambos módulos a 1440 px. El primer método de captura Chrome headless
dejó capas SVG obsoletas al cambiar viewport: se corrigió el arnés con páginas
nuevas y renderizado por software, sin cambios visuales motivados por ese artefacto.
Cada captura final se abrió para comprobar validez. No se acredita con ellas
el popup real de Google ni el cierre de los módulos en Safari/móvil.

Revisión visual independiente: **ship**, limitada a la extensión configurada
pero deshabilitada para Google real. El revisor retiró dos señalamientos iniciales
al reabrir las mismas capturas (logo visible) y confirmar la excepción de extensión
local sin nueva dirección visual; no hubo cambios de UI motivados por ellos.
Registro de continuidad: `access-design-continuity.md`; sistema existente preservado.

El detector se ejecutó una vez: sin hallazgos principales; avisos de documentación
para color heredado, colores oficiales del botón Google y tamaños de esta
extensión. Sin nuevas exclusiones. No hay raster nuevo de producto: se conserva
el SVG aprobado y se añade el icono oficial Google, con origen documentado.

Pendientes: gestión de usuarios, recuperación administrativa, configuración y
aceptación OAuth/infraestructura reales. No se habilitaron proveedor, cuentas,
recursos, facturación, OpenAI, DNS ni despliegues. Guía: `google-access.md`.

## Usuarios y roles — extensión del 5 de octubre de 2026

Implementado el panel dentro de Administración de MiDespensa sin reemplazar el
diseño de los módulos. Solo administración vigente consulta membresías o comprueba
UID/correo. Autorizar, cambiar rol, desactivar o reactivar requiere revisión y
confirmación explícitas; Consulta es el rol inicial. El servidor valida identidad
al activar, revisión esperada y protección transaccional del último administrador.
Desactivar no borra compras, recetas ni la identidad Google y sigue siendo posible
si esa identidad ya fue deshabilitada. Un cambio propio termina la sesión.

Una respuesta incierta o conflicto obliga a actualizar cuentas antes de otro
cambio; no se repiten escrituras automáticamente. Si falla la invalidación de
sesiones del proveedor, se informa que el permiso ya se guardó y no debe repetirse.
Las cuentas y la auditoría de permisos permanecen fuera del snapshot culinario.
El listado sigue limitado a 100 miembros, sin paginación ni visor de auditoría.

La prueba visual usa `authPreview=1`, una base nueva en memoria y cuentas
ficticias; `preview-new` permite probar un alta. El arnés de navegador solo permite
lecturas de Vite local. No escribió en los emuladores compartidos ni en los XML
de agosto o las recetas recuperadas. El backend se ensayó en puertos privados.

Evidencia de este corte:

- `npm run check`: **213 aprobadas, 22 omitidas** por requerir emuladores;
  build correcto. Incluye 5 pruebas de administración y 12 de su panel.
- `npm run test:backend`: **8 aprobadas** en Auth/Firestore/Storage aislados,
  incluida gestión real por HTTP con identidad ficticia y conflictos de revisión.
- Última ejecución conjunta de navegador de acceso/usuarios: **6 aprobadas**.
  Incluye alta, edición, desactivación, reactivación, roles no administradores,
  matriz visual y cierre en móvil. Las regresiones de revisión y XML → receta →
  menú también aprobaron en una ejecución anterior al ajuste responsive final;
  no se presenta esto como una nueva ejecución de toda la suite.
- Reglas (16) y recuperación (1) son evidencia del corte anterior, no ejecuciones
  nuevas. La auditoría integral de código/seguridad sigue pendiente.

El primer ensayo de navegador detectó selectores de prueba incorrectos y una
inicialización del fixture de Consulta/Edición con permisos insuficientes; se
corrigieron el arnés y la semilla explícita de desarrollo. La inspección visual
mostró solapamiento de cuenta/cierre en el sidebar estrecho: se trasladó ese bloque
al contenido de Administración a 1180 px o menos. La segunda captura detectó
capas ausentes del compositor headless en tema claro; se corrigió solo el arnés,
se repitió el caso visual y se abrieron las siete capturas finales válidas.

Matriz: escritorio 1440 px en ambos temas, 1952 px oscuro, tablet 1024 px,
móvil 390 px en ambos temas y confirmación móvil. El detector se ejecutó una vez,
sin hallazgos principales; dos avisos de tamaños locales de 12 px heredados de
controles/cuenta. Sin exclusiones nuevas ni cambios de tokens o activos.

La revisión visual independiente del panel concluyó **ship**, sin correcciones
materiales en este alcance y con adaptaciones responsive acordes al contrato.
No hubo comp nueva ni comparación con una referencia externa: se conservó el
sistema incumbente. `DESIGN.md` y su sidecar permanecen sin cambios; el registro
específico de la extensión es `users-design-continuity.md`. Este veredicto no
certifica seguridad integral, OAuth real ni preparación para publicar.

Guías de usuario, Google, checklist y backend actualizadas. Quedan pendientes
recuperación administrativa, aprobación/configuración y aceptación OAuth e
infraestructura reales. No se activaron cuentas, proveedor, cloud, facturación,
OpenAI, DNS, tareas periódicas ni despliegues.

## Respaldo verificable y recuperación administrativa — 5 de octubre de 2026

Francisco autorizó continuar el desarrollo mientras verifica productos/recetas y
aprobó recuperar administración mediante un procedimiento técnico fuera de la app.
No se añadió contraseña maestra ni ruta pública. Implementación y procedimiento
en `admin-recovery.md`; responsables, IAM, activación y ensayo cloud aún pendientes.

Herramientas nuevas: `scripts/local-backup.js` y `scripts/admin-recovery.js`.
La primera solo pide sesión local y `exportBackup` al HTTP 8788; la segunda queda
bloqueada antes de SDK/red hasta contar con aprobación temporal, destino y trabajo
exclusivos. `adminRecovery.enabled` permanece `false` en la configuración ejemplo.
La recuperación comprueba el sustituto Google y conserva el número de admins en
una transacción con recibo y auditoría. Repetir un plan aplicado no repite permisos;
revocaciones pendientes se reintentan por un comando distinto y confirmado.

Se capturó el conjunto compartido el **2026-10-05T18:15:46.091Z** sin detener
servicios ni importar/borrar datos. Ubicación privada, fuera del repositorio Vite:

`../forx-backup-2026-10-05-1215/backup.json`

Reporte contiguo: `verification.json`. Directorio 0700, archivos 0600, creación
exclusiva sin sobrescribir. Checksum:
`75b3dba82617443434182b5b0d6189bd4bf468ea3ca06e3091db6fd0fefe2e6b`.

La lectura posterior del archivo y la restauración en una fábrica IndexedDB nueva
en memoria conservaron **2183 registros**, incluyendo 329 recetas, 331 versiones,
221 compras, 34 registros de importación, 2 productos, 2 ingredientes y 2 menús.
Se compararon identidades, revisiones, contenido y costos de recetas/menús; solo se
añadieron a la copia el marcador local y su evento de restauración. Los originales
XML se excluyen, conservando metadata/vencimientos; tampoco incluye cuentas o
auditoría de seguridad. No es un ensayo cloud ni una copia fuera de este equipo.
Las verificaciones guardadas después del corte necesitan otro respaldo.

Pruebas finales:

- `npm run check`: **228 aprobadas, 23 omitidas** por requerir emuladores;
  build correcto. Nuevas: 11 de recuperación administrativa y 4 de respaldo local.
- `npm run test:backend`: **9 aprobadas**; identidades Google ficticias mediante
  SDK, permisos anteriores denegados y nuevos aceptados en API real emulada.
- `npm run test:rules`: **16 aprobadas**; `npm run test:recovery`: **1 aprobada**.
  Ejecutadas en secuencia y carpetas temporales privadas, puertos 8188/9098/9298.
  Entre estas suites se ejercitaron las 23 omitidas, con tres casos comunes repetidos.
- `start:production -- --check` aprobó el ejemplo sin red/activación. `git diff
  --check` sin problemas. No hubo nueva batería visual ni rediseño.

El primer ensayo backend falló porque un comando desconocido se rechazaba con
HTTP 500 en vez de 400: se corrigió la traducción de `invalid-argument` sin exponer
el error interno, y la suite repetida aprobó. Pruebas de interrupción posteriores
al commit, reenvío duplicado, planes distintos concurrentes, expiración, cambio de
identidad y fallo de revocación verifican que no se fabrique otro permiso ni se
modifiquen datos culinarios.

No se reiniciaron HTTP 8788, Vite 4174 ni los emuladores compartidos. Las lecturas
de respaldo no cambian la base de negocio; la sesión emulada es la habitual de
administración local. Sin push, despliegue, cloud, cuentas reales, facturación,
OpenAI ni contacto con servicios ajenos. Siguiente trabajo: auditoría integral
de código/seguridad; estas pruebas no la sustituyen.

## Conexión condicional de generación OpenAI — 6 de octubre de 2026

Francisco confirmó que la generación real con IA debe formar parte de la primera
publicación. Se conectaron el transporte y la política monetaria al runtime de
producción y al comando autenticado. `recipeGeneration.enabled=false` sigue en
el ejemplo. Habilitar exige política completa con referencia de aprobación,
activación explícita `FORX_ENABLE_RECIPE_AI=true` y clave privada del servidor;
la clave sola no habilita el proveedor. La interfaz distingue simulador, OpenAI
y desactivado, y explica qué contexto culinario se envía. Los resultados siguen
siendo borradores sin vínculo ni costo verificado.

Evidencia de este corte: `npm run check` aprobó 294 pruebas, omitió 26
condicionadas por emuladores y compiló. Una prueba HTTP aislada adicional
aprobó con respuesta del proveedor ficticia, reserva previa a la llamada,
conciliación y consulta de estado sin segundo consumo. Las tres pruebas de
navegador del generador simulado aprobaron; `start:production -- --check`
validó el ejemplo sin red ni activación. No se llamó a OpenAI, no se usó clave
real, no se modificaron datos de trabajo ni se desplegó.

Falta la aprobación de modelo y topes, el secreto y límite del proveedor, el
ensayo pagado acotado, la comparación con cargos reales y la revisión culinaria.
La auditoría integral y la aceptación de producción permanecen abiertas.

## Política monetaria del piloto aprobada — 6 de octubre de 2026

Francisco confirmó GPT-6.1 Sol y límites internos de US$0.15 por intento,
US$1 por usuario/día y US$5 por mes. Se registraron las cuatro tarifas estándar
vigentes y la referencia de aprobación en `config/recipe-ai-pilot.policy.json`.
Con 40,960 tokens de entrada y 4,000 de salida como máximos técnicos, la
reserva conservadora asciende a US$0.1424 por intento. La política se valida
sin red y no la carga el despliegue de ejemplo. No se creó un proyecto OpenAI,
no se configuró ningún secreto, límite externo o facturación y no hubo llamadas
pagadas. Falta verificar el precio antes de la activación y comparar después
los consumos con los cargos del proveedor.

Francisco confirmó además US$5 mensuales como límite **estricto** del proyecto
OpenAI exclusivo para FORX. Aún no existe ni se verificó ese proyecto o control
en la cuenta del proveedor; una alerta de gasto no lo sustituye. La
documentación oficial advierte que la aplicación del límite puede demorarse y
el gasto registrado superar ligeramente el importe configurado. La aprobación
no activa llamadas ni autoriza un despliegue.

## Preparación de prepublicación y conciliación — 6 de octubre de 2026

Se añadió un trabajo técnico privado de conciliación de reservas OpenAI: lista
pendientes sin texto culinario, crea plan temporal con digest y evidencia, y
aplica una sola decisión atómica e idempotente. Requiere ventana de aprobación,
Job e identidad administrada exclusivos y destino exacto; permanece apagado
en la configuración de ejemplo. Los trabajos de mantenimiento y recuperación
no inicializan el transporte OpenAI aunque el API lo tenga habilitado.

La comprobación `release:preflight` calcula hashes del artefacto y rechaza
candidatos con Git sucio, destinos ficticios, Google o mantenimiento inactivos,
o política IA diferente de la aprobada. Es lectura local: no comprueba cloud,
IAM, facturación, DNS ni aceptación. El procedimiento y las puertas manuales
están en `docs/release-operations.md`. La retención de registros/texto de IA
sigue sin plazo aprobado; no se implementó su borrado automático.

Verificación de este bloque: Node 24.19.0, 304 pruebas aprobadas y 26 omitidas
en la suite base por requerir emuladores; build correcto. `release:preflight
--example` emitió manifiesto local con `candidate:false`, sin red ni despliegue.
La suite `test:backend` no pudo iniciar aquí por falta de Java. La auditoría
con red detectó un aviso alto nuevo en `source-map-js` 1.2.1; tras actualizar
únicamente el lockfile a 1.2.2 y reinstalar en este worktree, la auditoría
completa devolvió cero avisos conocidos. Repetir suites aisladas y auditoría
en CI antes de cualquier candidato.
