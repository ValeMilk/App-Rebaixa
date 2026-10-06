/**
 * Planilha dos itens selecionados no Painel de Vencimentos: loja, produto, estoque, validade e
 * o preco da ultima compra da loja no ERP (Lacteus).
 */
const ExcelJS = require("exceljs");

const COLUNAS = [
  { header: "ID loja", key: "clienteCodigo", width: 10 },
  { header: "Loja", key: "cliente", width: 34 },
  { header: "Código produto", key: "produtoCodigo", width: 15 },
  { header: "Nome produto", key: "produto", width: 44 },
  { header: "Estoque", key: "quantidade", width: 10 },
  { header: "Data de validade", key: "dataValidade", width: 16, style: { numFmt: "dd/mm/yyyy" } },
  { header: "Dias para vencer", key: "diasParaVencer", width: 16 },
  { header: "Última visita do promotor", key: "ultimaVisita", width: 22, style: { numFmt: "dd/mm/yyyy hh:mm" } },
  { header: "Promotor", key: "promotor", width: 24 },
  { header: "Preço de compra (ERP)", key: "precoCompra", width: 20, style: { numFmt: '"R$" #,##0.00' } },
  { header: "Data da última compra", key: "dataCompra", width: 20, style: { numFmt: "dd/mm/yyyy" } },
  { header: "Preço vem de", key: "origemPreco", width: 24 },
];

const ORIGEM = { loja: "última compra da loja", rede: "última compra da rede" };

/** Data (ou texto ISO) como dia local, sem hora, para a celula do Excel. */
function soDia(valor) {
  if (!valor) return null;
  const s = valor instanceof Date ? valor.toISOString() : String(valor);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/**
 * Linhas da planilha a partir dos itens do estoque e das ultimas compras. Funcao pura.
 * `compras`: mapa "cliente|produto" (compra da propria loja). `comprasRede`: mapa "rede|produto",
 * usado quando a loja nao compra em nome proprio (compra pelo CD da rede ou tem outro codigo no ERP).
 */
function montarLinhas(itens, compras, comprasRede = new Map()) {
  return itens.map((it) => {
    let origem = "loja";
    let c = compras.get(`${it.clienteCodigo}|${it.produtoCodigo}`) || null;
    if (!c && it.codigoRede) {
      c = comprasRede.get(`${it.codigoRede}|${it.produtoCodigo}`) || null;
      origem = "rede";
    }
    return {
      clienteCodigo: it.clienteCodigo,
      cliente: it.cliente || "",
      produtoCodigo: it.produtoCodigo,
      produto: it.produto || "",
      quantidade: Number(it.quantidade) || 0,
      dataValidade: soDia(it.dataValidade),
      diasParaVencer: it.diasParaVencer ?? null,
      // hora de relogio da visita, gravada como UTC para o Excel nao deslocar o fuso
      ultimaVisita: it.ultimaVisitaEm ? new Date(`${it.ultimaVisitaEm}:00Z`) : null,
      promotor: it.ultimaVisitaPor || null,
      precoCompra: c ? Number(c.precoUltimaCompra) || 0 : null,
      dataCompra: c ? soDia(c.dataUltimaCompra) : null,
      origemPreco: c ? ORIGEM[origem] : "sem compra no ERP",
    };
  });
}

async function gerarPlanilha(linhas) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InfoVale";
  const ws = wb.addWorksheet("Vencimentos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUNAS;
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + COLUNAS.length)}1` };
  for (const l of linhas) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { COLUNAS, montarLinhas, gerarPlanilha };
