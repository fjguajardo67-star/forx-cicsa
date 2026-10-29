import { put, ConcurrentEditError } from '../data/entity-repository.js';
import { atomicWork } from '../data/unit-of-work.js';
import { validateGenerationInput, validateProposal, RECIPE_PROMPT_VERSION, ingredientSuggestions } from './recipe-proposal.js';
import { catalogPrices } from './prices.js';
import { OpenAIRecipeBudgetService } from './openai-recipe-budget-service.js';
import { generationTextIsDue, hasGenerationText } from './generation-text-retention.js';

const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
export const SIMULATION_LIMITS=Object.freeze({userDaily:10,projectMonthly:100,concurrent:2,timeoutMs:10000});
export class RecipeGenerationService {
  constructor(repository,{actor,clock=()=>new Date().toISOString(),provider=null,limits=SIMULATION_LIMITS,budgetPolicy=null}={}) {
    this.repository=repository;this.actor=actor;this.clock=clock;this.provider=provider;this.limits=limits;
    this.openAI = budgetPolicy ? new OpenAIRecipeBudgetService(repository,{actor,clock,transport:provider,policy:budgetPolicy}) : null;
  }
  authorize() { if (!this.actor?.uid || !['admin','editor'].includes(this.actor.role)) throw new Error('Solo editor o administrador puede generar propuestas.'); }
  capabilities() {
    const mode=this.provider?.mode==='openai'&&this.openAI?'openai':this.provider?.mode==='simulated'?'simulated':'disabled';
    return {mode,enabled:mode!=='disabled'&&['admin','editor'].includes(this.actor?.role),
      promptVersion:RECIPE_PROMPT_VERSION,limits:mode==='openai'?{userDaily:this.openAI.policy.userDailyRequests,
        projectMonthly:this.openAI.policy.projectMonthlyRequests}:mode==='simulated'?{userDaily:this.limits.userDaily,
        projectMonthly:this.limits.projectMonthly}:null};
  }
  async retry(action) {
    for(let attempt=0;attempt<5;attempt++)try{return await atomicWork(this.repository,action);}catch(error){if(!(error instanceof ConcurrentEditError)||attempt===4)throw error;}
  }
  async view(record) {
    if (!record || record.actorUid!==this.actor.uid) throw new Error('Solicitud no disponible para esta cuenta.');
    if (!hasGenerationText(record) || (record.status==='completed' && !record.proposal)
      || generationTextIsDue(record,this.clock())) return { requestId:record.requestId,generationRequestId:record.id,
      status:record.budget?.settlement==='held'?'uncertain':record.recipeId?'saved':'expired',
      mode:record.mode,recipeId:record.recipeId || null,
      error:record.budget?.settlement==='held'
        ? 'El texto venció; la reserva sigue pendiente de conciliación administrativa. No se reintentó la solicitud.'
        : record.recipeId?'La propuesta ya fue guardada como receta; consulta el catálogo.'
          : 'El texto de la propuesta venció a los 30 días sin guardarse. Inicia una solicitud nueva.' };
    const result={requestId:record.requestId,generationRequestId:record.id,status:record.status,mode:record.mode,error:record.error || null,recipeId:record.recipeId || null};
    if(record.status==='completed') {
      const data=Object.fromEntries(await Promise.all(['ingredients','products','reviews','price_observations'].map(async name=>[name,await this.repository.list(name)])));
      result.proposal=record.proposal;
      result.suggestions=ingredientSuggestions(record.proposal.recipe,catalogPrices(data));
    }
    return result;
  }
  async lookup({requestId}={}) {
    this.authorize();
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId || ''))throw new Error('Identidad de solicitud inválida.');
    return this.view(await this.repository.get('generation_requests',`gen_${await hash(this.actor.uid+':'+requestId)}`));
  }
  async generate(raw) {
    this.authorize();
    if(this.provider?.mode==='openai' && this.openAI) {
      const record=await this.openAI.generate(raw);
      return this.view(record);
    }
    if(this.provider?.mode!=='simulated')throw new Error('Generación desactivada. Este corte solo permite el simulador explícito, sin consumo de OpenAI.');
    const input=validateGenerationInput(raw),fingerprint=await hash(JSON.stringify(input));
    const id=`gen_${await hash(this.actor.uid+':'+input.requestId)}`,now=this.clock(),actorHash=await hash(this.actor.uid);
    const quotaIds=[`day_${now.slice(0,10)}_${actorHash}`,`month_${now.slice(0,7)}`,'concurrency'];
    const reservation=await this.retry(async repository=>{
      const prior=await repository.get('generation_requests',id);
      if(prior){if(prior.fingerprint!==fingerprint)throw new Error('Esta identidad ya se usó con otra solicitud. Inicia una nueva propuesta.');return {existing:prior};}
      const preferredIngredients=[];
      for(const ingredientId of input.preferredIngredientIds){
        const ingredient=await repository.get('ingredients',ingredientId);
        if(!ingredient||ingredient.status!=='active')throw new Error('Un ingrediente preferido ya no está disponible. Actualiza el catálogo.');
        preferredIngredients.push({name:ingredient.canonicalName,unit:ingredient.baseUnit});
      }
      const quotas=await Promise.all(quotaIds.map(key=>repository.get('generation_quotas',key)));
      if((quotas[0]?.count || 0)>=this.limits.userDaily)throw new Error('Alcanzaste el límite diario del simulador. No se envió otra solicitud.');
      if((quotas[1]?.count || 0)>=this.limits.projectMonthly)throw new Error('Se alcanzó el límite mensual del simulador.');
      if((quotas[2]?.count || 0)>=this.limits.concurrent)throw new Error('Hay solicitudes reservadas en curso o con resultado incierto. Consulta su estado antes de generar otra.');
      const {requestId,preferredIngredientIds,...culinary}=input;
      const context={...culinary,preferredIngredients};
      const record={id,requestId,fingerprint,actorUid:this.actor.uid,mode:'simulated',model:this.provider.model,promptVersion:RECIPE_PROMPT_VERSION,
        requestedAt:now,status:'pending',context,quotaIds,proposal:null,recipeId:null};
      await repository.commit([put('generation_requests',record),...quotas.map((q,i)=>put('generation_quotas',{...q,id:quotaIds[i],count:(q?.count || 0)+1,updatedAt:now},q))]);
      return {record,context};
    });
    if(reservation.existing)return this.view(reservation.existing);
    let proposal,status='completed',error=null,timer;
    const controller=new AbortController();
    try {
      const output=await Promise.race([
        Promise.resolve().then(()=>this.provider.generate(reservation.context,{signal:controller.signal})),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error(),{uncertain:true}));},this.limits.timeoutMs);})
      ]);
      try { proposal=validateProposal(output,input); }
      catch { status='failed';error='La propuesta no pasó la validación de FORX. No se creó una receta; ajusta la solicitud e inicia una nueva prueba.'; }
    } catch(cause) {
      status=cause?.uncertain?'uncertain':'failed';
      error=status==='uncertain'?'La espera terminó sin resultado confirmado. La reserva se conserva; no se reintentó ni se creó una receta.':'No se pudo obtener una propuesta. No se creó una receta ni se reintentó automáticamente.';
    } finally {clearTimeout(timer);}
    await this.retry(async repository=>{
      const record=await repository.get('generation_requests',id);
      const concurrent=await repository.get('generation_quotas','concurrency');
      // Unknown outcome holds the concurrency reservation; never pretend it was
      // cancelled or refunded. No provider call runs inside a retryable commit.
      await repository.commit([put('generation_requests',{...record,status,error,proposal:proposal || null,finishedAt:this.clock()},record),
        ...(status==='uncertain'?[]:[put('generation_quotas',{...concurrent,count:Math.max(0,concurrent.count-1),updatedAt:this.clock()},concurrent)])]);
    });
    return this.view(await this.repository.get('generation_requests',id));
  }
}
