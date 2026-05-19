const ResponsavelRede = require("../models/ResponsavelRede");
const Carteira = require("../models/Carteira");
const User = require("../models/User");

// Lista todas as responsabilidades cadastradas
async function listar(req, res) {
  const itens = await ResponsavelRede.find().sort({ redeSubrede: 1 }).lean();
  res.json({ responsaveis: itens });
}

// Lista de redes disponiveis (distinct da Carteira) para o dropdown
async function redesDisponiveis(req, res) {
  const docs = await Carteira.aggregate([
    { $match: { codigoRede: { $ne: null } } },
    { $group: { _id: "$codigoRede", redeSubrede: { $first: "$redeSubrede" } } },
    { $project: { _id: 0, codigoRede: "$_id", redeSubrede: 1 } },
    { $sort: { redeSubrede: 1 } },
  ]);
  res.json({ redes: docs });
}

// Lista de supervisores ativos para o dropdown
async function supervisoresDisponiveis(req, res) {
  const users = await User.find({ role: "supervisor", ativo: true })
    .select("_id nome codigo")
    .sort({ nome: 1 })
    .lean();
  res.json({ supervisores: users });
}

async function criar(req, res) {
  const { codigoRede, supervisorId } = req.body || {};
  if (!codigoRede || !supervisorId) {
    return res.status(400).json({ error: "codigoRede e supervisorId sao obrigatorios" });
  }
  const sup = await User.findById(supervisorId);
  if (!sup || sup.role !== "supervisor") {
    return res.status(400).json({ error: "Usuario nao e um supervisor valido" });
  }
  // Pega redeSubrede a partir da Carteira (uma loja qualquer dessa rede)
  const exemplo = await Carteira.findOne({ codigoRede: String(codigoRede) });
  if (!exemplo) {
    return res.status(400).json({ error: "Rede nao encontrada na carteira" });
  }
  try {
    const doc = await ResponsavelRede.create({
      codigoRede: String(codigoRede),
      redeSubrede: exemplo.redeSubrede || null,
      supervisorId: sup._id,
      supervisorCodigo: sup.codigo,
      supervisorNome: sup.nome,
      criadoPorId: req.user.id,
      criadoPorNome: req.user.nome,
    });
    res.status(201).json({ responsavel: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Esta rede ja possui responsavel. Edite o registro existente." });
    }
    throw err;
  }
}

async function atualizar(req, res) {
  const { supervisorId } = req.body || {};
  if (!supervisorId) return res.status(400).json({ error: "supervisorId obrigatorio" });
  const sup = await User.findById(supervisorId);
  if (!sup || sup.role !== "supervisor") {
    return res.status(400).json({ error: "Usuario nao e um supervisor valido" });
  }
  const doc = await ResponsavelRede.findByIdAndUpdate(
    req.params.id,
    {
      supervisorId: sup._id,
      supervisorCodigo: sup.codigo,
      supervisorNome: sup.nome,
    },
    { new: true }
  );
  if (!doc) return res.status(404).json({ error: "Nao encontrado" });
  res.json({ responsavel: doc });
}

async function remover(req, res) {
  const doc = await ResponsavelRede.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: "Nao encontrado" });
  res.json({ ok: true });
}

module.exports = {
  listar,
  redesDisponiveis,
  supervisoresDisponiveis,
  criar,
  atualizar,
  remover,
};
