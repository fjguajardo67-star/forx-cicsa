// Deliberately local-only transport. The browser never initializes an Admin SDK
// or writes Firestore. Explicit emulator mode fails closed if disconnected.
export async function createRemoteServices() {
  if (!import.meta.env.DEV || location.hostname!=='127.0.0.1') throw new Error('El servidor de prueba solo está disponible en desarrollo local.');
  const port=new URLSearchParams(location.search).get('serverPort') || '8787';
  if(!/^\d{4,5}$/.test(port) || Number(port)>65535)throw new Error('Puerto local inválido.');
  const endpoint=`http://127.0.0.1:${port}`;let token,actor;
  async function session(){const response=await fetch(endpoint+'/session',{method:'POST'});if(!response.ok)throw new Error('No está disponible el servidor local de FORX.');const value=await response.json();token=value.token;actor=value.actor;}
  await session();
  async function call(command,input={},retry=true){
    const response=await fetch(endpoint+'/commands',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({command,input})});
    if(response.status===401&&retry){await session();return call(command,input,false);}
    const value=await response.json();if(!response.ok)throw new Error(value.error || 'No se pudo guardar.');return value.result;
  }
  const mode='Servidor local · emuladores FORX · sin producción';
  return commandServices({call,actor,mode});
}

// Same domain commands and import protections for emulator and Google access.
// The caller owns authentication; this adapter cannot create a demo session.
export function commandServices({call,actor,mode,session=null}) {
  const pantry={actor,mode,remote:true,snapshot:()=>call('snapshot'),
    saveRule:input=>call('saveRule',input),exportBackup:()=>call('exportBackup'),
    createCategory:input=>call('createCategory',input),createIngredient:input=>call('createIngredient',input),
    saveProduct:(eventId,product)=>call('saveProduct',{eventId,product}),linkIngredient:(eventId,link)=>call('linkIngredient',{eventId,link}),
    validatePrice:(eventId,revisions)=>call('validatePrice',{eventId,revisions}),setReviewStatus:(targets,status)=>call('setReviewStatus',{targets,status}),
    undoReviewAction:auditId=>call('undoReviewAction',{auditId}),updateIngredientWaste:(ingredientId,wastePct,options)=>call('updateIngredientWaste',{ingredientId,wastePct,options}),addManualPrice:input=>call('addManualPrice',input),
    importFiles:async(files,{period,signal,onProgress=()=>{}}={})=>{
      if(signal?.aborted)throw new Error('Carga cancelada antes de enviar.');
      const policy=(await call('snapshot')).importPolicy;
      if(policy?.mode!=='block_older_months')throw new Error('El servidor todavía no confirma el bloqueo de periodos anteriores. No se enviaron XML. Solicita actualizar el servidor HTTP sin detener los emuladores.');
      const input={period,files:await Promise.all([...files].map(async file=>{
        if(file.size>10*1024*1024)throw new Error(`${file.name}: excede 10 MB.`);
        const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
        for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
        return {name:file.name,bytesBase64:btoa(binary)};
      }))};
      if(new Blob([JSON.stringify({command:'importXML',input})]).size>64*1024*1024)throw new Error('El lote supera 64 MB; divídelo en cargas menores.');
      // Once accepted, server imports are atomic per XML and must not be
      // retried automatically on a lost connection. Re-upload uses UUID/hash.
      if(signal?.aborted)throw new Error('Carga cancelada antes de enviar.');
      const result=await call('importXML',input);onProgress({processed:result.processed,total:files.length,state:'complete'});return result;
    }};
  const kitchen={actor,mode,snapshot:()=>call('kitchenSnapshot'),priceEvidence:input=>call('priceEvidence',input),saveRecipe:input=>call('saveRecipe',input),
    generateRecipeProposal:input=>call('generateRecipeProposal',input),recipeProposalStatus:input=>call('recipeProposalStatus',input),
    importRecipes:(text,options)=>call('importRecipes',{text,options}),saveSettings:input=>call('saveKitchenSettings',input),generateMenu:input=>call('generateMenu',input),saveMenu:input=>call('saveMenu',input)};
  pantry.session=kitchen.session=session;
  return {pantry,kitchen};
}
