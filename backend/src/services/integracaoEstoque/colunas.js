/**
 * Reconhecimento de colunas pelo NOME (nunca pela posicao), em tres camadas de precedencia:
 *  1. sinonimo ja cadastrado para a rede (aprendido; pode apontar para campo do sistema,
 *     campo personalizado ou "ignorar");
 *  2. sinonimo de fabrica (contrato minimo que a leitura exige);
 *  3. campo personalizado criado pela pessoa (chega aqui via camada 1, pois criar o campo
 *     tambem grava o sinonimo do cabecalho).
 * Se nada bater, a coluna e "nova" e a pessoa decide na hora.
 */
const { normalizarCabecalho } = require("./texto");

// Campos que a leitura conhece de fabrica. `zeroSeVazio`: numerico obrigatorio para o calculo
// (celula vazia vira 0); os informativos vazios ficam null (zero seria valor inventado).
const CAMPOS_SISTEMA = [
  { chave: "fornecedor", rotulo: "Fornecedor", obrigatorio: false, tipo: "codigo_descricao", sinonimos: ["fornecedor"] },
  { chave: "categoria", rotulo: "Categoria", obrigatorio: false, tipo: "codigo_descricao", sinonimos: ["categoria"] },
  { chave: "produto", rotulo: "Produto", obrigatorio: true, tipo: "codigo_descricao", sinonimos: ["produto"] },
  { chave: "subrede", rotulo: "Filial / Subrede (loja)", obrigatorio: true, tipo: "codigo_descricao", sinonimos: ["filial", "subrede", "loja"] },
  { chave: "estoque_atual", rotulo: "Estoque atual", obrigatorio: true, tipo: "numero", zeroSeVazio: true, sinonimos: ["estoque atual", "estoque", "saldo estoque"] },
  { chave: "qtd_vendida", rotulo: "Qtd vendida (30 dias)", obrigatorio: true, tipo: "numero", zeroSeVazio: true, sinonimos: ["qtd vendida", "quantidade vendida", "qtde vendida"] },
  { chave: "custo_medio_unitario", rotulo: "Custo médio unitário R$", obrigatorio: false, tipo: "numero", sinonimos: ["custo medio unit r$", "custo medio unit", "custo medio unitario", "custo medio"] },
  { chave: "venda_reais", rotulo: "Venda R$", obrigatorio: true, tipo: "numero", zeroSeVazio: true, sinonimos: ["venda r$", "venda em reais", "vlr venda r$", "valor venda r$"] },
  { chave: "valor_estoque_reais", rotulo: "Valor do estoque R$", obrigatorio: true, tipo: "numero", zeroSeVazio: true, sinonimos: ["vlr estoque r$", "valor estoque r$", "vlr estoque", "valor estoque"] },
  { chave: "dde", rotulo: "DDE (informado pelo cliente)", obrigatorio: false, tipo: "numero", sinonimos: ["dde"] },
  { chave: "idade_dias", rotulo: "Idade (dias)", obrigatorio: false, tipo: "numero", sinonimos: ["idade", "idade dias"] },
];

const POR_CHAVE = new Map(CAMPOS_SISTEMA.map((c) => [c.chave, c]));
const SINONIMOS_FABRICA = new Map();
for (const c of CAMPOS_SISTEMA) for (const s of c.sinonimos) SINONIMOS_FABRICA.set(normalizarCabecalho(s), c.chave);

const MAX_LINHAS_PROCURA_CABECALHO = 15;
const MINIMO_COLUNAS_RECONHECIDAS = 3;

/**
 * regras = {
 *   colunas: Map(cabecalhoNormalizado -> { campo|null, ignorar }),   // sinonimos aprendidos
 *   campos:  Map(chave -> { chave, rotulo, tipoValor })               // campos personalizados
 * }
 */
function regrasVazias() {
  return { colunas: new Map(), campos: new Map() };
}

function campoExiste(chave, regras) {
  return POR_CHAVE.has(chave) || regras.campos.has(chave);
}

/** Resolve um cabecalho normalizado para um campo, na ordem de precedencia das camadas. */
function resolverCampo(normalizado, regras) {
  const aprendido = regras.colunas.get(normalizado);
  if (aprendido) {
    if (aprendido.ignorar) return { campo: null, ignorar: true, origem: "cliente" };
    if (aprendido.campo && campoExiste(aprendido.campo, regras)) {
      return { campo: aprendido.campo, ignorar: false, origem: "cliente" };
    }
    // sinonimo orfao (campo personalizado removido): cai para as proximas camadas
  }
  const fabrica = SINONIMOS_FABRICA.get(normalizado);
  if (fabrica) return { campo: fabrica, ignorar: false, origem: "fabrica" };
  return { campo: null, ignorar: false, origem: null };
}

/**
 * Procura a linha do cabecalho nas primeiras N linhas: vence a que tem MAIS celulas
 * reconhecidas (>= minimo); empate fica com a PRIMEIRA. `linhas` e array de arrays de celulas.
 * Retorna { indice (0-based), reconhecidas } ou null.
 */
function acharCabecalho(linhas, regras, { maxLinhas = MAX_LINHAS_PROCURA_CABECALHO, minimo = MINIMO_COLUNAS_RECONHECIDAS } = {}) {
  let melhor = null;
  const limite = Math.min(maxLinhas, linhas.length);
  for (let i = 0; i < limite; i++) {
    let n = 0;
    for (const cel of linhas[i] || []) {
      const norm = normalizarCabecalho(cel);
      if (!norm) continue;
      const r = resolverCampo(norm, regras);
      if (r.campo || r.ignorar) n++;
    }
    if (n >= minimo && (!melhor || n > melhor.reconhecidas)) melhor = { indice: i, reconhecidas: n };
  }
  return melhor;
}

/**
 * Mapeia cada coluna do cabecalho. Campo ja visto nesta leitura => coluna DUPLICADA (nao lida:
 * nunca somar nem escolher em silencio). Retorna { colunas, obrigatoriosAusentes }.
 */
function mapearColunas(celulasCabecalho, regras) {
  let ultima = -1;
  celulasCabecalho.forEach((c, i) => { if (normalizarCabecalho(c)) ultima = i; });

  const vistos = new Set();
  const colunas = [];
  for (let i = 0; i <= ultima; i++) {
    const original = celulasCabecalho[i];
    const norm = normalizarCabecalho(original);
    if (!norm) continue; // celula de cabecalho vazia entre colunas: nao e coluna
    const r = resolverCampo(norm, regras);
    const col = {
      indice: i,
      cabecalhoOriginal: String(original).trim(),
      cabecalhoNormalizado: norm,
      campo: r.campo,
      origem: r.origem,
      ignorar: r.ignorar,
      duplicada: false,
      status: "nova",
    };
    if (r.ignorar) col.status = "ignorada";
    else if (r.campo) {
      if (vistos.has(r.campo)) { col.duplicada = true; col.status = "duplicada"; }
      else { vistos.add(r.campo); col.status = "reconhecida"; }
    }
    colunas.push(col);
  }

  const obrigatoriosAusentes = CAMPOS_SISTEMA
    .filter((c) => c.obrigatorio && !vistos.has(c.chave))
    .map((c) => ({ chave: c.chave, rotulo: c.rotulo }));

  return { colunas, obrigatoriosAusentes };
}

module.exports = {
  CAMPOS_SISTEMA,
  POR_CHAVE,
  MAX_LINHAS_PROCURA_CABECALHO,
  MINIMO_COLUNAS_RECONHECIDAS,
  regrasVazias,
  campoExiste,
  resolverCampo,
  acharCabecalho,
  mapearColunas,
};
