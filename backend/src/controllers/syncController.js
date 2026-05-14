const { sincronizarEstoque } = require("../services/estoqueSyncService");
const { sincronizarCarteira } = require("../services/erpService");
const { sincronizarProdutos, sincronizarERP } = require("../services/produtoSyncService");
const { erpConfigurado } = require("../services/erpDbService");

let executando = false;
let ultimaExecucao = null;

async function rodarSyncEstoque(req, res) {
  if (executando) {
    return res.status(409).json({ error: "Ja existe uma sincronizacao em andamento" });
  }
  executando = true;
  try {
    const r = await sincronizarEstoque();
    ultimaExecucao = { tipo: "estoque", em: new Date(), resultado: r };
    res.json({ ok: true, ...r });
  } finally {
    executando = false;
  }
}

async function rodarSyncCarteira(_req, res) {
  const r = await sincronizarCarteira();
  ultimaExecucao = { tipo: "carteira", em: new Date(), resultado: r };
  res.json({ ok: true, ...r });
}

async function rodarSyncProdutos(_req, res) {
  const r = await sincronizarProdutos();
  ultimaExecucao = { tipo: "produtos", em: new Date(), resultado: r };
  res.json({ ok: true, ...r });
}

async function rodarSyncERP(_req, res) {
  const r = await sincronizarERP();
  ultimaExecucao = { tipo: "erp_completo", em: new Date(), resultado: r };
  res.json({ ok: true, ...r });
}

function status(_req, res) {
  res.json({
    executando,
    ultimaExecucao,
    erpConfigurado: erpConfigurado(),
  });
}

module.exports = { rodarSyncEstoque, rodarSyncCarteira, rodarSyncProdutos, rodarSyncERP, status };
