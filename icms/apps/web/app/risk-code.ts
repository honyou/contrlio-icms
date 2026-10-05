type RiskCodeRecord = { id?: string; code?: string };

/** Keep generated template hashes recognizable without exposing the whole hash as the business-facing label. */
export function compactRiskCode(risk: RiskCodeRecord, candidates: RiskCodeRecord[] = []): string {
  const code = String(risk.code || "—");
  const match = /^RISK-([A-F0-9]{12,})$/i.exec(code);
  if (!match) return code;

  const token = match[1].toUpperCase();
  let visibleLength = 6;
  while (visibleLength < token.length && candidates.some(candidate =>
    candidate.id !== risk.id && String(candidate.code || "").toUpperCase().startsWith(`RISK-${token.slice(0, visibleLength)}`),
  )) visibleLength = Math.min(visibleLength + 2, token.length);

  return `R-${token.slice(0, visibleLength)}`;
}
