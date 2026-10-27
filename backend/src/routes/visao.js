const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const { listarEstoque, resumo, listarRupturas, marcarPedidoFeito } = require("../controllers/visaoController");

// v2.0 fase 1b: telas Estoque e vencimento e Ruptura (dados restritos ao alcance do usuario)
const router = express.Router();
router.use(auth, requirePermission("visao_lojas.ver"));

router.get("/estoque", listarEstoque);
router.get("/resumo", resumo);
router.get("/rupturas", listarRupturas);
router.post("/rupturas/:id/pedido-feito", marcarPedidoFeito);

module.exports = router;
