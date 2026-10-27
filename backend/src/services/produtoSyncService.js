const Produto = require("../models/Produto");
const PrecoRede = require("../models/PrecoRede");
const { buscarProdutosDoErp, buscarPrecosRedeDoErp, sincronizarCarteira } = require("./erpService");
const { erpConfigurado } = require("./erpDbService");

/**
 * Sincroniza o catalogo de produtos do ERP para o MongoDB.
 * Faz upsert por codigo do produto.
 */
async function sincronizarProdutos() {
  if (!erpConfigurado()) {
    return { atualizados: 0, total: 0, observacao: "ERP nao configurado — preencha as variaveis ERP_* no .env" };
  }

  const rows = await buscarProdutosDoErp();
  if (!rows.length) {
    return { atualizados: 0, total: 0, observacao: "Nenhum produto retornado pelo ERP" };
  }

  const ops = rows.map((p) => ({
    updateOne: {
      filter: { codigo: String(p.codigo) },
      update: {
        $set: {
          codigo:        String(p.codigo),
          codigoLivre:   p.codigoLivre  ? String(p.codigoLivre).trim() : "", // CHAR no SQL Server vem com espacos a direita
          descricao:     p.descricao    || "",
          categoria:     p.categoria    || "",
          subcategoria:  p.subcategoria  || "",
          precoTabela:   Number(p.precoTabela  || 0),
          precoMinimo:   Number(p.precoMinimo  || 0),
          precoP2:       Number(p.precoP2      || 0),
          precoP3:       Number(p.precoP3      || 0),
          precoPromo:    Number(p.precoP3      || 0),
          custo:         Number(p.custo        || 0),
          shelf:         Number(p.shelf        || 0),
          diasGiro:      Number(p.diasGiro     || 0),
          diasRebaixa:   Number(p.diasRebaixa  || 0),
          sincronizadoEm: new Date(),
          ativo: true,
        },
      },
      upsert: true,
    },
  }));

  let atualizados = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const r = await Produto.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    atualizados += (r.modifiedCount || 0) + (r.upsertedCount || 0);
  }

  return { atualizados, total: rows.length };
}

/** Linhas da E08 -> uma por rede x produto (a linha mais recente vence quando ha duplicidade). Funcao pura. */
function consolidarPrecosRede(rows) {
  const porChave = new Map();
  for (const r of rows || []) {
    const codigoRede = String(r.codigoRede ?? "").trim();
    const produtoCodigo = String(r.produtoCodigo ?? "").trim();
    if (!codigoRede || !produtoCodigo) continue;
    const chave = `${codigoRede}|${produtoCodigo}`;
    const atual = porChave.get(chave);
    if (atual && Number(atual.id) > Number(r.id)) continue;
    porChave.set(chave, {
      id: Number(r.id) || 0,
      codigoRede,
      produtoCodigo,
      p1: Number(r.p1) || 0,
      p2: Number(r.p2) || 0,
      p3: Number(r.p3) || 0,
      p4: Number(r.p4) || 0,
    });
  }
  return [...porChave.values()];
}

/**
 * Tabela de preco por rede (E08) -> PrecoRede. Espelho: o que nao veio mais e removido.
 */
async function sincronizarPrecosRede() {
  if (!erpConfigurado()) {
    return { atualizados: 0, total: 0, observacao: "ERP nao configurado — preencha as variaveis ERP_* no .env" };
  }
  const linhas = consolidarPrecosRede(await buscarPrecosRedeDoErp());
  if (!linhas.length) return { atualizados: 0, total: 0, observacao: "Nenhum preco por rede retornado pelo ERP" };

  const agora = new Date();
  const ops = linhas.map(({ id, ...l }) => ({
    updateOne: {
      filter: { codigoRede: l.codigoRede, produtoCodigo: l.produtoCodigo },
      update: { $set: { ...l, sincronizadoEm: agora } },
      upsert: true,
    },
  }));
  let atualizados = 0;
  for (let i = 0; i < ops.length; i += 1000) {
    const r = await PrecoRede.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
    atualizados += (r.modifiedCount || 0) + (r.upsertedCount || 0);
  }
  const del = await PrecoRede.deleteMany({ sincronizadoEm: { $lt: agora } });
  return { atualizados, total: linhas.length, removidos: del.deletedCount || 0 };
}

/**
 * Sync completo do ERP: carteira + produtos + precos por rede.
 */
async function sincronizarERP() {
  const carteira  = await sincronizarCarteira();
  const produtos  = await sincronizarProdutos();
  const precosRede = await sincronizarPrecosRede();
  return { carteira, produtos, precosRede };
}

module.exports = { sincronizarProdutos, sincronizarPrecosRede, consolidarPrecosRede, sincronizarERP };
