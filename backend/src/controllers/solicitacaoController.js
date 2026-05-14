const Solicitacao = require("../models/Solicitacao");
const Carteira = require("../models/Carteira");
const User = require("../models/User");

// Status inicial conforme role de quem cria
function statusInicial(role) {
  if (role === "diretoria" || role === "admin") return "aprovado_final";
  if (role === "supervisor") return "aprovado_supervisor";
  return "pendente_supervisor"; // vendedor
}

async function criar(req, res) {
  const { tipo, cliente, clienteCodigo, itens, motivo, observacoes } = req.body || {};
  if (!tipo || !cliente || !clienteCodigo || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Dados incompletos" });
  }

  // Buscar supervisor da carteira para o cliente (para notificação futura)
  let supervisorId = null, supervisorNome = null, supervisorCodigo = null;
  if (req.user.role === "vendedor") {
    const entrada = await Carteira.findOne({ clienteCodigo: String(clienteCodigo), vendedorCodigo: req.user.codigo });
    if (entrada) {
      supervisorCodigo = entrada.supervisorCodigo;
      supervisorNome = entrada.supervisorNome;
      const supUser = await User.findOne({ codigo: supervisorCodigo });
      if (supUser) supervisorId = supUser._id;
    }
  } else if (req.user.role === "supervisor") {
    supervisorId = req.user.id;
    supervisorNome = req.user.nome;
    supervisorCodigo = req.user.codigo;
  }

  const status = statusInicial(req.user.role);

  const sol = await Solicitacao.create({
    tipo,
    status,
    cliente,
    clienteCodigo: String(clienteCodigo),
    itens,
    motivo,
    observacoes,
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
  if (role === "vendedor") {
    // Vendedor vê apenas as próprias
    filtro.criadoPorId = id;
  } else if (role === "supervisor") {
    // Supervisor vê: pendente_supervisor de seus vendedores + as próprias
    const carteiraVendedores = await Carteira.distinct("vendedorCodigo", { supervisorCodigo: codigo });
    filtro.$or = [
      { criadoPorId: id },
      { status: "pendente_supervisor", supervisorCodigo: codigo },
      { status: "pendente_supervisor", supervisorId: id },
    ];
  }
  // diretoria/admin veem tudo

  const solicitacoes = await Solicitacao.find(filtro).sort({ createdAt: -1 }).limit(500);
  res.json({ solicitacoes });
}

async function obter(req, res) {
  const sol = await Solicitacao.findById(req.params.id);
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });
  // Vendedor só vê as próprias
  if (req.user.role === "vendedor" && String(sol.criadoPorId) !== req.user.id) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  res.json({ solicitacao: sol });
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

module.exports = { criar, listar, obter, decidir, cancelar };
