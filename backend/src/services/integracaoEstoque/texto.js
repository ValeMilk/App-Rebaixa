/**
 * Utilitarios de texto e numero da leitura de planilhas de estoque (Integracao Estoque).
 * Modulo puro: sem banco, sem I/O.
 */

function semAcento(s) {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Normaliza o texto de um cabecalho para comparar com sinonimos:
 * minusculas, sem acento, so letras/digitos/"$"/"%" (preserva "Venda R$" distinto de "Venda"),
 * espacos colapsados e aparados.
 *   "Custo Médio Unit. R$" -> "custo medio unit r$"
 */
function normalizarCabecalho(texto) {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de campo personalizado derivada do rotulo.
 *   "Estoque em Trânsito R$" -> "estoque_em_transito"
 */
function chaveDeCampoPersonalizado(rotulo) {
  const n = normalizarCabecalho(rotulo)
    .replace(/(^|\s)r\$(?=\s|$)/g, " ")
    .replace(/[$%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return n.replace(/ /g, "_");
}

/**
 * Converte o valor de uma celula em texto simples (ou null se vazia).
 * Datas viram "YYYY-MM-DD"; numeros viram texto sem notacao cientifica.
 */
function celulaTexto(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Separa "474835 - QUEIJO COALHO BARRA KG" em codigo e descricao.
 * So o PRIMEIRO " - " conta (a descricao pode repetir o padrao).
 * Sem separador: o texto inteiro e o codigo (e tambem a descricao exibida).
 */
function separarCodigoDescricao(valor) {
  const s = celulaTexto(valor);
  if (!s) return { codigo: null, descricao: null };
  const i = s.indexOf(" - ");
  if (i > 0) {
    return { codigo: s.slice(0, i).trim(), descricao: s.slice(i + 3).trim() };
  }
  return { codigo: s, descricao: s };
}

/**
 * Converte o valor de uma celula numerica. Retorna { vazio, ok, valor }.
 * Aceita numero nativo, "1234.56", "1.234,56" (pt-BR) e "12,5". Nada e corrigido ou arredondado.
 */
function paraNumero(v) {
  if (v === null || v === undefined) return { vazio: true, ok: true, valor: null };
  if (typeof v === "number") {
    return Number.isFinite(v) ? { vazio: false, ok: true, valor: v } : { vazio: false, ok: false, valor: null };
  }
  if (typeof v === "string") {
    const s = v.replace(/R\$/gi, "").replace(/\s+/g, "");
    if (s === "") return { vazio: true, ok: true, valor: null };
    let n = null;
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = Number(s.replace(/\./g, "").replace(",", "."));
    else if (/^[-+]?\d+,\d+$/.test(s)) n = Number(s.replace(",", "."));
    else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) n = Number(s);
    return n !== null && Number.isFinite(n) ? { vazio: false, ok: true, valor: n } : { vazio: false, ok: false, valor: null };
  }
  return { vazio: false, ok: false, valor: null };
}

module.exports = {
  semAcento,
  normalizarCabecalho,
  chaveDeCampoPersonalizado,
  celulaTexto,
  separarCodigoDescricao,
  paraNumero,
};
