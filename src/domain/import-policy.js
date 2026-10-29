// The cutoff belongs to invoice dates, never to the operator's batch label.
export const IMPORT_POLICY_ID='xml_period_policy';
export function invoicePeriod(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value || '')) return null;
  const instant=new Date(value+'Z');
  return Number.isFinite(instant.valueOf()) && instant.toISOString().slice(0,19)===value ? value.slice(0,7):null;
}
export function latestAcceptedPeriod(imports, policy) {
  return imports.filter(r=>r.status==='accepted').reduce((latest,r)=>{
    const period=invoicePeriod(r.invoiceDate);return period && (!latest || period>latest) ? period:latest;
  },policy?.latestAcceptedPeriod || null);
}
