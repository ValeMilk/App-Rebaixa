const svc = require("../services/integracaoEstoque/analise");

// Envia o erro com detalhes extras (ex.: colunas obrigatorias ausentes) quando houver.
function enviarErro(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error("[integracao-estoque]", err);
  res.status(status).json({ error: err.publicMessage || err.message || "Erro interno", ...(err.extra || {}) });
}

const handler = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    enviarErro(res, err);
  }
};

const corpoArquivo = (req) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    const e = new Error("Envie o arquivo .xlsx no corpo da requisicao.");
    e.status = 400;
    throw e;
  }
  return req.body;
};

const nomeDoArquivo = (req) => String(req.query.nome || "planilha.xlsx").slice(0, 200);

exports.clientes = handler(async (_req, res) => {
  res.json({ clientes: await svc.listarClientes() });
});

exports.ler = handler(async (req, res) => {
  const analise = await svc.analisar({
    buffer: corpoArquivo(req),
    nomeArquivo: nomeDoArquivo(req),
    codigoRede: String(req.query.codigoRede || ""),
  });
  res.json(analise);
});

exports.colunas = handler(async (req, res) => {
  const { codigoRede, decisoes } = req.body || {};
  res.json(await svc.salvarDecisoesColunas({ codigoRede: String(codigoRede || ""), decisoes, user: req.user }));
});

exports.lojasLote = handler(async (req, res) => {
  const { codigoRede, lojas } = req.body || {};
  res.json(await svc.cadastrarLojas({ codigoRede: String(codigoRede || ""), lojas, user: req.user }));
});

exports.vincular = handler(async (req, res) => {
  const { codigoRede, vinculos } = req.body || {};
  res.json(await svc.vincularProdutos({ codigoRede: String(codigoRede || ""), vinculos, user: req.user }));
});

exports.fantasma = handler(async (req, res) => {
  const { codigoRede, itens } = req.body || {};
  res.json(await svc.marcarFantasmas({ codigoRede: String(codigoRede || ""), itens, user: req.user }));
});

exports.buscarProdutos = handler(async (req, res) => {
  res.json({ produtos: await svc.buscarProdutos(req.query.q) });
});

exports.confirmar = handler(async (req, res) => {
  const r = await svc.confirmar({
    buffer: corpoArquivo(req),
    nomeArquivo: nomeDoArquivo(req),
    codigoRede: String(req.query.codigoRede || ""),
    dataRetrato: String(req.query.dataRetrato || ""),
    user: req.user,
  });
  res.status(r.jaExistia ? 200 : 201).json(r);
});

exports.retratos = handler(async (req, res) => {
  res.json({ retratos: await svc.listarRetratos(String(req.query.codigoRede || "")) });
});

exports.arquivo = handler(async (req, res) => {
  const { nome, conteudo } = await svc.obterArquivo(req.params.id);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.send(conteudo);
});
