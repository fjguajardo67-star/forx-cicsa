import { exactKeys } from './recipe-proposal.js';

const MONEY = /^(0|[1-9]\d{0,8})(?:\.(\d{1,9}))?$/;
const NANO = /^(0|[1-9]\d{0,29})$/;
const RATE_KEYS = ['input', 'cachedInput', 'cacheWrite', 'output'];
const roundUp = (numerator, denominator) => (numerator + denominator - 1n) / denominator;

export function nanoUSD(value, { allowZero = false } = {}) {
  if (typeof value !== 'string' || !MONEY.test(value)) throw new Error('Importe USD inválido.');
  const [units, fraction = ''] = value.split('.');
  const amount = BigInt(units) * 1_000_000_000n + BigInt((fraction + '000000000').slice(0, 9));
  if (!allowZero && amount === 0n) throw new Error('El límite o tarifa debe ser positivo.');
  return amount;
}
export function readNanoUSD(value) {
  if (typeof value !== 'string' || !NANO.test(value)) throw new Error('Importe reservado inválido.');
  return BigInt(value);
}

export function validateRecipeBudgetPolicy(value, transport) {
  exactKeys(value, ['approvalRef', 'priceVersion', 'model', 'maxInputTokens', 'maxOutputTokens', 'monthlyBudgetUSD', 'dailyUserBudgetUSD', 'perRequestBudgetUSD', 'priceUSDPerMillion', 'userDailyRequests', 'projectMonthlyRequests', 'concurrentRequests'], 'Política monetaria');
  if (!value || !/^[a-zA-Z0-9_.:-]{8,100}$/.test(value.approvalRef || '') || !/^[a-zA-Z0-9_.:-]{8,100}$/.test(value.priceVersion || '')
    || value.model !== transport?.model || value.maxOutputTokens !== transport?.maxOutputTokens || transport?.mode !== 'openai'
    || !Number.isSafeInteger(transport.maxRequestBytes) || transport.maxRequestBytes !== 32768
    || !Number.isSafeInteger(value.maxInputTokens) || value.maxInputTokens < (transport.maxRequestBytes + 4096)
    || value.maxInputTokens > 1_000_000) throw new Error('La política monetaria y el transporte no coinciden.');
  if (![value.userDailyRequests, value.projectMonthlyRequests, value.concurrentRequests].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 100000)) throw new Error('Faltan límites de solicitudes aprobados.');
  exactKeys(value.priceUSDPerMillion, RATE_KEYS, 'Tarifas');
  if (RATE_KEYS.some(key => !Object.hasOwn(value.priceUSDPerMillion, key))) throw new Error('Falta una tarifa aprobada.');
  const rates = Object.fromEntries(RATE_KEYS.map(key => [key, nanoUSD(value.priceUSDPerMillion[key]).toString()]));
  const limits = { monthly: nanoUSD(value.monthlyBudgetUSD), daily: nanoUSD(value.dailyUserBudgetUSD), request: nanoUSD(value.perRequestBudgetUSD) };
  if (limits.request > limits.daily || limits.request > limits.monthly) throw new Error('El máximo por solicitud rebasa los límites aprobados.');
  const approved = { approvalRef: value.approvalRef, priceVersion: value.priceVersion, model: value.model,
    maxInputTokens: value.maxInputTokens, maxOutputTokens: value.maxOutputTokens,
    ratesNanoUSDPerMillion: rates, monthlyLimitNanoUSD: limits.monthly.toString(), dailyLimitNanoUSD: limits.daily.toString(),
    requestLimitNanoUSD: limits.request.toString(), userDailyRequests:value.userDailyRequests,
    projectMonthlyRequests:value.projectMonthlyRequests, concurrentRequests:value.concurrentRequests };
  const reservation = reservationNanoUSD(approved);
  if (reservation > limits.request) throw new Error('La solicitud máxima rebasa el límite por solicitud.');
  return Object.freeze({ ...approved, reservationNanoUSD: reservation.toString() });
}

export function reservationNanoUSD(policy) {
  const rates = policy.ratesNanoUSDPerMillion;
  const maxInput = [rates.input, rates.cachedInput, rates.cacheWrite].map(readNanoUSD).reduce((a, b) => a > b ? a : b);
  return roundUp(BigInt(policy.maxInputTokens) * maxInput + BigInt(policy.maxOutputTokens) * readNanoUSD(rates.output), 1_000_000n);
}

