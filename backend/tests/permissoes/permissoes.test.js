/**
 * RBAC. Parte 1: regras puras do permissoesService. Parte 2: API contra um banco DESCARTAVEL
 * (outro nome de banco, apagado no fim; pulada se nao houver acesso), conferindo que o PADRAO
 * reproduz o acesso que cada perfil tinha antes e que editar a matriz muda o acesso de verdade.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");

const { CHAVES, PADRAO, PERFIS } = require("../../src/constants/permissoes");
const { resolverPerfil, perfisDoUsuario } = require("../../src/services/permissoesService");

// ── Parte 1: regras puras ───────────────────────────────────────────────────────

test("padrao: cada perfil comeca com o acesso que tinha antes do RBAC", () => {
  assert.deepEqual([...resolverPerfil("vendedor", null)].sort(), ["lojas.ver", "solicitacoes.criar", "solicitacoes.ver"]);
  assert.deepEqual([...resolverPerfil("supervisor", null)].sort(), ["encartes.criar", "encartes.ver", "metricas_redes.ver", "solicitacoes.criar"]);
  assert.deepEqual([...resolverPerfil("diretoria", null)].sort(), ["encartes.performance", "encartes.ver", "metricas_redes.ver", "solicitacoes.criar", "solicitacoes.decidir"]);
  assert.deepEqual([...resolverPerfil("admin", null)], CHAVES);
  for (const p of PERFIS) assert.ok(PADRAO[p].every((c) => CHAVES.includes(c)), `padrao de ${p} so usa chaves do catalogo`);
});

test("admin tem sempre tudo, mesmo que exista um documento salvo para ele", () => {
  assert.deepEqual([...resolverPerfil("admin", { permissoes: [], conhecidas: CHAVES })], CHAVES);
});

test("perfil editado: vale o que foi salvo; exclusiva do admin e 'nao se aplica' nunca entram", () => {
  const doc = { permissoes: ["lojas.ver", "permissoes.gerenciar", "encartes.ver", "chave.que.nao.existe"], conhecidas: CHAVES };
  assert.deepEqual([...resolverPerfil("vendedor", doc)], ["lojas.ver"]); // encartes.ver nao se aplica ao vendedor
  assert.deepEqual([...resolverPerfil("supervisor", doc)].sort(), ["encartes.ver", "lojas.ver"]);
  assert.deepEqual([...resolverPerfil("supervisor", { permissoes: [], conhecidas: CHAVES })], []);
});

test("permissao criada DEPOIS de o perfil ser salvo vale pelo padrao (nao nasce desligada)", () => {
  const antigas = CHAVES.filter((c) => c !== "encartes.performance");
  const doc = { permissoes: ["metricas_redes.ver"], conhecidas: antigas };
  assert.ok(resolverPerfil("diretoria", doc).has("encartes.performance")); // padrao da diretoria
  assert.ok(!resolverPerfil("supervisor", doc).has("encartes.performance")); // nao e padrao do supervisor
  assert.ok(!resolverPerfil("diretoria", doc).has("encartes.ver")); // era conhecida e foi desmarcada
});

test("perfis do usuario: principal + adicionais, sem repetir e sem perfis desconhecidos", () => {
  assert.deepEqual(perfisDoUsuario({ role: "vendedor", roles: ["diretoria", "vendedor", "xpto"] }), ["vendedor", "diretoria"]);
  assert.deepEqual(perfisDoUsuario({ role: "admin" }), ["admin"]);
  assert.deepEqual(perfisDoUsuario(null), []);
});

// ── Parte 2: API ────────────────────────────────────────────────────────────────

const NOME_BANCO = `rebaixa_teste_rbac_${Date.now()}`;
const baseUri = process.env.MONGODB_URI;
const uri = baseUri ? baseUri.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);

let server, base, svc;
const tokens = {};
const pronto = () => podeRodar && server;

async function chamar(perfil, metodo, rota, json) {
  const headers = {};
  if (perfil) headers.Authorization = `Bearer ${tokens[perfil]}`;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${base}/api${rota}`, { method: metodo, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
  const dados = (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  return { status: r.status, dados };
}
const negado = (r) => r.status === 403;

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try {
    await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 20000 });
  } catch {
    return;
  }
  const User = require("../../src/models/User");
  svc = require("../../src/services/permissoesService");
  const criar = async (role, roles = []) => {
    const u = await User.create({ nome: `Teste ${role}`, email: `${role}${roles.join("")}@teste.com`, codigo: `C-${role}${roles.join("")}`, senhaHash: "x", role, roles });
    return jwt.sign({ id: u._id.toString(), role, roles, nome: u.nome, codigo: u.codigo }, process.env.JWT_SECRET);
  };
  for (const p of PERFIS) tokens[p] = await criar(p);
  tokens.vendedorComDiretoria = await criar("vendedor", ["diretoria"]);

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  for (const [rota, arquivo] of [
    ["auth", "auth"], ["users", "users"], ["solicitacoes", "solicitacoes"], ["sync", "sync"], ["responsaveis-rede", "responsaveisRede"],
    ["encartes", "encartes"], ["dashboard", "dashboard"], ["integracao-estoque", "integracaoEstoque"],
    ["acompanhamento-estoque", "acompanhamentoEstoque"], ["permissoes", "permissoes"],
  ]) app.use(`/api/${rota}`, require(`../../src/routes/${arquivo}`));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// Quem PODE passar pela porta de cada rota com a matriz padrao (igual ao que era por perfil).
// "passar" = qualquer resposta que nao seja 403 (400/404 de validacao contam como acesso liberado).
const ID = "000000000000000000000000";
const PORTAS = [
  ["GET", "/users", ["admin"]],
  ["GET", "/encartes", ["supervisor", "diretoria", "admin"]],
  ["POST", "/encartes", ["supervisor", "admin"], {}],
  ["GET", "/encartes/performance", ["diretoria", "admin"]],
  ["GET", "/dashboard/supervisor", ["supervisor", "diretoria", "admin"]],
  ["POST", "/solicitacoes", ["vendedor", "supervisor", "diretoria", "admin"], {}],
  ["POST", `/solicitacoes/${ID}/decidir`, ["diretoria", "admin"], { decisao: "aprovado" }],
  ["GET", "/responsaveis-rede", ["admin"]],
  ["GET", "/responsaveis-rede/redes-disponiveis", ["diretoria", "admin"]],
  ["GET", "/responsaveis-rede/supervisores-disponiveis", ["diretoria", "admin"]],
  ["GET", "/integracao-estoque/clientes", ["admin"]],
  ["GET", "/acompanhamento-estoque/redes", ["admin"]],
  ["GET", "/sync/status", ["admin"]], // antes a diretoria passava pela API, sem ter a tela
  ["GET", "/permissoes", ["admin"]],
];

test("matriz padrao: cada rota abre para os mesmos perfis de antes", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  for (const [metodo, rota, liberados, corpo] of PORTAS) {
    for (const perfil of PERFIS) {
      const r = await chamar(perfil, metodo, rota, corpo);
      assert.equal(!negado(r), liberados.includes(perfil), `${metodo} ${rota} como ${perfil}: status ${r.status}`);
    }
    assert.equal((await chamar(null, metodo, rota, corpo)).status, 401, `${metodo} ${rota} sem token`);
  }
});

test("login/me devolvem as permissoes efetivas; perfis adicionais somam", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const sup = await chamar("supervisor", "GET", "/auth/me");
  assert.deepEqual(sup.dados.user.permissoes.slice().sort(), ["encartes.criar", "encartes.ver", "metricas_redes.ver", "solicitacoes.criar"]);
  assert.equal(sup.dados.user.senhaHash, undefined);
  const misto = await chamar("vendedorComDiretoria", "GET", "/auth/me");
  assert.ok(misto.dados.user.permissoes.includes("lojas.ver") && misto.dados.user.permissoes.includes("encartes.performance"));
  assert.ok(!negado(await chamar("vendedorComDiretoria", "GET", "/encartes/performance")));
  assert.equal((await chamar("admin", "GET", "/auth/me")).dados.user.permissoes.length, CHAVES.length);
});

test("tela de permissoes: catalogo, perfis, padrao e contagem de usuarios", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const r = await chamar("admin", "GET", "/permissoes");
  assert.equal(r.status, 200);
  assert.deepEqual(r.dados.perfis.map((p) => p.perfil), PERFIS);
  assert.equal(r.dados.grupos.flatMap((g) => g.permissoes).length, CHAVES.length);
  const admin = r.dados.perfis.find((p) => p.perfil === "admin");
  assert.equal(admin.editavel, false);
  assert.equal(admin.permissoes.length, CHAVES.length);
  const vend = r.dados.perfis.find((p) => p.perfil === "vendedor");
  assert.equal(vend.personalizado, false);
  assert.equal(vend.usuarios, 2); // o vendedor e o vendedor com perfil adicional de diretoria
  assert.equal(r.dados.perfis.find((p) => p.perfil === "diretoria").usuarios, 2);
});

test("editar a matriz muda o acesso de verdade, na hora; restaurar volta ao padrao", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  // supervisor nao decide solicitacoes por padrao
  assert.ok(negado(await chamar("supervisor", "POST", `/solicitacoes/${ID}/decidir`, { decisao: "aprovado" })));
  const novo = [...PADRAO.supervisor, "solicitacoes.decidir"];
  const salvo = await chamar("admin", "PUT", "/permissoes/supervisor", { permissoes: novo });
  assert.equal(salvo.status, 200);
  const sup = salvo.dados.perfis.find((p) => p.perfil === "supervisor");
  assert.equal(sup.personalizado, true);
  assert.ok(sup.permissoes.includes("solicitacoes.decidir"));
  assert.equal(sup.atualizadoPorNome, "Teste admin");
  assert.ok(!negado(await chamar("supervisor", "POST", `/solicitacoes/${ID}/decidir`, { decisao: "aprovado" })), "passa a ter acesso");
  assert.ok((await chamar("supervisor", "GET", "/auth/me")).dados.user.permissoes.includes("solicitacoes.decidir"));

  // tirar uma permissao tambem vale na hora
  await chamar("admin", "PUT", "/permissoes/supervisor", { permissoes: ["metricas_redes.ver"] });
  assert.ok(negado(await chamar("supervisor", "GET", "/encartes")));
  assert.ok(!negado(await chamar("supervisor", "GET", "/dashboard/supervisor")));
  assert.ok(negado(await chamar("supervisor", "POST", "/solicitacoes", {})));

  const rest = await chamar("admin", "POST", "/permissoes/supervisor/restaurar");
  assert.equal(rest.dados.perfis.find((p) => p.perfil === "supervisor").personalizado, false);
  assert.ok(!negado(await chamar("supervisor", "GET", "/encartes")));
  assert.ok(negado(await chamar("supervisor", "POST", `/solicitacoes/${ID}/decidir`, { decisao: "aprovado" })));
});

test("travas: admin nao e editavel, permissao exclusiva nao sai do admin, chave invalida e recusada", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await chamar("admin", "PUT", "/permissoes/admin", { permissoes: [] })).status, 400);
  assert.equal((await chamar("admin", "POST", "/permissoes/admin/restaurar")).status, 400);
  assert.equal((await chamar("admin", "PUT", "/permissoes/diretoria", { permissoes: ["permissoes.gerenciar"] })).status, 400);
  assert.equal((await chamar("admin", "PUT", "/permissoes/vendedor", { permissoes: ["encartes.ver"] })).status, 400); // nao se aplica
  assert.equal((await chamar("admin", "PUT", "/permissoes/vendedor", { permissoes: ["nao.existe"] })).status, 400);
  assert.equal((await chamar("admin", "PUT", "/permissoes/vendedor", { permissoes: "lojas.ver" })).status, 400);
  assert.equal((await chamar("admin", "PUT", "/permissoes/gerente", { permissoes: [] })).status, 400);
  // ninguem alem do admin edita, e o admin continua com tudo depois de tudo isso
  assert.ok(negado(await chamar("diretoria", "PUT", "/permissoes/vendedor", { permissoes: [] })));
  assert.ok(!negado(await chamar("admin", "GET", "/permissoes")));
  assert.ok(!negado(await chamar("admin", "GET", "/users")));
});

test("dar a diretoria a tela de usuarios abre a rota; o padrao dos outros perfis nao muda", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  await chamar("admin", "PUT", "/permissoes/diretoria", { permissoes: [...PADRAO.diretoria, "usuarios.gerenciar"] });
  assert.ok(!negado(await chamar("diretoria", "GET", "/users")));
  assert.ok(negado(await chamar("supervisor", "GET", "/users")));
  assert.ok(negado(await chamar("vendedor", "GET", "/users")));
  await chamar("admin", "POST", "/permissoes/diretoria/restaurar");
  svc.limparCache();
  assert.ok(negado(await chamar("diretoria", "GET", "/users")));
});
