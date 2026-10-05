/**
 * Redes do InfoVale: redes criadas aqui para lojas que so existem no Ativmob.
 *
 * A rede vive em RedeInfovale e e COPIADA para a Carteira (origem "infovale"), uma linha por
 * loja e por supervisor, para que telas, alcance de dados e encartes a tratem como qualquer rede.
 * Regra de precedencia: se a loja passar a existir na carteira do Lacteus, vale o Lacteus
 * (a loja fica na rede do InfoVale apenas marcada, sem efeito).
 */
const Carteira = require("../models/Carteira");
const RedeInfovale = require("../models/RedeInfovale");
const User = require("../models/User");
const Estoque = require("../models/Estoque");
const Encarte = require("../models/Encarte");
const ResponsavelRede = require("../models/ResponsavelRede");
const { query, pgConfigurado } = require("./estoquePgDbService");

const DIAS_LOJAS = 90;
const NAO_INFOVALE = { origem: { $ne: "infovale" } };

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

const normalizar = (s) => String(s || "").trim().replace(/\s+/g, " ");
const chaveNome = (s) => normalizar(s).toLowerCase();

/**
 * Linhas de Carteira geradas pelas redes do InfoVale. Funcao pura.
 * Uma linha por loja e por supervisor (rede sem supervisor gera uma linha sem supervisor);
 * loja que ja esta no Lacteus e ignorada.
 */
function montarDocsCarteira(redes, codigosNoLacteus) {
  const docs = [];
  for (const rede of redes) {
    const supervisores = rede.supervisores?.length ? rede.supervisores : [{ codigo: "", nome: "" }];
    for (const loja of rede.lojas || []) {
      if (codigosNoLacteus.has(loja.clienteCodigo)) continue;
      for (const sup of supervisores) {
        docs.push({
          clienteCodigo: loja.clienteCodigo,
          clienteNome: loja.clienteNome || "",
          vendedorCodigo: "",
          vendedorNome: "",
          supervisorCodigo: sup.codigo || "",
          supervisorNome: sup.nome || "",
          codigoRede: rede.codigoRede,
          redeSubrede: rede.nome,
          subrede: null,
          origem: "infovale",
        });
      }
    }
  }
  return docs;
}

/** Recria na Carteira as linhas das redes do InfoVale. Chamar apos gravar uma rede e apos sincronizar a carteira. */
async function aplicarNaCarteira() {
  const redes = await RedeInfovale.find({}).lean();
  const codigos = redes.flatMap((r) => r.lojas.map((l) => l.clienteCodigo));
  const noLacteus = new Set(codigos.length ? await Carteira.distinct("clienteCodigo", { ...NAO_INFOVALE, clienteCodigo: { $in: codigos } }) : []);
  const docs = montarDocsCarteira(redes, noLacteus);
  await Carteira.deleteMany({ origem: "infovale" });
  if (docs.length) await Carteira.insertMany(docs.map((d) => ({ ...d, sincronizadoEm: new Date() })));
  return { redes: redes.length, linhas: docs.length };
}

/** Lojas vistas no Ativmob: do Postgres (ultimos 90 dias) ou, sem ele, do espelho de estoque. */
async function lojasDoAtivmob() {
  if (pgConfigurado()) {
    try {
      const { rows } = await query(
        `SELECT codigo_destino AS codigo, MAX(nome_fantasia_dest) AS nome,
                to_char(MAX(event_dth), 'YYYY-MM-DD') AS ultima_contagem
           FROM public.ativmob_estoque
          WHERE NULLIF(TRIM(codigo_destino), '') IS NOT NULL AND event_dth >= CURRENT_DATE - ${DIAS_LOJAS}
          GROUP BY codigo_destino`
      );
      return rows.map((r) => ({ clienteCodigo: String(r.codigo), clienteNome: normalizar(r.nome), ultimaContagem: r.ultima_contagem }));
    } catch (e) {
      console.error("[redes-infovale] Postgres indisponivel, usando o espelho de estoque:", e.message);
    }
  }
  const docs = await Estoque.aggregate([{ $group: { _id: "$clienteCodigo", nome: { $first: "$cliente" } } }]);
  return docs.filter((d) => d._id).map((d) => ({ clienteCodigo: String(d._id), clienteNome: normalizar(d.nome), ultimaContagem: null }));
}

/** Lojas que podem entrar numa rede do InfoVale: estao no Ativmob e nao estao no Lacteus. */
async function lojasDisponiveis() {
  const [ativmob, noLacteus, redes] = await Promise.all([
    lojasDoAtivmob(),
    Carteira.distinct("clienteCodigo", NAO_INFOVALE),
    RedeInfovale.find({}, "codigoRede nome lojas").lean(),
  ]);
  const lacteus = new Set(noLacteus);
  const redeDaLoja = new Map();
  for (const r of redes) for (const l of r.lojas) redeDaLoja.set(l.clienteCodigo, { codigoRede: r.codigoRede, nome: r.nome });
  return ativmob
    .filter((l) => !lacteus.has(l.clienteCodigo))
    .map((l) => ({ ...l, rede: redeDaLoja.get(l.clienteCodigo) || null }))
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
}

async function supervisoresDisponiveis() {
  const users = await User.find({ role: "supervisor", ativo: true }, "nome codigo").sort({ nome: 1 }).lean();
  return users.map((u) => ({ id: String(u._id), nome: u.nome, codigo: u.codigo }));
}

