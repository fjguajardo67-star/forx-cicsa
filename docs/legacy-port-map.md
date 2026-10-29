# Mapa de extracción del FORX legado

Inspección de solo lectura en `menu-cicsa`, commit `a274255`.
No se modificó su archivo local sin rastrear `ARQUITECTURA_BD.md`.
El contrato v2 prevalece sobre las propuestas antiguas de datos.

| Lógica a portar después | Referencia local del legado |
| --- | --- |
| Tipos de receta y código estable | TIPOS_RECETA, COD_PREFIJO, siguienteCodigo |
| Costo por cantidad y unidad | costoIngrediente, _costoIngredienteBruto |
| Rendimiento seco/servido | rendimientoDe; COSTEO.md §4.5 |
| Canasta de complementos | costoComplementos; COSTEO.md §4.3 |
| Costo total diario y bandas de margen | semaforoDia, umbralesSemaforo; COSTEO.md §4.4 y §5 |
| Tope por platillo | calcularTopeCostoPlatillo; COSTEO.md §8b |
| Rotación y restricciones del menú | genMenu; jueves y domingos |
| Listas, impresiones y libro | genLista, imprimirMenu, imprimirRA, exportarLibro |

La suite heredada falla al no extraer `_costoIngredienteBruto` y
`rendimientoDe`; debe reconstruirse como regresiones de módulos puros. Además,
una llamada de prueba pasa seis argumentos a una fórmula que recibe cinco.
No se debe copiar esa suite como prueba verde de las fórmulas.

No portar la obtención de precios por nombre, las llamadas de IA con clave en
navegador, documentos monolíticos ni referencias de infraestructura anterior.

## Contrato de recetas que la siguiente fase deberá probar

Una receta con cantidad/unidad válidas y un nombre todavía ausente del catálogo
se guarda con `ingredientId: null`, aparece en el catálogo y puede elegirse
para un menú. Mantiene el texto capturado; no se le inventan ID, precio ni
equivalencia. La receta y el menú muestran faltantes, costo no verificable y
ningún semáforo verificado. Vincular posteriormente el ingrediente recalcula
el estado de la misma receta. La merma ya incorporada al precio usable no se
aplica otra vez; el rendimiento seco/servido es una política distinta y explícita.

Esta fase todavía no implementa captura, importación o generación de recetas,
menús, IA ni exportaciones.
