/**
 * Lojas da rede no arquivo do cliente.
 *  - nome sugerido para cadastro em lote (a pessoa sempre edita antes de confirmar);
 *  - semelhanca de nome entre lojas (base para casar com outro cadastro no futuro).
 */
const { semAcento } = require("./texto");

// Termos genericos que nao identificam a loja ("MATEUS SUPERMERCADOS S.A. MIX ITAPIPOCA")
const GENERICOS = new Set([
  "SUPERMERCADOS", "SUPERMERCADO", "S", "A", "SA", "LTDA", "EIRELI", "ME", "EPP",
  "MIX", "SUPER", "ATACADO", "ATACAREJO", "HIPER", "HIPERMERCADO", "COMERCIAL",
]);
const CONECTIVOS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const APELIDOS = { ZE: "JOSE" };

/** Palavras da loja: sem sufixo de UF (" - CE"), maiusculas, sem acento, so letras e digitos. */
function palavrasDaLoja(nome) {
  let s = semAcento(nome).toUpperCase();
  s = s.replace(/\s*-\s*[A-Z]{2}\s*$/, "");
  s = s.replace(/[^A-Z0-9]+/g, " ").trim();
  return s ? s.split(" ") : [];
}

/** Palavras que TODOS os nomes compartilham, na mesma ordem, a partir do inicio. */
function prefixoComumDeNomes(listasDePalavras) {
  if (listasDePalavras.length < 2) return []; // com uma loja so, o "comum" seria o nome inteiro
  const prefixo = [];
  const menor = Math.min(...listasDePalavras.map((l) => l.length));
  for (let i = 0; i < menor; i++) {
    const w = listasDePalavras[0][i];
    if (listasDePalavras.every((l) => l[i] === w)) prefixo.push(w);
    else break;
  }
  return prefixo;
}

function tituloEmPortugues(palavras) {
  return palavras
    .map((w, i) => {
      const min = w.toLowerCase();
      if (i > 0 && CONECTIVOS.has(w)) return min;
      return min.charAt(0).toUpperCase() + min.slice(1);
    })
    .join(" ");
}

/**
 * "MATEUS SUPERMERCADOS S.A. MIX JUAZEIRO DO NORTE" -> "Juazeiro do Norte"
 * Sem acento: grafia final e decisao de quem cadastra.
 */
function nomeSugeridoDeSubrede(razaoSocial, prefixoComum = []) {
  const palavras = palavrasDaLoja(razaoSocial);
  let resto = palavras;
  if (prefixoComum.length && prefixoComum.every((w, i) => palavras[i] === w)) {
    resto = palavras.slice(prefixoComum.length);
  }
  const tiraGenericos = (ws) => {
    const r = [...ws];
    while (r.length && GENERICOS.has(r[0])) r.shift();
    return r;
  };
  let nome = tiraGenericos(resto);
  if (!nome.length) nome = tiraGenericos(palavras); // prefixo comeu o nome inteiro
  if (!nome.length) nome = palavras;
  return nome.length ? tituloEmPortugues(nome) : String(razaoSocial ?? "").trim();
}

/** Sugere nomes para varias lojas de uma vez, usando o prefixo comum de TODAS as razoes do arquivo. */
function sugerirNomesDeLojas(razoes) {
  const listas = razoes.map((r) => palavrasDaLoja(r));
  const prefixo = prefixoComumDeNomes(listas);
  return razoes.map((r) => nomeSugeridoDeSubrede(r, prefixo));
}

// ── Semelhanca entre nomes de loja (uso futuro: casar com outro cadastro) ───────

function termosDaLoja(nome, termosDaRede = []) {
  const rede = new Set(termosDaRede);
  const out = new Set();
  for (let w of palavrasDaLoja(nome)) {
    if (rede.has(w) || GENERICOS.has(w) || CONECTIVOS.has(w)) continue;
    if (APELIDOS[w]) w = APELIDOS[w];
    out.add(w);
  }
  return out;
}

/** Coeficiente de Dice (0 a 1) entre os termos distintivos das duas lojas. */
function pontuarLoja(nomeA, nomeB, termosDaRede = []) {
  const a = termosDaLoja(nomeA, termosDaRede);
  const b = termosDaLoja(nomeB, termosDaRede);
  if (!a.size && !b.size) return 0;
  let comuns = 0;
  for (const t of a) if (b.has(t)) comuns++;
  return (2 * comuns) / (a.size + b.size);
}

module.exports = {
  palavrasDaLoja,
  prefixoComumDeNomes,
  nomeSugeridoDeSubrede,
  sugerirNomesDeLojas,
  termosDaLoja,
  pontuarLoja,
};
