const Produto = require("../models/Produto");
const { buscarProdutosDoErp, sincronizarCarteira } = require("./erpService");
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
          codigoLivre:   p.codigoLivre  ? String(p.codigoLivre)  : "",
          descricao:     p.descricao    || "",
          categoria:     p.categoria    || "",
          precoTabela:   Number(p.precoTabela  || 0),
          precoMinimo:   Number(p.precoMinimo  || 0),
          precoPromo:    Number(p.precoPromo   || 0),
          custo:         Number(p.custo        || 0),
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

/**
 * Sync completo do ERP: carteira + produtos.
 */
async function sincronizarERP() {
  const carteira  = await sincronizarCarteira();
  const produtos  = await sincronizarProdutos();
  return { carteira, produtos };
}

module.exports = { sincronizarProdutos, sincronizarERP };
