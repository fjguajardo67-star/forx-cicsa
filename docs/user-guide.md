# Primer flujo en FORX v2

## Acceso de Consulta

Una cuenta de Consulta abre **Precios**, el catálogo permitido de MiDespensa,
incluso al entrar por un enlace al módulo de revisión. Puede buscar ingredientes,
consultar precios, recetas y menús guardados, y exportar las vistas permitidas.
**Ver receta** abre su detalle sin editar ni guardar. No muestra acciones para
crear, generar, archivar o cambiar menús; tampoco recibe evidencia privada de
compras, XML ni listas de usuarios. Esas tareas requieren Edición o Administración.
El servidor mantiene la comprobación de permisos, además de los controles visibles.

## Tema claro y oscuro

En MiDespensa, el botón **Cambiar a tema claro / oscuro** está en la barra
superior junto a **Consultar catálogo**. En pantallas estrechas se muestra como
un círculo de dos mitades, con la misma etiqueta accesible. En FORX permanece
en el pie de la navegación.

Ambos módulos comparten la elección, que se conserva al recargar y al volver a
abrir la aplicación en el mismo navegador y dirección. Cambiar el tema no
guarda ni descarta una edición, ni modifica XML, ingredientes o precios. La
navegación conserva su fondo azul marino para mantener legible el logo.

## Revisar compras y verificar precios

Las cantidades se conservan sin redondear al capturarlas, incluidas las fracciones
del recetario recuperado. Se rechazan números fuera de rango, representaciones
de más de 64 caracteres o más de 32 decimales; el mensaje no sustituye el dato
por cero ni inventa una equivalencia.

Cada XML se guarda completo o no se guarda. Ya no existe el límite artificial de
149 conceptos: se comprobó una factura de 301 conceptos. Los archivos siguen
sujetos a tamaño; si un registro o comprobante excede el presupuesto seguro,
se marca **Fallido**, sin compras parciales, y continúa el siguiente archivo.
Un UUID mal formado va a cuarentena. Un fallo del servicio o conexión sí puede
interrumpir la carga: consulta **Importaciones** antes de repetir.

Si el original se guardó pero la transacción de compras falló, el reintento
comprueba sus bytes y metadata y reutiliza el original intacto. Sus dos meses
se cuentan desde la primera carga, no desde el reintento. No se recuperan
automáticamente objetos alterados o vencidos.

**Orden de los lotes:** carga del mes más antiguo al más reciente. Se bloquean
compras nuevas cuyo XML sea de un mes anterior al último aceptado. El mismo mes
admite archivos adicionales, aunque su día sea anterior. El corte proviene de
la fecha real del comprobante; “Periodo del lote” es una etiqueta y no lo altera.
Ejemplo: después de aceptar septiembre, un XML nuevo de agosto se muestra como
**Bloqueado por periodo**, con motivo, sin crear compras ni conservar otro XML.
Los archivos se procesan en orden; no mezcles meses desordenados en una carga.
Duplicados y conflictos de UUID mantienen su diagnóstico propio. Lo ya cargado
se conserva y puede revisarse: este cambio no borra ni migra el historial.

1. Abrir **Importar XML**, elegir el mes y seleccionar o arrastrar archivos.
   La carga comienza al seleccionarlos. Cada archivo obtiene su propio resultado.
2. Consultar **Importaciones** para localizar duplicados, conflictos y archivos
   no elegibles. Un conflicto no sustituye la primera compra: aclararlo con
   el despacho antes de resolverlo en una fase posterior.
3. En **Revisión**, la cola muestra una fila por proveedor + SKU y el número de
   compras acumuladas. Buscar, ordenar y filtrar permite localizar el producto;
   seleccionarlo abre su ficha de evidencia.
4. En el paso 2 pulsar **Editar producto**. Confirmar presentación, contenido,
   unidad, marca y categoría; **Guardar producto**.
5. En el paso 3 **Vincular existente** o **Crear ingrediente**. Confirmar nombre,
   categoría, unidad kg/l/pieza y merma. La fecha de confirmación de la merma no
   bloquea CFDI anteriores. **Crear y vincular** guarda
   categoría nueva, ingrediente y vínculo atómicamente.
