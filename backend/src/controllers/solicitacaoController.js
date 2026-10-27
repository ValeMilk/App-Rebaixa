const Solicitacao = require("../models/Solicitacao");
const SolicitacaoFoto = require("../models/SolicitacaoFoto");
const Carteira = require("../models/Carteira");
const User = require("../models/User");
const Produto = require("../models/Produto");
const PrecoRede = require("../models/PrecoRede");
const ResponsavelRede = require("../models/ResponsavelRede");
const { entradaDaLoja } = require("../services/escopoService");
const { usuarioPode } = require("../services/permissoesService");
const { recalcularItem, avaliarEscalada, escolherPiso } = require("../services/precificacaoService");

// ---------------------------------------------------------------------------
// v2.0: escalada e campos de margem
// ---------------------------------------------------------------------------

/**
 * Status inicial (v2.0, fluxo de aprovacao): o vendedor sempre passa pelo supervisor; o supervisor
 * pula a propria etapa e, se a solicitacao nao exige a diretoria (preco da rede ou valor recebido >=
 * piso), ja nasce aprovada; diretoria e admin aprovam direto.
 */
function statusInicial(role, exigeDiretoria) {
  if (role === "diretoria" || role === "admin") return "aprovado_final";
  if (role === "supervisor") return exigeDiretoria ? "aprovado_supervisor" : "aprovado_final";
  return "pendente_supervisor"; // vendedor
}

// Campos que so quem tem "solicitacoes.ver_margens" enxerga (o vendedor nunca ve margem nem sellout)
const CAMPOS_MARGEM = ["sellout", "margemPDV", "margemOferta", "margemCalculada", "valorRecebido", "custoRedeAplicado", "custoRedeOrigem", "margemRedeAplicada", "origemMargem", "selloutOrigem", "precoPiso", "pisoTipo"];

function ocultarMargens(sol) {
  const s = typeof sol.toObject === "function" ? sol.toObject() : { ...sol };
  s.itens = (s.itens || []).map((it) => {
    const copia = { ...it };
    for (const c of CAMPOS_MARGEM) delete copia[c];
    return copia;
  });
  if (s.aprovacao) s.aprovacao = { exigeDiretoria: s.aprovacao.exigeDiretoria };
  s.ajustes = (s.ajustes || []).map((a) => ({
    ...a,
    antes: a.antes ? { precoOferta: a.antes.precoOferta, inicioAcao: a.antes.inicioAcao, fimAcao: a.antes.fimAcao } : a.antes,
    depois: a.depois ? { precoOferta: a.depois.precoOferta, inicioAcao: a.depois.inicioAcao, fimAcao: a.depois.fimAcao } : a.depois,
  }));
  s.margensOcultas = true;
  return s;
}

async function aplicarVisibilidade(user, docs) {
  const ve = await usuarioPode(user, "solicitacoes.ver_margens");
  if (ve) return docs;
  return Array.isArray(docs) ? docs.map(ocultarMargens) : ocultarMargens(docs);
}

/** Piso conferido no servidor (nao confia no formulario): minimo do item ou P#3 conforme a rede. */
async function pisoDoItem(item, codigoRede, pisoTipo) {
  const produto = item.produtoCodigo ? await Produto.findOne({ codigoLivre: String(item.produtoCodigo).trim() }).lean() : null;
  const rede = codigoRede && /^\d+$/.test(String(codigoRede)) && item.produtoCodigo
    ? await PrecoRede.findOne({ codigoRede: String(codigoRede), produtoCodigo: String(item.produtoCodigo).trim() }).lean()
    : null;
  return escolherPiso({ pisoTipo: pisoTipo || item.pisoTipo || "minimo", item: produto, rede });
}

