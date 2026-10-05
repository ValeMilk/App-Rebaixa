const express = require("express");
const { listar, criar, atualizar, remover } = require("../controllers/userController");
const { auth, requirePermission } = require("../middlewares/auth");

const router = express.Router();

router.use(auth, requirePermission("usuarios.gerenciar"));

router.get("/", listar);
router.post("/", criar);
router.put("/:id", atualizar);
router.delete("/:id", remover);

module.exports = router;
