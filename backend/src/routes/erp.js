const express = require("express");
const { auth } = require("../middlewares/auth");
const { buscarUltimaCompra } = require("../services/erpService");

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
    });
  } catch (err) {
    console.error("[erp/ultima-compra]", err.message);
    return res.status(500).json({ error: "Erro ao consultar ERP" });
  }
});

module.exports = router;