/** Recalcula derivados de todos os itens e a escalada da solicitacao. Muta `sol`. */
async function recalcularSolicitacao(sol) {
  const itens = [];
  let exige = false;
  const motivos = [];
  for (const bruto of sol.itens) {
    const it = recalcularItem(typeof bruto.toObject === "function" ? bruto.toObject() : bruto);
    if (it.precoPiso == null) {
      const piso = await pisoDoItem(it, sol.codigoRede, it.pisoTipo);
      it.precoPiso = piso.valor;
      it.pisoTipo = piso.tipo;
    }
    const e = avaliarEscalada({ precoOfertaOrigem: it.precoOfertaOrigem, valorRecebido: it.valorRecebido, precoPiso: it.precoPiso, pisoTipo: it.pisoTipo });
    if (e.exigeDiretoria) exige = true;
    motivos.push(e.motivo);
    itens.push(it);
  }
  sol.itens = itens;
  sol.aprovacao = { exigeDiretoria: exige, motivoEscalada: [...new Set(motivos)].join(" ") || null };
  return sol;
}

// Foto em data URL (base64) -> Buffer. Limite de 3 MB depois da compressao no navegador.
function decodificarFoto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) return null;
  const dados = Buffer.from(m[2], "base64");
  if (!dados.length || dados.length > 3 * 1024 * 1024) return null;
  return { mime: m[1].toLowerCase(), dados };
}

// ---------------------------------------------------------------------------

async function criar(req, res) {
  const { tipo, cliente, clienteCodigo, itens, motivo, observacoes, inicioAcao, fimAcao, contraConcorrente, foto } = req.body || {};
  if (!tipo || !cliente || !clienteCodigo || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Dados incompletos" });
  }
  if (!inicioAcao || !fimAcao) {
    return res.status(400).json({ error: "Período da ação (início e fim) é obrigatório" });
  }
  const dIni = new Date(inicioAcao);
  const dFim = new Date(fimAcao);
  if (isNaN(dIni) || isNaN(dFim)) {
    return res.status(400).json({ error: "Datas de início/fim inválidas" });
  }
  if (dFim < dIni) {
    return res.status(400).json({ error: "Fim da ação não pode ser anterior ao início" });
  }
  for (const it of itens) {
    if (!(Number(it.precoPDV) > 0) || !(Number(it.precoOferta) > 0)) {
      return res.status(400).json({ error: "Preço PDV e preço da oferta são obrigatórios" });
    }
  }
  const fotoDecodificada = foto ? decodificarFoto(foto) : null;
  if (contraConcorrente && !fotoDecodificada) {
    return res.status(400).json({ error: "Ação contra concorrente exige a foto tirada na hora" });
  }
  if (foto && !fotoDecodificada) {
    return res.status(400).json({ error: "Foto inválida (use JPEG, PNG ou WebP até 3 MB)" });
  }

  // Buscar carteira do cliente para obter supervisor e dados de rede
  let supervisorId = null, supervisorNome = null, supervisorCodigo = null;
  let codigoRede = null, redeSubrede = null, subrede = null;

  if (req.user.role === "vendedor") {
    const entrada = await Carteira.findOne({ clienteCodigo: String(clienteCodigo), vendedorCodigo: req.user.codigo });
    if (entrada) {
      supervisorCodigo = entrada.supervisorCodigo;
      supervisorNome   = entrada.supervisorNome;
      codigoRede       = entrada.codigoRede   || null;
      redeSubrede      = entrada.redeSubrede  || null;
      subrede          = entrada.subrede      || null;
      const supUser = await User.findOne({ codigo: supervisorCodigo });
      if (supUser) supervisorId = supUser._id;
    }
  } else if (req.user.role === "supervisor") {
    supervisorId     = req.user.id;
    supervisorNome   = req.user.nome;
    supervisorCodigo = req.user.codigo;
    // carteira dele ou loja de uma rede de que e responsavel
    const entrada = await entradaDaLoja(req.user, clienteCodigo);
    if (entrada) {
      codigoRede  = entrada.codigoRede  || null;
      redeSubrede = entrada.redeSubrede || null;
      subrede     = entrada.subrede     || null;
    }
  } else {
    // admin/diretoria: pegar rede da carteira sem filtro de vendedor
    const entrada = await Carteira.findOne({ clienteCodigo: String(clienteCodigo) });
    if (entrada) {
      codigoRede  = entrada.codigoRede  || null;
      redeSubrede = entrada.redeSubrede || null;
      subrede     = entrada.subrede     || null;
    }
  }
  if (!codigoRede && req.body.codigoRede) codigoRede = String(req.body.codigoRede);
  if (!redeSubrede && req.body.redeSubrede) redeSubrede = String(req.body.redeSubrede);

  const sol = new Solicitacao({
    tipo,
    cliente,
    clienteCodigo: String(clienteCodigo),
    codigoRede,
    redeSubrede,
    subrede,
    itens,
    motivo,
    observacoes,
    inicioAcao: dIni,
    fimAcao: dFim,
    contraConcorrente: !!contraConcorrente,
    temFoto: !!fotoDecodificada,
    criadoPorId: req.user.id,
    criadoPorNome: req.user.nome,
    criadoPorRole: req.user.role,
    criadoPorCodigo: req.user.codigo,
    supervisorId,
    supervisorNome,
    supervisorCodigo,
    historico: [
      {
        acao: "criada",
        porUserId: req.user.id,
        porNome: req.user.nome,
        porRole: req.user.role,
      },
    ],
  });

  // v2.0: derivados (preco liquido, margens, valor recebido) e escalada calculados no servidor
  await recalcularSolicitacao(sol);
  sol.status = statusInicial(req.user.role, sol.aprovacao.exigeDiretoria);
  if (sol.status === "aprovado_final" && req.user.role === "supervisor") {
    sol.historico.push({ acao: "aprovado_final", porUserId: req.user.id, porNome: req.user.nome, porRole: req.user.role, comentario: "Aprovação do supervisor encerra o fluxo: " + sol.aprovacao.motivoEscalada });
    sol.aprovadoPorId = req.user.id;
    sol.aprovadoPorNome = req.user.nome;
    sol.aprovadoEm = new Date();
  }
  await sol.save();

  if (fotoDecodificada) {
    await SolicitacaoFoto.create({ solicitacaoId: sol._id, mime: fotoDecodificada.mime, tamanho: fotoDecodificada.dados.length, dados: fotoDecodificada.dados });
  }

  // v2.0: a solicitacao conta como acao nas pendencias de contagem da loja+produto
  try {
    const { registrarAcao } = require("../services/pendenciasService");
    for (const it of sol.itens) {
      if (it.produtoCodigo) {
        await registrarAcao({ clienteCodigo: sol.clienteCodigo, produtoCodigo: String(it.produtoCodigo), tipo: "solicitacao", user: req.user, solicitacaoId: sol._id });
      }
    }
  } catch (err) {
    console.error("[solicitacoes] registrarAcao nas pendencias:", err.message);
  }

  res.status(201).json({ solicitacao: await aplicarVisibilidade(req.user, sol) });
}

