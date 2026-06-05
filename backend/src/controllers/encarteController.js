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

  // redesInfo: mapa codigoRede → redeSubrede com todas as redes acessiveis ao usuario
  let redesInfo = {}; // codigoRede → redeSubrede

  if (role === "supervisor") {
    // Redes da carteira
    const carteira = await Carteira.find({
      supervisorCodigo: codigo,
      $or: [
        { redeSubrede: { $not: /INATIVO/i } },
        { redeSubrede: null },
      ],
    }, "codigoRede redeSubrede").lean();
    for (const c of carteira) {
      if (c.codigoRede) redesInfo[c.codigoRede] = c.redeSubrede || null;
    }

    // Redes em que e responsavel definido (pode nao estar na carteira direta)
    const overrides = await ResponsavelRede.find({ supervisorCodigo: codigo }, "codigoRede redeSubrede").lean();
    for (const o of overrides) {
      if (!redesInfo[o.codigoRede]) redesInfo[o.codigoRede] = o.redeSubrede || null;
    }
  } else if (role === "admin" || role === "diretoria") {
    // Todas as redes distintas da carteira
    const carteira = await Carteira.find({
      codigoRede: { $ne: null },
      $or: [
        { redeSubrede: { $not: /INATIVO/i } },
        { redeSubrede: null },
      ],
    }, "codigoRede redeSubrede").lean();
    for (const c of carteira) {
      if (c.codigoRede) redesInfo[c.codigoRede] = c.redeSubrede || null;
    }
  }

  const redesPermitidas = role === "admin" || role === "diretoria"
    ? null
    : Object.keys(redesInfo);

  const filtro = redesPermitidas !== null ? { codigoRede: { $in: redesPermitidas } } : {};

  const encartes = await Encarte.find(filtro)
    .sort({ codigoRede: 1, periodoInicio: -1 })
    .select("-itens")
    .lean();

  // Mapa de overrides para calculo de podeEditar
  const overridesAll = redesPermitidas !== null
    ? await ResponsavelRede.find({ codigoRede: { $in: redesPermitidas } }).lean()
    : await ResponsavelRede.find({}).lean();
  const overrideMap = {};
  for (const o of overridesAll) overrideMap[o.codigoRede] = o;

  // Monta grupos a partir das REDES do usuario (nao so a partir dos encartes existentes)
  const grupos = {};
  for (const [codigoRede, redeSubrede] of Object.entries(redesInfo)) {
    grupos[codigoRede] = { codigoRede, redeSubrede, encartes: [] };
  }

  // Para admin/diretoria sem redesInfo populado, inicializa grupos a partir dos encartes
  for (const e of encartes) {
    if (!grupos[e.codigoRede]) {
      grupos[e.codigoRede] = { codigoRede: e.codigoRede, redeSubrede: e.redeSubrede, encartes: [] };
    }
  }

  // Distribui encartes nos grupos com podeEditar resolvido
  for (const e of encartes) {
    const override = overrideMap[e.codigoRede];
    let podeEdit;
    if (role === "admin" || role === "diretoria") {
      podeEdit = true;
    } else if (override) {
      podeEdit = override.supervisorCodigo === codigo || String(override.supervisorId) === id;
    } else {
      podeEdit = String(e.criadoPorId) === id || e.criadoPorCodigo === codigo;
    }
    grupos[e.codigoRede].encartes.push({ ...e, podeEditar: podeEdit });
  }

  // Resolve podeEditar para criacao de novo encarte em cada grupo (sem encarte ainda)
  const lista = Object.values(grupos)
    .sort((a, b) => (a.redeSubrede || a.codigoRede).localeCompare(b.redeSubrede || b.codigoRede))
    .map((g) => {
      const override = overrideMap[g.codigoRede];
      let podeEditGrupo;
      if (role === "admin" || role === "diretoria") {
        podeEditGrupo = true;
      } else if (override) {
        podeEditGrupo = override.supervisorCodigo === codigo || String(override.supervisorId) === id;
      } else {
        // Sem override: qualquer supervisor da carteira pode criar
        podeEditGrupo = true;
      }
      return { ...g, podeEditar: podeEditGrupo };
    });

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
    subcategoria,
    precoTabela,
    precoMinimo,
    precoPromo,
    custo,
    precoUltimaCompra,
    dataUltimaCompra,
    precoOferta,
    precoPDV,
    sellout,
    custoPromo,
    margemPDV,
    margemOferta,
  } = req.body || {};

  if (!produto) return res.status(400).json({ error: "produto e obrigatorio" });

  enc.itens.push({
    produtoCodigo: produtoCodigo || null,
    produto,
    subcategoria:      subcategoria      || null,
    precoTabela:       Number(precoTabela)       || 0,
    precoMinimo:       Number(precoMinimo)        || 0,
    precoPromo:        Number(precoPromo)         || 0,
    custo:             Number(custo)              || 0,
    precoUltimaCompra: precoUltimaCompra != null  ? Number(precoUltimaCompra) : null,
    dataUltimaCompra:  dataUltimaCompra           ? new Date(dataUltimaCompra) : null,
    precoOferta:       precoOferta != null        ? Number(precoOferta) : null,
    precoPDV:          precoPDV != null           ? Number(precoPDV)    : null,
    sellout:           Number(sellout)            || 0,
    custoPromo:        custoPromo != null          ? Number(custoPromo)  : null,
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
 * Atualiza precificacao de um item no encarte.
 */
async function atualizarItem(req, res) {
  const { id, itemId } = req.params;
  const { precoPDV, precoOferta, sellout } = req.body || {};

  const enc = await Encarte.findById(id);
  if (!enc) return res.status(404).json({ error: "Encarte nao encontrado" });

  if (!(await podeEditar(req.user, enc))) {
    return res.status(403).json({ error: "Apenas o supervisor responsavel pode editar este encarte" });
  }

  const item = enc.itens.find((it) => String(it._id) === itemId);
  if (!item) return res.status(404).json({ error: "Item nao encontrado" });

  // Atualiza os preços
  if (precoPDV != null) item.precoPDV = Number(precoPDV);
  if (precoOferta != null) item.precoOferta = Number(precoOferta);
  if (sellout != null) item.sellout = Number(sellout);

  // Recalcula margens e custoPromo
  const uc = Number(item.precoUltimaCompra) || 0;
  const pdv = Number(item.precoPDV) || 0;
  const oferta = Number(item.precoOferta) || 0;
  const sell = Number(item.sellout) || 0;

  if (uc > 0 && pdv > 0) {
    item.margemPDV = ((pdv - uc) / pdv) * 100;
  } else {
    item.margemPDV = null;
  }

  const custoPromo = uc - sell;
  if (custoPromo > 0 && oferta > 0) {
    item.margemOferta = ((oferta - custoPromo) / oferta) * 100;
    item.custoPromo = custoPromo;
  } else {
    item.margemOferta = null;
    item.custoPromo = null;
  }

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
  const { q, subcategoria, limit = 100 } = req.query;
  const filtro = { ativo: true };
  if (q) filtro.descricao = { $regex: q, $options: "i" };
  if (subcategoria) filtro.subcategoria = subcategoria;

  const produtos = await Produto.find(filtro)
    .select("codigo codigoLivre descricao categoria subcategoria precoTabela precoMinimo precoPromo custo")
    .sort({ descricao: 1 })
    .limit(Number(limit))
    .lean();

  res.json({ total: produtos.length, produtos });
}

/** Retorna lista de categorias distintas (nao vazias) para montar dropdown */
async function listarCategorias(req, res) {
  const categorias = await Produto.distinct("categoria", { ativo: true, categoria: { $ne: "" } });
  res.json({ categorias: categorias.filter(Boolean).sort() });
}

/** Retorna lista de subcategorias distintas (nao vazias), opcionalmente filtrado por categoria */
async function listarSubcategorias(req, res) {
  const { categoria } = req.query;
  const filtro = { ativo: true, subcategoria: { $ne: "" } };
  
  // Se categoria foi especificada, filtrar subcategorias daquela categoria
  if (categoria) {
    filtro.categoria = categoria;
  }
  
  const subs = await Produto.distinct("subcategoria", filtro);
  res.json({ subcategorias: subs.filter(Boolean).sort() });
}

/**
 * Performance de encartes para diretoria/admin.
 * Suporta comparação entre dois períodos.
 * Query params:
 *   p1inicio, p1fim   — período 1 (obrigatório)
 *   p2inicio, p2fim   — período 2 (opcional, para comparação)
 *   codigoRede        — filtro de rede (opcional)
 *   criadoPorId       — filtro de supervisor (opcional)
 */
async function performance(req, res) {
  const { p1inicio, p1fim, p2inicio, p2fim, codigoRede, criadoPorId } = req.query;

  function buildFiltro(inicio, fim) {
    const f = {};
    if (inicio || fim) {
      f.$or = [
        {
          periodoInicio: {
            ...(inicio ? { $gte: new Date(inicio) } : {}),
            ...(fim ? { $lte: new Date(fim) } : {}),
          },
        },
        {
          periodoFim: {
            ...(inicio ? { $gte: new Date(inicio) } : {}),
            ...(fim ? { $lte: new Date(fim) } : {}),
          },
        },
      ];
    }
    if (codigoRede) f.codigoRede = codigoRede;
    if (criadoPorId) f.criadoPorId = criadoPorId;
    return f;
  }

  function calcPeriodoStats(encartes) {
    const hoje = new Date();
    let totalItens = 0;
    let somaMargemOferta = 0;
    let countMargem = 0;
    let somaPrecoOferta = 0;
    let countPreco = 0;
    const selloutPorSub = {}; // subcategoria -> { soma, count }

    for (const enc of encartes) {
      for (const item of enc.itens || []) {
        totalItens++;

        if (item.margemOferta != null) {
          somaMargemOferta += item.margemOferta;
          countMargem++;
        }
        if (item.precoOferta != null) {
          somaPrecoOferta += item.precoOferta;
          countPreco++;
        }

        const sub = item.subcategoria || "Sem subcategoria";
        if (!selloutPorSub[sub]) selloutPorSub[sub] = { soma: 0, count: 0 };
        if (item.sellout != null) {
          selloutPorSub[sub].soma += item.sellout;
          selloutPorSub[sub].count++;
        }
      }
    }

    const selloutArr = Object.entries(selloutPorSub)
      .map(([subcategoria, { soma, count }]) => ({
        subcategoria,
        selloutMedio: count > 0 ? soma / count : 0,
        totalItens: count,
      }))
      .sort((a, b) => b.selloutMedio - a.selloutMedio);

    return {
      totalEncartes: encartes.length,
      totalItens,
      margemMediaOferta: countMargem > 0 ? somaMargemOferta / countMargem : null,
      precoMedioOferta: countPreco > 0 ? somaPrecoOferta / countPreco : null,
      selloutPorSubcategoria: selloutArr,
    };
  }

  function formatEncartes(encartes, periodoLabel) {
    const hoje = new Date();
    return encartes.map((enc) => {
      let somaMargemOferta = 0, countMargem = 0;
      let somaPrecoOferta = 0, countPreco = 0;
      const selloutPorSub = {};

      for (const item of enc.itens || []) {
        if (item.margemOferta != null) { somaMargemOferta += item.margemOferta; countMargem++; }
        if (item.precoOferta != null) { somaPrecoOferta += item.precoOferta; countPreco++; }
        const sub = item.subcategoria || "Sem subcategoria";
        if (!selloutPorSub[sub]) selloutPorSub[sub] = { soma: 0, count: 0 };
        if (item.sellout != null) { selloutPorSub[sub].soma += item.sellout; selloutPorSub[sub].count++; }
      }

      return {
        _id: enc._id,
        nome: enc.nome,
        codigoRede: enc.codigoRede,
        redeSubrede: enc.redeSubrede,
        periodoInicio: enc.periodoInicio,
        periodoFim: enc.periodoFim,
        criadoPorId: enc.criadoPorId,
        criadoPorNome: enc.criadoPorNome,
        totalItens: (enc.itens || []).length,
        margemMediaOferta: countMargem > 0 ? somaMargemOferta / countMargem : null,
        precoMedioOferta: countPreco > 0 ? somaPrecoOferta / countPreco : null,
        selloutPorSubcategoria: Object.entries(selloutPorSub).map(([subcategoria, { soma, count }]) => ({
          subcategoria,
          selloutMedio: count > 0 ? soma / count : 0,
          totalItens: count,
        })).sort((a, b) => b.selloutMedio - a.selloutMedio),
        status: new Date(enc.periodoFim) < hoje ? "finalizado" : "ativo",
        periodo: periodoLabel,
      };
    });
  }

  const enc1 = p1inicio || p1fim
    ? await Encarte.find(buildFiltro(p1inicio, p1fim)).lean()
    : await Encarte.find(buildFiltro()).lean();

  const stats1 = calcPeriodoStats(enc1);
  const encartes1 = formatEncartes(enc1, 1);

  let stats2 = null;
  let encartes2 = [];
  if (p2inicio || p2fim) {
    const enc2 = await Encarte.find(buildFiltro(p2inicio, p2fim)).lean();
    stats2 = calcPeriodoStats(enc2);
    encartes2 = formatEncartes(enc2, 2);
  }

  res.json({
    periodo1: stats1,
    periodo2: stats2,
    encartes: [...encartes1, ...encartes2],
  });
}

module.exports = { listar, criar, obter, adicionarItem, removerItem, atualizarItem, atualizar, remover, listarProdutos, listarCategorias, listarSubcategorias, performance };
