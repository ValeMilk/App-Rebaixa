/**
 * Leitura da planilha de estoque: acha o cabecalho, mapeia colunas pelo nome, extrai as linhas
 * sem corrigir nem inventar nada e infere a data do retrato.
 *
 * Regras de fidelidade (nao negociaveis):
 *  - linha sem produto OU sem loja nao e dado: vai para "descartadas" com o motivo (nunca some);
 *  - celula numerica vazia vira 0 so quando o campo e obrigatorio para o calculo; informativo
 *    vazio vira null (zero seria valor inventado);
 *  - nenhum valor e arredondado ou corrigido;
 *  - conservacao: validas + descartadas == total de linhas de dado (todas depois do cabecalho).
 */
const ExcelJS = require("exceljs");
const { celulaTexto, separarCodigoDescricao, paraNumero } = require("./texto");
const {
  CAMPOS_SISTEMA,
  POR_CHAVE,
  acharCabecalho,
  mapearColunas,
  MAX_LINHAS_PROCURA_CABECALHO,
} = require("./colunas");

const MAX_LINHAS_ARQUIVO = 20000;

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

/** Normaliza o valor cru de uma celula do exceljs (formula, rich text, hyperlink, erro). */
function valorDaCelula(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return valorDaCelula(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return valorDaCelula(v.text);
    if ("error" in v) return null;
    return null;
  }
  return v;
}

/** Le a primeira aba do .xlsx como matriz de celulas (linha 1 = indice 0). */
async function lerMatriz(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw erro(400, "Nao foi possivel ler o arquivo. Envie uma planilha .xlsx valida.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw erro(400, "O arquivo nao tem nenhuma aba.");
  if (ws.rowCount > MAX_LINHAS_ARQUIVO) {
    throw erro(400, `Arquivo com linhas demais (${ws.rowCount}). O limite e ${MAX_LINHAS_ARQUIVO}.`);
  }
  const colunas = ws.columnCount;
  const matriz = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const linha = [];
    for (let c = 1; c <= colunas; c++) linha.push(valorDaCelula(row.getCell(c).value));
    matriz.push(linha);
  }
  return matriz;
}

// ── Data do retrato ─────────────────────────────────────────────────────────────

function dataValida(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Varre o texto por uma data (AAAA-MM-DD, DD-MM, DD/MM, DD.MM, com ano opcional de 2 ou 4 digitos). */
function extrairDataDoTexto(texto) {
  const t = String(texto ?? "");
  const iso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(t);
  if (iso && dataValida(+iso[1], +iso[2], +iso[3])) {
    return { dia: +iso[3], mes: +iso[2], ano: +iso[1], texto: iso[0] };
  }
  const re = /(?<!\d)(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}|\d{2}))?(?!\d)/g;
  let m;
  while ((m = re.exec(t))) {
    const dia = +m[1];
    const mes = +m[2];
    let ano = m[3] ? +m[3] : null;
    if (ano !== null && ano < 100) ano += 2000;
    const anoTeste = ano ?? 2000; // so para validar dia/mes sem ano (2000 e bissexto)
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && dataValida(anoTeste, mes, dia)) {
      return { dia, mes, ano, texto: m[0] };
    }
  }
  return null;
}

/** Sem ano declarado: evita que "31-12" lido em janeiro vire dezembro DO ANO QUE VEM. */
function inferirAno(dia, mes, hoje) {
  const anoCorrente = hoje.getFullYear();
  const candidato = Date.UTC(anoCorrente, mes - 1, dia);
  const limite = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) + 86400000;
  return candidato > limite ? anoCorrente - 1 : anoCorrente;
}

