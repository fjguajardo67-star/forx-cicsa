export const GENERATION_TEXT_DAYS = 30;
const RETENTION_MS = GENERATION_TEXT_DAYS * 24 * 60 * 60 * 1000;

export function generationTextExpiresAt(requestedAt) {
  const start = Date.parse(requestedAt);
  if (!Number.isFinite(start)) throw new Error('Fecha de generación inválida.');
  return new Date(start + RETENTION_MS).toISOString();
}

export function hasGenerationText(record) {
  return record?.context != null || record?.proposal != null;
}

// Keep the immutable budget/quota evidence and the recipe reference. Only the
// intermediate culinary text leaves the generation request.
export function eraseGenerationText(record, erasedAt) {
  if (!Number.isFinite(Date.parse(erasedAt))) throw new Error('Fecha de depuración inválida.');
  return { ...record, context: null, proposal: null,
    textErasedAt: hasGenerationText(record) ? erasedAt : record.textErasedAt || erasedAt };
}

export function generationTextIsDue(record, now) {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) throw new Error('Fecha de corte inválida.');
  return hasGenerationText(record) && Date.parse(generationTextExpiresAt(record.requestedAt)) <= instant;
}
