# Arquitectura integrada · fase 2

Actualización del 29 de octubre: el parser fija el RFC de CICSA y los comandos
de importación rechazan comprobantes ajenos antes de guardar originales,
conceptos o índices. El API limita el plazo total de procesamiento sin liberar
concurrencia mientras siga trabajo pendiente. La inicialización desde un respaldo
v3 aprobado es un trabajo exclusivo del operador sobre destino vacío, con
comprobación de integridad y activación final; no es una ruta pública de restauración.
Detalles de publicación y reemplazo: `production-transition.md`.

`src/app.js` abre dos pantallas sobre los mismos servicios/datos:
`mountMiDespensa` y `mountForx`. No hay iframe, publicación de precios,
doble catálogo ni importación de estado legado.

## Interfaz y dominio

MiDespensa conserva su UI y `PantryStoreAdapter`, agrupando visualmente por
producto sin agrupar la evidencia. FORX utiliza estructura/estilos originales
en Shadow DOM para evitar que los dos sistemas visuales se sobrescriban.
Ambos módulos usan la misma fuente de ingredientes y observaciones.

`PantryService` reutiliza parser/ingestión/normalización; es dueño de revisión,
vínculos, merma y observaciones. `KitchenService` guarda recetas y menús por ID.
`recipes.js` valida manuales y lotes; `costing.js` y `menus.js` separan
existencia de receta, selección del menú y verificabilidad del costo.

`menus.js` mantiene ventanas de selección por tipo y deriva advertencias tanto
al generar como al consultar/sustituir. El servidor recalcula etiquetas y
candados, valida días consecutivos y rechaza nuevas selecciones omitidas,
archivadas, borradores o restringidas a otro día; no acepta avisos del cliente
como prueba de cumplimiento. La ventana heredada cuenta selecciones, no días.

`import-policy.js` define el corte mensual confirmado el 3 de octubre: bloquea
XML nuevos anteriores al último mes aceptado; no elimina evidencia ya cargada.
La política se aplica en `PantryService`, compartido por IndexedDB y servidor.

Las cantidades se conservan respecto a porciones base. Una coincidencia de
nombre no crea un vínculo. Recetas y menús consultan precios actuales: una nueva
validación cambia el costo sin reescribir la receta ni su versión histórica.
No se prometen cierres históricos de costo: las exportaciones dicen costeo actual.

`price-evidence.js` proyecta la compra exacta de la observación vigente para
Precios. `KitchenService.priceEvidence` exige editor/admin y el identificador
de observación esperado; rechaza una consulta obsoleta, no la sustituye por otra.
La normalización se consulta desde `priceBasis` inmutable y la compra derivada,
sin leer bytes XML ni rutas Storage. La respuesta enumera campos permitidos.
Las cuentas viewer conservan el catálogo reducido sin fuentes ni evidencia fiscal.
El enlace a MiDespensa lleva producto y observación: selecciona una referencia
de solo lectura y no cambia la compra activa de la cola agrupada por SKU.

## Persistencia

IndexedDB por entidad, transacciones y revisiones; no documento global.
Su versión 2 añadió recetas/menús; la versión 3 añade solicitudes/cuotas del
generador. Ambas actualizaciones son aditivas y conservan los registros existentes.
FirestoreEntityRepository usa compare-and-set dentro de transacciones reales.
Las versiones de recetas, observaciones y auditoría son inmutables.

Dos cambios sobre la misma revisión no se mezclan silenciosamente: uno se
rechaza y pide recargar. El agrupador de comandos `atomicWork` evita dejar
categorías, ingredientes o vínculos parcialmente creados.

Las reglas explícitas viven como documentos `settings/rule_*`. El motor reutiliza
la normalización del catálogo y proyecta sugerencias al consultar la cola, sin
escribir productos, vínculos ni observaciones. Las categorías contradictorias
producen conflicto, independientemente de la prioridad. Guardar una regla exige
rol de edición, revisión esperada y categoría todavía vigente.

El respaldo obtiene una lectura coherente de todas las entidades: una transacción
readonly en IndexedDB o Firestore. Omite bytes/rutas XML, valida estructura y
referencias y calcula una suma de integridad. Recuperar no es un comando remoto:
crea exclusivamente una base IndexedDB nueva, comprueba que esté vacía y la
inicializa atómicamente conservando IDs y revisiones. La URL identifica esa copia;
no cambia ni sincroniza el origen. El respaldo v2 incorpora las nuevas entidades;
al inspeccionar un respaldo v1 se verifica primero su checksum original y se
normalizan únicamente las colecciones ausentes de la nueva copia a listas vacías.
No se reescribe el archivo de respaldo ni la instancia original.

## Generador de propuestas y reserva monetaria aislada