async function listar(req, res) {
  const { status, tipo } = req.query;
  const filtro = {};
  if (status) filtro.status = status;
  if (tipo) filtro.tipo = tipo;

  const { role, id, codigo } = req.user;

  // Carrega overrides de responsabilidade por rede (coleção pequena)
  const overrides = await ResponsavelRede.find().select("codigoRede supervisorCodigo").lean();
  const redesComResponsavel = overrides.map((o) => o.codigoRede); // todas que têm override
  const redesQuesouResp = overrides
    .filter((o) => o.supervisorCodigo === codigo)
    .map((o) => o.codigoRede); // redes em que ESTE supervisor é o responsável

  if (role === "vendedor") {
    filtro.criadoPorId = id;
  } else if (role === "supervisor") {
    // Regra padrão (carteira) ainda vale, MAS para redes que têm responsável (override)
    // somente o responsável vê via override; os demais continuam vendo as próprias lojas
    // (carteira) em modo leitura. O modo leitura é controlado por `podeDecidirSupervisor`.
    filtro.$or = [
      { criadoPorId: id }, // próprias
      // Carteira: vê pendentes onde a solicitação aponta para ele como supervisor
      { status: "pendente_supervisor", supervisorCodigo: codigo },
      { status: "pendente_supervisor", supervisorId: id },
      // v2.0: tambem as ja decididas por ele / das suas lojas (acompanhamento)
      { supervisorCodigo: codigo },
      // Override: vê TODAS as solicitações das redes em que ele é responsável
      ...(redesQuesouResp.length > 0
        ? [{ codigoRede: { $in: redesQuesouResp } }]
        : []),
    ];
  }
  // diretoria/admin veem tudo

  const docs = await Solicitacao.find(filtro).sort({ createdAt: -1 }).limit(500).lean();

  // Enriquecer com flag podeDecidirSupervisor (somente p/ supervisor)
  let enriched = docs;
  if (role === "supervisor") {
    const setRedesResp = new Set(redesQuesouResp);
    const setRedesComResp = new Set(redesComResponsavel);
    enriched = docs.map((s) => {
      let podeDecidirSupervisor = false;
      if (s.status === "pendente_supervisor") {
        const rede = s.codigoRede;
        if (rede && setRedesComResp.has(rede)) {
          // Rede tem override: só o responsável decide
          podeDecidirSupervisor = setRedesResp.has(rede);
        } else {
          // Rede sem override: regra carteira (a própria query já garantiu visibilidade)
          podeDecidirSupervisor =
            s.supervisorCodigo === codigo || String(s.supervisorId) === id;
        }
      }
      return { ...s, podeDecidirSupervisor };
    });
  }

  res.json({ solicitacoes: await aplicarVisibilidade(req.user, enriched) });
}

