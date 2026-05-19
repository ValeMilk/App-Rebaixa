const Solicitacao = require("../models/Solicitacao");
const Carteira = require("../models/Carteira");
const User = require("../models/User");
const ResponsavelRede = require("../models/ResponsavelRede");

// Status inicial conforme role de quem cria
function statusInicial(role) {
  if (role === "diretoria" || role === "admin") return "aprovado_final";
  if (role === "supervisor") return "aprovado_supervisor";
  return "pendente_supervisor"; // vendedor
}

async function criar(req, res) {
  const { tipo, cliente, clienteCodigo, itens, motivo, observacoes, inicioAcao, fimAcao } = req.body || {};
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

  // Buscar carteira do cliente para obter supervisor e dados de rede
  let supervisorId = null, supervisorNome = null, supervisorCodigo = null;
  let codigoRede = null, redeSubrede = null;

  if (req.user.role === "vendedor") {
    const entrada = await Carteira.findOne({ clienteCodigo: String(clienteCodigo), vendedorCodigo: req.user.codigo });
    if (entrada) {
      supervisorCodigo = entrada.supervisorCodigo;
      supervisorNome   = entrada.supervisorNome;
      codigoRede       = entrada.codigoRede   || null;
      redeSubrede      = entrada.redeSubrede  || null;
      const supUser = await User.findOne({ codigo: supervisorCodigo });
      if (supUser) supervisorId = supUser._id;
    }
  } else if (req.user.role === "supervisor") {
    supervisorId     = req.user.id;
    supervisorNome   = req.user.nome;
    supervisorCodigo = req.user.codigo;
    const entrada = await Carteira.findOne({ clienteCodigo: String(clienteCodigo), supervisorCodigo: req.user.codigo });
    if (entrada) {
      codigoRede  = entrada.codigoRede  || null;
      redeSubrede = entrada.redeSubrede || null;
    }
  } else {
    // admin/diretoria: pegar rede da carteira sem filtro de vendedor
    const entrada = await Carteira.findOne({ clienteCodigo: String(clienteCodigo) });
    if (entrada) {
      codigoRede  = entrada.codigoRede  || null;
      redeSubrede = entrada.redeSubrede || null;
    }
  }

  const status = statusInicial(req.user.role);

  const sol = await Solicitacao.create({
    tipo,
    status,
    cliente,
    clienteCodigo: String(clienteCodigo),
    codigoRede,
    redeSubrede,
    itens,
    motivo,
    observacoes,
    inicioAcao: dIni,
    fimAcao: dFim,
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

  res.status(201).json({ solicitacao: sol });
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

  res.json({ solicitacoes: enriched });
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

  res.json({ solicitacao: { ...sol, podeDecidirSupervisor } });
}

async function decidir(req, res) {
  const { id } = req.params;
  const { decisao, motivoDecisao } = req.body || {};
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

  // Supervisor pode decidir pendente_supervisor
  if (role === "supervisor" && sol.status === "pendente_supervisor") {
    sol.status = decisao === "aprovado" ? "aprovado_supervisor" : "rejeitado";
  }
  // Diretoria/admin pode decidir aprovado_supervisor
  else if ((role === "diretoria" || role === "admin") && sol.status === "aprovado_supervisor") {
    sol.status = decisao === "aprovado" ? "aprovado_final" : "rejeitado";
  }
  // Diretoria/admin pode decidir qualquer pendente
  else if ((role === "diretoria" || role === "admin") && sol.status === "pendente_supervisor") {
    sol.status = decisao === "aprovado" ? "aprovado_final" : "rejeitado";
  } else {
    return res.status(409).json({ error: "Nao e possivel decidir neste status com sua role" });
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
    comentario: motivoDecisao,
  });
  await sol.save();
  res.json({ solicitacao: sol });
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
  res.json({ solicitacao: sol });
}

module.exports = { criar, listar, obter, decidir, cancelar, listarAtivas };

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
