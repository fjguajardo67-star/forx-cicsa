# FORX integrado — pendientes y salida a producción

Corte: 6 de octubre de 2026. Estado: desarrollo local funcional y base de backend real probada en emuladores; **no listo para producción**.
Lista de trabajo y aceptación, no autorización para ejecutar despliegues, migraciones o borrados.

## Decisiones acordadas

- Una sola aplicación: FORX con MiDespensa integrado, conservando sus interfaces.
- Conservar la URL de acceso del FORX anterior para la nueva aplicación.
- Primero terminar, probar, publicar y comprobar la operación de la nueva aplicación.
- Después retirar el FORX anterior y el staging legado de MiDespensa. No retirar el módulo MiDespensa de la aplicación nueva.
- Egresos queda fuera: no consultar, usar ni modificar sus servicios, credenciales o datos, tampoco durante el retiro.
- Facturación, recursos cloud, presupuesto, migración y despliegue se revisan con Francisco antes de ejecutarlos.
- XML: bloquear comprobantes de meses anteriores al último mes aceptado, determinado por la fecha del XML, no por la etiqueta del lote. Los datos ya cargados se conservan.
- Generación de recetas: OpenAI y flujo de revisión confirmados. Francisco pidió incluir la generación real en la primera publicación el 6 de octubre. Recorrido y conexión condicional implementados; llamadas pagadas todavía desactivadas.
- Orden confirmado el 5 de octubre: backend antes de revisión de código/seguridad. H01–H05 corregidos; dependencias sin avisos conocidos en el corte posterior, con pruebas y control en CI. Evidencia en `docs/operations.md` y `docs/dependency-security.md`. No equivale a aceptación de seguridad cloud.
- Google elegido para acceso y recuperación de identidad. FORX no guarda ni respalda contraseñas; mantiene su propia autorización de usuarios y roles.
- Recuperación administrativa aprobada: procedimiento técnico fuera de la aplicación, con cuenta Google sustituta comprobada, vista previa, confirmación y bitácora; sin contraseña maestra ni ruta pública. Implementado y probado localmente, no activado en cloud.

URL confirmada por Francisco: `https://menu-cicsa.cicsacomedores.com.mx`.
Evidencia: archivo `CNAME` y `HANDOFF.md` del checkout legado de `menu-cicsa`.
Estos archivos describen GitHub Pages desde `main`; **no se comprobó la configuración remota actual**.
Francisco confirmó conservar esta URL el 3 de octubre de 2026. No se cambiaron DNS, hosting ni dominios.

## Próximo paso sin tocar el FORX existente: Firebase de staging