6. Comprobar la fórmula del paso 4. **Validar precio real** añade una observación
   calculada sobre importe neto, cantidad, presentación y merma. Revalidar conserva
   la anterior. Esta primera validación es humana: el XML informa el importe,
   pero no confirma por sí solo cuántos kg, litros o piezas contiene la presentación.
   Después, un XML más reciente del mismo proveedor y SKU genera automáticamente
   una nueva observación si coinciden descripción y unidad XML, producto vinculado,
   presentación, ingrediente y merma aprobados. La bitácora registra la actualización.
   Cambios, exclusiones o conversiones no verificables quedan pendientes en Revisión;
   una compra antigua no desplaza una más reciente.
7. Consultar **Ingredientes** o **Consultar catálogo**. La ficha conserva el
   precio vigente, productos, alias, merma e historial de observaciones.

En **Productos**, el selector **Validados** muestra solo los productos cuya
compra más reciente conserva una observación válida. **Pendientes y conflictos**
muestra los que requieren revisión. Un producto puede estar vinculado a un
ingrediente y seguir pendiente de su primera validación de precio.

Mientras esté abierta la edición del producto o del vínculo de ingrediente,
hay que **Guardar** o **Cancelar** antes de validar. El botón y el atajo `v`
quedan bloqueados para no validar los datos anteriores ni perder el borrador.

Servicios y otros conceptos no culinarios se retiran del costeo con **Excluir de
FORX**. Las casillas permiten hacerlo por lote. La bitácora registra la decisión;
no se crean ingredientes ni precios automáticamente.

El catálogo admite ingredientes sin compra. Esos ingredientes muestran **Sin
precio**. Cambiar presentación, vínculo o merma requiere revisar los precios
afectados. Las observaciones anteriores no se sobrescriben. Un precio manual se
conserva como provisional y no acredita un costo verificado.
La merma aprobada se aplica al importe neto de la compra que se valida, aunque
el CFDI sea anterior a la fecha en que se confirmó esa merma en la aplicación.
Esa fecha documenta la decisión; **no** se usa para ordenar compras ni para
rechazar el cálculo. Cambiar solo la fecha no modifica el precio. Cambiar el
porcentaje sí requiere revalidar los precios afectados; no se reescribe su historia.

**Eliminar de la lista** retira el producto de la cola, no sus compras ni precios
históricos. Se puede **Restablecer** en Administración → Bitácora. Si hay una
decisión posterior, no se revierte a ciegas: hay que revisar el producto.

Recargar la página trae decisiones de otras pestañas del mismo navegador/origen.
Si un registro cambió mientras lo editabas, la operación se rechaza; recarga y
revisa. El modo navegador no sincroniza entre dispositivos; el modo servidor
demo comparte registros entre sesiones locales, con tokens y revisiones.

Los originales vencen dos meses naturales desde la primera carga. En local se
limpian al abrir la aplicación; no hay borrado programado en servidor habilitado.
No usar esta instancia como único respaldo de información.

Si aparece **No está disponible el servidor local de FORX**, no significa que
los XML hayan sido rechazados por su fecha. No repitas a ciegas ni cierres los
procesos de emuladores: primero hay que recuperar los servicios y comprobar en
Importaciones cuántos archivos del intento quedaron procesados. Si quedó en
cero, puedes volver a seleccionar el lote cuando el entorno esté recuperado.
Antes de elegir archivos confirma el periodo; para agosto de 2026 es `2026-08`.

## Categorías y reglas

En MiDespensa → **Categorías y reglas**, debajo de las categorías, se pueden
crear, editar y pausar reglas. Una regla sugiere una categoría; no guarda un
producto, no vincula un ingrediente y no valida un precio automáticamente.

1. Elegir descripción exacta, frase de la descripción o SKU exacto. El SKU
   requiere el RFC del proveedor para no confundir códigos de empresas distintas.
   Las descripciones también se pueden limitar a un proveedor.