export function estimatedCostNanoUSD(usage, rates) {
  exactKeys(usage, ['inputTokens', 'cachedInputTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens', 'totalTokens'], 'Uso reportado');
  const valid = value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
  if (!Object.values(usage).every(valid) || usage.cachedInputTokens + usage.cacheWriteTokens > usage.inputTokens
    || usage.reasoningTokens > usage.outputTokens || usage.inputTokens + usage.outputTokens !== usage.totalTokens) throw new Error('Uso reportado inconsistente.');
  exactKeys(rates, RATE_KEYS, 'Tarifas respaldadas');
  const normal = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens;
  return roundUp(BigInt(normal) * readNanoUSD(rates.input)
    + BigInt(usage.cachedInputTokens) * readNanoUSD(rates.cachedInput)
    + BigInt(usage.cacheWriteTokens) * readNanoUSD(rates.cacheWrite)
    + BigInt(usage.outputTokens) * readNanoUSD(rates.output), 1_000_000n);
}

export function budgetQuota(value) {
  if (value == null) return { heldNanoUSD: '0', estimatedNanoUSD: '0' };
  exactKeys(value, ['heldNanoUSD', 'estimatedNanoUSD'], 'Saldo de generación');
  readNanoUSD(value.heldNanoUSD); readNanoUSD(value.estimatedNanoUSD);
  return value;
}

export function validateRequestBudget(value) {
  const keys = ['unit', 'approvalRef', 'priceVersion', 'ratesNanoUSDPerMillion', 'maxInputTokens', 'maxOutputTokens',
    'reservedNanoUSD', 'estimatedNanoUSD', 'usage', 'settlement', 'responseId', 'reportedUsage', 'reportedModel', 'reportedTier'];
  exactKeys(value, [...keys, 'evidenceRef', 'reconciledBy', 'reconciledAt'], 'Reserva de solicitud');
  if (keys.some(key => !Object.hasOwn(value, key))) throw new Error('Reserva de solicitud incompleta.');
  if (value.unit !== 'nanoUSD' || !/^[a-zA-Z0-9_.:-]{8,100}$/.test(value.approvalRef || '')
    || !/^[a-zA-Z0-9_.:-]{8,100}$/.test(value.priceVersion || '')
    || !Number.isSafeInteger(value.maxInputTokens) || value.maxInputTokens < 1
    || !Number.isSafeInteger(value.maxOutputTokens) || value.maxOutputTokens < 1) throw new Error('Reserva de solicitud inválida.');
  exactKeys(value.ratesNanoUSDPerMillion, RATE_KEYS, 'Tarifas de solicitud');
  if (RATE_KEYS.some(key => !Object.hasOwn(value.ratesNanoUSDPerMillion, key) || readNanoUSD(value.ratesNanoUSDPerMillion[key]) === 0n)) throw new Error('Tarifa de solicitud inválida.');
  if (readNanoUSD(value.reservedNanoUSD) !== reservationNanoUSD(value)) throw new Error('La reserva no corresponde a la tarifa.');
  if (!['held', 'estimated', 'released'].includes(value.settlement)) throw new Error('Estado monetario inválido.');
  if (value.settlement === 'estimated') {
    if (value.estimatedNanoUSD == null || value.usage == null || readNanoUSD(value.estimatedNanoUSD) !== estimatedCostNanoUSD(value.usage, value.ratesNanoUSDPerMillion)) throw new Error('Conciliación monetaria inválida.');
  } else if (value.estimatedNanoUSD != null || value.usage != null) throw new Error('No hay consumo confirmado para esta reserva.');
  if (value.responseId != null && !/^resp_[a-zA-Z0-9_-]{1,120}$/.test(value.responseId)) throw new Error('Identidad de respuesta inválida.');
  if (value.reportedModel != null && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value.reportedModel)) throw new Error('Modelo reportado inválido.');
  if (value.reportedTier != null && !/^[a-zA-Z0-9_-]{1,30}$/.test(value.reportedTier)) throw new Error('Servicio reportado inválido.');
  if (value.reportedUsage != null) estimatedCostNanoUSD(value.reportedUsage, value.ratesNanoUSDPerMillion);
  if (value.settlement === 'estimated' && JSON.stringify(value.reportedUsage) !== JSON.stringify(value.usage) && value.evidenceRef == null) throw new Error('El uso liquidado no coincide con la respuesta.');
  if (value.evidenceRef != null && !/^[a-zA-Z0-9_.:-]{8,160}$/.test(value.evidenceRef)) throw new Error('Evidencia inválida.');
  if (value.evidenceRef != null && (!value.reconciledBy || !value.reconciledAt)) throw new Error('Falta procedencia de conciliación.');
  return value;
}
