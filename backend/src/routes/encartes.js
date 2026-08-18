const express = require("express");
const { auth, requireRole } = require("../middlewares/auth");
const {
  listar,
  criar,
  obter,
  adicionarItem,
  removerItem,
  atualizarItem,
  atualizar,
  remover,
  listarProdutos,
  listarCategorias,
  listarSubcategorias,
  performance,
} = require("../controllers/encarteController");
const { gerarPdfRede, gerarPdfGeral } = require("../controllers/pdfController");

const router = express.Router();

// Todos os endpoints exigem autenticacao
router.use(auth);

// Supervisores, admin e diretoria podem acessar encartes
const roles = requireRole("supervisor", "admin", "diretoria");

router.get("/",                           roles, listar);
router.post("/",                          requireRole("supervisor", "admin"), criar);
router.get("/categorias",                 roles, listarCategorias);
router.get("/produtos",                   roles, listarProdutos);
router.get("/subcategorias",              roles, listarSubcategorias);
router.get("/performance",                requireRole("admin", "diretoria"), performance);
router.get("/pdf/geral",                  roles, gerarPdfGeral);
router.get("/pdf/rede/:codigoRede",       roles, gerarPdfRede);
router.get("/debug/rede/:codigoRede",     roles, async (req, res) => {
  try {
    const { codigoRede } = req.params;
    const Encarte = require("../models/Encarte");
    const encartes = await Encarte.find({ codigoRede }).lean();
    res.json({ 
      codigoRede, 
      total: encartes.length, 
      encartes: encartes.map(e => ({
        _id: e._id,
        nome: e.nome,
        tipo: e.tipo,
        periodoInicio: e.periodoInicio,
        periodoFim: e.periodoFim,
        itensCount: e.itens?.length || 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});
router.get("/:id",                        roles, obter);
router.put("/:id",                        roles, atualizar);
router.delete("/:id",                     roles, remover);
router.post("/:id/itens",                 roles, adicionarItem);
router.put("/:id/itens/:itemId",          roles, atualizarItem);
router.delete("/:id/itens/:itemId",       roles, removerItem);

module.exports = router;
