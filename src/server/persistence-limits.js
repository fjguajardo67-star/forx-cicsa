// Conservative preflight budgets, not a claim to calculate Firestore's wire
// format. Reserve room for protobuf/document names/index overhead. Firestore
// still enforces its own transaction and document limits atomically.
// https://docs.cloud.google.com/firestore/docs/release-notes#March_29_2023
export class PersistenceInputError extends Error {
  constructor(message) {super(message);this.code='invalid-argument';this.fileRejected=true;}
}
export function validatePersistenceInput(operations) {
  let budget=0;
  for (const op of operations) {
    if (typeof op.id!=='string' || !op.id || Buffer.byteLength(op.id)>1500 || op.id.includes('/') || ['.','..'].includes(op.id) || /^__.*__$/.test(op.id))
      throw new PersistenceInputError('Identidad de registro inválida; el archivo no se guardó parcialmente.');
    let document=op.value;
    if(op.collection==='originals' && document) {const {bytes,...metadata}=document;document=metadata;}
    const size=Buffer.byteLength(JSON.stringify(document ?? null))*3+2048+Buffer.byteLength(op.id)*2;
    if(!op.checkOnly && size>768*1024)throw new PersistenceInputError('Un registro derivado excede el tamaño seguro; solicita al despacho dividir el comprobante. No se guardó parcialmente.');
    budget+=size;
    if(budget>8*1024*1024)throw new PersistenceInputError('El comprobante excede el tamaño transaccional seguro; solicita al despacho dividirlo. No se guardó parcialmente.');
  }
}
