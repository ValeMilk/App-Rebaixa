const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function login(req, res) {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: "Email e senha sao obrigatorios" });
  }

  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !user.ativo) {
    return res.status(401).json({ error: "Credenciais invalidas" });
  }

  const ok = await user.compararSenha(String(senha));
  if (!ok) return res.status(401).json({ error: "Credenciais invalidas" });

  const token = jwt.sign(
    { id: user._id, role: user.role, nome: user.nome, codigo: user.codigo },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );

  res.json({ token, user });
}

async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado" });
  res.json({ user });
}

// Endpoint publico para popular o select de login
async function listarParaLogin(req, res) {
  const users = await User.find({ ativo: true }, { nome: 1, email: 1, _id: 0 }).sort({ nome: 1 });
  res.json({ users });
}

module.exports = { login, me, listarParaLogin };
