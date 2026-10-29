# Prepublicación y conciliación privada de IA

Este procedimiento prepara evidencia local y una operación técnica controlada.
No autoriza cloud, facturación, llamadas pagadas, migraciones ni despliegues.
La URL anterior permanece intacta hasta aceptar la aplicación nueva en un
destino temporal. No consultar ni usar Egresos.

## Artefacto reproducible, sin red

En un checkout limpio de un commit concreto, usar Node 24, `npm ci`, auditoría
completa, `npm run check`, `npm run test:rules`, `npm run test:recovery`,
`npm run test:backend` y `npm run test:e2e`. CI ejecuta esas puertas; comprobar
su resultado para el mismo commit. La auditoría requiere acceso al registro npm;
si no está disponible, no interpretarla como aprobada.
La prueba de navegador usa un servidor propio en `127.0.0.1:4184` (o el puerto
`FORX_E2E_PORT` indicado) y rechaza un puerto ocupado; no reutiliza la sesión
local abierta. Dejar sin definir `FORX_E2E_SERVER`, `FORX_E2E_READONLY_PORT` y
`FORX_LEGACY_BACKUP` en el pase aislado. Las pruebas opt-in de servidor existente
se planifican por separado y solo permiten comandos de lectura.

`FORX_CONFIG_PATH=config/deployment.example.json npm run release:preflight -- --example`
solo comprueba el ejemplo local y emite hashes de `dist`, reglas, lockfile,
política IA y configuración, junto con el commit. Reporta `candidate:false`.
Para un candidato, usar `--candidate` con el archivo de configuración real y
y `FORX_CLIENT_CONFIG_PATH` con la configuración pública exacta del navegador,
ambos fuera de Git y sin secretos privados. Exige Node 24, repite pruebas
unitarias y compila inyectando ese archivo (no una variable heredada),
y exige Git limpio, destinos no ficticios, Google, retención de XML y texto de IA, y
respaldo aprobados, la política IA exacta del piloto y coincidencia de
entorno/proyecto/origen de la aplicación y de la API entre navegador y backend. El manifiesto incluye la
huella de la configuración pública y los orígenes de aplicación y API.
En producción también
exige el origen `https://menu-cicsa.cicsacomedores.com.mx`. El manifiesto lleva
`deployed:false` y una lista de verificaciones externas pendientes; jamás
publica por sí mismo. Guardar ese manifiesto con la revisión del candidato.

Antes de desplegar: confirmar proyecto/cuenta/IAM propios, presupuesto y alertas,
secreto OpenAI privado, límite estricto mensual de US$5 del proyecto OpenAI,
OAuth y dominios, reglas/buckets/HTTPS, selección de datos y respaldo. Ensayar
en una URL temporal, comprobar acceso, XML, precio, receta, menú, exportación,
respaldo/restauración y reversión. Solo después proponer la ventana de cambio
de la URL habitual. El límite estricto de OpenAI puede aplicarse con retraso;
el gasto registrado podría superar ligeramente US$5.
[OpenAI Docs: límites de gasto](https://developers.openai.com/api/docs/guides/spend-limits).

## Reservas OpenAI inciertas

No asumir costo cero tras timeout, rechazo o respuesta incompleta. Comparar la
solicitud con el uso/costo del proyecto exclusivo de OpenAI y conservar la
evidencia verificable fuera de Git. La conciliación solo admite uso confirmado
con modelo/tokens/modo correctos o evidencia de ausencia de cargo. La
estimación de FORX no sustituye el cargo del proveedor. Nunca generar otra
receta para intentar conciliar una reserva.

`npm run job:recipe-budget -- status` lista solo ID, estado, modelo, fecha y
reserva, sin texto culinario. `preview --evidence ARCHIVO --out PLAN` crea un
plan privado de 15 minutos con reserva e importe estimado en nanoUSD;
`apply --plan PLAN --confirm DIGEST` verifica destino, revisión, aprobación e
importes antes de actualizar saldo y bitácora.
La repetición del mismo plan/evidencia es idempotente; una divergencia se
rechaza. Evidencia y plan deben estar fuera del repositorio y ser legibles
únicamente por su propietario (modo 0600). Ejemplo de contenido de evidencia
para cargo confirmado, con identificadores ficticios:

```json
{
  "generationRequestId": "gen_<64 caracteres hexadecimales>",
  "evidenceRef": "billing-ticket-2026-10-001",
  "usage": {
    "inputTokens": 100,
    "cachedInputTokens": 20,
    "cacheWriteTokens": 0,
    "outputTokens": 200,
    "reasoningTokens": 30,
    "totalTokens": 300
  },
  "model": "gpt-6.1-sol",
  "serviceTier": "default",
  "responseId": "resp_ejemplo"
}
```

Para ausencia comprobada de cargo, sustituir `usage` por `"noCharge":true`;
conservar `evidenceRef` y `serviceTier`. No colocar claves ni respuesta cruda
del proveedor en el archivo. El trabajo exige un Cloud Run Job separado del
API, con IAM propio, `CLOUD_RUN_JOB` igual al `jobName` aprobado,
`FORX_RECIPE_BUDGET_TARGET=proyecto/base`, `FORX_ENABLE_CLOUD=true` y
`FORX_APPROVED_TARGET=proyecto/base`. Además, la configuración no secreta
`recipeBudgetReconciliation` debe tener `enabled:true`, `jobName`, `approvedBy`,
`approvedAt` y `expiresAt` dentro de una ventana máxima de una hora. El ejemplo
queda `enabled:false`. El trabajo no necesita la clave OpenAI ni abre un
transporte de generación. Aún no se creó el Job ni se validó su IAM real.

Francisco aprobó 30 días exactos desde `requestedAt` para el texto intermedio
de solicitudes y propuestas de IA. El trabajo privado
`generation-text-preview` / `generation-text-apply` depura `context` y
`proposal` al vencer, con plan de 15 minutos, destino, revisión y huella del
contenido. Conserva ID, estado, cuota, reserva/costo estimado, vínculo a
receta y bitácora; la receta guardada y sus versiones no se depuran. Una
propuesta no guardada que vence deja de poder abrirse o convertirse en receta.
Una reserva incierta sigue pendiente de conciliación, nunca se reintenta por
haber perdido el texto. El trabajo `scheduled-generation-text` requiere
`maintenance.generationTextRetentionEnabled`, responsable y aprobación; el
ejemplo permanece desactivado. No se creó scheduler ni IAM real. La vista
previa se detiene si hay más de 500 registros vencidos; hay que implementar
paginación antes de operar a mayor escala.

Los respaldos nuevos son versión 3 y excluyen todo el texto intermedio de IA
desde su creación, incluso antes de los 30 días, para que un respaldo duradero
no prolongue su retención. Conservan el ledger y las recetas guardadas. Las
versiones 1 y 2 siguen siendo legibles para recuperación aislada, pero una
versión 2 puede contener texto antiguo: revisar su disposición y ejecutar la
depuración antes de exponer una recuperación. No se han borrado respaldos
históricos ni datos actuales.
