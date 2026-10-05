const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const c = require("../controllers/integracaoEstoqueController");

const router = express.Router();

// Por enquanto, so o administrador enxerga a Integracao Estoque.
router.use(auth, requirePermission("integracao_estoque.usar"));

// A planilha chega como corpo binario (nome e rede vao na query string).
const arquivo = express.raw({ type: () => true, limit: "8mb" });

router.get("/clientes", c.clientes);
router.post("/ler", arquivo, c.ler);
router.post("/colunas", c.colunas);
router.post("/lojas/lote", c.lojasLote);
router.get("/produtos/buscar", c.buscarProdutos);
router.post("/produtos/vinculos", c.vincular);
router.post("/produtos/fantasma", c.fantasma);
router.post("/confirmar", arquivo, c.confirmar);
router.get("/retratos", c.retratos);
router.get("/retratos/:id/arquivo", c.arquivo);

module.exports = router;