2. Escribir el texto literal, elegir una categoría activa y prioridad; guardar.
   No se admiten expresiones regulares. Mayúsculas y acentos no alteran la
   coincidencia; una frase no coincide con una parte interna de otra palabra.
3. Usar el simulador con descripción, SKU y RFC para comprobar la sugerencia
   sin importar archivos ni modificar registros.
4. Volver a Revisión. La ficha explica qué regla coincide y propone la categoría
   para que la confirmes con **Guardar producto**. La validación de precio
   sigue siendo una decisión separada.

Si coinciden categorías distintas, aparece un conflicto: la prioridad ordena
las coincidencias, pero no oculta la contradicción. Un producto ya clasificado
tiene precedencia; una regla nueva no reemplaza esa decisión ni sus precios.
Las reglas se aplican también a compras pendientes anteriores. Cada edición o
pausa queda en bitácora; una edición concurrente requiere recargar.

## Respaldar y recuperar una copia

En MiDespensa → **Administración**, **Descargar respaldo completo** conserva
catálogo, compras derivadas, observaciones, vínculos, reglas, bitácora, recetas,
versiones, menús y configuración. En servidor requiere administrador. No incluye
los XML originales, sus rutas privadas ni credenciales. La fecha de vencimiento
original se conserva y no vuelve a empezar al recuperar. Tampoco incluye el
texto intermedio de solicitudes o propuestas del generador: si no guardaste
una propuesta como receta, el respaldo no permite recuperarla. Conserva sus
cuotas, reserva/gasto estimado y la receta que sí se haya guardado.

El JSON contiene información de proveedores y compras y **no está cifrado**:
guárdalo en un lugar privado. Su suma de integridad detecta alteraciones, pero
no acredita quién lo emitió; recupera solamente archivos de origen confiable.

1. Elegir el respaldo en la misma sección. La aplicación comprueba su formato,
   integridad y referencias antes de habilitar la recuperación.
2. Revisar nombre del archivo, fecha y cantidades. Un archivo inválido muestra
   el motivo y no crea una copia.
3. Pulsar **Crear y abrir copia recuperada**. Se abre otra base local, separada
   del servidor y de la base local habitual; no se sobrescriben sus registros.
4. Guardar la dirección que contiene `?recovery=...` para volver a esa copia en
   el mismo navegador y origen. Guarda otro respaldo si sigues trabajando allí.

Cerrar la pestaña no borra la copia, pero limpiar los datos del navegador sí
puede hacerlo. El JSON descargado es el respaldo portable. Los cambios de una
copia recuperada no se sincronizan al servidor. No hay importación de XML desde
el respaldo ni recuperación de los archivos originales vencidos.

## Verificar el origen desde Precios

En FORX → **Precios**, cada ingrediente con precio validado muestra el producto,
proveedor, **SKU de origen** y fecha de la compra utilizada. La búsqueda acepta
ingrediente, producto, proveedor o SKU; el CSV incluye estas referencias.
Un ingrediente puede reunir varios SKU: se muestra el de la observación vigente,
no el de cualquier producto vinculado ni una compra posterior sin validar.

**Ver origen** despliega, sin salir de la pantalla, el concepto de compra, UUID
del CFDI, importe y descuento, contenido confirmado, conversión a unidad base,
merma, cantidad aprovechable y cálculo guardado. La validación incluye fecha,
identificador de usuario y observación. No se recalcula con una presentación
distinta ni se inventa SKU: si falta en el XML, se indica **Sin SKU en XML**.

**Abrir producto y compra en MiDespensa** selecciona el producto y conserva una
ficha de la observación exacta consultada. Puede coexistir con una compra más
reciente pendiente del mismo SKU; no significa que esa nueva compra esté validada.
Si el precio cambió mientras consultabas, pulsa **Actualizar datos** y vuelve
a abrir su origen. La evidencia derivada permanece tras vencer el XML original.

Esta consulta detallada requiere editor o administrador. Una cuenta de consulta
no adquiere acceso a evidencia fiscal. No se añadieron estos enlaces al editor
de recetas ni a Grill Express.

