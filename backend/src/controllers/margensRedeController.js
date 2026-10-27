const svc = require("../services/margensRedeService");

// Erros com status + publicMessage vao para o errorHandler; quando o erro traz detalhes extras
// (ex.: versao ja importada, colunas obrigatorias ausentes), a resposta inclui esses campos.
const handler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err && err.status && err.extra) {
      return res.status(err.status).json({ error: err.publicMessage || err.message, ...err.extra });
    }
    next(err);
  }
};

const corpoArquivo = (req) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    const e = new Error("Envie o arquivo .xlsx no corpo da requisicao.");
    e.status = 400;
    e.publicMessage = e.message;
    throw e;
  }
  return req.body;
};

const nomeDoArquivo = (req) => String(req.query.nomeArquivo || req.query.nome || "planilha.xlsx").slice(0, 200);

async function exigirAnexar(req) {
  if (!(await svc.podeAnexar(req.user, req.params.codigoRede))) {
    const e = new Error("So o supervisor responsavel pela rede ou o administrador pode anexar o custo medio desta rede.");
    e.status = 403;
    e.publicMessage = e.message;
    throw e;
  }
}

exports.listar = handler(async (req, res) => {
  res.json({ redes: await svc.listarRedes(req.user) });
});

exports.obter = handler(async (req, res) => {
  res.json(await svc.obterConfig(req.params.codigoRede, req.user));
});

exports.salvar = handler(async (req, res) => {
  res.json({ config: await svc.salvarConfig(req.params.codigoRede, req.body || {}, req.user) });
});

exports.versoes = handler(async (req, res) => {
  await svc.exigirAcessoRede(req.user, req.params.codigoRede);
  const versoes = await svc.listarVersoes(req.params.codigoRede);
  res.json({ versoes, versaoAtiva: versoes.find((v) => v.ativa) || null });
});

exports.arquivo = handler(async (req, res) => {
  await svc.exigirAcessoRede(req.user, req.params.codigoRede);
  const { nome, conteudo } = await svc.obterArquivoVersao(req.params.codigoRede, req.params.versao);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.send(conteudo);
});

exports.ler = handler(async (req, res) => {
  await exigirAnexar(req);
  res.json(await svc.analisarCustoMedio({ codigoRede: req.params.codigoRede, buffer: corpoArquivo(req), nomeArquivo: nomeDoArquivo(req) }));
});

exports.confirmar = handler(async (req, res) => {
  await exigirAnexar(req);
  const r = await svc.importarCustoMedio({ codigoRede: req.params.codigoRede, buffer: corpoArquivo(req), nomeArquivo: nomeDoArquivo(req), user: req.user });
  res.status(201).json(r);
});
