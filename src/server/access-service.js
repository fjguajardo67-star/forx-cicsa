const roles = ['viewer','editor','admin'];
const denied = () => Object.assign(new Error('No tienes acceso activo a FORX.'), {status:403});
const validUid = uid => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
const publicAccess = user => ({uid:user.uid, email:user.email, role:user.role, active:user.active, revision:user.revision});

// Membership is authoritative server data, NOT a role sent by a browser or a
// stale claim inside an otherwise valid token. It is never restored from backup.
export class AccessService {
  constructor({auth,db,provider,clock=()=>new Date().toISOString()}) { Object.assign(this,{auth,db,provider,clock}); }
  ref(uid) { if (!validUid(uid)) throw Object.assign(new Error('Usuario inválido.'),{status:400}); return this.db.collection('_forx_access').doc(uid); }
  async requireAdmin(actor) {
    const member=(await this.ref(actor.uid).get()).data();
    if (!member?.active || member.role!=='admin') throw denied();
  }
  async eligibleUser(uid) {
    let user;
    try { user=await this.auth.getUser(uid); }
    catch(error) { if(error.code==='auth/user-not-found')throw Object.assign(new Error('Cuenta no encontrada.'),{status:404});throw error; }
    if (!user.email || user.disabled || !user.emailVerified
      || this.provider==='google.com' && !user.providerData?.some(p=>p.providerId==='google.com'))
      throw Object.assign(new Error('La cuenta no está disponible para acceso.'),{status:400});
    return user;
  }
  async lookup(actor,input) {
    await this.requireAdmin(actor);
    if (!input || Object.keys(input).length!==1 || !Object.hasOwn(input,'uid')) throw Object.assign(new Error('Consulta inválida.'),{status:400});
    const ref=this.ref(input.uid),user=await this.eligibleUser(input.uid);
    const membership=(await ref.get()).data();
    return {uid:user.uid,email:user.email,name:user.displayName || '',membership:membership?publicAccess(membership):null};
  }
  async authenticate(token) {
    let decoded,user;
    try { decoded=await this.auth.verifyIdToken(token,true); user=await this.auth.getUser(decoded.uid); }
    catch { throw Object.assign(new Error('La sesión venció o fue revocada.'),{status:401}); }
    if (user.disabled || !user.emailVerified || decoded.firebase?.sign_in_provider !== this.provider) throw denied();
    const member=(await this.ref(decoded.uid).get()).data();
    if (!member?.active || !roles.includes(member.role)) throw denied();
    return {uid:decoded.uid,token:{name:user.displayName || decoded.uid,forxActive:true,forxRole:member.role},
      actor:{uid:decoded.uid,name:user.displayName || decoded.uid,email:user.email,role:member.role}};
  }
  async list(actor) {
    await this.requireAdmin(actor);
    const snapshot=await this.db.collection('_forx_access').limit(101).get();
    if (snapshot.size>100) throw new Error('Se requiere paginación para más de 100 cuentas.');
    return snapshot.docs.map(doc=>publicAccess(doc.data()));
  }
  async update(actor,input) {
    await this.requireAdmin(actor);
    if (!input || Object.keys(input).some(key=>!['uid','role','active','expectedRevision'].includes(key))
      || !roles.includes(input.role) || typeof input.active!=='boolean'
      || !(input.expectedRevision===null || Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>0))
      throw Object.assign(new Error('Cambio de acceso inválido.'),{status:400});
    const target=this.ref(input.uid),issuer=this.ref(actor.uid),control=this.db.collection('_forx_system').doc('access');
    // Deactivation must remain possible even when the Auth identity was removed
    // or disabled. Activation requires verified identity from the chosen provider.
    const user=input.active?await this.eligibleUser(input.uid):null;
    const audit=this.db.collection('_forx_security_audit').doc(crypto.randomUUID());
    const updated=await this.db.runTransaction(async tx=>{
      const [caller,before,meta]=await tx.getAll(issuer,target,control);
      if (!caller.data()?.active || caller.data()?.role!=='admin') throw denied();
      if ((before.data()?.revision ?? null)!==input.expectedRevision) throw Object.assign(new Error('El acceso cambió; recarga.'),{status:409});
      if (!before.exists && !input.active) throw Object.assign(new Error('La membresía no existe.'),{status:400});
      const count=meta.data()?.adminCount;
      if (!Number.isSafeInteger(count)||count<1) throw new Error('Control de acceso no inicializado.');
      const wasAdmin=before.data()?.active && before.data()?.role==='admin', isAdmin=input.active&&input.role==='admin';
      const adminCount=count+Number(isAdmin)-Number(Boolean(wasAdmin));
      if (adminCount<1) throw Object.assign(new Error('No se puede desactivar al último administrador.'),{status:409});
      const record={uid:input.uid,email:user?.email || before.data().email,active:input.active,role:input.role,revision:(input.expectedRevision || 0)+1,updatedBy:actor.uid,updatedAt:this.clock()};
      tx.set(target,record);tx.set(control,{adminCount});
      tx.create(audit,{action:'access.changed',actorUid:actor.uid,targetUid:input.uid,role:input.role,active:input.active,occurredAt:this.clock()});
      return publicAccess(record);
    });
    // Database membership takes effect immediately even if revocation fails.
    try { await this.auth.revokeRefreshTokens(input.uid); } catch { return {...updated,sessionRevocationPending:true}; }
    return {...updated,sessionRevocationPending:false};
  }
  async bootstrap(uid) {
    const target=this.ref(uid),control=this.db.collection('_forx_system').doc('access');
    const user=await this.eligibleUser(uid);
    await this.db.runTransaction(async tx=>{
      const existing=await tx.get(control);
      const members=await tx.get(this.db.collection('_forx_access').limit(1));
      if (existing.exists || !members.empty) throw new Error('El acceso ya fue inicializado.');
      tx.create(control,{adminCount:1});
      tx.create(target,{uid,email:user.email,role:'admin',active:true,revision:1,updatedBy:'explicit-bootstrap',updatedAt:this.clock()});
      tx.create(this.db.collection('_forx_security_audit').doc(crypto.randomUUID()),{action:'access.bootstrap',targetUid:uid,occurredAt:this.clock()});
    });
  }
}
