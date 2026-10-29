# Dependencias: cierre de avisos del 5 de octubre de 2026

## Resultado y alcance

La consulta inicial a npm reportó 21 entradas (8 moderadas, 12 altas y 1 crítica).
Incluía propagaciones por dependencias: no eran 21 fallos independientes.
El árbol actualizado devuelve **cero avisos conocidos** en la auditoría completa
y con `npm audit --omit=dev`. No se ocultaron avisos, excluyeron paquetes del
control completo ni aplicaron `audit fix --force` o downgrades sugeridos.
Eso no certifica ausencia de vulnerabilidades desconocidas ni autoriza publicar.

## Versiones y sustituciones controladas

- Firebase CLI 14.27.0 → 15.32.1: actualiza, entre otras, las rutas vulnerables
  de tar, csv-parse y stream-json.
- Vitest 3.2.7 → 4.1.11: parche de acceso arbitrario a archivos en su mocker.
  Se mantiene Vite 7.3.6 y se ejecuta la batería sin cambiar sus aserciones.
- Firebase web 12.19.0 y Admin 14.5.0 permanecen. No se degrada Firebase a 9.x.

Cinco sustituciones transitivas explícitas en `package.json`, con lockfile:

| Consumidor | Versión seleccionada | Razón |
|---|---|---|
| @firebase/firestore → @grpc/grpc-js | 1.14.5 | Parche de autenticación/error gRPC; el SDK fijaba ~1.9.0. |
| gaxios 6.7.1 → uuid | 11.1.1 | Corrige límites de buffer, conserva CommonJS y v4 usada para multipart. |
| firebase-tools → chokidar | 4.0.3 | Retira braces, cuyo último 3.0.3 aún no tiene parche publicado. |
| firebase-tools → @google-cloud/pubsub | 6.1.0 | Adopta el cliente que requiere OpenTelemetry Core corregido. |
| get-uri → basic-ftp | 6.2.2 | Parche del analizador de listados FTP; conserva API consumida por get-uri. |

Los overrides cruzan rangos fijados por sus consumidores. No basta con un audit
limpio: `tests/dependency-compatibility.test.js` verifica resolución, CommonJS,
API transitiva y cambios de reglas en rutas literales. Se complementa con SDK,
HTTP, reglas y almacenamiento emulados. No sustituye ensayos cloud.

Chokidar 4 no expande globs. FORX arranca únicamente Auth, Firestore y Storage
con rutas literales, cubiertas por pruebas. NO queda certificado el watcher de
Cloud Functions ni sus exclusiones glob heredadas; tampoco FTP remoto o Pub/Sub
cloud, que FORX no utiliza. Si se añaden esos usos, hay que reevaluar el override
antes de habilitarlos. No se alteraron dependencias instaladas a mano ni se
crearon versiones falsas para ocultar un aviso.

## Runtime y repetibilidad

- Node 24 LTS en `.nvmrc` y en CI; pruebas locales con Node 24.19.0.
- `engines` admite Node 22.12+ de la rama 22 o la rama 24. Node 26 del sistema
  no es la referencia de publicación: superstatic del CLI aún no lo admite.
- No se cambió el Node global ni se reiniciaron HTTP/Vite/emuladores del usuario.
- Usar `npm ci` con el lockfile; la instalación de este corte se realizó con
  scripts de instalación desactivados. Se verificó `npm ci --dry-run`.
- CI ejecuta `npm run audit:dependencies` después de instalar. Cualquier aviso
  desde nivel bajo, o un fallo del servicio de auditoría, impide continuar.
  El workflow se editó localmente: no hubo push ni ejecución en GitHub Actions.

## Evidencia

- `npm run check`: 244 aprobadas, 24 omitidas que requieren emuladores, build correcto.
- Backend: 10; reglas/HTTP: 16; recuperación: 1 aprobadas. Cubren las 24 omitidas
  con tres casos comunes repetidos; puertos 8188/9098/9298 y temporales privados.
- Firestore de pruebas pasó a 1.22.0 al actualizar el CLI. Firebase renovó su
  caché descargable; no se borraron XML ni bases del usuario.
- Las pruebas nuevas verifican cuatro contratos de compatibilidad.
- La regresión de navegador se registra en `operations.md`.

Ninguna de estas pruebas escribió en la base compartida. Los procesos de
Firestore 8180, HTTP 8788 y Auth/Storage 9099/9299 permanecieron activos.
No se consultó Egresos, activó cloud ni modificó facturación.

## Mantenimiento

Antes de cada candidato de publicación: `npm ci`, `npm run audit:dependencies`,
`npm run check`, suites aisladas de seguridad/recuperación y navegador.
Si un consumidor incorpora el parche, retirar su override en un cambio separado
y repetir las pruebas. No perpetuar excepciones ni ignorar avisos nuevos.
El cierre de dependencias no cierra aceptación funcional, OpenAI real ni
configuración, presupuesto y aceptación de infraestructura.

Fuentes del proveedor consultadas:

- [Firebase CLI 15.32.1](https://github.com/firebase/firebase-tools/releases/tag/v15.32.1).
- [Aviso de Vitest](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9).
- [Aviso de gRPC](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j).
- [Aviso de UUID](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
- [Basic FTP 6.2.2](https://github.com/patrickjuchli/basic-ftp/releases/tag/v6.2.2).
- Metadatos y avisos vigentes del registro npm; versiones exactas en package-lock.json.

## Revisión adicional del 6 de octubre de 2026

Una nueva consulta de `npm audit --audit-level=low` detectó un aviso alto en
`source-map-js` 1.2.1 (GHSA-68fv-2mgg-jv7q), dependencia transitiva de
PostCSS/Vite y css-tree/jsdom. Ambos consumidores aceptan `^1.2.1`; el
lockfile se actualizó **solo** a 1.2.2, versión corregida, sin override ni
cambio de dependencias directas. `npm ci --ignore-scripts` con Node 24.19.0,
auditoría completa y 304 pruebas/compilación aprobaron; la auditoría devuelve
cero avisos conocidos en este corte. Repetirla antes de publicar, pues el
registro puede cambiar. La suite de emuladores local no se ejecutó de nuevo:
este equipo no tiene Java; CI provisiona Java 21 y debe aprobar para el mismo
commit.

[Aviso y versión corregida](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
# Actualización — 29 de octubre de 2026

La revisión detectó 11 paquetes con avisos en el lockfile anterior, incluido
`re2js@2.8.6` en el árbol de producción. Se actualizaron dependencias transitivas
compatibles y Vitest a 4.1.12; Vite quedó en 7.3.7. La auditoría posterior reporta
cero vulnerabilidades. No se usó `--force` ni se alteraron paquetes manualmente.
Las verificaciones de este corte se ejecutan con Node 24.22.1 y Java 21.
Los resultados siguientes corresponden a los cortes históricos anteriores.