## Recetas y menús FORX

### Revisar un respaldo anterior, sin importar

En FORX → **Catálogo** o **Exportar**, pulsa **Revisar respaldo anterior** y
selecciona el JSON `ForX-respaldo-…` (hasta 10 MB). Es una vista de solo lectura:
no envía el archivo al servidor, no guarda recetas ni modifica configuración,
precios o vínculos. No es la recuperación completa de MiDespensa descrita arriba.

- Revisa por separado la **Copia local** y la **Copia de nube**. La comparación
  cubre contenido culinario y marcas históricas, no los precios heredados.
  Las copias no se suman ni se fusionan. Las diferencias no se resuelven solas.
- Busca por receta o ingrediente; filtra advertencias, duplicados, coincidencias
  con el catálogo actual, omisiones o Grill Express. **Ver detalle** muestra
  cantidades, unidades, procedimiento y desechables originales.
- Un nombre repetido, ID compartido, falta de procedimiento, cantidad irregular
  o unidad como “porción” requiere revisión. La detección de cantidades idénticas
  es una advertencia, no una corrección culinaria. “Sin alertas de formato” no
  significa receta validada.
- Las cantidades antiguas están guardadas por porción. No se vuelven a dividir
  entre `paxO` ni `paxD`, conservados como referencia histórica. Las cantidades
  escritas dentro del procedimiento no se modifican ni escalan automáticamente.
- Las marcas de eliminación no contienen el texto de las recetas borradas.
  Omisiones, borradores y configuración se muestran, sin reactivar ni aplicar nada.

No hay botón de importación en esta pantalla. Los precios antiguos quedan fuera del
costeo y no se deducen vínculos a MiDespensa por nombre. **Limpiar vista previa**
descarta solamente la lectura en memoria; recargar o salir del módulo también la
descarta. El archivo original y el catálogo permanecen intactos. Si cambia el
catálogo en otra sesión, **Actualizar datos** vuelve a comprobar coincidencias.

### Recuperación asistida del recetario anterior

La importación asistida, con autorización del administrador, usa el mismo
validador que la captura manual. No reemplaza recetas existentes ni importa
configuración, precios históricos, precios de venta o vínculos por nombre.
Conserva cantidades por porción (base 1), clasificación y omisiones. Asigna
nuevos identificadores y códigos; deja la huella del respaldo y las referencias
anteriores en las notas, y cada alta en la bitácora.

Solo consolida nombres duplicados si su contenido culinario coincide, ignorando
acentos y mayúsculas; deja referencia de ambos originales. Un mismo nombre con
contenido distinto queda pendiente. Una receta con unidad no admitida (como
“porción” sin equivalencia) queda pendiente completa: no se descartan sus
ingredientes ni se inventa una conversión. Cantidades sospechosas o falta de
procedimiento dejan la receta en borrador, fuera del generador automático.

En Grill Express no se recuperan precios de venta ni costos de producción; el
campo de producción parte del valor inicial 0 y debe confirmarse al editar el
platillo. No constituye un costo validado. Los ingredientes y desechables
permanecen sin vínculo y con costo no verificable.

Antes y después se guarda un respaldo de datos derivados (sin XML originales)
en un directorio privado fuera del repositorio. La recuperación no guarda un
menú de prueba: la comprobación de especiales, omisiones y costos se ejecuta
en memoria. Generar un menú en la aplicación sigue siendo una acción separada.

### Capturar y usar recetas

Usar **Menú y recetas FORX** en MiDespensa; **MiDespensa** regresa a la cola.
No hay que publicar precios ni exportarlos entre aplicaciones.

1. En **Agregar receta**, abrir captura manual o pegar el formato estructurado
   mostrado. **Revisar y guardar** abre el editor; pegar texto libre de una web
   no es un parser universal. La carga por lotes informa cada resultado y permite
   omitir o reemplazar duplicados, conservando versiones.
2. Confirmar nombre, tipo, porciones base, cantidades y unidades. Seleccionar el
   ingrediente MiDespensa en cada renglón. Se puede dejar sin vínculo y guardar.
   Porciones base describe las cantidades capturadas; no equivale a comensales.
