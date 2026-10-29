# FORX v2 · MiDespensa integrado

Repositorio de publicación: `fjguajardo67-star/forx-cicsa`. Acceso final:
`https://menu-cicsa.cicsacomedores.com.mx`. La rama integrada conserva el CNAME,
pero no sustituye la versión anterior hasta verificar el backend y los datos.
Preparación y estado del reemplazo: [transición a producción](docs/production-transition.md).

Una aplicación, dos módulos conservados: MiDespensa administra XML, productos,
ingredientes y precios; FORX utiliza ese mismo catálogo para recetas y menús.
No hay publicación entre aplicaciones ni proveedor externo de productos/precios.

Estado y salida a producción: [lista de pendientes y aceptación](docs/production-checklist.md).
La nueva aplicación conservará la URL de FORX; el FORX anterior y el staging
legado de MiDespensa se retirarán solo después de la aceptación del reemplazo.
Todavía no hay autorización para desplegar, cambiar dominios ni eliminar recursos.

Corte del 5 de octubre: [base de backend de producción](docs/production-backend.md)
implementada y ensayada localmente: acceso/roles, API sin cuenta demo, retención,
respaldo y recuperación de servidor. Transporte de UI y Google implementados,
**sin activar infraestructura real**; requiere aprobación y aceptación cloud.
La revisión local posterior identificó cinco hallazgos ya corregidos y probados.
El corte de [seguridad de dependencias](docs/dependency-security.md) deja la
auditoría npm completa y de ejecución sin avisos conocidos. No sustituye la
aceptación de seguridad e infraestructura reales.

Corte funcional del 4 de octubre: [reglas y evidencia](docs/functional-rules.md)
y [diseño del generador OpenAI](docs/openai-recipe-generator.md). Menús, costeo y
bloqueo de XML históricos corregidos y probados; generador implementado con
simulador explícito y conexión de producción condicionada, **OpenAI real aún
desactivado y requerido para la primera publicación**. Antes
de otra carga en una sesión emulada ya abierta, actualizar solo el HTTP siguiendo
`docs/operations.md`; no reiniciar los emuladores que contienen los datos locales.

Base MiDespensa `7c6d838`; pantallas, recetas base y reglas de FORX `a274255`.
El prototipo reducido permanece en `02080c8`, no es la referencia visual.

## Ejecutar sin servicios

Usar Node 24 LTS (`.nvmrc`; CI usa la misma rama). Node 26 del sistema no es
el runtime homologado del CLI. No hace falta reemplazarlo globalmente: selecciona
24 con tu gestor de versiones antes de estos comandos.

```sh
npm ci
npm run audit:dependencies
npm run dev -- --port 4174 --strictPort
```

Abrir http://127.0.0.1:4174. IndexedDB `forx-v2-local` guarda registros por
entidad. La versión 2 añade recetas/menús y la 3 solicitudes/cuotas sin borrar
ni reescribir los registros existentes.
No lee ni migra bases de las aplicaciones originales.

Para probar exclusivamente el flujo del generador, abrir
`http://127.0.0.1:4174/?backend=indexeddb&recipeGenerator=simulated#/forx/generar`.
Usa la base independiente `forx-v2-simulation`, con seis ejemplos fijos por tipo,
sin interpretar la idea/restricciones ni enviar nada a OpenAI. No cambia los datos
del servidor compartido. Propuesta → revisión en editor → guardar borrador;
ningún precio o vínculo se inventa. Instrucciones en `docs/user-guide.md`.

## Ejecutar con servidor demo

En otra terminal, con Java 21 disponible en PATH:

```sh
npm run dev:server
```

Abrir http://127.0.0.1:4174/?backend=emulator. La interfaz es la misma.
Comandos HTTP en 127.0.0.1:8787; Auth, Firestore y Storage exclusivamente en
emuladores de `demo-forx-v2`. Sesión sintética de administrador; no es acceso
multiusuario de producción. El servidor rechaza otros proyectos y hosts.
Los emuladores son efímeros: detenerlos pierde sus datos sintéticos.
Nunca usar este modo como respaldo único.

## Verificar

```sh
npm run check
npm run test:e2e
npm run test:rules
npm run test:recovery
npm run test:backend
```

Playwright abre su propio Vite en `127.0.0.1:4184` y falla si el puerto está
ocupado; nunca reutiliza una sesión existente. Se puede elegir otro puerto
libre con `FORX_E2E_PORT=4185 npm run test:e2e`. La suite normal usa datos
sintéticos del navegador y omite pruebas opt-in contra un servidor existente.

