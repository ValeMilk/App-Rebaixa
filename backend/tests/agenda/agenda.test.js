/**
 * Agenda semanal de visitas. Parte 1: regras puras. Parte 2: API num banco DESCARTAVEL (apagado
 * no fim; pulada sem acesso): cada um mexe so na propria agenda, quem tem "ver todas" so consulta.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");

const { formatarCidade, dataValida, somarDias, validarEvento } = require("../../src/services/agendaService");

test("cidade: maiusculas do Lacteus viram nome proprio; o que foi digitado fica como esta", () => {
  assert.equal(formatarCidade("SAO GONCALO DO AMARANTE"), "Sao Goncalo do Amarante");
  assert.equal(formatarCidade("  FORTALEZA "), "Fortaleza");
  assert.equal(formatarCidade("Maracanaú"), "Maracanaú");
  assert.equal(formatarCidade("são gonçalo do amarante"), "São Gonçalo do Amarante"); // tudo em minusculas tambem vira nome proprio
  assert.equal(formatarCidade(""), "");
});

test("datas: validas e soma de dias (inclusive virada de mes e ano bissexto)", () => {
  assert.equal(dataValida("2026-10-14"), true);
  assert.equal(dataValida("2026-02-30"), false);
  assert.equal(dataValida("14/10/2026"), false);
  assert.equal(somarDias("2026-10-26", 6), "2026-11-01");
  assert.equal(somarDias("2028-02-27", 2), "2028-02-29");
  assert.equal(somarDias("2026-10-12", -7), "2026-10-05");
});

test("visita: dia inteiro ou horario; cidade obrigatoria; limites", () => {
  const ok = validarEvento({ data: "2026-10-14", diaInteiro: true, cidade: "  Caucaia ", lojas: [{ clienteCodigo: "1", clienteNome: "A" }, { clienteCodigo: "1" }, { clienteCodigo: "2" }] });
  assert.deepEqual([ok.diaInteiro, ok.inicio, ok.fim, ok.cidade, ok.lojas.length], [true, null, null, "Caucaia", 2]);
  const h = validarEvento({ data: "2026-10-14", inicio: "08:00", fim: "12:30", cidade: "Caucaia" });
  assert.deepEqual([h.diaInteiro, h.inicio, h.fim], [false, "08:00", "12:30"]);
  assert.throws(() => validarEvento({ data: "2026-10-14", inicio: "12:00", fim: "12:00", cidade: "Caucaia" }), /depois do início/);
  assert.throws(() => validarEvento({ data: "2026-10-14", inicio: "8:00", fim: "9:00", cidade: "Caucaia" }), /horário/);
  assert.throws(() => validarEvento({ data: "2026-10-14", diaInteiro: true, cidade: " " }), /cidade/);
  assert.throws(() => validarEvento({ data: "nao", diaInteiro: true, cidade: "Caucaia" }), /data/);
  assert.throws(() => validarEvento({ data: "2026-10-14", diaInteiro: true, cidade: "Caucaia", observacao: "x".repeat(501) }), /500/);
});

// ── API ─────────────────────────────────────────────────────────────────────────

const NOME_BANCO = `rebaixa_teste_agenda_${Date.now()}`;
const uri = process.env.MONGODB_URI ? process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${NOME_BANCO}$1`) : null;
const podeRodar = !!(uri && process.env.JWT_SECRET);
let server, base;
const tokens = {};
const pronto = () => podeRodar && server;

test.before(async () => {
  if (!podeRodar) return;
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
  try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 }); } catch { return; }
  const User = require("../../src/models/User");
  const Carteira = require("../../src/models/Carteira");
  for (const [k, role, codigo] of [["admin", "admin", "A1"], ["sup1", "supervisor", "S1"], ["sup2", "supervisor", "S2"], ["dir", "diretoria", "D1"], ["vend", "vendedor", "V1"]]) {
    const u = await User.create({ nome: `Teste ${k}`, email: `${k}@teste.com`, codigo, senhaHash: "x", role, ativo: true });
    tokens[k] = jwt.sign({ id: u._id.toString(), role, roles: [], nome: u.nome, codigo }, process.env.JWT_SECRET);
  }
  await Carteira.create([
    { clienteCodigo: "10", clienteNome: "MERCADINHO A", supervisorCodigo: "S1", cidade: "FORTALEZA", codigoRede: "1", redeSubrede: "R1" },
    { clienteCodigo: "11", clienteNome: "MERCADINHO B", supervisorCodigo: "S1", cidade: "CAUCAIA", codigoRede: "1", redeSubrede: "R1", subrede: "SUBCLASSE CAUCAIA" },
    { clienteCodigo: "12", clienteNome: "MERCADINHO C", supervisorCodigo: "S1", cidade: null, codigoRede: "1", redeSubrede: "R1" },
    { clienteCodigo: "20", clienteNome: "OUTRO SUP", supervisorCodigo: "S2", cidade: "FORTALEZA", codigoRede: "2", redeSubrede: "R2" },
    { clienteCodigo: "21", clienteNome: "LOJA MARACANAU", supervisorCodigo: "S2", cidade: "MARACANAU", codigoRede: "2", redeSubrede: "R2" }, // Lacteus guarda sem acento
  ]);
  const app = express();
  app.use(express.json());
  app.use("/api/agenda", require("../../src/routes/agenda"));
  app.use(require("../../src/middlewares/errorHandler"));
  await new Promise((ok) => { server = app.listen(0, ok); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((ok) => server.close(ok));
  if (mongoose.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

async function chamar(quem, metodo, rota, corpo) {
  const headers = { Authorization: `Bearer ${tokens[quem]}` };
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${base}/api/agenda${rota}`, { method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, dados: await r.json().catch(() => null) };
}
const SEMANA = "?de=2026-10-12&ate=2026-10-18";
const ids = {};

test("quem usa a agenda: supervisor monta a sua, diretoria so consulta, vendedor nao tem", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await chamar("vend", "GET", SEMANA)).status, 403);
  assert.equal((await chamar("dir", "POST", "", { data: "2026-10-13", diaInteiro: true, cidade: "Caucaia" })).status, 403);
  assert.equal((await chamar("sup1", "GET", "/donos")).status, 403); // seletor de supervisores e de quem ve todas
  assert.equal((await chamar("dir", "GET", "/donos")).status, 200);
});

test("criar, listar e a cidade na grafia canonica", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const a = await chamar("sup1", "POST", "", { data: "2026-10-13", diaInteiro: true, cidade: "fortaleza", lojas: [{ clienteCodigo: "10", clienteNome: "MERCADINHO A" }], observacao: "Pagamentos" });
  assert.equal(a.status, 201);
  assert.equal(a.dados.visita.cidade, "Fortaleza"); // a grafia do Lacteus (FORTALEZA -> Fortaleza), nao a digitada
  assert.equal(a.dados.visita.donoCodigo, "S1");
  ids.a = a.dados.visita.id;
  const b = await chamar("sup1", "POST", "", { data: "2026-10-14", inicio: "08:00", fim: "12:00", cidade: "Caucaia" });
  const c = await chamar("sup1", "POST", "", { data: "2026-10-14", inicio: "14:00", fim: "17:00", cidade: "Maracanaú" });
  ids.b = b.dados.visita.id;
  ids.c = c.dados.visita.id;
  await chamar("sup2", "POST", "", { data: "2026-10-13", diaInteiro: true, cidade: "Sobral" });

  const meus = (await chamar("sup1", "GET", SEMANA)).dados.visitas;
  assert.deepEqual(meus.map((v) => `${v.data} ${v.cidade}`), ["2026-10-13 Fortaleza", "2026-10-14 Caucaia", "2026-10-14 Maracanaú"]);
  assert.equal((await chamar("sup2", "GET", SEMANA)).dados.visitas.length, 1); // so a dele
  // supervisor nao consegue olhar a agenda do outro mesmo pedindo
  assert.equal((await chamar("sup2", "GET", `${SEMANA}&dono=S1`)).dados.visitas.every((v) => v.donoCodigo === "S2"), true);

  const todas = (await chamar("dir", "GET", SEMANA)).dados;
  assert.equal(todas.visitas.length, 4);
  assert.equal(todas.verTodas, true);
  assert.deepEqual((await chamar("dir", "GET", `${SEMANA}&dono=S2`)).dados.visitas.map((v) => v.cidade), ["Sobral"]);
  assert.equal((await chamar("sup1", "GET", "?de=2026-10-12&ate=2027-10-12")).status, 400); // periodo grande demais
});

test("editar e excluir: so o dono (ou o admin)", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  assert.equal((await chamar("sup2", "PUT", `/${ids.b}`, { data: "2026-10-15", diaInteiro: true, cidade: "Caucaia" })).status, 403);
  assert.equal((await chamar("sup2", "DELETE", `/${ids.b}`)).status, 403);
  assert.equal((await chamar("dir", "PUT", `/${ids.b}`, { data: "2026-10-15", diaInteiro: true, cidade: "Caucaia" })).status, 403);

  const ed = await chamar("sup1", "PUT", `/${ids.b}`, { data: "2026-10-15", diaInteiro: true, cidade: "Caucaia" });
  assert.equal(ed.status, 200);
  assert.deepEqual([ed.dados.visita.data, ed.dados.visita.diaInteiro, ed.dados.visita.inicio], ["2026-10-15", true, null]);
  assert.equal((await chamar("sup1", "PUT", `/${ids.b}`, { data: "2026-10-15", inicio: "10:00", fim: "09:00", cidade: "Caucaia" })).status, 400);

  // admin mexe na agenda de qualquer um e cria em nome de um supervisor
  assert.equal((await chamar("admin", "PUT", `/${ids.c}`, { data: "2026-10-14", inicio: "13:00", fim: "16:00", cidade: "Maracanaú" })).status, 200);
  const emNome = await chamar("admin", "POST", "", { data: "2026-10-16", diaInteiro: true, cidade: "Itapipoca", donoCodigo: "S2" });
  assert.equal(emNome.status, 201);
  assert.equal(emNome.dados.visita.donoCodigo, "S2");
  // supervisor nao consegue criar em nome de outro: o dono continua sendo ele
  const tentativa = await chamar("sup1", "POST", "", { data: "2026-10-16", diaInteiro: true, cidade: "Itapipoca", donoCodigo: "S2" });
  assert.equal(tentativa.dados.visita.donoCodigo, "S1");

  assert.equal((await chamar("sup1", "DELETE", `/${tentativa.dados.visita.id}`)).status, 200);
  assert.equal((await chamar("sup1", "DELETE", "/000000000000000000000000")).status, 404);
});

test("copiar a semana anterior: copia, nao duplica e exige segundas-feiras", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const cp = await chamar("sup1", "POST", "/copiar-semana", { de: "2026-10-12", para: "2026-10-19" });
  assert.equal(cp.status, 200);
  assert.deepEqual([cp.dados.copiadas, cp.dados.ignoradas], [3, 0]);
  const prox = (await chamar("sup1", "GET", "?de=2026-10-19&ate=2026-10-25")).dados.visitas;
  assert.deepEqual(prox.map((v) => `${v.data} ${v.cidade} ${v.diaInteiro ? "dia" : v.inicio + "-" + v.fim}`), [
    "2026-10-20 Fortaleza dia", "2026-10-21 Maracanaú 13:00-16:00", "2026-10-22 Caucaia dia",
  ]);
  assert.deepEqual(prox[0].lojas.map((l) => l.clienteCodigo), ["10"]); // lojas e observacao vao junto
  assert.equal(prox[0].observacao, "Pagamentos");

  const de_novo = await chamar("sup1", "POST", "/copiar-semana", { de: "2026-10-12", para: "2026-10-19" });
  assert.deepEqual([de_novo.dados.copiadas, de_novo.dados.ignoradas], [0, 3]);
  assert.equal((await chamar("sup1", "POST", "/copiar-semana", { de: "2026-10-13", para: "2026-10-20" })).status, 400); // nao e segunda
  assert.equal((await chamar("sup1", "POST", "/copiar-semana", { de: "2026-10-12", para: "2026-10-12" })).status, 400);
  assert.equal((await chamar("dir", "POST", "/copiar-semana", { de: "2026-10-12", para: "2026-10-19" })).status, 403);
});

test("cidades e lojas para escolher na visita", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  const cidades = (await chamar("sup1", "GET", "/cidades")).dados.cidades;
  for (const c of ["Fortaleza", "Caucaia", "Maracanaú", "Sobral"]) assert.ok(cidades.includes(c), `cidade ${c}`);
  assert.equal(new Set(cidades).size, cidades.length); // sem repetidas por grafia
  assert.ok(!cidades.includes("Maracanau"), "a grafia com acento digitada vale sobre a do Lacteus");

  const todas = (await chamar("sup1", "GET", "/lojas")).dados.lojas;
  assert.deepEqual(todas.map((l) => l.clienteCodigo), ["10", "11", "12"]); // so a carteira dele
  const fort = (await chamar("sup1", "GET", "/lojas?cidade=fortaleza")).dados.lojas;
  assert.deepEqual(fort.map((l) => [l.clienteCodigo, l.cidade]), [["10", "Fortaleza"]]);
});

test("redes e subredes: a visita pode ser por classe/subclasse, com ou sem cidade", async (t) => {
  if (!pronto()) return t.skip("sem banco de teste");
  // opcoes do supervisor 1: redes da carteira dele, com a contagem de lojas na cidade escolhida
  const op = (await chamar("sup1", "GET", "/redes?cidade=caucaia")).dados;
  assert.deepEqual(op.redes.map((r) => [r.codigoRede, r.nome, r.lojas, r.lojasNaCidade]), [["1", "R1", 3, 1]]);
  assert.deepEqual(op.subredes.map((s) => [s.codigoRede, s.redeNome, s.nome, s.lojas, s.lojasNaCidade]), [["1", "R1", "SUBCLASSE CAUCAIA", 1, 1]]);
  const outro = (await chamar("sup2", "GET", "/redes")).dados;
  assert.deepEqual(outro.redes.map((r) => r.codigoRede), ["2"]); // so a carteira dele
  // admin marcando na agenda de um supervisor ve as opcoes da carteira DELE; supervisor nao consegue olhar a do outro
  assert.deepEqual((await chamar("admin", "GET", "/redes?dono=S2")).dados.redes.map((r) => r.codigoRede), ["2"]);
  assert.deepEqual((await chamar("admin", "GET", "/lojas?dono=S2")).dados.lojas.map((l) => l.clienteCodigo).sort(), ["20", "21"]);
  assert.deepEqual((await chamar("sup1", "GET", "/redes?dono=S2")).dados.redes.map((r) => r.codigoRede), ["1"]);

  // cidade + varias redes/subredes (supervisor que atende uma cidade so e visita varias redes)
  const a = await chamar("sup1", "POST", "", {
    data: "2026-10-20", diaInteiro: true, cidade: "fortaleza",
    redes: [{ codigoRede: "1", nome: "R1" }, { codigoRede: "1", nome: "R1" }, { codigoRede: "7", nome: "REDE SETE" }],
    subredes: [{ codigoRede: "1", redeNome: "R1", nome: "SUBCLASSE CAUCAIA" }],
  });
  assert.equal(a.status, 201);
  assert.deepEqual(a.dados.visita.redes.map((r) => r.codigoRede), ["1", "7"]); // repetida some
  assert.deepEqual(a.dados.visita.subredes.map((s) => s.nome), ["SUBCLASSE CAUCAIA"]);
  assert.equal(a.dados.visita.cidade, "Fortaleza");

  // so a rede, sem cidade; sem nada e recusado
  const b = await chamar("sup1", "POST", "", { data: "2026-10-21", diaInteiro: true, redes: [{ codigoRede: "1", nome: "R1" }] });
  assert.equal(b.status, 201);
  assert.equal(b.dados.visita.cidade, "");
  const vazia = await chamar("sup1", "POST", "", { data: "2026-10-21", diaInteiro: true });
  assert.equal(vazia.status, 400);
  assert.match(vazia.dados.error, /cidade ou escolha/);

  // editar tirando a cidade e as redes e recusado; trocar so a rede vale
  assert.equal((await chamar("sup1", "PUT", `/${b.dados.visita.id}`, { data: "2026-10-21", diaInteiro: true, cidade: "", redes: [] })).status, 400);
  const ed = await chamar("sup1", "PUT", `/${b.dados.visita.id}`, { data: "2026-10-21", diaInteiro: true, subredes: [{ codigoRede: "1", redeNome: "R1", nome: "SUBCLASSE CAUCAIA" }] });
  assert.equal(ed.status, 200);
  assert.deepEqual([ed.dados.visita.redes.length, ed.dados.visita.subredes.length], [0, 1]);

  // a semana copiada leva as redes e subredes, e nao confunde visitas parecidas
  const cp = await chamar("sup1", "POST", "/copiar-semana", { de: "2026-10-19", para: "2026-10-26" });
  assert.deepEqual([cp.dados.copiadas, cp.dados.ignoradas], [5, 0]); // as 3 da semana copiada antes + as 2 novas
  const copia = (await chamar("sup1", "GET", "?de=2026-10-26&ate=2026-11-01")).dados.visitas.find((v) => v.data === "2026-10-27" && v.redes.length);
  assert.deepEqual(copia.redes.map((r) => r.nome), ["R1", "REDE SETE"]);
  assert.deepEqual((await chamar("sup1", "POST", "/copiar-semana", { de: "2026-10-19", para: "2026-10-26" })).dados.ignoradas, 5);
});