/** Titulo primeiro, nome do arquivo na falta dele. Retorna { data, fonte, texto, anoInferido } ou null. */
function inferirData({ titulo, nomeArquivo, hoje = new Date() }) {
  const fontes = [
    { fonte: "titulo", texto: titulo },
    { fonte: "arquivo", texto: String(nomeArquivo ?? "").replace(/\.[a-z0-9]+$/i, "") },
  ];
  for (const f of fontes) {
    const achada = extrairDataDoTexto(f.texto);
    if (!achada) continue;
    const anoInferido = achada.ano === null;
    const ano = anoInferido ? inferirAno(achada.dia, achada.mes, hoje) : achada.ano;
    if (!dataValida(ano, achada.mes, achada.dia)) continue; // ex.: 29-02 num ano nao bissexto
    const p2 = (n) => String(n).padStart(2, "0");
    return { data: `${ano}-${p2(achada.mes)}-${p2(achada.dia)}`, fonte: f.fonte, texto: achada.texto, anoInferido };
  }
  return null;
}

// ── Extracao das linhas ─────────────────────────────────────────────────────────

function resumoDaLinha(row) {
  return row.map(celulaTexto).filter((c) => c !== null).slice(0, 6).join(" | ");
}

/**
 * Extrai as linhas de dado (todas depois do cabecalho). Pura: recebe a matriz e o mapeamento.
 * Retorna { validas, descartadas, totalLinhasDado }.
 */
function extrairLinhas({ matriz, indiceCabecalho, colunas, regras }) {
  const porCampo = new Map();
  for (const c of colunas) if (c.campo && !c.duplicada && !c.ignorar) porCampo.set(c.campo, c.indice);

  const validas = [];
  const descartadas = [];
  const total = matriz.length - (indiceCabecalho + 1);

  for (let i = indiceCabecalho + 1; i < matriz.length; i++) {
    const row = matriz[i];
    const numeroLinha = i + 1; // 1-indexada, como no Excel
    const descartar = (motivo) => descartadas.push({ linha: numeroLinha, motivo, conteudo: resumoDaLinha(row) });

    if (row.every((c) => celulaTexto(c) === null)) { descartar("linha em branco"); continue; }

    const cel = (campo) => (porCampo.has(campo) ? row[porCampo.get(campo)] : null);
    const produto = separarCodigoDescricao(cel("produto"));
    const loja = separarCodigoDescricao(cel("subrede"));
    if (!produto.codigo && !loja.codigo) { descartar("sem produto e sem loja"); continue; }
    if (!produto.codigo) { descartar("sem produto"); continue; }
    if (!loja.codigo) { descartar("sem loja"); continue; }

    let falhou = null;
    const numero = (campo) => {
      const def = POR_CHAVE.get(campo);
      const bruto = cel(campo);
      const n = paraNumero(bruto);
      if (!n.ok) { falhou = `valor invalido em "${def.rotulo}": ${JSON.stringify(celulaTexto(bruto))}`; return null; }
      if (n.vazio) return def.zeroSeVazio ? 0 : null;
      return n.valor;
    };

    const estoqueAtual = numero("estoque_atual");
    const qtdVendida = numero("qtd_vendida");
    const vendaReais = numero("venda_reais");
    const valorEstoqueReais = numero("valor_estoque_reais");
    const custoMedioUnitario = porCampo.has("custo_medio_unitario") ? numero("custo_medio_unitario") : null;
    const ddeInformado = porCampo.has("dde") ? numero("dde") : null;
    const idadeDias = porCampo.has("idade_dias") ? numero("idade_dias") : null;

    const extras = {};
    for (const [chave, def] of regras.campos) {
      if (!porCampo.has(chave)) continue;
      const bruto = row[porCampo.get(chave)];
      if (def.tipoValor === "numero") {
        const n = paraNumero(bruto);
        if (!n.ok) { falhou = `valor invalido em "${def.rotulo}": ${JSON.stringify(celulaTexto(bruto))}`; break; }
        extras[chave] = n.vazio ? null : n.valor;
      } else {
        extras[chave] = celulaTexto(bruto); // texto e data (data vira AAAA-MM-DD)
      }
    }
    if (falhou) { descartar(falhou); continue; }

    const categoria = separarCodigoDescricao(cel("categoria"));
    const fornecedor = separarCodigoDescricao(cel("fornecedor"));

    validas.push({
      linha: numeroLinha,
      lojaCodigo: loja.codigo,
      lojaRazaoSocial: loja.descricao,
      produtoCodigo: produto.codigo,
      produtoDescricao: produto.descricao,
      categoriaCodigo: categoria.codigo,
      categoriaNome: categoria.descricao,
      fornecedorCodigo: fornecedor.codigo,
      fornecedorNome: fornecedor.descricao,
      estoqueAtual,
      qtdVendida,
      vendaReais,
      valorEstoqueReais,
      custoMedioUnitario,
      ddeInformado,
      idadeDias,
      extras,
    });
  }
  return { validas, descartadas, totalLinhasDado: total };
}

