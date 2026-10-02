// Formatadores e ajudantes do acompanhamento de estoque. Nenhum arredonda o dado de origem:
// so a EXIBICAO e formatada (um -0,002 continua aparecendo como -0,002, nunca como 0,00).

export const fmtNum = (n, casas) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (casas != null) return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  // sem casas fixas: inteiros sem decimais, fracionarios ate 3 casas (preserva residuos como -0,002)
  return v.toLocaleString("pt-BR", { maximumFractionDigits: Number.isInteger(v) ? 0 : 3 });
};

export const fmtDias = (n) => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`);

// Valor monetario compacto para eixos de grafico: "R$ 12 mil", "R$ 1,2 mi".
export const fmtMoedaCompacta = (n) => {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

/** "2026-09-22" -> "22/09" (eixo) ou "22/09/2026". */
export const diaMes = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export const diaMesAno = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

/**
 * Tom e texto de uma variacao entre retratos. `bom`: "subir" (subir e bom), "descer" ou "neutro".
 * Retorna null quando nao ha comparacao.
 */
export function variacaoTexto(v, { tipo = "pct", bom = "neutro" } = {}) {
  if (!v || v.delta == null) return null;
  if (Math.abs(v.delta) < 1e-9) return { texto: "= igual", tone: "neutral" };
  const subiu = v.delta > 0;
  const seta = subiu ? "▲" : "▼";
  let corpo;
  if (tipo === "pct") corpo = v.pct == null ? "novo" : `${Math.abs(v.pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  else if (tipo === "dias") corpo = `${Math.abs(v.delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
  else corpo = Math.abs(v.delta).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const tone = bom === "neutro" ? "neutral" : (bom === "subir") === subiu ? "success" : "danger";
  return { texto: `${seta} ${corpo}`, tone };
}

/** Escala "redonda" para o eixo de um grafico: { topo, passo } com ~4 intervalos (1, 2, 2,5, 5 x 10^k). */
export function escalaBonita(max) {
  const bruto = Math.max(max, 4) / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / mag;
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { passo, topo: Math.ceil(Math.max(max, 4) / passo) * passo };
}
