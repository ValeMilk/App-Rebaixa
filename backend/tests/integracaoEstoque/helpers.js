const ExcelJS = require("exceljs");

/** Monta um .xlsx em memoria a partir de uma matriz de linhas (array de arrays). */
async function criarPlanilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Estoque");
  linhas.forEach((l) => ws.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const CABECALHO = [
  "Fornecedor", "Categoria", "Produto", "Filial", "Estoque Atual", "Qtd Vendida",
  "Custo Médio Unit. R$", "Venda R$", "Vlr Estoque R$", "DDE", "Idade",
];

/** Layout de referencia: titulo, linha vazia, cabecalho, dados. */
function layoutReferencia(dados, { titulo = "ESTOQUE 22-09", cabecalho = CABECALHO } = {}) {
  return [[titulo], [], cabecalho, ...dados];
}

const LOJA_A = "101 - MATEUS SUPERMERCADOS S.A. MIX ITAPIPOCA - CE";
const LOJA_B = "102 - MATEUS SUPERMERCADOS S.A. MIX JUAZEIRO DO NORTE - CE";

/** Linha de dado no layout de referencia. */
function dado(produto, loja, estoque, qtd, custo, venda, vlr, dde = 10, idade = 5) {
  return ["1 - VALE MILK", "7 - QUEIJOS", produto, loja, estoque, qtd, custo, venda, vlr, dde, idade];
}

module.exports = { criarPlanilha, CABECALHO, layoutReferencia, dado, LOJA_A, LOJA_B };