3. **Catálogo** contiene la receta aunque falten ingredientes. El editor explica
   la observación vigente, los faltantes y el costo verificable o subtotal conocido.
   Precio desconocido no significa cero. Rendimiento y gramos por pieza solo se
   usan al documentar una equivalencia real.
4. En **Exportar**, revisar las líneas, producción, objetivo y canasta; vincular
   ingredientes y confirmar parámetros. Es una operación de administrador.
5. En **Menú**, elegir fecha, duración, línea y comensales, luego **Regenerar**.
   Se guarda un nuevo menú; no se destruye el anterior. **Menús guardados** permite
   recuperarlo. **Cambiar** sustituye una receta por otra del tipo/día permitido.
   Guisados y garnachas tienen historiales separados, de al menos 15 selecciones
   por familia (o la duración elegida si es mayor); no son 15 días completos.
   Pozole y tacos dorados de papa se priorizan el jueves; Barbacoa/Menudo alternan
   los domingos desde el primero del menú. Faltantes, repeticiones por catálogo
   insuficiente y excepciones manuales quedan advertidos. Las advertencias se
   recalculan al sustituir, no se conservan mensajes obsoletos del menú original.
6. Las recetas incompletas siguen disponibles. Resolver el vínculo o precio en
   MiDespensa y volver a FORX recalcula el mismo menú. **Actualizar datos** trae
   cambios de otras sesiones; no sobreescribe el borrador de otra persona.
7. **Lista Compras** escala cantidades; advertencias identifican lo que no está
   resuelto. Excel/CSV conservan faltantes. **Imprimir** descarga un documento HTML
   que se abre en navegador para imprimir o guardar como PDF. No usa servicios externos.

Grill Express permanece dentro de FORX: ingredientes, desechables, producción y
venta por platillo. Comparte el catálogo, no la producción global del menú.
Su menú de venta y el libro de recetas son documentos distintos.

**Agregar las 40 recetas base** es opcional: conserva cantidades y procedimientos
del código original, sin sus precios ni asociaciones antiguas. Revisar los vínculos.
**Archivar** conserva historial y deja pendientes los menús afectados; no borra datos.
La recuperación de una receta archivada todavía no dispone de un botón en la UI.

### Probar Generar receta, sin consumo de OpenAI

El flujo aprobado ya se puede probar con un **simulador explícito** en:
`http://127.0.0.1:4174/?backend=indexeddb&recipeGenerator=simulated#/forx/generar`.
Es una base de ensayo separada: no contiene ni modifica el lote de agosto ni las
recetas recuperadas del servidor. No hace falta cargar XML reales para esta prueba.

1. Capturar una idea, tipo y porciones. Proteína, restricciones e ingredientes
   preferidos son opcionales. El simulador entrega un ejemplo fijo por tipo,
   escalado por porciones: **no interpreta la idea ni las restricciones**. No es
   todavía la generación de recetas con OpenAI ni una evaluación de su calidad.
2. **Generar propuesta simulada** muestra ingredientes, cantidades y procedimiento.
   No guarda una receta. Las coincidencias exactas de MiDespensa son sugerencias,
   nunca vínculos ni precios aprobados. Si el catálogo está vacío, quedan pendientes.
3. **Revisar en editor** abre el editor conocido. Revisar cantidades, unidades,
   procedimiento y restricciones; marcar la confirmación de revisión. Solo
   **Guardar receta** crea el borrador. No se permite activarlo en ese primer guardado.
4. El borrador aparece en Catálogo y conserva su origen simulado aunque cambie de
   nombre. Editarlo permite activarlo después de revisarlo. Para usarlo en un menú
   no exige precio, pero el costo seguirá no verificable hasta resolver todos los
   vínculos, unidades y observaciones en MiDespensa.