`test:rules` inicia emuladores con Java 21 y ejecuta reglas, autenticación,
HTTP, concurrencia y una carga de 32 XML. `test:recovery` verifica respaldo y
recuperación. Ejecutar estas dos suites en secuencia: comparten puertos de prueba.
Ambas usan puertos distintos de la demo y **carpetas temporales privadas por
ejecución**; no afectan a `dev:server`. `test:backend` usa el mismo aislamiento
y se ejecuta después de las otras suites, nunca en paralelo con ellas.
La suite normal omite los casos
dependientes de emuladores. No ejecutar directamente Firebase CLI con temporales
compartidos: distintos puertos no aíslan los archivos de Storage.
Con un servidor demo recién iniciado, `FORX_E2E_SERVER=1 npm run test:e2e --
tests/e2e/forx.spec.js` verifica el recorrido completo contra el servidor.
Las pruebas crean únicamente XML/recetas sintéticos.
La recuperación parcial de servicios y las protecciones de las suites están en
`docs/operations.md`. No reutilizar los emuladores abiertos para limpiar fixtures.

## Incluido

- UI de MiDespensa: cola por proveedor/SKU, evidencia, clasificación, categorías,
  presentación, vínculo, merma, precio validado y bitácora.
- UI FORX heredada: navegación, menú, catálogo, captura manual/estructurada,
  lotes, Grill Express, precios internos y configuración.
- Recetas por ID, códigos, versiones inmutables, edición, omisión y archivo.
  Las 40 recetas del código original se agregan solo mediante acción explícita,
  sin sus antiguos precios ni vínculos inventados.
- Guardar y usar recetas incompletas está permitido. Un ingrediente no vinculado,
  sin precio vigente o con unidad incompatible impide verificar receta y menú.
- Menús guardados, días reales, restricciones y sustitución, compras escaladas,
  Excel, CSV, documentos HTML imprimibles y respaldo JSON de recetas/menús.
- Autorización en servidor, precios recalculados allí y revisión optimista por
  entidad; XML en Storage privado, sin bytes en Firestore.
- Reglas explícitas de sugerencia de categoría, simulador y conflictos visibles;
  nunca crean ingredientes ni validan precios por sí solas.
- Respaldo completo de registros derivados desde Administración y recuperación
  en una copia local independiente, sin sobrescribir la instancia de origen.
- Generador: revisión obligatoria, borrador, procedencia, roles, límites
  atómicos y consulta de estado sin repetir solicitudes. Contrato, transporte
  y conexión condicional a OpenAI probados sin red; no hay gasto real habilitado.

## No incluido ni activado

Acceso Google implementado, todavía sin activar: `docs/google-access.md`.
La compilación pública exige configuración aprobada y sesión autorizada; sin
ella queda cerrada, no abre IndexedDB ni sesiones demo. Vite local conserva los
modos actuales; `?authPreview=1` muestra el acceso con cuenta ficticia y datos en
memoria, sin tocar las compras/recetas del usuario. Usuarios y roles ya está en
Administración de MiDespensa; UID `preview-new` para el ensayo. Falta configurar
cuentas reales y aceptar la recuperación administrativa en infraestructura real.
El [procedimiento técnico externo](docs/admin-recovery.md) ya está implementado
y probado localmente; no añade una ruta pública ni una contraseña maestra.

Se puede continuar verificando productos/recetas en la URL de trabajo emulada.
`npm run backup:local -- DIRECTORIO_NUEVO_FUERA_DEL_REPOSITORIO` captura el servidor
8788 y verifica una restauración aislada en memoria, sin modificarlo. No reiniciar
los emuladores ni usar `authPreview=1` para el trabajo sobre datos reales.

IA real, proyecto cloud, usuarios reales, despliegue y facturación. La retención de
dos meses está implementada para IndexedDB y para el worker privado de Storage;
el worker y su entrada programable están probados con datos sintéticos, no activados.
El respaldo completo excluye XML originales y credenciales. No hay restauración
al servidor desde la UI ni sincronización de una copia recuperada hacia él. Existe
una herramienta de servidor para restaurar exclusivamente a una base recovery
vacía, sin activarla como producción. El JSON anterior
de FORX → Exportar sigue siendo una exportación parcial, no recuperable aquí.
Ya se cargó un lote real de agosto y se recuperaron 326 recetas/platillos en el
entorno local, sin precios heredados. Eso no acredita aceptación integral: falta
verificar precios, completar vínculos y cerrar las reglas/pruebas de liberación.
No hubo traslado a producción ni sustitución de los sistemas anteriores.

Detalles: `docs/user-guide.md`, `docs/architecture.md`, `docs/data-model.md`,
`docs/costing.md`, `docs/operations.md`, `docs/ui-continuity.md` y
`docs/forx-design-continuity.md`.