`RecipeGenerationService` comparte repositorio y actor con `KitchenService`.
Valida solicitudes, reserva cuotas de forma atómica y ejecuta el proveedor fuera
de transacciones reintentables. Un ID estable por actor/solicitud evita invocar
dos veces. Estados pendientes o inciertos no liberan reservas silenciosamente.
Solo el dueño con rol editor/admin consulta su solicitud; los registros privados
no forman parte del snapshot de catálogo y las reglas bloquean su acceso directo.

Con transporte OpenAI y política explícita inyectados, el servicio reserva un
importe calculado con la tarifa más alta de entrada y el máximo de salida;
contabiliza el uso informado en la respuesta con la versión de tarifa guardada.
Las reservas pendientes/inciertas permanecen retenidas. La conciliación
administrativa puede resolverse sin clave del proveedor, con evidencia y bitácora.
Los runtimes de producción y emulador aún no suministran esos componentes.

`validateProposal` usa esquema cerrado y el validador común de recetas. La respuesta
no contiene precios, vínculos aprobados ni equivalencias. `saveRecipe` exige revisión
explícita, fuerza borrador inicial y consume la propuesta en la misma transacción
que crea receta/versión/bitácora; la procedencia se deriva en servidor, no del cliente.

Solo se puede ejecutar `simulated`: seis fixtures fijos, claramente rotulados,
sin red. `openai-recipe-contract.js` construye/lee el contrato Responses, pero no
incluye transporte, claves ni activación real. El servidor está desactivado por
defecto. La prueba DEV `recipeGenerator=simulated` usa otra base IndexedDB,
`forx-v2-simulation`; no cambia el proveedor del servidor ni copia datos del usuario.
Modelo, presupuesto y conciliación monetaria aún requieren implementación/aprobación.

## Servidor demo implementado

`remote-services.js` solo se activa con `?backend=emulator`, en desarrollo y
127.0.0.1. Si falla, no cae silenciosamente a IndexedDB.
`local-http.js` acepta origen local fijo, verifica tokens con Auth emulado y
pasa identidad verificada a la lista cerrada `pantry-commands.js`. Un payload
no puede decidir su actor ni su rol ni imponer un costo calculado en navegador.
Viewer consulta; editor trabaja catálogo/recetas/menús; administrador configura.

El arranque exige el proyecto demo y los tres hosts de emuladores en loopback.
Se genera una credencial sintética efímera en memoria para no descubrir
credenciales del equipo. No se inicializa SDK cloud en el navegador.
La sesión automática es solo una facilidad de ensayo local, no autenticación
apta para una publicación.

`PrivateOriginals` carga XML privados dirigidos por hash, sin sobrescribir,
y conserva vencimiento. Firestore solo registra metadatos.
Una transacción fallida puede dejar un objeto huérfano con fecha de expiración:
su recolección y limpieza tienen ahora un worker privado separado, probado en
emuladores; la programación/activación real sigue pendiente.
No se devuelve una URL pública ni se habilitan escrituras directas de cliente.

## Seguridad y límites

Reglas probadas contra emuladores; ninguna escritura de cliente fabrica precios,
recetas o auditoría. Comandos con rol autorizado y revisiones en servidor.
Sin despliegue, producción, migraciones ni acceso a sistemas ajenos.

El servidor demo acepta hasta 64 MB JSON por solicitud y 500 XML por lote,
10 MB por XML. Rechaza un XML que exceda 450 operaciones atómicas; no lo divide
silenciosamente. Mientras el lote está en servidor no se ofrece una cancelación
que no puede cumplir. Los archivos ya confirmados permanecen si la carga falla.

## Backend real separado, aún inactivo

`cloud-runtime.js` valida configuración y aprobación antes de inicializar SDK;
exige identidad administrada y bases/buckets propios. No hereda endpoints ni
credenciales de la demo. `production-http.js` verifica Auth y membresía vigente
mediante `AccessService`; las reglas de producción cierran el acceso directo.

La identidad inicial solo se registra con `initializeEmptyInstance`, en una base
vacía y con UID verificado explícito. El arranque normal no inicializa catálogo ni
fabrica administradores. Un marcador controla propiedad y estado; las transacciones
del repositorio impiden escrituras durante mantenimiento.

Retención y respaldo/restauración son trabajos separados del API, con límites y
confirmaciones propios. Las colecciones privadas `_forx_access`, `_forx_system`,
`_forx_security_audit`, `_forx_limits` y `_forx_jobs` no se incorporan a IndexedDB
ni al respaldo culinario. Recuperar no restaura cuentas ni permisos y mantiene
el destino aislado. Detalle en `production-backend.md`. La UI sigue usando los
transportes locales existentes; no se activó acceso cloud.
