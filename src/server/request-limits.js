import { createHash } from 'node:crypto';
export class RequestLimits {
  constructor(db,limits,{clock=()=>Date.now()}={}) { Object.assign(this,{db,limits,clock}); }
  async reserve(uid) {
    const minute=Math.floor(this.clock()/60000),hash=createHash('sha256').update(uid).digest('hex');
    const refs=[this.db.collection('_forx_limits').doc(`global_${minute}`),this.db.collection('_forx_limits').doc(`${hash}_${minute}`)];
    await this.db.runTransaction(async tx=>{
      const values=await tx.getAll(...refs);
      const caps=[this.limits.globalMinute,this.limits.perUserMinute];
      if (values.some((v,i)=>(v.data()?.count || 0)>=caps[i])) throw Object.assign(new Error('Límite temporal alcanzado; espera un minuto.'),{status:429});
      refs.forEach((ref,i)=>tx.set(ref,{count:(values[i].data()?.count || 0)+1,expiresAt:new Date((minute+60)*60000)}));
    });
  }
}
