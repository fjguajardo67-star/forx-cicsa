import { PantryService } from '../domain/pantry-service.js';
import { KitchenService } from '../domain/kitchen-service.js';

export class CommandError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// The auth argument MUST come from verified server middleware (e.g. a callable
// request.auth), never from request data. No transport or SDK initializes here.
export async function executePantryCommand(repository, auth, request, { clock, generationProvider, generationLimits, generationBudgetPolicy, signal } = {}) {
  if (!auth?.uid || auth.token?.forxActive !== true || !['viewer','editor','admin'].includes(auth.token?.forxRole)) {
    throw new CommandError('permission-denied', 'Se requiere una cuenta activa de FORX.');
  }
  const actor = { uid: auth.uid, name: auth.token.name || auth.uid, role: auth.token.forxRole };
  const service = new PantryService(repository, { actor, ...(clock ? { clock } : {}) });
  const kitchen = new KitchenService(repository, { actor, generationProvider, generationLimits, generationBudgetPolicy, ...(clock ? { clock } : {}) });
  if (request?.command === 'kitchenSnapshot') {
    const state = await kitchen.snapshot();
    state.catalog = state.catalog.map(i => ({ id:i.id,canonicalName:i.canonicalName,aliases:i.aliases,
      status:i.status,baseUnit:i.baseUnit,categoryId:i.categoryId,wastePct:i.wastePct,
      currentPrice:i.currentPrice ? { id:i.currentPrice.id,normalizedPrice:i.currentPrice.normalizedPrice,calculationPrice:i.currentPrice.calculationPrice,observedAt:i.currentPrice.observedAt } : null }));
    return state;
  }
  if (request?.command === 'catalog') {
    const { catalog, categories } = await service.snapshot();
    return { categories, ingredients: catalog.map(item => ({ id:item.id, canonicalName:item.canonicalName,
      aliases:item.aliases, categoryId:item.categoryId, baseUnit:item.baseUnit, wastePct:item.wastePct,
      price:item.currentPrice ? { observationId:item.currentPrice.id, amount:item.currentPrice.normalizedPrice,
        unit:item.currentPrice.baseUnit, observedAt:item.currentPrice.observedAt } : null })) };
  }
  if (actor.role === 'viewer') throw new CommandError('permission-denied', 'Esta cuenta solo puede consultar el catálogo.');
  const input = request?.input || {};
  const commands = {
    generateRecipeProposal: () => kitchen.generateRecipeProposal(input),
    recipeProposalStatus: () => kitchen.recipeProposalStatus(input),
    saveRule: () => service.saveRule(input),
    exportBackup: () => { if(actor.role !== 'admin') throw new CommandError('permission-denied', 'Solo administración puede exportar el respaldo completo.'); return service.exportBackup(); },
    priceEvidence: () => kitchen.priceEvidence(input),
    importXML: () => {
      if (!Array.isArray(input.files) || input.files.some(file => typeof file.name !== 'string' || (typeof file.content !== 'string' && typeof file.bytesBase64 !== 'string'))) throw new Error('Archivos inválidos.');
      return service.importFiles(input.files.map(file=>{
        if(file.bytesBase64==null)return {name:file.name,content:file.content};
        if(file.bytesBase64.length>Math.ceil(10*1024*1024/3)*4 || file.bytesBase64.length%4 || /[^A-Za-z0-9+/=]/.test(file.bytesBase64))throw new Error('Archivo demasiado grande o codificación inválida.');
        const bytes=Uint8Array.from(atob(file.bytesBase64),character=>character.charCodeAt(0));
        return {name:file.name,size:bytes.length,arrayBuffer:async()=>bytes};
      }),{period:input.period,signal});
    },
    saveRecipe: () => kitchen.saveRecipe(input),
    importRecipes: () => kitchen.importRecipes(input.text,input.options),
    saveKitchenSettings: () => kitchen.saveSettings(input),
    generateMenu: () => kitchen.generateMenu(input),
    saveMenu: () => kitchen.saveMenu(input),
    snapshot: () => service.snapshot(),
    createCategory: () => service.createCategory(input),
    createIngredient: () => service.createIngredient(input),
    saveProduct: () => service.saveProduct(input.eventId, input.product),
    linkIngredient: () => service.linkIngredient(input.eventId, input.link),
    validatePrice: () => service.validatePrice(input.eventId, input.revisions),
    setReviewStatus: () => service.setReviewStatus(input.targets, input.status),
    undoReviewAction: () => service.undoReviewAction(input.auditId),
    updateIngredientWaste: () => service.updateIngredientWaste(input.ingredientId, input.wastePct, input.options),
    addManualPrice: () => service.addManualPrice(input)
  };
  // Retention and arbitrary repository writes are intentionally not commands.
  if (!Object.hasOwn(commands, request?.command)) throw new CommandError('invalid-argument', 'La operación no está permitida.');
  return commands[request.command]();
}