/** Redes do InfoVale, com a marca das lojas que hoje ja estao no Lacteus (ignoradas). */
async function listar() {
  const redes = await RedeInfovale.find({}).sort({ nome: 1 }).lean();
  const codigos = redes.flatMap((r) => r.lojas.map((l) => l.clienteCodigo));
  const noLacteus = codigos.length ? await Carteira.find({ ...NAO_INFOVALE, clienteCodigo: { $in: codigos } }, "clienteCodigo redeSubrede").lean() : [];
  const redeLacteus = new Map(noLacteus.map((c) => [c.clienteCodigo, normalizar(c.redeSubrede) || "sem rede"]));
  return redes.map((r) => ({
    id: String(r._id),
    codigoRede: r.codigoRede,
    nome: r.nome,
    supervisores: r.supervisores.map((s) => ({ id: String(s.id), codigo: s.codigo, nome: s.nome })),
    lojas: r.lojas.map((l) => ({ ...l, noLacteus: redeLacteus.get(l.clienteCodigo) || null })),
    atualizadoPorNome: r.atualizadoPorNome || r.criadoPorNome || null,
    atualizadoEm: r.updatedAt,
  }));
}

async function proximoCodigo() {
  const codigos = await RedeInfovale.distinct("codigoRede");
  const maior = codigos.reduce((m, c) => Math.max(m, Number(String(c).replace(/^IV/, "")) || 0), 0);
  return `IV${maior + 1}`;
}

/** Valida e monta os campos de uma rede (criacao ou edicao). */
async function prepararDados(dados, idAtual) {
  const nome = normalizar(dados?.nome);
  if (nome.length < 2 || nome.length > 60) throw erro(400, "Informe o nome da rede (de 2 a 60 caracteres).");

  const outras = await RedeInfovale.find(idAtual ? { _id: { $ne: idAtual } } : {}, "nome codigoRede lojas").lean();
  if (outras.some((r) => chaveNome(r.nome) === chaveNome(nome))) throw erro(400, "Ja existe uma rede do InfoVale com esse nome.");
  const nomesLacteus = await Carteira.distinct("redeSubrede", { ...NAO_INFOVALE, redeSubrede: { $ne: null } });
  if (nomesLacteus.some((n) => chaveNome(n) === chaveNome(nome))) throw erro(400, "Ja existe uma rede com esse nome no Lacteus. Use outro nome.");

  if (!Array.isArray(dados.supervisores)) throw erro(400, "Envie a lista de supervisores.");
  const ids = [...new Set(dados.supervisores.map(String))];
  const users = ids.length ? await User.find({ _id: { $in: ids }, role: "supervisor", ativo: true }, "nome codigo").lean().catch(() => []) : [];
  if (users.length !== ids.length) throw erro(400, "Supervisor invalido: escolha usuarios ativos com perfil principal de supervisor.");
  const supervisores = users.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((u) => ({ id: u._id, codigo: u.codigo, nome: u.nome }));

  if (!Array.isArray(dados.lojas) || !dados.lojas.length) throw erro(400, "Selecione ao menos uma loja.");
  const lojasMap = new Map();
  for (const l of dados.lojas) {
    const clienteCodigo = String(l?.clienteCodigo || "").trim();
    if (!clienteCodigo) throw erro(400, "Loja sem codigo.");
    lojasMap.set(clienteCodigo, { clienteCodigo, clienteNome: normalizar(l.clienteNome) || clienteCodigo });
  }
  for (const r of outras) {
    const repetida = r.lojas.find((l) => lojasMap.has(l.clienteCodigo));
    if (repetida) throw erro(400, `A loja ${repetida.clienteNome || repetida.clienteCodigo} ja esta na rede ${r.nome}.`);
  }
  const lojas = [...lojasMap.values()].sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR"));
  return { nome, supervisores, lojas };
}

async function criar(dados, user) {
  const campos = await prepararDados(dados, null);
  const rede = await RedeInfovale.create({ ...campos, codigoRede: await proximoCodigo(), criadoPorNome: user?.nome, atualizadoPorNome: user?.nome });
  await aplicarNaCarteira();
  return rede;
}

async function atualizar(id, dados, user) {
  const rede = await RedeInfovale.findById(id).catch(() => null);
  if (!rede) throw erro(404, "Rede nao encontrada.");
  Object.assign(rede, await prepararDados(dados, rede._id), { atualizadoPorNome: user?.nome });
  await rede.save();
  // o nome da rede fica copiado em quem a referencia
  await ResponsavelRede.updateMany({ codigoRede: rede.codigoRede }, { $set: { redeSubrede: rede.nome } });
  await aplicarNaCarteira();
  return rede;
}

async function remover(id) {
  const rede = await RedeInfovale.findById(id).catch(() => null);
  if (!rede) throw erro(404, "Rede nao encontrada.");
  const encartes = await Encarte.countDocuments({ codigoRede: rede.codigoRede });
  if (encartes) throw erro(409, `Esta rede tem ${encartes} ${encartes === 1 ? "acao cadastrada" : "acoes cadastradas"} em Encartes e nao pode ser excluida. Voce pode tirar as lojas e os supervisores dela.`);
  await rede.deleteOne();
  await ResponsavelRede.deleteMany({ codigoRede: rede.codigoRede });
  await aplicarNaCarteira();
}

module.exports = { montarDocsCarteira, aplicarNaCarteira, lojasDisponiveis, supervisoresDisponiveis, listar, criar, atualizar, remover };
