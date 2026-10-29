# Generador de recetas FORX con OpenAI

Diseño del 3 de octubre de 2026; flujo aprobado e implementado con simulador
el 4 de octubre. Proveedor elegido por Francisco: OpenAI.
**El recorrido simulado funciona; la generación real con OpenAI sigue inactiva.**
No se configuraron claves, no se enviaron datos a OpenAI y no hubo consumo pagado.

## Estado implementado y límites de este corte

- Formulario en Generar receta → propuesta → editor existente → revisión
  explícita → guardar borrador. Guardar no activa la receta automáticamente.
- Simulador con seis ejemplos fijos, uno por tipo, escalados por porciones.
  **No interpreta la idea ni las restricciones**: sirve para probar el recorrido,
  no para evaluar calidad de OpenAI. Esto se indica antes y después de generar,
  en el editor y en el catálogo de las recetas simuladas guardadas.
- Validación cerrada de entrada/salida, roles, reservas atómicas, identidad de
  solicitud, consulta de estado sin regeneración y procedencia protegida al guardar.
  No crea ingredientes, observaciones, precios ni vínculos por coincidencia.
- Límites de ensayo: 10 solicitudes por usuario/día UTC, 100 por entorno/mes UTC,
  2 concurrentes, espera de 10 segundos. Son cantidades de pruebas, **no presupuesto
  monetario aprobado**. Un resultado incierto conserva su reserva y no se reintenta.
- Contrato de Responses con esquema estricto, `store:false` y manejo de rechazo/
  truncamiento probado sin red. Transporte implementado el 5 de octubre y probado
  con HTTP sustituido. El servicio de dominio ya lo enlaza con reserva y
  conciliación monetaria transaccionales cuando recibe una política explícita.
  El runtime de producción admite esa conexión solo con configuración validada,
  `FORX_ENABLE_RECIPE_AI=true` y clave privada de servidor; el ejemplo está
  desactivado y no contiene secreto. La política de piloto ya fue aprobada y
  está versionada por separado; faltan el secreto, operación administrativa real,
  comprobación contra la factura del proveedor y evaluación culinaria.
  F05 permanece abierto.

Prueba local aislada:
`http://127.0.0.1:4174/?backend=indexeddb&recipeGenerator=simulated#/forx/generar`.
Usa `forx-v2-simulation`, no los datos de los emuladores ni `forx-v2-local`.
El servidor permanece desactivado por defecto; solo admite activación simulada
explícita con `FORX_RECIPE_PROVIDER=simulated`. La URL no habilita un proveedor
en el servidor. No se reinició el HTTP compartido en este corte.

## Resultado buscado

Generar una propuesta culinaria institucional dentro de la pantalla **Generar
receta** de FORX. Revisarla en el editor que ya existe y guardarla con el mismo
validador de las recetas manuales y por lote. No crear otra aplicación ni un
asistente que escriba libremente en las bases.

OpenAI propone cantidades y procedimiento; FORX valida estructura y reglas;
una persona confirma la receta y los vínculos; MiDespensa acredita los precios.
Una propuesta generada no se anuncia como receta técnicamente probada, inocua
o con costo validado solo por haber pasado una validación de formato.

## Transporte preparado el 5 de octubre (sin activación)

`src/server/openai-recipe-transport.js` es una pieza interna de servidor. No lee variables de entorno,
no carga claves ni usa `fetch` global automáticamente. El runtime de producción
le inyecta configuración y `fetch` solo al activar ambos cerrojos; las pruebas
solo inyectan respuestas artificiales.

- Destino fijo `https://api.openai.com/v1/responses`, `service_tier:default`,
  sin redirecciones ni reintentos automáticos. Modelo y límite de salida
  explícitos del servidor.
- Contexto culinario cerrado: excluye campos de compras, precios, IDs y secretos;
  máximo 20 ingredientes preferidos con nombre/unidad. No envía el catálogo.
- Petición máxima de 32 KiB y respuesta de 256 KiB, verificando bytes reales
  aunque no venga Content-Length. Plazo de espera cubre conexión y lectura.
  Se cancela la lectura al abortar, incluso ante una respuesta tardía.
- Valida la propuesta con las reglas existentes. Devuelve borrador sin vínculos
  ni precio de venta; no escribe recetas ni altera MiDespensa.
