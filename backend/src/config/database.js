const mongoose = require("mongoose");
const dns = require("dns");

// DNS local nao resolve SRV do Atlas; forcamos 8.8.8.8
dns.setServers(["8.8.8.8", "8.8.4.4"]);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[db] MONGODB_URI nao configurada");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, { autoIndex: true });
    console.log("[db] MongoDB conectado");
  } catch (err) {
    console.error("[db] Erro ao conectar:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
