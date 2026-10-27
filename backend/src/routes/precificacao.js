const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const { montarContexto } = require("../services/precificacaoService");

// v2.0 fases 2 e 3: contexto de precificacao da solicitacao (ultima compra, desconto, precos do item
// e da rede, sellout automatico, piso). Quem cria solicitacao e quem decide usam.
const router = express.Router();
router.use(auth, requirePermission("solicitacoes.criar", "solicitacoes.decidir"));

router.get("/contexto", async (req, res, next) => {
  const { clienteCodigo, produtoCodigo, codigoRede, tipo } = req.query || {};
  if (!produtoCodigo || (!clienteCodigo && !codigoRede)) {
    return res.status(400).json({ error: "produtoCodigo e clienteCodigo (ou codigoRede) sao obrigatorios" });
  }
  try {
    const ctx = await montarContexto({ clienteCodigo, produtoCodigo, codigoRede, tipo });
    res.json(ctx);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
