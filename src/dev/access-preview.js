// Browser demonstration only. Authorization/security evidence uses AccessService
// against isolated Auth/Firestore emulators, not this in-memory double.
export function createAccessPreview(actor) {
  const rows=new Map([
    [actor.uid,{uid:actor.uid,email:actor.email,role:actor.role,active:true,revision:1}],
    ['preview-editor',{uid:'preview-editor',email:'edicion.ficticia@example.invalid',role:'editor',active:true,revision:1}],
    ['preview-viewer',{uid:'preview-viewer',email:'consulta.ficticia@example.invalid',role:'viewer',active:false,revision:1}]
  ]);
  const failure=status=>Object.assign(new Error('Respuesta ficticia.'),{status});
  const check=()=>{if(actor.role!=='admin')throw failure(403);};
  return {
    previewHint:'Ensayo en memoria: no autoriza personas reales. Para probar un alta, usa el UID preview-new. Al salir o recargar se descarta todo.',
    async list(){check();return structuredClone([...rows.values()]);},
    async lookup(uid){check();const membership=rows.get(uid);if(!membership&&uid!=='preview-new')throw failure(404);
      return {uid,email:membership?.email || 'nueva.cuenta@example.invalid',membership:membership?structuredClone(membership):null};},
    async update(input){check();const before=rows.get(input.uid);
      if((before?.revision??null)!==input.expectedRevision)throw failure(409);
      if(!before&&input.uid!=='preview-new')throw failure(404);
      const activeAdmins=[...rows.values()].filter(r=>r.active&&r.role==='admin').length;
      if(before?.active&&before.role==='admin'&&(!input.active||input.role!=='admin')&&activeAdmins===1)throw failure(409);
      const result={uid:input.uid,email:before?.email || 'nueva.cuenta@example.invalid',role:input.role,active:input.active,revision:(before?.revision || 0)+1};
      rows.set(input.uid,result);return {...result,sessionRevocationPending:false};
    }
  };
}