async function obter(req, res) {
  const sol = await Solicitacao.findById(req.params.id).lean();
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });
  // Vendedor só vê as próprias
  if (req.user.role === "vendedor" && String(sol.criadoPorId) !== req.user.id) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  // Calcula podeDecidirSupervisor para o detalhe (mesma regra do listar)
  let podeDecidirSupervisor = false;
  if (req.user.role === "supervisor" && sol.status === "pendente_supervisor") {
    if (sol.codigoRede) {
      const override = await ResponsavelRede.findOne({ codigoRede: sol.codigoRede }).lean();
      if (override) {
        podeDecidirSupervisor = override.supervisorCodigo === req.user.codigo;
      } else {
        podeDecidirSupervisor =
          sol.supervisorCodigo === req.user.codigo || String(sol.supervisorId) === req.user.id;
      }
    } else {
      podeDecidirSupervisor =
        sol.supervisorCodigo === req.user.codigo || String(sol.supervisorId) === req.user.id;
    }
  }

  res.json({ solicitacao: await aplicarVisibilidade(req.user, { ...sol, podeDecidirSupervisor }) });
}

/** Foto da solicitacao (quem pode ver a solicitacao pode ver a foto). */
async function foto(req, res) {
  const sol = await Solicitacao.findById(req.params.id).select("criadoPorId temFoto").lean();
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });
  if (req.user.role === "vendedor" && String(sol.criadoPorId) !== req.user.id) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  const f = await SolicitacaoFoto.findOne({ solicitacaoId: sol._id }).lean();
  if (!f) return res.status(404).json({ error: "Sem foto" });
  res.set("Content-Type", f.mime || "image/jpeg");
  res.set("Cache-Control", "private, max-age=3600");
  res.send(f.dados);
}

/**
 * Decisao (v2.0): o supervisor pode AJUSTAR as condicoes (preco da oferta, sellout, periodo) antes
 * de aprovar; depois do ajuste a escalada e recalculada. A aprovacao do supervisor encerra o fluxo
 * quando a solicitacao nao exige a diretoria; senao vai para "Ag. Diretoria".
 */
