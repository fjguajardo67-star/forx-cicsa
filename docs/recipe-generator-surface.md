# Generar receta — extensión aprobada

Modo Operate. Francisco aprobó el flujo propuesta → revisión → borrador, primero
con respuestas simuladas sin consumo. Se extiende la ruta existente, no se
rediseña FORX ni se crea un chat. Referencia: interfaz actual, sistema en
`forx-design-continuity.md` y diseño funcional en `openai-recipe-generator.md`.

## Direction contract

THESIS: Proponer no equivale a guardar, activar ni acreditar costo. El simulador
se identifica antes de solicitar y también en la propuesta y receta guardada.

OWN-WORLD: Barra, temas Plex, superficies marinas/claras y controles FORX
existentes. Botón ámbar para generar/revisar, secundarios para recuperar estado.

STORY: Capturar idea, tipo, porciones y restricciones; elegir preferencias;
solicitar ejemplo; inspeccionar ingredientes y faltantes; revisar en el editor.

FIRST VIEWPORT: Título y estado del proveedor arriba; formulario compacto debajo,
ayuda de privacidad junto al envío. La propuesta aparece debajo, con cantidades,
advertencias y acción explícita. Móvil apila campos sin perder controles.

FORM: Extensión precisa del sistema actual, aprobada. Seed no aplica.
Interacción central: pasar una propuesta validada al mismo editor sin guardado
automático, con vínculos pendientes y costo no verificable.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

No nuevas imágenes ni tokens. Errores quedan junto al envío y conservan campos.
Consulta de estado nunca repite generación. Recargar/navegar advierte sobre la
captura no guardada. Activación OpenAI real permanece fuera de este corte.
