const Encarte = require("../models/Encarte");
const Carteira = require("../models/Carteira");
const ResponsavelRede = require("../models/ResponsavelRede");
const Produto = require("../models/Produto");

/**
 * Resolve se o usuario logado pode EDITAR um encarte.
 * Regra:
 *   1. Se a rede tem ResponsavelRede definido → so o responsavel edita.
 *   2. Senao → o criador do encarte edita.
 *   Admin/diretoria sempre pode editar.
 */
async function podeEditar(user, encarte) {
  const { role, id, codigo } = user;
  if (role === "admin" || role === "diretoria") return true;
  if (role !== "supervisor") return false;

  const override = await ResponsavelRede.findOne({ codigoRede: encarte.codigoRede }).lean();
  if (override) {
    return override.supervisorCodigo === codigo || String(override.supervisorId) === id;
  }
  // Sem override: criador pode editar
  return String(encarte.criadoPorId) === id || encarte.criadoPorCodigo === codigo;
}

/**
 * Lista encartes agrupados por rede.
 * Supervisor ve apenas redes da carteira (+ redes em que e responsavel).
 * Admin/diretoria ve tudo.
 */
async function listar(req, res) {
  const { role, codigo, id } = req.user;

  let redesPermitidas = null; // null = sem filtro (admin/diretoria)

  if (role === "supervisor") {
    // Redes da carteira
    const carteira = await Carteira.find({ supervisorCodigo: codigo }, "codigoRede redeSubrede").lean();
    const redesCarteira = carteira.filter((c) => c.codigoRede).map((c) => c.codigoRede);

    // Redes em que e responsavel definido
    const overrides = await ResponsavelRede.find({ supervisorCodigo: codigo }, "codigoRede").lean();
    const redesOverride = overrides.map((o) => o.codigoRede);

    const set = new Set([...redesCarteira, ...redesOverride]);
    redesPermitidas = [...set];
  }

  const filtro = redesPermitidas !== null ? { codigoRede: { $in: redesPermitidas } } : {};

  const encartes = await Encarte.find(filtro)
    .sort({ codigoRede: 1, periodoInicio: -1 })
    .select("-itens") // lista sem itens para ser leve
    .lean();

  // Agrupa por rede
  const grupos = {};
  for (const e of encartes) {
    const key = e.codigoRede;
    if (!grupos[key]) {
      grupos[key] = { codigoRede: key, redeSubrede: e.redeSubrede, encartes: [] };
    }
    grupos[key].encartes.push(e);
  }

  // Para cada encarte, resolve se o usuario pode editar
  const overridesAll = redesPermitidas !== null
    ? await ResponsavelRede.find({ codigoRede: { $in: redesPermitidas ?? [] } }).lean()
    : await ResponsavelRede.find({}).lean();
  const overrideMap = {};
  for (const o of overridesAll) overrideMap[o.codigoRede] = o;

  const lista = Object.values(grupos).map((g) => ({
    ...g,
    encartes: g.encartes.map((e) => {
      const override = overrideMap[e.codigoRede];
      let podeEdit;
      if (role === "admin" || role === "diretoria") {
        podeEdit = true;
      } else if (override) {
        podeEdit = override.supervisorCodigo === codigo || String(override.supervisorId) === id;
      } else {
        podeEdit = String(e.criadoPorId) === id || e.criadoPorCodigo === codigo;
      }
      return { ...e, podeEditar: podeEdit };
    }),
  }));

  res.json({ grupos: lista });
}

/**
 * Cria um novo encarte.
 * Apenas supervisores podem criar. O supervisor deve ter a rede na carteira
 * ou ser o responsavel definido.
 */
async function criar(req, res) {
  const { nome, codigoRede, periodoInicio, periodoFim } = req.body || {};
  if (!nome || !codigoRede || !periodoInicio || !periodoFim) {
    return res.status(400).json({ error: "nome, codigoRede, periodoInicio e periodoFim sao obrigatorios" });
  }
  if (new Date(periodoFim) < new Date(periodoInicio)) {
    return res.status(400).json({ error: "periodoFim nao pode ser anterior a periodoInicio" });
  }

  const { codigo, nome: nomeUser, id, role } = req.user;

  // Verifica que supervisor tem acesso a esta rede
  if (role === "supervisor") {
    const naCarteira = await Carteira.findOne({ supervisorCodigo: codigo, codigoRede }).lean();
    const eResponsavel = await ResponsavelRede.findOne({ codigoRede, supervisorCodigo: codigo }).lean();
    if (!naCarteira && !eResponsavel) {
      return res.status(403).json({ error: "Voce nao tem acesso a esta rede" });
    }
  }

  // Pega redeSubrede de referencia
  const refCarteira = await Carteira.findOne({ codigoRede }).lean();
  const redeSubrede = refCarteira?.redeSubrede || null;

  const encarte = await Encarte.create({
    nome: nome.trim(),
    codigoRede,
    redeSubrede,
    periodoInicio: new Date(periodoInicio),
    periodoFim: new Date(periodoFim),
    criadoPorId: id,
    criadoPorCodigo: codigo,
    criadoPorNome: nomeUser,
    itens: [],
  });

  res.status(201).json(encarte);
}

/**
 * Obtem um encarte completo (com itens).
 */