async function decidir(req, res) {
  const { id } = req.params;
  const { decisao, motivoDecisao, ajustes } = req.body || {};
  if (!["aprovado", "rejeitado"].includes(decisao)) {
    return res.status(400).json({ error: "Decisao invalida. Use 'aprovado' ou 'rejeitado'" });
  }
  const sol = await Solicitacao.findById(id);
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });

  const { role } = req.user;

  // Override de responsabilidade por rede:
  // se a rede da solicitação tem responsável definido e o usuário NÃO é o responsável,
  // bloqueia a decisão na etapa de supervisor (diretoria/admin segue normal).
  if (role === "supervisor" && sol.codigoRede) {
    const override = await ResponsavelRede.findOne({ codigoRede: sol.codigoRede }).lean();
    if (override && override.supervisorCodigo !== req.user.codigo) {
      return res.status(403).json({
        error: `Esta rede tem responsável definido (${override.supervisorNome}). Apenas ele pode decidir.`,
      });
    }
  }

  const podeEtapa =
    (role === "supervisor" && sol.status === "pendente_supervisor") ||
    ((role === "diretoria" || role === "admin") && ["pendente_supervisor", "aprovado_supervisor"].includes(sol.status));
  if (!podeEtapa) {
    return res.status(409).json({ error: "Nao e possivel decidir neste status com sua role" });
  }

  // Ajuste das condicoes (so na aprovacao)
  if (decisao === "aprovado" && ajustes && typeof ajustes === "object") {
    const novoOferta = ajustes.precoOferta != null && ajustes.precoOferta !== "" ? Number(ajustes.precoOferta) : null;
    const novoSellout = ajustes.sellout != null && ajustes.sellout !== "" ? Number(ajustes.sellout) : null;
    const novoIni = ajustes.inicioAcao ? new Date(ajustes.inicioAcao) : null;
    const novoFim = ajustes.fimAcao ? new Date(ajustes.fimAcao) : null;
    if ((novoOferta != null && !(novoOferta > 0)) || (novoSellout != null && novoSellout < 0)) {
      return res.status(400).json({ error: "Ajuste inválido: preço da oferta deve ser maior que zero e sellout não pode ser negativo" });
    }
    if ((novoIni && isNaN(novoIni)) || (novoFim && isNaN(novoFim))) {
      return res.status(400).json({ error: "Datas do ajuste inválidas" });
    }
    const ini = novoIni || sol.inicioAcao;
    const fim = novoFim || sol.fimAcao;
    if (fim < ini) return res.status(400).json({ error: "Fim da ação não pode ser anterior ao início" });
    const travado = sol.itens.some((it) => it.precoOfertaTravado);
    if (novoOferta != null && travado && role === "supervisor") {
      return res.status(400).json({ error: "Preço da rede (P#2/P#3) não pode ser alterado pelo supervisor" });
    }

    const antes = { precoOferta: sol.itens[0]?.precoOferta, sellout: sol.itens[0]?.sellout, inicioAcao: sol.inicioAcao, fimAcao: sol.fimAcao };
    const mudou = (novoOferta != null && novoOferta !== antes.precoOferta) || (novoSellout != null && novoSellout !== antes.sellout)
      || (novoIni && +novoIni !== +sol.inicioAcao) || (novoFim && +novoFim !== +sol.fimAcao);
    if (mudou) {
      sol.itens = sol.itens.map((bruto) => {
        const it = bruto.toObject();
        if (novoOferta != null) { it.precoOferta = novoOferta; if (it.precoOfertaOrigem !== "rede") { it.precoOfertaOrigem = "vendedor"; it.precoOfertaTravado = false; } }
        if (novoSellout != null) { it.sellout = novoSellout; it.selloutOrigem = "manual"; }
        return it;
      });
      sol.inicioAcao = ini;
      sol.fimAcao = fim;
      await recalcularSolicitacao(sol);
      sol.ajustes.push({
        porUserId: req.user.id, porNome: req.user.nome, porRole: req.user.role,
        antes,
        depois: { precoOferta: sol.itens[0]?.precoOferta, sellout: sol.itens[0]?.sellout, inicioAcao: sol.inicioAcao, fimAcao: sol.fimAcao },
      });
      sol.historico.push({ acao: "ajustada", porUserId: req.user.id, porNome: req.user.nome, porRole: req.user.role, comentario: resumoAjuste(antes, sol) });
    }
  }

  if (decisao === "rejeitado") {
    sol.status = "rejeitado";
  } else if (role === "supervisor") {
    // Solicitacao antiga (sem avaliacao) segue a regra antiga: vai para a diretoria
    const exige = sol.aprovacao?.exigeDiretoria !== false;
    sol.status = exige ? "aprovado_supervisor" : "aprovado_final";
  } else {
    sol.status = "aprovado_final";
  }

  sol.aprovadoPorId = req.user.id;
  sol.aprovadoPorNome = req.user.nome;
  sol.aprovadoEm = new Date();
  sol.motivoDecisao = motivoDecisao || "";
  sol.historico.push({
    acao: sol.status,
    porUserId: req.user.id,
    porNome: req.user.nome,
    porRole: req.user.role,
    comentario: [motivoDecisao, role === "supervisor" && sol.status === "aprovado_final" ? `(encerra o fluxo: ${sol.aprovacao?.motivoEscalada || "não exige diretoria"})` : null].filter(Boolean).join(" "),
  });
  await sol.save();
  res.json({ solicitacao: await aplicarVisibilidade(req.user, sol) });
}

