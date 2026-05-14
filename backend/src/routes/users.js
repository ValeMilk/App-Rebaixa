const express = require("express");
const { listar, criar, atualizar, remover } = require("../controllers/userController");
const { auth, requireRole } = require("../middlewares/auth");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/", listar);
router.post("/", criar);
router.put("/:id", atualizar);
router.delete("/:id", remover);

module.exports = router;