- Separa propuesta válida, rechazo, incompleto y salida inválida del consumo
  reportado. Conserva los contadores de tokens aun cuando la receta no sirva;
  si faltan o son incoherentes, el consumo queda desconocido, nunca en cero.
- Errores de transporte/HTTP después del envío quedan inciertos; no reproducen
  cuerpo, cabeceras, clave ni causa cruda del proveedor. Un timeout no demuestra
  cancelación del cargo. El servicio de dominio reserva y concilia antes/después
  de invocar esta pieza.

Los techos técnicos (16 000 tokens de salida y 120 segundos configurables como
máximos permitidos) **no son valores de activación ni presupuesto aprobado**.
La integración de dominio ya proporciona reserva, conciliación e idempotencia;
antes de activarla faltan tarifas/modelo y límites aprobados, secreto exclusivo
de FORX, retención y aceptación culinaria. El transporte nunca debe invocarse
directamente desde una ruta pública. Las pruebas falsas no certifican calidad.

Verificación del corte anterior de transporte: 33 pruebas nuevas; `npm run check`
con Node 24: 277 aprobadas, 24 omitidas por requerir emuladores, compilación
correcta. Las pruebas de emuladores/navegador no se repitieron en este corte
porque no cambiaron persistencia, permisos, runtime ni UI. Se mantiene la
prueba existente que rechaza el proveedor `openai` y se comprueba que ningún
runtime importa el transporte. Sin dependencias nuevas, llamadas pagadas,
reinicios ni cambios a datos actuales. F05 sigue abierto.

