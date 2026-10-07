/**
 * Alcance de lojas: o supervisor responsavel por uma rede alcanca TODAS as lojas dela, mesmo
 * fora da carteira. Banco DESCARTAVEL (apagado no fim; pulado sem acesso).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");

const NOME_BANCO = `rebaixa_teste_escopo_${Date.now()}`;
const uri = process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);
let server, base, escopo;
const tokens = {};
const user = (role, codigo) => ({ id: "000000000000000000000001", role, roles: [], nome: role, codigo });

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 }); } catch { return; }
  escopo = require("../../src/services/escopoService");
  const Carteira = require("../../src/models/Carteira");
  const ResponsavelRede = require("../../src/models/ResponsavelRede");
  const Estoque = require("../../src/models/Estoque");
  // Rede 26 (Mix Mateus): lojas 1 e 2 com o supervisor S1; loja 3 da rede 50 com S1; loja 9 de outra rede com S2
  await Carteira.create([
    { clienteCodigo: "1", clienteNome: "MATEUS - CAUCAIA", supervisorCodigo: "S1", codigoRede: "26", redeSubrede: "MIX MATEUS" },
    { clienteCodigo: "2", clienteNome: "MATEUS - JOSE WALTER", supervisorCodigo: "S1", codigoRede: "26", redeSubrede: "MIX MATEUS" },
    { clienteCodigo: "3", clienteNome: "ATACADAO", supervisorCodigo: "S1", codigoRede: "50", redeSubrede: "ATACADAO", vendedorCodigo: "V1" },
    { clienteCodigo: "9", clienteNome: "OUTRA", supervisorCodigo: "S2", codigoRede: "99", redeSubrede: "OUTRA" },
  ]);
  // Jefferson (S3) nao tem Mateus na carteira, mas e o responsavel pela rede 26
  await ResponsavelRede.create({ codigoRede: "26", redeSubrede: "MIX MATEUS", supervisorId: new mongoose.Types.ObjectId(), supervisorCodigo: "S3", supervisorNome: "Jefferson" });
  await Estoque.create(["1", "2", "3", "9"].map((c) => ({ chave: `${c}|500`, clienteCodigo: c, cliente: `LOJA ${c}`, produtoCodigo: "500", produto: "IOGURTE", quantidade: 5, dataValidade: new Date(Date.now() + 9 * 864e5) })));
  for (const [k, role, codigo] of [["s1", "supervisor", "S1"], ["s3", "supervisor", "S3"], ["v1", "vendedor", "V1"], ["adm", "admin", "A1"]]) tokens[k] = jwt.sign(user(role, codigo), process.env.JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use("/api/estoque", require("../../src/routes/estoque"));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

const lojas = async (quem) => {
  const r = await fetch(`${base}/api/estoque`, { headers: { Authorization: `Bearer ${tokens[quem]}` } });
  return (await r.json()).itens.map((i) => i.clienteCodigo).sort();
};

test("responsavel pela rede alcanca todas as lojas dela; os outros seguem a carteira", async (t) => {
  if (!(podeRodar && server)) return t.skip("sem banco de teste");
  assert.deepEqual(await lojas("s3"), ["1", "2"]); // nada na carteira, tudo da rede 26
  assert.deepEqual(await lojas("s1"), ["1", "2", "3"]); // carteira (continua vendo as proprias, mesmo com responsavel na rede)
  assert.deepEqual(await lojas("v1"), ["3"]);
  assert.deepEqual(await lojas("adm"), ["1", "2", "3", "9"]);

  assert.equal(await escopo.alcancaCliente(user("supervisor", "S3"), "1"), true);
  assert.equal(await escopo.alcancaCliente(user("supervisor", "S3"), "3"), false);
  assert.equal(await escopo.alcancaCliente(user("diretoria", "D1"), "9"), true);
  assert.deepEqual((await escopo.clientesDoUsuario(user("supervisor", "S3"))).sort(), ["1", "2"]);
  assert.equal(await escopo.clientesDoUsuario(user("admin", "A1")), null);
  assert.equal((await escopo.entradaDaLoja(user("supervisor", "S3"), "2")).codigoRede, "26");
  assert.equal(await escopo.entradaDaLoja(user("supervisor", "S3"), "9"), null);
});
