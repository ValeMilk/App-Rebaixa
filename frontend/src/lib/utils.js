export function fmtData(d) {
  if (!d) return "-";
  // Parse ISO date (YYYY-MM-DD) como horário local, não UTC (evita offset -3h no Brasil)
  const s = typeof d === "string" ? d : d instanceof Date ? d.toISOString() : String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("pt-BR");
  return new Date(d).toLocaleDateString("pt-BR");
}

export function fmtDataHora(d) {
  if (!d) return "-";
  return new Date(d).toLocaleString("pt-BR");
}

export function fmtBRL(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Formata o nome de exibição de uma rede combinando redeSubrede (A16) + subrede (A68).
 * Regra: "REDE — SUBREDE" quando ambos existem; senão usa o que existir; fallback final = codigoRede.
 */
export function formatarRede({ redeSubrede, subrede, codigoRede } = {}) {
  const r = (redeSubrede || "").trim() || null;
  const s = (subrede || "").trim() || null;
  if (r && s) return `${r} — ${s}`;
  if (r) return r;
  if (s) return s;
  return codigoRede || null;
}
