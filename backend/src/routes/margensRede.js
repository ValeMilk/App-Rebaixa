const express = require("express");
const { auth, requirePermission } = require("../middlewares/auth");
const c = require("../controllers/margensRedeController");

// v2.0 fase 3: cadastro de margens por rede e custo medio.
//  - ver (lista, config, versoes, download): margens_rede.gerenciar OU custo_medio.anexar
//    (o supervisor sem "gerenciar" so alcanca as redes em que e responsavel: o service filtra)
//  - salvar config: margens_rede.gerenciar
//  - ler/confirmar custo medio: custo_medio.anexar E (admin ou responsavel pela rede)
const router = express.Router();
router.use(auth);

const ver = requirePermission("margens_rede.gerenciar", "custo_medio.anexar");
const gerenciar = requirePermission("margens_rede.gerenciar");
const anexar = requirePermission("custo_medio.anexar");

// A planilha chega como corpo binario (nome do arquivo em ?nomeArquivo=).
const arquivo = express.raw({ type: () => true, limit: "8mb" });

router.get("/", ver, c.listar);
router.get("/:codigoRede", ver, c.obter);
router.put("/:codigoRede", gerenciar, c.salvar);
router.get("/:codigoRede/custo-medio", ver, c.versoes);
router.get("/:codigoRede/custo-medio/:versao/arquivo", ver, c.arquivo);
router.post("/:codigoRede/custo-medio/ler", anexar, arquivo, c.ler);
router.post("/:codigoRede/custo-medio/confirmar", anexar, arquivo, c.confirmar);

module.exports = router;
