const User = require("../models/User");

async function listar(_req, res) {
  const users = await User.find().sort({ nome: 1 });
  res.json({ users });
}

async function criar(req, res) {
  const { nome, email, codigo, role } = req.body || {};
  if (!nome || !email || !codigo || !role) {
    return res.status(400).json({ error: "Dados incompletos" });
  }
  const senhaHash = await User.gerarHash(String(codigo));
  try {
    const user = await User.create({
      nome,
      email: String(email).toLowerCase(),
      codigo: String(codigo),
      senhaHash,
      role,
    });
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Email ou codigo ja cadastrado" });
    }
    throw err;
  }
}

async function atualizar(req, res) {
  const { id } = req.params;
  const { nome, email, codigo, role, ativo } = req.body || {};
  const update = {};
  if (nome) update.nome = nome;
  if (email) update.email = String(email).toLowerCase();
  if (role) update.role = role;
  if (typeof ativo === "boolean") update.ativo = ativo;
  if (codigo) {
    update.codigo = String(codigo);
    update.senhaHash = await User.gerarHash(String(codigo));
  }

  const user = await User.findByIdAndUpdate(id, update, { new: true });
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado" });
  res.json({ user });
}

async function remover(req, res) {
  const { id } = req.params;
  await User.findByIdAndUpdate(id, { ativo: false });
  res.json({ ok: true });
}

module.exports = { listar, criar, atualizar, remover };