1. Francisco crea en [Firebase Console](https://console.firebase.google.com/) un **proyecto nuevo**, nombre visible `FORX v2 · staging`, ID sugerido `forx-v2-cicsa-stg` si está disponible. El ID definitivo debe empezar con `forx-v2-` y no se puede cambiar después. No agregar Firebase al proyecto FORX anterior. Gemini y Analytics son opcionales; esta aplicación no los necesita para el ensayo.
2. Registra **una aplicación web** llamada `FORX v2 staging`. Conserva del objeto de configuración web `projectId`, `authDomain`, `apiKey` y `appId`; `apiKey` es configuración pública web, no una clave de administrador. No enviar contraseñas, cuentas de facturación, JSON de servicio ni secretos de OpenAI.
3. En Authentication → Sign-in method, habilita **Google**. Deja autorizados los dominios temporales que se usarán en staging; todavía no añadir ni mover `menu-cicsa.cicsacomedores.com.mx`.
4. Comparte el **ID real del proyecto** y la configuración web para preparar los archivos privados de staging. En esta etapa no se crea la base, buckets, Cloud Run ni se vincula facturación. Después de revisar región, servicios y presupuesto, la implementación usará una base Firestore nombrada `forx-staging-*`, dos buckets privados separados (XML temporales y respaldos), Hosting para la interfaz, Cloud Run para el API/trabajos y secretos/IAM propios. El proyecto de producción será separado.

El respaldo local comprobado del 5 de octubre contiene 329 recetas, 221 compras y solo 2 observaciones de precio. **No se supondrá que representa las verificaciones posteriores.** Antes de llevar datos a staging se hará un respaldo nuevo y un manifiesto de cantidades/huellas, sin tocar el origen. La aprobación ya dada para trabajar con precios no se volverá a pedir; se comprobará su evidencia en el entorno funcional.

Crear el proyecto sin facturación permite adelantar el registro y configuración de acceso. Cloud Storage para Firebase requiere Blaze; Firestore solo concede la cuota gratuita a una base por proyecto. Los presupuestos de alerta de Google Cloud no son un tope global de gasto; cualquier activación de Blaze/recursos se revisa primero con Francisco. [Proyecto y app web](https://firebase.google.com/docs/web/setup), [Storage y Blaze](https://firebase.google.com/docs/storage/web/start), [Firestore y bases nombradas](https://firebase.google.com/docs/firestore/manage-databases), [presupuestos](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## Punto de partida comprobado

- [x] Núcleo XML → revisión → producto → ingrediente → observación → catálogo integrado con recetas y menús.
- [x] Trazabilidad del precio por proveedor, SKU y observación; faltantes mantienen el costo no verificable.
- [x] Carga del lote real de agosto en el entorno local. Cargar no equivale a terminar la validación de precios.
- [x] Recuperación local de 326 recetas/platillos sin precios heredados ni vínculos inventados, con respaldos antes y después.
- [x] Respaldo consistente del conjunto actual y restauración aislada comprobados el 5 de octubre: 329 recetas, 221 compras y 2 menús. Registros/revisiones y costos conservados; excluye XML originales y cuentas. Las modificaciones posteriores requieren otra copia; no hay respaldo periódico local.
- [x] Temas claro/oscuro compartidos, preservando el diseño de ambos módulos.
- [x] Regresión de dominio y compilación actualizadas; reglas/servidor y recuperación ejecutados por separado en emuladores aislados. El registro exacto se conserva en `operations.md`. No acredita aceptación de producción ni cierre de IA.

## 1. Cerrar el desarrollo funcional

- [x] **F01 · Rotación de menús.** Historial separado por familia, incluidos extras; regresión del séptimo día corregida. Ventana heredada de `max(duración,15)` selecciones, no promesa de 15 días sin repetir. Catálogo escaso produce advertencias. Evidencia: `tests/menu-rules.test.js` y `docs/functional-rules.md`.
- [ ] **F02 · Paridad de reglas.** Matriz automatizada aprobada para jueves/pozole/tacos dorados de papa, alternancia de domingos, proteínas, omisiones, borradores, sustituciones y acompañamientos. Servidor recalcula avisos/candados y valida días/tipos. **La aceptación de un menú real se hará en staging funcional**, después de cargar los datos elegidos; no bloquea la creación del proyecto ni del entorno de prueba.
- [x] **F03 · Política de precios y XML históricos.** Decisión implementada: bloquear meses anteriores al último aceptado. Fecha real del comprobante; mismo mes permitido; comparación/avance atómicos; rechazo sin nuevas compras ni original almacenado. Pruebas de dominio, concurrencia, HTTP e interfaz aprobadas. Jerarquía: observación validada compatible → fecha de comprobante → fecha de revisión → ID estable. La sesión HTTP antigua debe actualizarse antes de una nueva carga; el cliente impide aparentar una política ausente en servidor.
- [x] **F04 · Costeo integral.** Regresiones contrastadas con cálculo manual para descuentos, unidades, presentaciones, merma, rendimientos, canasta, producción, Grill, porciones, márgenes y exportación. Corregido redondeo intermedio y canasta parcial sin total falso. Evidencia: `tests/costing-regression.test.js` y `docs/functional-rules.md`. La aceptación de parámetros comerciales reales permanece en D04.
- [ ] **F05 · Generación de recetas con IA — requisito de primera publicación.** **Flujo y conexión condicional implementados; OpenAI real desactivado.** Formulario, propuesta, revisión explícita, borrador, validación y roles probados. Los seis ejemplos fijos prueban el recorrido, no la calidad de IA. Transporte Responses, reserva monetaria y conciliación por tokens implementados y probados sin red con Firestore emulado; los saldos se respaldan y recuperan. Hay un trabajo privado para vista previa y conciliación idempotente de reservas inciertas, desactivado por defecto y sin uso cloud. Francisco aprobó el 6 de octubre el piloto GPT-6.1 Sol, tarifas estándar versionadas y topes internos de US$0.15/intento, US$1/usuario-día y US$5/mes; constan en `config/recipe-ai-pilot.policy.json`. Confirmó además US$5/mes como límite estricto del proyecto OpenAI exclusivo: **aprobado, aún no configurado ni verificado**. El backend admite proveedor y política solo si la configuración validada, activación explícita y secreto privado están presentes; el ejemplo mantiene `recipeGeneration.enabled=false`. El texto intermedio de IA vence a los 30 días y los respaldos nuevos lo excluyen; falta activar y aceptar el trabajo periódico en cloud. Faltan secreto/proyecto y comprobación del límite externo, ensayo pagado autorizado, contraste de estimación con cargos y evaluación culinaria. Detalle en `docs/openai-recipe-generator.md`. Sin precios, vínculos ni equivalencias inventados. Generar menús con recetas existentes es una función distinta y ya está implementada.
- [ ] **F06 · Cierre de documentación y pruebas.** Manuales de este corte actualizados y pruebas locales aisladas ejecutadas para dominio, navegador, reglas, roles, concurrencia y recuperación. El cierre final sigue abierto hasta incorporar/probar F05 y aceptar F02; no se declara candidata de producción a esta versión.

**Salida de esta etapa:** F01–F06 aceptados; cualquier reducción de alcance queda escrita, nunca implícita.

## 2. Preparar y aceptar los datos iniciales

- [ ] **D01 · Precios reales.** Francisco ya autorizó continuar con los precios existentes; no repetir esa solicitud. En staging, comprobar los SKU culinarios trasladados, presentación/contenido/unidad, ingrediente, merma y evidencia exacta, y clasificar las excepciones sin inventar precios.
- [ ] **D02 · Recetas utilizables.** Vincular a MiDespensa los ingredientes de las recetas que se usarán al arrancar y revisar porciones, tipo y proteína. Las demás pueden permanecer en catálogo con costo no verificable; no es necesario inventar datos para completar el 100 % del recetario.
- [ ] **D03 · Excepciones recuperadas.** Confirmar gramos por porción de lechuga y arándanos para las tres ensaladas pendientes; revisar Sopes de Chicharrón antes de activarlo; resolver la falta de Menudo si debe participar en la alternancia dominical. Conservar la trazabilidad del duplicado de Pipián consolidado.
- [ ] **D04 · Configuración de negocio.** Francisco confirma líneas/precios de venta, canasta, producción, margen y equivalencias. No presentar valores heredados como ya aprobados.
- [ ] **D05 · Selección y traslado.** Elegir expresamente qué recetas, compras, ingredientes, observaciones y configuración pasan a producción; distinguir pruebas sintéticas de datos reales. Respaldo previo, ensayo en destino aislado, comparación de cantidades/identidades/referencias/costos y aprobación antes de la carga definitiva. No copiar automáticamente bases de aplicaciones anteriores ni de Egresos.

**Salida de esta etapa:** conjunto de datos identificado y respaldado para staging, con cantidades y procedencia verificables. El menú de arranque se crea y comprueba en ese entorno, no antes de disponer de él. Documentar los faltantes permitidos, sin esconderlos.

## 3. Preparar producción propia y persistente

- [ ] **P01 · Proyecto y presupuesto.** Crear primero un proyecto Firebase nuevo y exclusivo de staging, sin sustituir el FORX existente; registrar una aplicación web y Google como proveedor de acceso. Antes de vincular facturación/Blaze, crear Firestore/Storage/Cloud Run o desplegar, revisar servicios, región, volumen de usuarios/XML, presupuesto mensual, alertas y responsables con Francisco. El proyecto de producción se prepara separado después del ensayo.
- [ ] **P02 · Backend de producción.** Arranque cloud/API separados de la demo implementados, bloqueados hasta configuración/aprobación/identidad administrada. Propiedad, mantenimiento, límites y transporte de UI autenticado probados localmente. Faltan configuración/aceptación real y HTTPS. Evidencia: `docs/production-backend.md` y `docs/google-access.md`.
- [ ] **P03 · Identidad y permisos.** Google elegido. Acceso/cierre y panel de usuarios/roles implementados en Administración de MiDespensa: consulta privada, comprobación de UID/correo, confirmación, revisión optimista y desactivación sin borrar datos. Servidor verifica sesiones/membresías/roles y protege último administrador; sin `/session` automática. Recuperación administrativa externa implementada y probada, desactivada por defecto; véase `docs/admin-recovery.md`. Faltan responsables/IAM y aceptación de ese procedimiento, cuentas autorizadas y OAuth reales. No se habilitó cloud. La lista está limitada a 100 miembros y aún no hay visor de auditoría de seguridad.
- [ ] **P04 · XML privados y retención.** Worker con vista previa/confirmación, generaciones, huérfanos, recuperación de fallos y bitácora implementado/probado. Conserva derivados y rechaza prolongación por versiones/soft delete. Entrada programable desactivada. Pendientes bucket/IAM reales, cadencia, activación y aceptación. No se borraron XML del usuario.
- [ ] **P05 · Respaldo y restauración de servidor.** Copia privada verificada y recuperación Firestore → Storage → Firestore vacío probadas con datos sintéticos, sin XML ni permisos. Recuperación reanudable, destino sin API público. Entrada programable desactivada. Pendientes frecuencia/retención, IAM, alertas, objetivos de recuperación, prueba de volumen y ensayo real autorizado.
- [x] **P06a · Avisos de dependencias del corte.** Cero avisos conocidos en auditoría completa después de actualizar `source-map-js` a 1.2.2 el 6 de octubre; lockfile actualizado, Node 24 LTS y control de auditoría en CI. La suite unitaria y build pasan; backend/reglas/recuperación/navegador deberán aprobar otra vez en CI para este commit (sin Java local). Sin excepciones silenciadas; alcances de overrides en `docs/dependency-security.md`. Repetir auditoría antes de cada publicación.
- [ ] **P06 · Seguridad y operación.** Dependencias resueltas en P06a; aún validar secretos, límites, registros sin XML/credenciales, alertas y control de gasto en el entorno real. Probar varios meses de datos y usuarios concurrentes; revisar lecturas completas de colecciones y tiempos de carga.
- [ ] **P07 · Publicación reproducible.** La comprobación local sin red identifica commit, destino, hashes del build/reglas/lockfile y la configuración pública exacta incorporada al navegador. Rechaza un candidato con destinos ficticios, Git sucio, navegador/backend en proyectos u orígenes distintos, Google desactivado, mantenimiento inactivo o política IA distinta de la aprobada. **No despliega ni certifica el entorno externo.** Faltan configuración/secrets reales por entorno, despliegue de backend/reglas/interfaz, comprobaciones y reversión ensayadas. Probar primero en una dirección temporal sin sustituir la URL antigua. Procedimiento: `docs/release-operations.md`.

**Salida de esta etapa:** staging funcional con datos autorizados, menú real creado y revisado allí, recuperación demostrada y presupuesto aprobado. Emuladores apagables no son producción.

## 4. Sustituir el acceso en la URL de FORX

- [ ] **U01 · Determinar destino de la URL confirmada.** La URL ya está aprobada: `https://menu-cicsa.cicsacomedores.com.mx`. Falta inventariar únicamente dominio/subdominio, hosting y recursos propios de FORX/MiDespensa autorizados. Determinar si se reutiliza el hosting o cambia el destino del dominio; no asumir que haya que cambiar DNS ni borrar un proyecto entero.
- [ ] **U02 · Preparar el cambio.** Guardar versión/configuración anterior y preparar dominio, HTTPS, rutas, orígenes permitidos y callbacks de autenticación que requiera el destino. Comprobar caché y navegadores con la app anterior abierta; nunca reutilizar silenciosamente almacenamiento legado.
- [ ] **U03 · Autorizar y ejecutar la ventana.** Acordar momento, respaldo final y responsable. Evitar dos aplicaciones escribiendo datos en paralelo. Publicar la versión aceptada y hacer que la URL habitual entregue la aplicación integrada.
- [ ] **U04 · Aceptación en la URL final.** Verificar acceso real y roles, una carga controlada, revisión, precio, receta, menú, exportación, reapertura desde otro equipo, respaldo y alertas. El cambio de dominio exitoso no basta: Francisco confirma que la aplicación está pública y operacional. Pública significa accesible por su URL, no datos sin autenticación.
- [ ] **U05 · Estabilización y reversión.** Acordar una ventana de observación antes del retiro definitivo. Preservar artefactos para recuperar el servicio sin perder escrituras nuevas; si es necesario revertir la interfaz, no reconectar por defecto un backend antiguo incompatible ni sustituir datos nuevos por una copia vieja. Registrar el procedimiento de mantenimiento/recuperación y ensayarlo.

**Salida de esta etapa:** nueva aplicación aceptada en la URL de FORX y ventana de estabilización cerrada. Hasta entonces no se desmantela lo anterior.

## 5. Retirar FORX anterior y staging legado de MiDespensa

- [ ] **R01 · Inventario exacto y propiedad.** Identificar deployments, funciones, tareas, cuentas de servicio, secretos, buckets, bases y dominios que pertenezcan exclusivamente a las aplicaciones retiradas. No inspeccionar servicios de Egresos. Si un recurso parece compartido o de propiedad incierta, excluirlo del retiro y detener esa acción hasta aclararlo.
- [ ] **R02 · Resguardo final.** Guardar código versionado, configuraciones recuperables y datos cuya conservación se haya aprobado; probar que el respaldo abre/restaura. No versionar secretos ni XML reales en Git. Respetar vencimientos de originales y política de retención aprobada.
- [ ] **R03 · Desactivar de forma reversible.** Deshabilitar publicación automática y procesos exclusivos del legado que ya no deban escribir o generar costos. Mantener el dominio y cualquier recurso que sostenga la aplicación nueva. Preferir archivo del repositorio a su eliminación.
- [ ] **R04 · Retiro definitivo autorizado.** Presentar a Francisco la lista exacta de recursos a eliminar, qué contienen, qué respaldo existe y qué no será recuperable; obtener confirmación específica antes de borrar datos/recursos. La decisión de retirar las apps después del reemplazo no permite borrar ahora ni elimina este control.
- [ ] **R05 · Comprobación posterior.** Verificar que la URL, autenticación, datos, retención, respaldos y alertas de la aplicación nueva siguen funcionando. Confirmar que los recursos exclusivos retirados ya no ejecutan trabajos ni generan cargos y registrar lo conservado, archivado y eliminado.

**Salida final:** una sola aplicación operativa en la URL habitual, sin servicios activos exclusivos del FORX anterior ni del staging legado que debieran haberse retirado, y sin tocar Egresos ni recursos compartidos.

## Decisiones que sí requieren respuesta de Francisco

La URL, el bloqueo de XML antiguos, OpenAI, el flujo de propuesta/revisión, Google como proveedor de acceso y la inclusión de IA real en la primera publicación ya quedaron confirmados; no requieren otra respuesta.

1. Acordar reglas culinarias por tipo; confirmar cuenta/proyecto OpenAI y procedimiento de conciliación antes de activar consumo real. La retención de texto intermedio de 30 días, modelo, tarifas, topes internos y límite estricto externo de US$5/mes ya están aprobados; el límite externo y el trabajo periódico todavía deben configurarse y comprobarse.
2. En staging funcional, crear y aceptar un menú real y confirmar los parámetros de negocio (F02/D02/D04); no exigirlo antes de habilitar el entorno.
3. Antes de activar facturación o desplegar: proyecto/cuenta, usuarios/roles iniciales, servicios, presupuesto y recuperación esperada.
4. Antes de trasladar a producción o cambiar la URL: conjunto de datos y pruebas de staging aceptados, y ventana de cambio/estabilización.
5. Antes de eliminar: aprobación sobre el inventario exacto de recursos exclusivos y sus respaldos.

## Seguimiento

Correcciones de auditoría: entradas decimales acotadas preservando fracciones
recuperadas; reintento de originales sin renovar retención; XML grandes atómicos
con fallos deterministas aislados; menú independiente del tamaño total del
recetario; Consulta sin snapshot privado ni controles de escritura.
Quedan abiertos F05, aceptación funcional/datos y todos
los criterios cloud/publicación que no tengan aceptación específica.

Marcar una casilla solo con evidencia de su criterio de aceptación: commit, prueba, acta o aprobación. Registrar excepciones junto a su identificador. Esta lista prevalece sobre los textos históricos de fase para decidir si se puede liberar; no reemplaza el contrato de datos ni autoriza acciones externas por sí misma.

Registro de este corte: reglas de menús/costeo/XML corregidas y probadas; flujo aprobado del generador implementado y probado con simulador en entorno independiente. No se reinició el servidor HTTP compartido ni sus emuladores, ni se modificaron los datos cargados. **Sin despliegue, DNS, migración de datos actuales, facturación, llamadas de IA ni desmantelamiento.**