function resumoAjuste(antes, sol) {
  const partes = [];
  const it = sol.itens[0] || {};
  if (antes.precoOferta !== it.precoOferta) partes.push(`oferta ${fmt(antes.precoOferta)} → ${fmt(it.precoOferta)}`);
  if (antes.sellout !== it.sellout) partes.push(`sellout ${fmt(antes.sellout)} → ${fmt(it.sellout)}`);
  if (+antes.inicioAcao !== +sol.inicioAcao || +antes.fimAcao !== +sol.fimAcao) partes.push("período alterado");
  return partes.join("; ");
}
function fmt(v) {
  return v == null ? "—" : `R$ ${Number(v).toFixed(2)}`;
}

async function cancelar(req, res) {
  const sol = await Solicitacao.findById(req.params.id);
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });
  if (String(sol.criadoPorId) !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Acesso negado" });
  }
  if (!["pendente_supervisor", "aprovado_supervisor"].includes(sol.status)) {
    return res.status(409).json({ error: "Nao pode cancelar neste status" });
  }
  sol.status = "cancelado";
  sol.historico.push({
    acao: "cancelado",
    porUserId: req.user.id,
    porNome: req.user.nome,
    porRole: req.user.role,
  });
  await sol.save();
  res.json({ solicitacao: await aplicarVisibilidade(req.user, sol) });
}

// Lista resumida de solicitacoes ATIVAS (pendentes ou aprovadas com fimAcao >= hoje)
// Usada pela tela de estoque para marcar produtos que ja tem rebaixa/oferta em andamento.
async function listarAtivas(req, res) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const filtro = {
    status: { $in: ["pendente_supervisor", "aprovado_supervisor", "aprovado_final"] },
    $or: [
      { fimAcao: { $gte: hoje } },
      { fimAcao: { $exists: false } }, // legados sem periodo
      { fimAcao: null },
    ],
  };

  const docs = await Solicitacao.find(filtro)
    .select("_id tipo status clienteCodigo codigoRede inicioAcao fimAcao itens.produtoCodigo")
    .lean();

  const ativas = [];
  for (const d of docs) {
    const produtoCodigo = d.itens?.[0]?.produtoCodigo;
    if (!produtoCodigo) continue;
    ativas.push({
      _id: d._id,
      tipo: d.tipo,
      status: d.status,
      clienteCodigo: d.clienteCodigo || null,
      codigoRede: d.codigoRede || null,
      produtoCodigo: String(produtoCodigo),
      inicioAcao: d.inicioAcao,
      fimAcao: d.fimAcao,
    });
  }
  res.json({ ativas });
}

module.exports = { criar, listar, obter, foto, decidir, cancelar, listarAtivas, statusInicial, ocultarMargens, CAMPOS_MARGEM };
