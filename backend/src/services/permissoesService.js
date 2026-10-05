/**
 * RBAC: resolve as permissoes de cada perfil (padrao em codigo + o que o admin editou no banco)
 * e as do usuario (uniao do perfil principal com os perfis adicionais).
 */
const PerfilPermissao = require("../models/PerfilPermissao");
const { PERFIS, CHAVES, SOMENTE_ADMIN, NAO_SE_APLICA, PADRAO } = require("../constants/permissoes");

const TTL_MS = 15000;
let cache = null; // { em, matriz: { perfil: Set }, docs: { perfil: doc } }

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  return e;
}

/**
 * Permissoes efetivas de um perfil a partir do documento salvo (ou do padrao, se nao houver).
 * Funcao pura. Regras: admin = tudo; permissao exclusiva do admin nunca vai para outro perfil;
 * chave que nao existia quando o perfil foi salvo vale pelo padrao; chave fora do catalogo e ignorada.
 */
function resolverPerfil(perfil, doc) {
  if (perfil === "admin") return new Set(CHAVES);
  const padrao = new Set(PADRAO[perfil] || []);
  let efetivas;
  if (!doc) efetivas = padrao;
  else {
    const salvas = new Set(doc.permissoes || []);
    const conhecidas = new Set(doc.conhecidas || []);
    efetivas = new Set(CHAVES.filter((c) => (conhecidas.has(c) ? salvas.has(c) : padrao.has(c))));
  }
  for (const c of SOMENTE_ADMIN) efetivas.delete(c);
  for (const c of NAO_SE_APLICA[perfil] || []) efetivas.delete(c);
  return new Set(CHAVES.filter((c) => efetivas.has(c)));
}

async function carregar() {
  if (cache && Date.now() - cache.em < TTL_MS) return cache;
  const docs = await PerfilPermissao.find({}).lean();
  const porPerfil = Object.fromEntries(docs.map((d) => [d.perfil, d]));
  const matriz = Object.fromEntries(PERFIS.map((p) => [p, resolverPerfil(p, porPerfil[p])]));
  cache = { em: Date.now(), matriz, docs: porPerfil };
  return cache;
}

function limparCache() {
  cache = null;
}

/** Perfis efetivos do usuario: o principal mais os adicionais. */
function perfisDoUsuario(user) {
  return [...new Set([user?.role, ...((user && user.roles) || [])].filter((p) => PERFIS.includes(p)))];
}

/** Permissoes do usuario (uniao das permissoes dos seus perfis), na ordem do catalogo. */
async function permissoesDoUsuario(user) {
  const { matriz } = await carregar();
  const uniao = new Set();
  for (const p of perfisDoUsuario(user)) for (const c of matriz[p]) uniao.add(c);
  return CHAVES.filter((c) => uniao.has(c));
}

async function usuarioPode(user, ...chaves) {
  const { matriz } = await carregar();
  return perfisDoUsuario(user).some((p) => chaves.some((c) => matriz[p].has(c)));
}

/** Matriz completa para a tela: por perfil, as permissoes efetivas e se foi personalizado. */
async function obterMatriz() {
  const { matriz, docs } = await carregar();
  return PERFIS.map((perfil) => ({
    perfil,
    permissoes: [...matriz[perfil]],
    padrao: [...resolverPerfil(perfil, null)],
    personalizado: !!docs[perfil],
    editavel: perfil !== "admin",
    atualizadoPorNome: docs[perfil]?.atualizadoPorNome || null,
    atualizadoEm: docs[perfil]?.updatedAt || null,
  }));
}

/** Salva as permissoes de um perfil (substitui a lista inteira). */
async function salvarPerfil(perfil, permissoes, user) {
  if (!PERFIS.includes(perfil)) throw erro(400, "Perfil invalido.");
  if (perfil === "admin") throw erro(400, "O perfil Admin tem sempre todas as permissoes e nao pode ser editado.");
  if (!Array.isArray(permissoes)) throw erro(400, "Envie a lista de permissoes do perfil.");
  const desconhecidas = permissoes.filter((c) => !CHAVES.includes(c));
  if (desconhecidas.length) throw erro(400, `Permissao desconhecida: ${desconhecidas.join(", ")}`);
  const exclusivas = permissoes.filter((c) => SOMENTE_ADMIN.has(c));
  if (exclusivas.length) throw erro(400, `Permissao exclusiva do perfil Admin: ${exclusivas.join(", ")}`);
  const semSentido = permissoes.filter((c) => NAO_SE_APLICA[perfil].has(c));
  if (semSentido.length) throw erro(400, `Permissao que nao se aplica a este perfil: ${semSentido.join(", ")}`);

  await PerfilPermissao.updateOne(
    { perfil },
    { $set: { permissoes: CHAVES.filter((c) => permissoes.includes(c)), conhecidas: CHAVES, atualizadoPorId: user?.id, atualizadoPorNome: user?.nome } },
    { upsert: true, runValidators: true }
  );
  limparCache();
  return obterMatriz();
}

/** Volta o perfil ao padrao (apaga a personalizacao). */
async function restaurarPerfil(perfil) {
  if (!PERFIS.includes(perfil) || perfil === "admin") throw erro(400, "Perfil invalido.");
  await PerfilPermissao.deleteOne({ perfil });
  limparCache();
  return obterMatriz();
}

module.exports = {
  resolverPerfil,
  perfisDoUsuario,
  permissoesDoUsuario,
  usuarioPode,
  obterMatriz,
  salvarPerfil,
  restaurarPerfil,
  limparCache,
};
