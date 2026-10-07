/**
 * Alcance de lojas de cada usuario (quem ve o que):
 * - vendedor: as lojas da propria carteira;
 * - supervisor: as lojas da carteira dele MAIS todas as lojas das redes de que e responsavel
 *   (Responsabilidades de Rede): ser responsavel pela rede inclui as lojas que nao estao na carteira;
 * - diretoria e admin: todas (null).
 */
const Carteira = require("../models/Carteira");
const ResponsavelRede = require("../models/ResponsavelRede");

const CAMPOS = "clienteCodigo codigoRede redeSubrede subrede supervisorCodigo supervisorNome";

/** Filtro da Carteira para o usuario, ou null quando ve tudo. */
async function filtroCarteira(user) {
  if (user.role === "vendedor") return { vendedorCodigo: user.codigo };
  if (user.role === "supervisor") {
    const redes = await ResponsavelRede.distinct("codigoRede", { supervisorCodigo: user.codigo });
    return redes.length ? { $or: [{ supervisorCodigo: user.codigo }, { codigoRede: { $in: redes } }] } : { supervisorCodigo: user.codigo };
  }
  return null;
}

/** Linhas da Carteira que o usuario alcanca (todas, para diretoria/admin). */
async function carteiraDoUsuario(user) {
  const filtro = await filtroCarteira(user);
  return Carteira.find(filtro || {}, CAMPOS).lean();
}

/** Codigos de cliente que o usuario alcanca; null = todos. */
async function clientesDoUsuario(user) {
  const filtro = await filtroCarteira(user);
  return filtro ? Carteira.distinct("clienteCodigo", filtro) : null;
}

/** O usuario alcanca esta loja? */
async function alcancaCliente(user, clienteCodigo) {
  const filtro = await filtroCarteira(user);
  return !filtro || !!(await Carteira.exists({ ...filtro, clienteCodigo: String(clienteCodigo) }));
}

/** Linha da Carteira desta loja dentro do alcance do usuario (null se fora dele). */
async function entradaDaLoja(user, clienteCodigo) {
  const filtro = await filtroCarteira(user);
  return Carteira.findOne({ ...(filtro || {}), clienteCodigo: String(clienteCodigo) }).lean();
}

module.exports = { filtroCarteira, carteiraDoUsuario, clientesDoUsuario, alcancaCliente, entradaDaLoja };
