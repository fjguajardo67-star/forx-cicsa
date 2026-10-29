// Synthetic legacy-format evidence only. Never bundle the user's private backup.
export function legacyRecipe(overrides={}) {
  return {id:1,nombre:'Guisado de prueba',tipo:'guisado',region:'Prueba',carnico:'Verdura',
    tiempo:30,paxO:50,paxD:500,fecha:'2026-09-13',
    ingredientes:[{nombre:'Jitomate de prueba',cantidad:150,unidad:'g',precio_kg:98765}],
    procedimiento:['Cocinar los ingredientes.','Servir.'],...overrides};
}
export function legacyBackup() {
  const local={recetas:[
    legacyRecipe(),
    legacyRecipe({id:2,nombre:'Pipián de prueba'}),
    legacyRecipe({id:3,nombre:'Pipian de prueba'}),
    legacyRecipe({id:4,nombre:'Carnitas A de prueba'}),
    legacyRecipe({id:4,nombre:'Carnitas B de prueba'}),
    legacyRecipe({id:5,nombre:'Sopes de prueba',procedimiento:[],ingredientes:Array.from({length:6},(_,i)=>({nombre:`Captura ${i+1}`,cantidad:25,unidad:'g'}))}),
    legacyRecipe({id:6,nombre:'Receta omitida de prueba'}),
    legacyRecipe({id:7,nombre:'Receta eliminada de prueba'}),
    legacyRecipe({id:8,nombre:'<img src=x onerror=alert(1)>',procedimiento:['<script>alert(1)</script>']})
  ],alacarta:[{id:9,nombre:'Ensalada de prueba',categoria:'Ensaladas',estado:'borrador',
    ingredientes:[{nombre:'Mezcla de hojas',cantidad:1,unidad:'porcion',precio_kg:98765}],
    desechables:[{nombre:'Contenedor',cantidad:1,unidad:'pz',precio_kg:98765}],precio_venta:98765,costo_produccion:98765}],
  borradas:['Receta eliminada de prueba','Eliminada sin contenido'],omitidas:['Receta omitida de prueba'],config:{lineas:[],margen_objetivo:30}};
  return {_app:'ForX — respaldo de datos',_generado:'2026-09-13T03:42:16.739Z',_sesion:'private-synthetic@example.invalid',local,nube:{...structuredClone(local),config:null}};
}