async function obter(req, res) {
  const { id } = req.params;
  const enc = await Encarte.findById(id).lean();
  if (!enc) return res.status(404).json({ error: "Encarte nao encontrado" });

  const { role, codigo } = req.user;
  const userId = req.user.id;

  // Verifica visibilidade para supervisor
  if (role === "supervisor") {
    const naCarteira = await Carteira.findOne({ supervisorCodigo: codigo, codigoRede: enc.codigoRede }).lean();
    const eResponsavel = await ResponsavelRede.findOne({ codigoRede: enc.codigoRede, supervisorCodigo: codigo }).lean();
    if (!naCarteira && !eResponsavel) {
      return res.status(403).json({ error: "Acesso negado" });
    }
  }

  const override = await ResponsavelRede.findOne({ codigoRede: enc.codigoRede }).lean();
  let podeEdit;
  if (role === "admin" || role === "diretoria") {
    podeEdit = true;
  } else if (override) {
    podeEdit = override.supervisorCodigo === codigo || String(override.supervisorId) === userId;
  } else {
    podeEdit = String(enc.criadoPorId) === userId || enc.criadoPorCodigo === codigo;
  }

  res.json({ ...enc, podeEditar: podeEdit });
}

/**
 * Adiciona um produto ao encarte.
 */
async function adicionarItem(req, res) {
  const { id } = req.params;
  const enc = await Encarte.findById(id);
  if (!enc) return res.status(404).json({ error: "Encarte nao encontrado" });

  if (!(await podeEditar(req.user, enc))) {
    return res.status(403).json({ error: "Apenas o supervisor responsavel pode editar este encarte" });
  }

  const {
    produtoCodigo,
    produto,
    precoTabela,
    precoMinimo,
    precoPromo,
    custo,
    precoUltimaCompra,
    dataUltimaCompra,
    precoOferta,
    precoPDV,
    sellout,
    margemPDV,
    margemOferta,
  } = req.body || {};

  if (!produto) return res.status(400).json({ error: "produto e obrigatorio" });

  enc.itens.push({
    produtoCodigo: produtoCodigo || null,
    produto,
    precoTabela:       Number(precoTabela)       || 0,
    precoMinimo:       Number(precoMinimo)        || 0,
    precoPromo:        Number(precoPromo)         || 0,
    custo:             Number(custo)              || 0,
    precoUltimaCompra: precoUltimaCompra != null  ? Number(precoUltimaCompra) : null,
    dataUltimaCompra:  dataUltimaCompra           ? new Date(dataUltimaCompra) : null,
    precoOferta:       precoOferta != null        ? Number(precoOferta) : null,
    precoPDV:          precoPDV != null           ? Number(precoPDV)    : null,
    sellout:           Number(sellout)            || 0,
    margemPDV:         margemPDV != null          ? Number(margemPDV)   : null,
    margemOferta:      margemOferta != null       ? Number(margemOferta): null,
    adicionadoPorId:   req.user.id,
    adicionadoPorNome: req.user.nome,
  });

  await enc.save();
  res.json(enc);
}

/**
 * Remove um produto do encarte pelo _id do item.
 */
async function removerItem(req, res) {
  const { id, itemId } = req.params;
  const enc = await Encarte.findById(id);
  if (!enc) return res.status(404).json({ error: "Encarte nao encontrado" });

  if (!(await podeEditar(req.user, enc))) {
    return res.status(403).json({ error: "Apenas o supervisor responsavel pode editar este encarte" });
  }

  const antes = enc.itens.length;
  enc.itens = enc.itens.filter((it) => String(it._id) !== itemId);
  if (enc.itens.length === antes) return res.status(404).json({ error: "Item nao encontrado" });

  await enc.save();
  res.json(enc);
}

/**
 * Atualiza cabecalho do encarte (nome, periodo).
 */
async function atualizar(req, res) {
  const { id } = req.params;
  const enc = await Encarte.findById(id);
  if (!enc) return res.status(404).json({ error: "Encarte nao encontrado" });

  if (!(await podeEditar(req.user, enc))) {
    return res.status(403).json({ error: "Apenas o supervisor responsavel pode editar este encarte" });
  }

  const { nome, periodoInicio, periodoFim } = req.body || {};
  if (nome) enc.nome = nome.trim();
  if (periodoInicio) enc.periodoInicio = new Date(periodoInicio);
  if (periodoFim) enc.periodoFim = new Date(periodoFim);
  if (enc.periodoFim < enc.periodoInicio) {
    return res.status(400).json({ error: "periodoFim nao pode ser anterior a periodoInicio" });
  }

  await enc.save();
  res.json(enc);
}

/**
 * Remove o encarte inteiro.
 */
async function remover(req, res) {
  const { id } = req.params;
  const enc = await Encarte.findById(id);
  if (!enc) return res.status(404).json({ error: "Encarte nao encontrado" });

  if (!(await podeEditar(req.user, enc))) {
    return res.status(403).json({ error: "Apenas o supervisor responsavel pode remover este encarte" });
  }

  await enc.deleteOne();
  res.json({ ok: true });
}

/**
 * Lista produtos do catalogo para busca na montagem do encarte.
 * Retorna codigo, codigoLivre, descricao, precoTabela, precoMinimo, precoPromo, custo.
 */
async function listarProdutos(req, res) {
  const { q, limit = 50 } = req.query;
  const filtro = { ativo: true };
  if (q) filtro.descricao = { $regex: q, $options: "i" };

  const produtos = await Produto.find(filtro)
    .select("codigo codigoLivre descricao categoria precoTabela precoMinimo precoPromo custo")
    .sort({ descricao: 1 })
    .limit(Number(limit))
    .lean();

  res.json({ total: produtos.length, produtos });
}

module.exports = { listar, criar, obter, adicionarItem, removerItem, atualizar, remover, listarProdutos };
