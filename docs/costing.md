# Costeo integrado

Referencia funcional: COSTEO.md y fórmulas del FORX original a274255.
La configuración heredada se muestra sin confirmar: no habilita un costo de menú
verificado hasta que el administrador revise líneas y canasta.

## Reglas conservadas y explicitadas

- Precio culinario por kg/l/pz: observación vigente validada por MiDespensa.
- Precio interno con precisión decimal completa; los cuatro decimales de
  `normalizedPrice` son de presentación. `calculationPrice` se deriva de la
  evidencia `priceBasis` cuando existe, también para observaciones antiguas,
  sin reescribirlas. El transporte de cocina conserva esa precisión.
- La merma ya forma parte del precio aprovechable. La receta no la carga otra vez.
- Masa convierte g/kg; volumen ml/l; piezas quedan piezas.
- Pieza → kg solo con gramos por pieza y fuente confirmados en ese renglón.
  No existe densidad implícita kg/l ni peso inferido por nombre.
- Rendimiento servido/seco requiere nota; por defecto 1, sin ajuste.
  Arroz/frijol 2.5 provienen de COSTEO.md y se muestran para confirmar.
- Costo de receta = suma de renglones / porciones base.
- Canasta de complementos y producción se agregan una sola vez al día.
  Guisados 1/2 y garnacha son los tres espacios cobrados según FORX.
  Las recetas de acompañamiento no se cobran nuevamente: las cubre la canasta,
  pero sus pendientes sí impiden mostrar el día como verificado.
- Grill = materia prima / base + desechables / base + producción por platillo.
  No recibe nuevamente producción global de comida.
- Margen = (venta − costo) / venta. Verde desde objetivo, amarillo desde dos
  tercios del objetivo, naranja desde cero, rojo por debajo.
- Tope = (venta × (1 − margen objetivo) − producción − canasta) / porciones
  por platillo. No aparece si configuración o canasta siguen pendientes.

Un ingrediente ausente, no vinculado, sin precio vigente, incompatible o una
receta sin ingredientes deja total en null: nunca se sustituye por cero.
El editor puede mostrar subtotal conocido, etiquetado como no total.
Un precio manual provisional no acredita costo verificado.
Una canasta incompleta devuelve total no verificable y un subtotal conocido
separado. Cantidades, rendimientos o precios inválidos tampoco acreditan costos.

Las compras multiplican por comensales/base. La cantidad a comprar divide una
vez por rendimiento de merma del ingrediente. Costos y cantidades se distinguen.
Los documentos incluyen faltantes y emplean el costeo actual, no un cierre
histórico. Las versiones guardan la receta, no congelan precios.

Regresiones y cálculos de referencia: `tests/costing-regression.test.js`,
`tests/kitchen.test.js` y `tests/kitchen-exports.test.js`. Incluyen neto de $720
sobre 21.6 kg aprovechables, canasta/producción una vez, Grill con base múltiple,
unidades, fronteras del margen, tope negativo y propagación de faltantes.