Contrato contrastado con OpenAI Docs: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
y [Responses: creación y uso reportado](https://developers.openai.com/api/reference/python/resources/responses/methods/create).

## Reserva y conciliación implementadas el 5 de octubre (sin activación)

`RecipeGenerationService` usa `OpenAIRecipeBudgetService` solo si el servidor
inyecta un transporte OpenAI y una política monetaria completa. La política
contiene referencia de aprobación, versión de tarifa, modelo, límite máximo de
tokens de entrada/salida, tarifas separadas de entrada normal, entrada leída de
caché, escritura de caché y salida, topes USD por solicitud, usuario/día UTC y
entorno/mes UTC, además de límites de cantidad y concurrencia. **No hay modelo,
tarifa, presupuesto ni aprobación reales configurados en los runtimes**; las
tarifas de las pruebas son ficticias.

- Calcula importes en enteros de nanodólar para evitar redondeos acumulados.
  La reserva usa la tarifa de entrada más alta y los máximos configurados.
  Valida que quepa en los tres topes antes de invocar OpenAI.
- Guarda solicitud y saldos en `generation_requests` y `generation_quotas` con
  una transacción y control de revisiones; se probó con Firestore emulado.
  Repetir el mismo `requestId` devuelve el estado almacenado.
- Con la respuesta, usa tokens ordinarios, leídos de caché, escritos en caché
  y de salida; los de razonamiento ya están dentro de los de salida. Aplica
  la tarifa guardada con la solicitud y mueve la reserva a **gasto estimado**,
  incluso si el contenido fue rechazado o inválido.
- Si faltan tokens válidos, modelo o modalidad esperados, conserva la reserva
  y los contadores recibidos. Error HTTP, timeout o proceso interrumpido no
  equivalen a costo cero. No reintenta ni entrega receta con resultado incierto.
  Una respuesta que excede los techos se contabiliza pero no se ofrece.
- Solo un fallo probado **antes** del envío libera automáticamente la reserva.
  `reconcileOpenAIRecipeBudget` permite al administrador ajustar saldos con
  evidencia de uso o de ausencia de cargo; registra actor, fecha y referencia
  en bitácora. No vuelve a pedir ni recupera la receta. Si sigue `pending`,
  espera una hora antes de permitir conciliación.
- El respaldo v3 incluye solicitudes y saldos sin texto culinario intermedio;
  su inspector recalcula importes y coteja las sumas. La restauración aislada conserva el libro. Los respaldos
  anteriores siguen legibles. El simulador conserva el saldo OpenAI al
  compartir contador.

Para conciliar, consultar la solicitud por su ID, comparar modelo, modalidad,
tokens e ID de respuesta con Usage/costos del proyecto FORX y conservar una
referencia verificable (`evidenceRef`). Registrar los tokens o una confirmación
de ausencia de cargo. Si hay duda, dejar retenida la reserva. La misma solicitud
no puede conciliarse dos veces con resultados distintos. Se agregó un trabajo
privado de operador para consultar reservas, crear una vista previa de evidencia
y aplicar una conciliación confirmada. No hay pantalla ni ruta pública para
ello; el trabajo está desactivado en el ejemplo y no se ejecutó en cloud. El
procedimiento y sus cerrojos se detallan en `docs/release-operations.md`.

El importe calculado con tokens y tarifa es una **estimación local**, no una
factura certificada. Debe compararse periódicamente con los costos reales del
proyecto OpenAI y configurarse también su límite de gasto. OpenAI indica que
incluso un límite estricto puede aplicarse con retraso.
[Tarifas oficiales](https://developers.openai.com/api/docs/pricing),
[caché y categorías de tokens](https://developers.openai.com/api/docs/guides/prompt-caching),
[límites de gasto](https://developers.openai.com/api/docs/guides/spend-limits).

Verificación del 6 de octubre: `npm run check` con 294 pruebas aprobadas, 26
omitidas y compilación correcta; además una prueba HTTP aislada aprobada con
respuesta OpenAI ficticia, reserva previa y consulta de estado sin segunda
llamada. Todo el tráfico OpenAI de las pruebas fue sustituido por respuestas
locales. No se reiniciaron los servicios compartidos ni se modificaron los
datos cargados.

## Activación pendiente para la primera publicación

`config/deployment.example.json` conserva `recipeGeneration.enabled=false`.
Una configuración habilitada debe incluir modelo, máximo de salida, plazo y
política con referencia de aprobación, versión de tarifas, cuatro clases de
precio, topes monetarios y límites de solicitudes. `--check` la valida sin
conexión. El arranque real requiere además `FORX_ENABLE_CLOUD=true`, destino
aprobado, identidad administrada, `FORX_ENABLE_RECIPE_AI=true` y
`FORX_OPENAI_API_KEY` en el entorno privado del servidor. Una clave por sí sola
no activa IA; no va en el JSON, navegador, respaldo ni repositorio.

Francisco aprobó el 6 de octubre el piloto con `gpt-6.1-sol`, tarifa estándar
OpenAI Docs de entrada US$2, entrada caché US$0.10, escritura de caché US$2.50
y salida US$10 por millón de tokens, y topes internos de US$0.15 por intento,
US$1 por usuario/día UTC y US$5 por entorno/mes UTC. El archivo
`config/recipe-ai-pilot.policy.json` registra el acuerdo **sin activar la IA**.
Se fijaron techos técnicos conservadores de 40,960 tokens de entrada y 4,000 de
salida: la reserva máxima es US$0.1424 por intento, menor al tope aprobado. Los
límites de 10 intentos por usuario/día, 100 por entorno/mes y 2 concurrentes
conservan el máximo del ensayo existente; el presupuesto puede detener antes.
La tarifa debe cotejarse otra vez antes de activar y versionarse si cambia.
[Tarifa oficial GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

Francisco confirmó también el límite estricto de US$5 por mes para el proyecto
OpenAI exclusivo de FORX. Es un control externo adicional al tope interno de
US$5; **la aprobación no significa que ya esté configurado**. Antes de
suministrar un secreto faltan crear/verificar ese proyecto, configurar y
comprobar en sus ajustes el límite de gasto mensual con la opción de
aplicación estricta (no solo una alerta), y probar el procedimiento de
conciliación. La aplicación del límite por OpenAI no es instantánea y el gasto
registrado puede superar ligeramente US$5; el libro de reservas de FORX sigue
siendo el control preventivo local.
[Límites de gasto de OpenAI](https://developers.openai.com/api/docs/guides/spend-limits).
Un ensayo pagado acotado y revisado por
Francisco es requisito de aceptación culinaria y de costos. La suscripción
ChatGPT Pro no paga estas llamadas de API. No se hizo ningún ensayo pagado.

## Recorrido dentro de la interfaz actual

1. Capturar platillo, tipo, proteína, porciones base y restricciones culinarias.
   Propuesta: 10 porciones base inicialmente, como el generador legado, siempre
   visibles y editables antes de generar. No confundirlas con los comensales.
2. Opcionalmente elegir ingredientes preferidos de MiDespensa. No seleccionar
   todo el catálogo automáticamente ni confundir el catálogo con existencias.
3. Pulsar **Generar propuesta**. Mostrar solicitud en curso y bloquear el doble
   envío; conservar los campos ante errores. Informar antes de enviar qué datos
   culinarios se compartirán y que una nueva generación puede consumir cuota.
4. Mostrar nombre, cantidades, procedimiento, adaptaciones y advertencias.
   Separar “coincidencia sugerida en MiDespensa”, “pendiente de vínculo” y “sin
   precio validado”. No preseleccionar un vínculo por semejanza de nombre.
5. **Revisar en editor** abre el editor existente con la propuesta y estado
   borrador. No se guarda ni se activa automáticamente.
6. Guardar explícitamente. Una receta con ingredientes fuera de MiDespensa puede
   guardarse; una persona puede activarla para menús. Los faltantes impiden
   acreditar costo, no impiden que exista ni que se utilice.

Mantener tipografía, temas, controles, navegación y densidad de FORX. No añadir
una conversación de chat como requisito para una tarea de captura estructurada.

## Reglas culinarias del generador

- Cocina institucional familiar, cantidades ejecutables y unidades medibles.
- Mantener las restricciones explícitas de la solicitud. Si no puede resolverlas,
  devolver una advertencia o pedir ajuste, nunca sustituirlas silenciosamente.
- Cada ingrediente lleva nombre, cantidad positiva y unidad; evitar “al gusto”,
  tazas o unidades sin equivalencia. Para ingredientes nuevos preferir g/ml;
  pz solo cuando la receta realmente cuenta piezas, sin inventar su peso.
- Procedimiento secuencial y tiempos orientativos; sin proteína cruda. Las
  adaptaciones de platos tradicionalmente crudos deben quedar señaladas para
  revisión culinaria humana, sin afirmar certificación sanitaria automática.
- No imponer seis ingredientes artificiales a una receta sencilla. Conservar
  los mínimos del validador común y evaluar suficiencia del procedimiento aparte.
- No aplicar 150 g de proteína indiscriminadamente a todos los tipos: ese valor
  aparecía en el prompt legado, pero debe definirse por familia/porción antes de
  volverlo una restricción general. No convertir una receta existente por ello.
- No generar precios, costos, márgenes, SKUs, mermas, densidades ni rendimientos
  “confirmados”. OpenAI tampoco crea ingredientes ni valida productos.
- El nombre y tipo de la receta se someten a las mismas reglas del catálogo.
  Los especiales del menú siguen siendo responsabilidad del generador de menús,
  no de OpenAI: pozole jueves, tacos dorados de papa exactos y domingos alternados.

## Contrato técnico

Petición del navegador: `requestId`, nombre/idea, tipo, proteína, porciones base,
restricciones y una lista acotada de IDs de ingredientes preferidos. El servidor
consulta esos IDs y deriva el contexto permitido. No confía en precios, roles,
modelo, endpoint, prompt de sistema ni presupuesto enviados por el navegador.

Salida estructurada: nombre, tipo, región, proteína, porciones base, minutos,
renglones `{name, quantity, unit}`, procedimiento, adaptaciones y advertencias.
Sin campos de precio ni de vínculo aprobado. Exigir esquema cerrado y rechazo
de campos adicionales, además de la validación semántica propia de FORX.

Usar **Responses API** y **Structured Outputs** con `text.format`, esquema JSON
y `strict: true`. La documentación distingue formato estructurado de validación
de contenido; también exige manejar rechazos e incompletos. FORX no reparará un
JSON truncado inventando el resto de la receta.
Fuente: [Structured Outputs, documentación oficial](https://developers.openai.com/api/docs/guides/structured-outputs).

La solicitud tendrá `store: false`, sin herramientas, búsquedas web, acceso a
archivos ni acciones de escritura. Esto no equivale a prometer retención cero
en todos los sistemas del proveedor; revisar condiciones de datos al activar.
Fuente: [Controles de datos de la API, documentación oficial](https://developers.openai.com/api/docs/guides/your-data).

## Servidor, autorización y datos

- Comando específico `generateRecipeProposal`, autorizado solo para editor/admin.
  El servidor autentica, valida tamaño y normaliza la solicitud antes de invocar.
- Clave de un proyecto OpenAI exclusivo de FORX en secretos del servidor. Nunca
  en `localStorage`, código cliente, Git, respaldo o mensajes de error.
- Modelo fijado por configuración de servidor, no elegido arbitrariamente por
  el cliente. La integración permanece deshabilitada hasta aprobarlo y habilitarla.
- Enviar solo solicitud culinaria y nombres/unidades de los ingredientes
  preferidos. No enviar XML, RFC, UUID, proveedor, SKU, facturas, precios de
  compra, datos personales, claves ni el recetario completo.
- Tratar nombres, restricciones y respuesta del modelo como datos no confiables.
  Escapar la vista previa; nada de HTML ejecutable ni instrucciones que puedan
  saltarse el validador o autorizar operaciones.
- `validateRecipe` valida la propuesta antes de mostrarla y vuelve a validar
  antes de guardar. Mantener `ingredientId:null`, rendimiento 1, sin gramos por
  pieza y sin merma inventada. Las sugerencias de catálogo son una lista aparte.
- Guardar procedencia de la receta aprobada: proveedor, modelo, versión de
  reglas/prompt, solicitud y persona que la revisó. No guardar secretos ni
  respuestas crudas del proveedor en la bitácora general.

## Control de gasto y fallos

Antes de cada llamada, reservar cuota en el servidor de forma atómica. Aplicar
límite por solicitud, usuario/día y proyecto/mes, más concurrencia. Modelo,
tarifas y topes internos del piloto ya están aprobados y versionados; la
reserva usa esa tarifa y los máximos configurados;
los tokens de la respuesta generan un gasto estimado. La factura/costos del
proyecto requieren contraste operativo posterior.

La identidad de solicitud evita dobles cargos por doble clic o reconexión. No
reintentar automáticamente una llamada cuyo resultado o consumo es incierto.
Timeout, rechazo, respuesta incompleta o validación fallida conservan el formulario
y no crean una receta parcial. Cancelar la espera no garantiza anular un consumo
ya iniciado; debe explicarse sin ofrecer una devolución ficticia de cuota.

Los registros de cuota/solicitud son entidades propias, con reglas, respaldo
y recuperación probados. No reutilizan una instantánea monolítica ni datos de
otras aplicaciones. Francisco fijó 30 días desde la solicitud para el texto
intermedio; un trabajo privado lo retira con vista previa, revisión y bitácora.
Los respaldos v3 excluyen ese texto desde su creación. Permanecen la receta
guardada, su historial, las cuotas y el libro monetario. El trabajo periódico
no está activado en cloud y requiere aceptación operativa. No se guardan claves,
XML, precios ni respuestas crudas de error. El procedimiento técnico de
conciliación ya existe, pero espera ensayo y aceptación en el entorno aislado.

## Pruebas y aceptación antes de activar

1. Pruebas sin red con proveedor simulado: cantidades inválidas, unidades ajenas,
   campos de precio/identidad inyectados, tipo/porciones distintos de la petición,
   rechazo, truncamiento, timeout y respuesta malformada.
2. Límites y autorización: viewer denegado; cuota concurrente; doble solicitud;
   saldo reservado ante consumo incierto; ningún secreto en navegador o respaldo.
3. Flujo completo: propuesta → revisión → receta guardada sin vínculo → costo
   no verificable → validación/vínculo humano en MiDespensa → mismo ID recalculado.
4. Generación de menús con esa receta, respetando tipo, estado, omisiones y
   especiales. No filtrar por falta de precio ni mostrar un total falso.
5. Batería culinaria acordada: guisado, garnacha, guarnición, postre, agua y Grill;
   receta sencilla, ingrediente ausente y restricciones explícitas. Evaluación
   humana de pertinencia, cantidades, procedimiento y rendimiento.
6. Solo con autorización de consumo: ensayo acotado con OpenAI, registrar modelo,
   calidad, latencia y costo real. Si falla, no declarar cerrado F05.

## Confirmaciones antes de activar OpenAI real

- Fijar el estándar culinario por tipo (incluida porción de proteína), sin
  reaplicar valores del prompt legado como si todos fueran reglas aprobadas.
- Comprobar en un ensayo autorizado la calidad/costo del modelo piloto aprobado;
  crear y verificar el proyecto OpenAI y su límite estricto antes de activarlo.

La aprobación de OpenAI y del flujo de propuesta/revisión ya está dada; no se repite.
El generador no requiere un GPT separado ni un chat externo para usar FORX.
