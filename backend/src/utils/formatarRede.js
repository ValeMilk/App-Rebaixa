/**
 * Formata o nome de exibicao de uma rede combinando redeSubrede (A16) + subrede (A68).
 * Regra: "REDE — SUBREDE" quando ambos existem; senao usa o que existir; fallback final = codigoRede.
 */
function formatarRede({ redeSubrede, subrede, codigoRede } = {}) {
  const r = (redeSubrede || "").trim() || null;
  const s = (subrede || "").trim() || null;
  if (r && s) return `${r} — ${s}`;
  if (r) return r;
  if (s) return s;
  return codigoRede || null;
}

module.exports = { formatarRede };
