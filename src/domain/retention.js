// Dos meses naturales desde la carga, en UTC. Fin de mes se limita al último
// día del mes de destino (31 de diciembre → 28/29 de febrero).
export function originalExpiresAt(uploadedAt) {
  const date = new Date(uploadedAt);
  if (!Number.isFinite(date.valueOf())) throw new Error('Fecha de carga inválida.');
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 2);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

export function expiredOriginals(originals, now) {
  const instant = Date.parse(now);
  if (!Number.isFinite(instant)) throw new Error('Fecha de corte inválida.');
  return originals.filter(item => item.status === 'retained'
    && item.expiresAt === originalExpiresAt(item.uploadedAt)
    && Date.parse(item.expiresAt) <= instant)
    .map(({ id, hash, uploadedAt, expiresAt, path }) => ({ id, hash, uploadedAt, expiresAt, path }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id.localeCompare(b.id));
}