Después de enviar, los campos quedan protegidos contra un segundo envío accidental.
**Consultar estado sin generar otra** consulta la misma solicitud; **Nueva solicitud**
inicia otra prueba. Ante error se conservan los campos y no se reintenta automáticamente.
Salir con una propuesta sin guardar pide confirmación; dejar la vista no garantiza
cancelar una solicitud ya iniciada. Un resultado incierto conserva su reserva.
El texto de la solicitud y propuesta deja de poder consultarse o guardarse a
los 30 días exactos desde la solicitud; el trabajo privado lo depura sin borrar
recetas ya guardadas ni el registro de gasto.

Límites del simulador: 10 solicitudes por usuario/día UTC y 100 por entorno/mes UTC,
2 simultáneas y espera de 10 segundos. No son importes ni límites pagados aprobados.
En el entorno normal la generación permanece desactivada. No se solicitan claves
en el navegador y no hay llamadas pagadas habilitadas. El siguiente paso para
OpenAI real requiere modelo, presupuesto y criterios culinarios acordados.

El **Respaldo** de FORX → Exportar sigue siendo una exportación parcial de recetas,
menús y configuración; no se recupera con el flujo completo. Para todos los registros
derivados usar Administración de MiDespensa. El respaldo completo v3 incluye
solicitudes y cuotas del generador sin texto intermedio; también acepta los
formatos v1 y v2 anteriores, sin reescribirlos ni modificar su instancia de origen.

### Backend real: preparación, todavía sin activación

El corte del 5 de octubre prepara acceso por usuarios autorizados, roles,
retención y respaldos de servidor. **La aplicación que estás probando sigue local**:
no se trasladaron tus XML ni recetas y no cambia tu acceso actual.

Se eligió **Google**. La pantalla de acceso, comprobación de autorización y cierre
en ambos módulos están implementados y probados localmente, todavía sin Google
real. Crear una cuenta no da permiso automáticamente: administración debe
autorizarla en FORX. El panel está en **MiDespensa → Administración → Usuarios y roles**.
La generación real de OpenAI sigue desactivada por separado.

Cuando se habilite el acceso, pulsa **Continuar con Google** y selecciona tu cuenta
autorizada. Si aparece «Tu cuenta necesita autorización», comparte correo y UID
con administración; no cambies de cuenta para intentar saltar permisos. Si olvidas
la contraseña, usa **Recuperar mi cuenta de Google**: FORX no guarda contraseñas.
Sal con **Cerrar sesión**, al pie de navegación de cualquiera de los módulos.
En MiDespensa con pantalla estrecha, abre **Administración** para ver tu cuenta
y cerrar sesión; así no se superpone el control a la navegación compacta.
Esto descarta ediciones no guardadas y cierra FORX en esa pestaña, no tu cuenta
de Google ni las demás pestañas. Revisa las sesiones restantes en equipos compartidos.

La prueba local `?authPreview=1` está rotulada como ficticia y usa memoria nueva;
no abre Google ni tus XML/recetas cargados. No uses esa prueba para capturar datos
que quieras conservar. Detalle de alcance y configuración: `google-access.md`.

Las tareas de retención y respaldo están implementadas y probadas con datos
sintéticos, pero no programadas ni conectadas a cloud. La recuperación a un servidor
vacío es una herramienta operativa, no el botón de recuperación local de esta UI.
No uses los comandos de producción para tratar de conectar los datos actuales.
Su activación necesita revisar destino, presupuesto, permisos y datos contigo.

### Usuarios y roles

Solo una cuenta con **Administración** puede consultar o modificar las membresías.
Consulta y Edición no reciben la lista de usuarios. En la sesión local habitual
sin servidor autenticado se explica que la gestión no está habilitada.

1. La persona intenta entrar con Google. Si no tiene permiso, comparte su **UID**
   de la pantalla de autorización; no su contraseña.
2. Administración pulsa **Autorizar cuenta**, copia ese UID y **Comprobar UID**.
   El servidor devuelve el correo de la identidad. Verificar que corresponde a la
   persona correcta. Comprobar no concede acceso ni envía una invitación.
3. Elegir **Consulta**, **Edición** o **Administración**. Por seguridad, una nueva
   cuenta empieza con Consulta. **Revisar cambio** muestra cuenta, rol y acceso;
   únicamente **Confirmar cambio** guarda el permiso.
