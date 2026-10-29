import Decimal from 'decimal.js';
import { SIMULATION_NOTICE } from './recipe-proposal.js';

// Deliberately authored fixtures, NOT a culinary model. They never consult a
// network, prices or supplier records. The UI and persisted provenance say so.
const fixtures={
  guisado:{name:'Ejemplo simulado: pollo con calabacita',protein:'Pollo',minutes:40,lines:[['Pollo',150,'g'],['Calabacita',100,'g'],['Jitomate',60,'g'],['Aceite',5,'ml']],steps:['Limpiar y preparar los ingredientes con separación entre crudos y cocidos.','Cocinar el pollo y las verduras hasta cocción completa; comprobar el punto conforme al procedimiento de cocina.','Porcionar y revisar el rendimiento antes de usar la receta.']},
  garnacha:{name:'Ejemplo simulado: tostada de frijol',protein:'Sin proteína',minutes:25,lines:[['Tostada',2,'pz'],['Frijol cocido',120,'g'],['Lechuga',30,'g']],steps:['Lavar y desinfectar la lechuga conforme al procedimiento de cocina.','Calentar el frijol cocido y repartir sobre las tostadas.','Añadir lechuga y servir; revisar porción y rendimiento.']},
  guarnicion:{name:'Ejemplo simulado: arroz con zanahoria',protein:'',minutes:30,lines:[['Arroz',35,'g'],['Zanahoria',20,'g'],['Agua',90,'ml']],steps:['Lavar y preparar la zanahoria.','Cocer el arroz con agua y zanahoria hasta estar listo.','Medir el rendimiento y revisar las porciones.']},
  postre:{name:'Ejemplo simulado: manzana cocida',protein:'',minutes:25,lines:[['Manzana',120,'g'],['Agua',30,'ml'],['Canela',0.2,'g']],steps:['Lavar y cortar la manzana.','Cocer con agua y canela hasta suavizar.','Porcionar y enfriar según el procedimiento de cocina.']},
  agua:{name:'Ejemplo simulado: agua de limón',protein:'',minutes:15,lines:[['Agua potable',240,'ml'],['Jugo de limón',15,'ml'],['Azúcar',8,'g']],steps:['Medir los ingredientes con utensilios limpios.','Disolver el azúcar y mezclar con agua potable y jugo de limón.','Revisar el volumen final y conservar según el procedimiento de cocina.']},
  grill:{name:'Ejemplo simulado: sándwich de panela',protein:'Queso',minutes:15,lines:[['Pan de caja',2,'pz'],['Queso panela',80,'g'],['Jitomate',40,'g']],steps:['Lavar y preparar el jitomate conforme al procedimiento de cocina.','Armar el sándwich con panela y jitomate.','Calentar y servir. Revisar desechables y producción por separado.']}
};
export function createSimulatedRecipeProvider() {
  return {mode:'simulated',model:'fixture-v1',async generate(input){
    const fixture=fixtures[input.type];
    return { ...fixture,type:input.type,region:'Ejemplo de prueba',baseServings:Number(input.baseServings),
      lines:fixture.lines.map(([name,quantity,unit])=>({name,quantity:new Decimal(quantity).times(input.baseServings).toNumber(),unit})),
      adaptations:[],warnings:[SIMULATION_NOTICE] };
  }};
}
