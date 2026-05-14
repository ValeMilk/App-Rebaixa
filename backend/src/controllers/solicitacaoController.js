const Solicitacao = require("../models/Solicitacao");

async function criar(req, res) {
  const { tipo, cliente, clienteCodigo, itens, motivo, observacoes } = req.body || {};
  if (!tipo || !cliente || !clienteCodigo || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: "Dados incompletos" });
  }

  const sol = await Solicitacao.create({
    tipo,
    cliente,
    clienteCodigo: String(clienteCodigo),
    itens,
    motivo,
    observacoes,
    supervisorId: req.user.id,
    supervisorNome: req.user.nome,
    supervisorCodigo: req.user.codigo,
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

  // Supervisor ve so as proprias
  if (req.user.role === "supervisor") {
    filtro.supervisorId = req.user.id;
  }

  const solicitacoes = await Solicitacao.find(filtro).sort({ createdAt: -1 }).limit(500);
  res.json({ solicitacoes });
}

async function obter(req, res) {
  const sol = await Solicitacao.findById(req.params.id);
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });
  if (req.user.role === "supervisor" && String(sol.supervisorId) !== req.user.id) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  res.json({ solicitacao: sol });
}

async function decidir(req, res) {
  const { id } = req.params;
  const { decisao, motivoDecisao } = req.body || {};
  if (!["aprovada", "rejeitada"].includes(decisao)) {
    return res.status(400).json({ error: "Decisao invalida" });
  }
  const sol = await Solicitacao.findById(id);
  if (!sol) return res.status(404).json({ error: "Nao encontrada" });
  if (sol.status !== "pendente") {
    return res.status(409).json({ error: "Solicitacao ja decidida" });
  }

  sol.status = decisao;
  sol.aprovadoPorId = req.user.id;
  sol.aprovadoPorNome = req.user.nome;
  sol.aprovadoEm = new Date();
  sol.motivoDecisao = motivoDecisao || "";
  sol.historico.push({
    acao: decisao,
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
  if (String(sol.supervisorId) !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "Acesso negado" });
  }
  if (sol.status !== "pendente") {
    return res.status(409).json({ error: "Apenas pendentes podem ser canceladas" });
  }
  sol.status = "cancelada";
  sol.historico.push({
    acao: "cancelada",
    porUserId: req.user.id,
    porNome: req.user.nome,
    porRole: req.user.role,
  });
  await sol.save();
  res.json({ solicitacao: sol });
}

module.exports = { criar, listar, obter, decidir, cancelar };
