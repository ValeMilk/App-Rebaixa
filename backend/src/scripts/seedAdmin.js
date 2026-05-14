require("dotenv").config();
const connectDB = require("../config/database");
const User = require("../models/User");

(async () => {
  await connectDB();

  const nome = process.env.ADMIN_NOME || "Administrador";
  const email = (process.env.ADMIN_EMAIL || "admin@valemilk.com.br").toLowerCase();
  const codigo = process.env.ADMIN_CODIGO || "ADM001";
  // ADMIN_SENHA pode ser diferente do codigo (ex: senha forte para o admin)
  const senha = process.env.ADMIN_SENHA || codigo;

  const senhaHash = await User.gerarHash(senha);

  const existente = await User.findOne({ email });
  if (existente) {
    await User.updateOne({ email }, { $set: { senhaHash, nome, codigo } });
    console.log(`[seed] admin atualizado -> email: ${email} | senha: ${senha}`);
  } else {
    await User.create({ nome, email, codigo, senhaHash, role: "admin", ativo: true });
    console.log(`[seed] admin criado -> email: ${email} | senha: ${senha}`);
  }

  process.exit(0);
})();