4. Para modificar, usar **Editar** en la fila. **Desactivado** impide entrar a FORX
   sin borrar Google, compras o recetas. Para reactivar, el servidor vuelve a
   exigir una identidad disponible y verificada.

La última cuenta administradora activa no se puede desactivar ni degradar.
Cambiar los permisos de tu propia cuenta pide confirmación y cierra tu sesión.
Los cambios quedan en la auditoría privada del servidor, separada de la bitácora
culinaria; no hay visor de esa auditoría en este panel.

Si otro administrador cambió el registro, **Actualizar cuentas** y revisar otra
vez. Si falla la red, un cambio puede haberse guardado: no se repite por sí solo.
Actualizar consulta el estado; no vuelve a enviar el cambio. Una advertencia de
revocación pendiente significa que el permiso ya cambió pero quedó pendiente
invalidar la sesión del proveedor; no repetir el cambio para intentar solucionarlo.
Salir de la vista no revierte una operación que el servidor ya recibió.

Ensayo: abrir `?authPreview=1#/despensa`, entrar con la cuenta ficticia y abrir
Administración. UID **preview-new** permite probar un alta ficticia. Los cambios
solo viven en memoria y se descartan al salir o recargar. No usar cuentas ni datos
reales allí. La configuración cloud y aceptación real de la recuperación administrativa siguen pendientes.

### Continuar verificando tus productos y recetas

Usa el enlace con **`backend=emulator&serverPort=8788`** para trabajar con tus
compras y recetas recuperadas. **`authPreview=1`** es una demostración de acceso
con datos ficticios: no contiene esos registros ni debe usarse para verificarlos.

- En MiDespensa, confirma categoría culinaria/no culinaria, SKU/proveedor,
  presentación, contenido, unidad e ingrediente antes de validar el precio.
- En FORX, vincula ingredientes, revisa cantidades/porciones, tipo, proteína y
  preparación. Puedes guardar pendientes; no inventes precios ni equivalencias.
- Un costo incompleto seguirá sin verificarse. Arranca con las recetas que
  necesitas; no hace falta completar todo el recetario para revisar un menú.
- Tus cambios confirmados permanecen en la base local mientras los emuladores
  estén activos. No detenerlos, reiniciarlos ni limpiar datos del navegador.
  Al terminar la sesión usa **MiDespensa → Administración → Descargar respaldo
  completo**, no solo la exportación parcial de recetas de FORX.

El respaldo captura un momento: las verificaciones posteriores necesitan otra
copia. Los originales XML y las cuentas no se incluyen. El desarrollo y sus
pruebas usan instancias separadas, sin sustituir la base donde estás trabajando.

### Si se pierde el acceso de administración

Primero intentar recuperar la cuenta con Google o acudir a otro administrador
autorizado. Se implementó un procedimiento técnico externo para sustituir una
cuenta administradora perdida por otra Google comprobada, con vista previa,
confirmación, bitácora e invalidación de sesiones. No hay contraseña maestra ni
botón público y no se borran recetas/productos al realizarlo.

Este procedimiento está probado en entorno aislado pero **no activado en cloud**.
Requiere aprobación y responsables de infraestructura; no puede ejecutarse por
una persona solo por conocer un UID. El manual técnico es `docs/admin-recovery.md`.
# Actualización de acceso e importación — 29 de octubre de 2026

FORX y MiDespensa comparten su catálogo interno. Solo se guardan facturas tipo I
recibidas por CICSA, RFC `CIC190426SD4`, y emitidas por terceros. Los comprobantes
ajenos, emitidos o de otro tipo se cuentan como no elegibles; no se guardan sus
archivos ni conceptos, aunque no tengan UUID. Los registros históricos no se borran.
Si el servidor responde que la operación no pudo confirmarse o venció su plazo,
consulta Importaciones y actualiza los datos antes de repetir: una parte del lote
puede haber quedado confirmada. El sistema no reintenta escrituras automáticamente.
