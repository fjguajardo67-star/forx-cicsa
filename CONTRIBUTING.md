# Colaborar en FORX v2

Trabajar en rama y worktree aislados. Este corte parte de main en 7c6d838;
conservar intactos los checkouts anteriores y sus datos.

Antes de entregar: `npm run check`, `npm run test:e2e` y `npm run test:rules`
(Java 21). Solo fixtures sintéticas versionadas; nunca XML reales, claves ni
datos de navegador. El proyecto ficticio permitido es `demo-forx-v2`.

No hay comando de despliegue. No crear recursos cloud ni cambiar facturación
sin revisión de alcance y presupuesto con el usuario. Toda migración futura
requiere respaldo y autorización específica.

Los cambios de dominio llevan pruebas de comportamiento. El parser y la
normalización existentes se reutilizan; las observaciones nunca se sobrescriben.
Recetas incompletas deben poder existir y usarse, con costo no verificable.
