const express = require("express");
const { auth } = require("../middlewares/auth");
const { buscarUltimaCompra, buscarUltimaCompraRede, buscarUltimaCompraRedeBatch } = require("../services/erpService");

const router = express.Router();
router.use(auth);

router.get("/ultima-compra", async (req, res) => {
  const { clienteCodigo, produtoCodigo } = req.query || {};
  if (!clienteCodigo || !produtoCodigo) {
    return res.status(400).json({ error: "clienteCodigo e produtoCodigo sao obrigatorios" });
  }
  try {
    const r = await buscarUltimaCompra(clienteCodigo, produtoCodigo);
    if (!r) return res.json({ encontrado: false });
    return res.json({
      encontrado: true,
      precoUltimaCompra: Number(r.precoUltimaCompra) || 0,
      dataUltimaCompra: r.dataUltimaCompra,
      subcategoria: r.subcategoria || null,
      rede: r.rede || null,
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
    const r = await buscarUltimaCompraRede(codigoRede, produtoCodigo);
    if (!r) return res.json({ encontrado: false });
    return res.json({
      encontrado: true,
      clienteCodigo: String(r.clienteCodigo),
      precoUltimaCompra: Number(r.precoUltimaCompra) || 0,
      dataUltimaCompra: r.dataUltimaCompra,
      subcategoria: r.subcategoria || null,
      codigoRede: r.codigoRede != null ? String(r.codigoRede) : null,
      rede: r.rede || null,
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
    const resultados = await buscarUltimaCompraRedeBatch(codigoRede, produtosCodigos);
    return res.json({ resultados });
  } catch (err) {
    console.error("[erp/ultima-compra-rede-batch]", err.message);
    return res.status(500).json({ error: "Erro ao consultar ERP em batch" });
  }
});

module.exports = router;

