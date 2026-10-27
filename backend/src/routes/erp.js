const express = require("express");
const { auth } = require("../middlewares/auth");
const {
  buscarUltimaCompra,
  buscarUltimaCompraRede,
  buscarUltimaCompraRedeBatch,
  anexarDescontoContrato,
} = require("../services/erpService");

const router = express.Router();
router.use(auth);

// Campos do desconto de contrato diluido (so informativos; as margens seguem pela ultima compra normal)
function camposDesconto(r) {
  return {
    descontoContratoPercentual: r.descontoContratoPercentual ?? null,
    descontoContratoTipo: r.descontoContratoTipo ?? null,
    precoUltimaCompraComDesconto: r.precoUltimaCompraComDesconto ?? null,
  };
}

// `codigoRede` (opcional): quando a loja nao tem compra em nome proprio (compra pelo CD da rede
// ou tem outro codigo no Lacteus), cai para a compra mais recente de qualquer loja da rede,
// a mesma regra da planilha de vencimentos. A resposta diz a `origem` ("loja" | "rede").
router.get("/ultima-compra", async (req, res) => {
  const { clienteCodigo, produtoCodigo, codigoRede } = req.query || {};
  if (!clienteCodigo || !produtoCodigo) {
    return res.status(400).json({ error: "clienteCodigo e produtoCodigo sao obrigatorios" });
  }
  try {
    let origem = "loja";
    let r0 = await buscarUltimaCompra(clienteCodigo, produtoCodigo);
    if (!r0 && codigoRede) {
      r0 = await buscarUltimaCompraRede(codigoRede, produtoCodigo);
      origem = "rede";
    }
    if (!r0) return res.json({ encontrado: false });
    const [r] = await anexarDescontoContrato([r0]);
    return res.json({
      encontrado: true,
      origem,
      clienteCompraCodigo: r.clienteCodigo != null ? String(r.clienteCodigo).trim() : null,
      precoUltimaCompra: Number(r.precoUltimaCompra) || 0,
      dataUltimaCompra: r.dataUltimaCompra,
      subcategoria: r.subcategoria || null,
      rede: r.rede || null,
      ...camposDesconto(r),
    });
  } catch (err) {
    console.error("[erp/ultima-compra]", err.message);
    return res.status(500).json({ error: "Erro ao consultar ERP" });
  }
});

// Filtra por codigoRede direto no ERP (sem precisar de Carteira sincronizada)
router.post("/ultima-compra-rede", async (req, res) => {
  const { codigoRede, produtoCodigo } = req.body || {};
  if (!codigoRede || !produtoCodigo) {
    return res.status(400).json({ error: "codigoRede e produtoCodigo sao obrigatorios" });
  }

  try {
    const r0 = await buscarUltimaCompraRede(codigoRede, produtoCodigo);
    if (!r0) return res.json({ encontrado: false });
    // O desconto e o da loja cuja compra foi a mais recente (mesma origem do preco)
    const [r] = await anexarDescontoContrato([r0]);
    return res.json({
      encontrado: true,
      clienteCodigo: String(r.clienteCodigo),
      precoUltimaCompra: Number(r.precoUltimaCompra) || 0,
      dataUltimaCompra: r.dataUltimaCompra,
      subcategoria: r.subcategoria || null,
      codigoRede: r.codigoRede != null ? String(r.codigoRede) : null,
      rede: r.rede || null,
      ...camposDesconto(r),
    });
  } catch (err) {
    console.error("[erp/ultima-compra-rede]", err.message);
    return res.status(500).json({ error: "Erro ao consultar ERP" });
  }
});

// Busca última compra de MÚLTIPLOS produtos de uma vez (OTIMIZADO)
router.post("/ultima-compra-rede-batch", async (req, res) => {
  const { codigoRede, produtosCodigos } = req.body || {};
  if (!codigoRede || !Array.isArray(produtosCodigos) || produtosCodigos.length === 0) {
    return res.status(400).json({ error: "codigoRede e produtosCodigos[] sao obrigatorios" });
  }

  try {
    const brutos = await buscarUltimaCompraRedeBatch(codigoRede, produtosCodigos);
    const linhas = Object.entries(brutos).map(([cod, v]) => ({
      produtoCodigo: cod,
      clienteCodigo: v.clienteCodigo,
      precoUltimaCompra: v.preco,
      dataUltimaCompra: v.data,
    }));
    const enriquecidas = await anexarDescontoContrato(linhas);
    // Mantem { preco, data } (usado pelo app) e acrescenta o desconto de contrato
    const resultados = {};
    for (const l of enriquecidas) {
      resultados[l.produtoCodigo] = {
        preco: l.precoUltimaCompra,
        data: l.dataUltimaCompra,
        clienteCodigo: l.clienteCodigo ?? null,
        ...camposDesconto(l),
      };
    }
    return res.json({ resultados });
  } catch (err) {
    console.error("[erp/ultima-compra-rede-batch]", err.message);
    return res.status(500).json({ error: "Erro ao consultar ERP em batch" });
  }
});

module.exports = router;