/** Primeira celula nao vazia antes da linha do cabecalho. */
function tituloAntesDoCabecalho(matriz, indiceCabecalho) {
  for (let i = 0; i < indiceCabecalho; i++) {
    for (const c of matriz[i]) {
      const t = celulaTexto(c);
      if (t) return t;
    }
  }
  return null;
}

/**
 * Sem nenhuma linha com colunas suficientes reconhecidas, a linha com mais celulas preenchidas
 * (nas primeiras N) vira CANDIDATA a cabecalho, para a pessoa poder ensinar os nomes.
 */
function cabecalhoCandidato(matriz) {
  let melhor = null;
  const limite = Math.min(MAX_LINHAS_PROCURA_CABECALHO, matriz.length);
  for (let i = 0; i < limite; i++) {
    const n = matriz[i].filter((c) => celulaTexto(c) !== null).length;
    if (n >= 2 && (!melhor || n > melhor.n)) melhor = { indice: i, n };
  }
  return melhor ? melhor.indice : null;
}

/**
 * Le a planilha inteira. `regras` = regras da rede (ver colunas.js).
 * Retorna tudo que a previa precisa, sem tocar em banco.
 */
async function lerPlanilha({ buffer, nomeArquivo, regras, hoje = new Date() }) {
  const matriz = await lerMatriz(buffer);

  let achado = acharCabecalho(matriz, regras);
  let cabecalhoIncerto = false;
  if (!achado) {
    const cand = cabecalhoCandidato(matriz);
    if (cand === null) {
      return {
        matrizLinhas: matriz.length,
        semCabecalho: true,
        cabecalhoIncerto: false,
        linhaCabecalho: null,
        titulo: null,
        colunas: [],
        obrigatoriosAusentes: CAMPOS_SISTEMA.filter((c) => c.obrigatorio).map((c) => ({ chave: c.chave, rotulo: c.rotulo })),
        validas: [],
        descartadas: [],
        totalLinhasDado: 0,
        dataInferida: inferirData({ titulo: null, nomeArquivo, hoje }),
        leituraBloqueada: true,
      };
    }
    achado = { indice: cand, reconhecidas: 0 };
    cabecalhoIncerto = true;
  }

  const titulo = tituloAntesDoCabecalho(matriz, achado.indice);
  const { colunas, obrigatoriosAusentes } = mapearColunas(matriz[achado.indice], regras);
  const leituraBloqueada = obrigatoriosAusentes.length > 0;

  let extraido = { validas: [], descartadas: [], totalLinhasDado: matriz.length - (achado.indice + 1) };
  if (!leituraBloqueada) {
    extraido = extrairLinhas({ matriz, indiceCabecalho: achado.indice, colunas, regras });
  }

  return {
    matrizLinhas: matriz.length,
    semCabecalho: false,
    cabecalhoIncerto,
    linhaCabecalho: achado.indice + 1,
    titulo,
    colunas,
    obrigatoriosAusentes,
    ...extraido,
    dataInferida: inferirData({ titulo, nomeArquivo, hoje }),
    leituraBloqueada,
  };
}

module.exports = {
  MAX_LINHAS_ARQUIVO,
  lerMatriz,
  lerPlanilha,
  extrairLinhas,
  extrairDataDoTexto,
  inferirAno,
  inferirData,
  tituloAntesDoCabecalho,
};
