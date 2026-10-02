/**
 * Integracao Estoque: orquestra leitura + reconhecimento (lojas e produtos) + gravacao do retrato.
 * Tudo que toca banco fica aqui; as regras de leitura/pontuacao vivem nos modulos puros.
 */
const crypto = require("crypto");
const Carteira = require("../../models/Carteira");
const Produto = require("../../models/Produto");
const IntegracaoColuna = require("../../models/IntegracaoColuna");
const IntegracaoCampo = require("../../models/IntegracaoCampo");
const IntegracaoLoja = require("../../models/IntegracaoLoja");
const IntegracaoProduto = require("../../models/IntegracaoProduto");
const EstoqueRetrato = require("../../models/EstoqueRetrato");
const EstoqueRetratoLinha = require("../../models/EstoqueRetratoLinha");
const EstoqueRetratoArquivo = require("../../models/EstoqueRetratoArquivo");

const { normalizarCabecalho, chaveDeCampoPersonalizado } = require("./texto");
const { CAMPOS_SISTEMA, POR_CHAVE, regrasVazias, campoExiste } = require("./colunas");
const { lerPlanilha } = require("./leitura");
const { sugerirNomesDeLojas } = require("./lojas");
const { sugerirProdutos, preSelecoesComTrava, nomeNormalizado } = require("./produtos");

const TIPO_ARQUIVO = "estoque";
const ORIGEM = "planilha_estoque";
const MAX_DESCARTADAS_NA_PREVIA = 500;
const MAX_DESCARTADAS_GRAVADAS = 2000;

function erro(status, mensagem, extra) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  e.extra = extra;
  return e;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// ── Redes (clientes) ────────────────────────────────────────────────────────────

/** Redes que podem receber planilhas: as da carteira (sem inativas). */
async function listarClientes() {
  const docs = await Carteira.aggregate([
    { $match: { codigoRede: { $ne: null }, $or: [{ redeSubrede: { $not: /INATIVO/i } }, { redeSubrede: null }] } },
    { $group: { _id: "$codigoRede", nome: { $first: "$redeSubrede" } } },
    { $project: { _id: 0, codigoRede: "$_id", nome: 1 } },
    { $sort: { nome: 1 } },
  ]);
  return docs.map((d) => ({ codigoRede: String(d.codigoRede), nome: (d.nome || String(d.codigoRede)).trim() }));
}

async function nomeDaRede(codigoRede) {
  const c = await Carteira.findOne({ codigoRede }, "redeSubrede").lean();
  return c ? (c.redeSubrede || String(codigoRede)).trim() : null;
}

async function exigirRede(codigoRede) {
  if (!codigoRede) throw erro(400, "Informe a rede (cliente) dona da planilha.");
  const nome = await nomeDaRede(String(codigoRede));
  if (!nome) throw erro(400, "Rede nao encontrada na carteira.");
  return nome;
}

// ── Regras aprendidas por rede ──────────────────────────────────────────────────

async function carregarRegras(codigoRede) {
  const [colunas, campos] = await Promise.all([
    IntegracaoColuna.find({ codigoRede, tipoArquivo: TIPO_ARQUIVO }).lean(),
    IntegracaoCampo.find({ codigoRede, tipoArquivo: TIPO_ARQUIVO }).lean(),
  ]);
  const regras = regrasVazias();
  for (const c of colunas) regras.colunas.set(c.cabecalhoNormalizado, { campo: c.campo, ignorar: c.ignorar });
  for (const c of campos) regras.campos.set(c.chave, { chave: c.chave, rotulo: c.rotulo, tipoValor: c.tipoValor });
  return regras;
}

/**
 * Salva decisoes da pessoa sobre colunas: associar a um campo, ignorar ou criar campo novo.
 * Salvar de novo o mesmo cabecalho ATUALIZA a associacao.
 */
async function salvarDecisoesColunas({ codigoRede, decisoes, user }) {
  await exigirRede(codigoRede);
  if (!Array.isArray(decisoes) || !decisoes.length) throw erro(400, "Nenhuma decisao enviada.");
  const regras = await carregarRegras(codigoRede);
  const salvas = [];

  for (const d of decisoes) {
    const original = String(d.cabecalhoOriginal ?? "").trim();
    const normalizado = normalizarCabecalho(original);
    if (!normalizado) throw erro(400, "Cabecalho de coluna invalido.");
    let campo = null;
    let ignorar = false;

    if (d.acao === "ignorar") {
      ignorar = true;
    } else if (d.acao === "associar") {
      if (!d.campo || !campoExiste(d.campo, regras)) throw erro(400, `Campo desconhecido: ${d.campo}`);
      campo = d.campo;
    } else if (d.acao === "criar") {
      const rotulo = String(d.rotulo ?? "").trim();
      if (!rotulo) throw erro(400, "Informe o nome do campo novo.");
      const chave = chaveDeCampoPersonalizado(rotulo);
      if (!chave) throw erro(400, "Nome de campo invalido.");
      if (POR_CHAVE.has(chave)) throw erro(400, `"${rotulo}" e um campo do sistema. Associe a coluna a ele ou escolha outro nome.`);
      const tipoValor = ["numero", "texto", "data"].includes(d.tipoValor) ? d.tipoValor : "numero";
      await IntegracaoCampo.updateOne(
        { codigoRede, tipoArquivo: TIPO_ARQUIVO, chave },
        { $setOnInsert: { rotulo, tipoValor, criadoPorNome: user?.nome } },
        { upsert: true }
      );
      regras.campos.set(chave, { chave, rotulo, tipoValor });
      campo = chave;
    } else {
      throw erro(400, "Acao de coluna invalida.");
    }

    await IntegracaoColuna.updateOne(
      { codigoRede, tipoArquivo: TIPO_ARQUIVO, cabecalhoNormalizado: normalizado },
      { $set: { cabecalhoOriginal: original, campo, ignorar, atualizadoPorNome: user?.nome } },
      { upsert: true }
    );
    salvas.push({ cabecalhoOriginal: original, campo, ignorar });
  }
  return { salvas };
}

// ── Leitura + reconhecimento ────────────────────────────────────────────────────

async function carregarCatalogo() {
  const docs = await Produto.find({}, "codigo codigoLivre descricao ativo").sort({ codigo: 1 }).lean();
  return docs.map((p) => ({
    produtoId: p._id,
    codigo: p.codigo,
    codigoLivre: p.codigoLivre || null,
    descricao: p.descricao,
    ativo: p.ativo !== false,
  }));
}

/** Le o arquivo e resolve lojas e produtos contra o cadastro ATUAL da rede. */
async function lerEResolver({ buffer, nomeArquivo, codigoRede, hoje = new Date() }) {
  const regras = await carregarRegras(codigoRede);
  const leitura = await lerPlanilha({ buffer, nomeArquivo, regras, hoje });

  const [lojasCad, identificadores, catalogo] = await Promise.all([
    IntegracaoLoja.find({ codigoRede }).lean(),
    IntegracaoProduto.find({ codigoRede, origem: ORIGEM }).lean(),
    carregarCatalogo(),
  ]);
  const lojasMap = new Map(lojasCad.map((l) => [l.codigo, l]));
  const idMap = new Map(identificadores.map((i) => [i.valor, i]));

  // Agregado por loja
  const lojasAgg = new Map();
  for (const l of leitura.validas) {
    let a = lojasAgg.get(l.lojaCodigo);
    if (!a) {
      a = { codigo: l.lojaCodigo, razaoSocial: l.lojaRazaoSocial, linhas: 0, produtos: new Set(), valorEstoque: 0, venda: 0 };
      lojasAgg.set(l.lojaCodigo, a);
    }
    if (!a.razaoSocial && l.lojaRazaoSocial) a.razaoSocial = l.lojaRazaoSocial;
    a.linhas += 1;
    a.produtos.add(l.produtoCodigo);
    a.valorEstoque += l.valorEstoqueReais;
    a.venda += l.vendaReais;
  }

  // Agregado por produto
  const produtosAgg = new Map();
  for (const l of leitura.validas) {
    let a = produtosAgg.get(l.produtoCodigo);
    if (!a) {
      a = { codigo: l.produtoCodigo, descricao: l.produtoDescricao, linhas: 0, lojas: new Set() };
      produtosAgg.set(l.produtoCodigo, a);
    }
    if (!a.descricao && l.produtoDescricao) a.descricao = l.produtoDescricao;
    a.linhas += 1;
    a.lojas.add(l.lojaCodigo);
  }

  // Ordem de identificacao: (1) codigo ja cadastrado, (4) nome exato e unico. Senao: pendente.
  // (2) codigo de barras e (3) referencia de fornecedor nao vem neste tipo de arquivo.
  const porNome = new Map();
  for (const c of catalogo) {
    const k = nomeNormalizado(c.descricao);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(c);
  }
  const produtoStatus = new Map(); // codigo -> { status, produtoId, produtoCodigo }
  for (const a of produtosAgg.values()) {
    const id = idMap.get(a.codigo);
    if (id && id.fantasma) { produtoStatus.set(a.codigo, { status: "fantasma", produtoId: null }); continue; }
    if (id && id.produtoId) { produtoStatus.set(a.codigo, { status: "vinculado", produtoId: id.produtoId, produtoCodigo: id.produtoCodigo }); continue; }
    const iguais = a.descricao ? porNome.get(nomeNormalizado(a.descricao)) : null;
    if (iguais && iguais.length === 1) {
      produtoStatus.set(a.codigo, { status: "nome_exato", produtoId: iguais[0].produtoId, produtoCodigo: iguais[0].codigo });
    } else {
      produtoStatus.set(a.codigo, { status: "pendente", produtoId: null });
    }
  }

  return { regras, leitura, lojasMap, lojasAgg, produtosAgg, produtoStatus, identificadores, catalogo };
}

function resumoDe(ctx) {
  const { leitura, lojasMap, lojasAgg, produtoStatus } = ctx;
  const contar = (st) => [...produtoStatus.values()].filter((p) => st.includes(p.status)).length;
  return {
    totalLinhasArquivo: leitura.totalLinhasDado,
    linhasValidas: leitura.validas.length,
    linhasDescartadas: leitura.descartadas.length,
    lojasNoArquivo: lojasAgg.size,
    lojasReconhecidas: [...lojasAgg.keys()].filter((c) => lojasMap.has(c)).length,
    produtosNoArquivo: produtoStatus.size,
    produtosReconhecidos: contar(["vinculado", "nome_exato"]),
    produtosFantasma: contar(["fantasma"]),
    produtosPendentes: contar(["pendente"]),
    valorTotalEstoque: leitura.validas.reduce((s, l) => s + l.valorEstoqueReais, 0),
    vendaTotal: leitura.validas.reduce((s, l) => s + l.vendaReais, 0),
  };
}

/** Previa: tudo que a tela precisa para revisar antes de gravar. Nao grava nada. */
async function analisar({ buffer, nomeArquivo, codigoRede, hoje }) {
  await exigirRede(codigoRede);
  const hash = sha256(buffer);
  const ctx = await lerEResolver({ buffer, nomeArquivo, codigoRede, hoje });
  const { leitura, lojasMap, lojasAgg, produtosAgg, produtoStatus, identificadores, catalogo, regras } = ctx;

  const existente = await EstoqueRetrato.findOne({ codigoRede, hashSha256: hash }, "dataRetrato importadoPorNome createdAt").lean();

  // Lojas: tabela por loja + as sem cadastro (com nome sugerido, editavel na tela)
  const todas = [...lojasAgg.values()];
  const sugeridos = sugerirNomesDeLojas(todas.map((l) => l.razaoSocial || l.codigo));
  const lojas = todas
    .map((l, i) => {
      const cad = lojasMap.get(l.codigo);
      return {
        codigo: l.codigo,
        razaoSocial: l.razaoSocial,
        nome: cad ? cad.nome : null,
        reconhecida: !!cad,
        produtos: l.produtos.size,
        linhas: l.linhas,
        valorEstoque: l.valorEstoque,
        venda: l.venda,
        nomeSugerido: sugeridos[i],
      };
    })
    .sort((a, b) => (a.nome || a.razaoSocial || a.codigo).localeCompare(b.nome || b.razaoSocial || b.codigo, "pt-BR"));
  const lojasNaoIdentificadas = lojas
    .filter((l) => !l.reconhecida)
    .map((l) => ({ codigo: l.codigo, razaoSocial: l.razaoSocial, nomeSugerido: l.nomeSugerido, linhas: l.linhas }));

  // Produtos pendentes com sugestoes e pre-selecao (com a trava de lote)
  const vinculadosAntes = new Map();
  const marcar = (produtoId, valor) => {
    const k = String(produtoId);
    if (!vinculadosAntes.has(k)) vinculadosAntes.set(k, new Set());
    vinculadosAntes.get(k).add(valor);
  };
  for (const i of identificadores) if (i.produtoId) marcar(i.produtoId, i.valor);
  for (const [codigo, s] of produtoStatus) if (s.status === "nome_exato") marcar(s.produtoId, codigo);

  const pendentes = [...produtosAgg.values()].filter((p) => produtoStatus.get(p.codigo).status === "pendente");
  const itens = pendentes.map((p) => ({ codigo: p.codigo, sugestoes: sugerirProdutos(p.descricao || p.codigo, catalogo, 3) }));
  const pre = preSelecoesComTrava(itens, vinculadosAntes);
  const produtosPendentes = pendentes.map((p, i) => {
    const sel = pre.get(p.codigo);
    return {
      codigo: p.codigo,
      descricao: p.descricao,
      linhas: p.linhas,
      lojas: p.lojas.size,
      sugestoes: itens[i].sugestoes.map((s) => ({
        produtoId: String(s.produtoId), codigo: s.codigo, codigoLivre: s.codigoLivre,
        descricao: s.descricao, ativo: s.ativo, pontuacao: s.pontuacao, motivos: s.motivos,
      })),
      preSelecionado: sel.sugestao ? String(sel.sugestao.produtoId) : null,
      motivoSemPreSelecao: sel.motivo,
    };
  });

  const camposPersonalizados = [...regras.campos.values()];
  const resumo = resumoDe(ctx);
  const bloqueada = leitura.semCabecalho || leitura.leituraBloqueada;

  return {
    arquivo: { nome: nomeArquivo, tamanhoBytes: buffer.length, hashSha256: hash },
    jaImportado: existente
      ? { id: String(existente._id), dataRetrato: dia(existente.dataRetrato), importadoPorNome: existente.importadoPorNome, importadoEm: existente.createdAt }
      : null,
    cabecalho: { linha: leitura.linhaCabecalho, titulo: leitura.titulo, incerto: leitura.cabecalhoIncerto, semCabecalho: leitura.semCabecalho },
    colunas: leitura.colunas,
    obrigatoriosAusentes: leitura.obrigatoriosAusentes,
    camposSistema: CAMPOS_SISTEMA.map(({ chave, rotulo, obrigatorio, tipo }) => ({ chave, rotulo, obrigatorio, tipo })),
    camposPersonalizados,
    bloqueada,
    dataInferida: leitura.dataInferida,
    resumo,
    lojas,
    lojasNaoIdentificadas,
    produtosPendentes,
    descartadas: leitura.descartadas.slice(0, MAX_DESCARTADAS_NA_PREVIA),
    descartadasTotal: leitura.descartadas.length,
    podeConfirmar: !bloqueada && resumo.linhasValidas > 0,
  };
}

// ── Cadastros ───────────────────────────────────────────────────────────────────

/** Cadastra lojas em lote (nome ja editado pela pessoa). Nunca cria loja sozinho. */
async function cadastrarLojas({ codigoRede, lojas, user }) {
  await exigirRede(codigoRede);
  if (!Array.isArray(lojas) || !lojas.length) throw erro(400, "Nenhuma loja enviada.");
  let criadas = 0;
  let jaExistiam = 0;
  for (const l of lojas) {
    const codigo = String(l.codigo ?? "").trim();
    const nome = String(l.nome ?? "").trim();
    if (!codigo) throw erro(400, "Loja sem codigo.");
    if (!nome) throw erro(400, `Informe o nome da loja ${codigo}.`);
    const r = await IntegracaoLoja.updateOne(
      { codigoRede, codigo },
      { $setOnInsert: { nome, razaoSocial: l.razaoSocial ? String(l.razaoSocial).trim() : null, criadoPorNome: user?.nome } },
      { upsert: true }
    );
    if (r.upsertedCount) criadas++; else jaExistiam++;
  }
  return { criadas, jaExistiam };
}

/** Confirma vinculos codigo do cliente -> produto do catalogo. So as linhas que a pessoa marcou. */
async function vincularProdutos({ codigoRede, vinculos, user }) {
  await exigirRede(codigoRede);
  if (!Array.isArray(vinculos) || !vinculos.length) throw erro(400, "Nenhum vinculo enviado.");
  const ids = [...new Set(vinculos.map((v) => String(v.produtoId)))];
  const produtos = await Produto.find({ _id: { $in: ids } }, "codigo").lean().catch(() => {
    throw erro(400, "Produto invalido.");
  });
  const porId = new Map(produtos.map((p) => [String(p._id), p]));

  for (const v of vinculos) {
    const valor = String(v.codigo ?? "").trim();
    const p = porId.get(String(v.produtoId));
    if (!valor) throw erro(400, "Vinculo sem codigo do cliente.");
    if (!p) throw erro(400, `Produto do catalogo nao encontrado para o codigo ${valor}.`);
    const sugestao = v.metodo === "sugestao_confirmada";
    await IntegracaoProduto.updateOne(
      { codigoRede, origem: ORIGEM, valor },
      {
        $set: {
          descricaoOrigem: v.descricao ? String(v.descricao).trim() : null,
          produtoId: p._id,
          produtoCodigo: p.codigo,
          fantasma: false,
          metodo: sugestao ? "sugestao_confirmada" : "manual",
          pontuacao: sugestao && Number.isFinite(Number(v.pontuacao)) ? Number(v.pontuacao) : null,
          confirmadoPorNome: user?.nome,
          confirmadoEm: new Date(),
        },
      },
      { upsert: true }
    );
  }
  return { vinculados: vinculos.length };
}

/** Marca codigos do cliente como FANTASMA: fora da analise para sempre e nunca mais pendencia. */
async function marcarFantasmas({ codigoRede, itens, user }) {
  await exigirRede(codigoRede);
  if (!Array.isArray(itens) || !itens.length) throw erro(400, "Nenhum item enviado.");
  for (const it of itens) {
    const valor = String(it.codigo ?? "").trim();
    if (!valor) throw erro(400, "Item sem codigo.");
    await IntegracaoProduto.updateOne(
      { codigoRede, origem: ORIGEM, valor },
      {
        $set: {
          descricaoOrigem: it.descricao ? String(it.descricao).trim() : null,
          produtoId: null, produtoCodigo: null, fantasma: true, metodo: "manual", pontuacao: null,
          confirmadoPorNome: user?.nome, confirmadoEm: new Date(),
        },
      },
      { upsert: true }
    );
  }
  return { marcados: itens.length };
}

/** Busca manual no catalogo por nome ou codigo. */
async function buscarProdutos(q) {
  const termo = String(q ?? "").trim();
  if (termo.length < 2) return [];
  const re = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const docs = await Produto.find({ $or: [{ descricao: re }, { codigo: re }, { codigoLivre: re }] }, "codigo codigoLivre descricao ativo")
    .sort({ descricao: 1 }).limit(15).lean();
  return docs.map((p) => ({ produtoId: String(p._id), codigo: p.codigo, codigoLivre: p.codigoLivre || null, descricao: p.descricao, ativo: p.ativo !== false }));
}

// ── Retrato ─────────────────────────────────────────────────────────────────────

function dataRetratoValida(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const ok = d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  return ok ? d : null;
}

function retratoPublico(r) {
  return {
    id: String(r._id),
    codigoRede: r.codigoRede,
    redeNome: r.redeNome,
    dataRetrato: dia(r.dataRetrato),
    nomeArquivo: r.nomeArquivo,
    tamanhoBytes: r.tamanhoBytes,
    totalLinhasArquivo: r.totalLinhasArquivo,
    linhasValidas: r.linhasValidas,
    linhasDescartadas: r.linhasDescartadas,
    lojasNoArquivo: r.lojasNoArquivo,
    lojasReconhecidas: r.lojasReconhecidas,
    produtosNoArquivo: r.produtosNoArquivo,
    produtosReconhecidos: r.produtosReconhecidos,
    produtosFantasma: r.produtosFantasma,
    valorTotalEstoque: r.valorTotalEstoque,
    vendaTotal: r.vendaTotal,
    importadoPorNome: r.importadoPorNome,
    importadoEm: r.createdAt,
  };
}

/**
 * Grava o retrato (append-only). O bruto nunca espera o cadastro ficar perfeito: pendencias
 * ficam visiveis e resolviveis depois. Mesmo arquivo (hash) devolve o retrato existente.
 */
async function confirmar({ buffer, nomeArquivo, codigoRede, dataRetrato, user, hoje }) {
  const redeNome = await exigirRede(codigoRede);
  const data = dataRetratoValida(dataRetrato);
  if (!data) throw erro(400, "Confirme a data do retrato (AAAA-MM-DD).");

  const hash = sha256(buffer);
  const jaTem = await EstoqueRetrato.findOne({ codigoRede, hashSha256: hash }).lean();
  if (jaTem) return { jaExistia: true, retrato: retratoPublico(jaTem) };

  const ctx = await lerEResolver({ buffer, nomeArquivo, codigoRede, hoje });
  const { leitura, lojasMap, lojasAgg, produtosAgg, produtoStatus } = ctx;
  if (leitura.semCabecalho) throw erro(422, "Nao foi possivel identificar a linha de cabecalho do arquivo.");
  if (leitura.leituraBloqueada) {
    throw erro(422, `Faltam colunas obrigatorias: ${leitura.obrigatoriosAusentes.map((o) => o.rotulo).join(", ")}.`, { obrigatoriosAusentes: leitura.obrigatoriosAusentes });
  }
  if (!leitura.validas.length) throw erro(422, "O arquivo nao tem nenhuma linha valida.");

  // Identificacao por nome exato (e unico) fica registrada; nunca sobrescreve um vinculo existente.
  const porNome = [...produtoStatus.entries()].filter(([, s]) => s.status === "nome_exato");
  if (porNome.length) {
    await IntegracaoProduto.bulkWrite(porNome.map(([codigo, s]) => ({
      updateOne: {
        filter: { codigoRede, origem: ORIGEM, valor: codigo },
        update: { $setOnInsert: {
          descricaoOrigem: produtosAgg.get(codigo).descricao, produtoId: s.produtoId, produtoCodigo: s.produtoCodigo,
          fantasma: false, metodo: "nome_exato", pontuacao: null, confirmadoPorNome: user?.nome, confirmadoEm: new Date(),
        } },
        upsert: true,
      },
    })));
  }

  const resumo = resumoDe(ctx);
  let retrato;
  try {
    retrato = await EstoqueRetrato.create({
      codigoRede, redeNome, dataRetrato: data, nomeArquivo, hashSha256: hash, tamanhoBytes: buffer.length,
      tituloArquivo: leitura.titulo,
      totalLinhasArquivo: resumo.totalLinhasArquivo, linhasValidas: resumo.linhasValidas, linhasDescartadas: resumo.linhasDescartadas,
      lojasNoArquivo: resumo.lojasNoArquivo, lojasReconhecidas: resumo.lojasReconhecidas,
      produtosNoArquivo: resumo.produtosNoArquivo, produtosReconhecidos: resumo.produtosReconhecidos, produtosFantasma: resumo.produtosFantasma,
      valorTotalEstoque: resumo.valorTotalEstoque, vendaTotal: resumo.vendaTotal,
      mapeamentoColunas: leitura.colunas,
      descartadas: leitura.descartadas.slice(0, MAX_DESCARTADAS_GRAVADAS),
      importadoPorId: user?.id, importadoPorNome: user?.nome,
    });
  } catch (err) {
    if (err && err.code === 11000) { // corrida: outro envio do mesmo arquivo entrou primeiro
      const ja = await EstoqueRetrato.findOne({ codigoRede, hashSha256: hash }).lean();
      if (ja) return { jaExistia: true, retrato: retratoPublico(ja) };
    }
    throw err;
  }

  try {
    await EstoqueRetratoArquivo.create({ retratoId: retrato._id, nomeArquivo, conteudo: buffer });
    const docs = leitura.validas.map((l) => {
      const s = produtoStatus.get(l.produtoCodigo);
      const { linha, ...resto } = l;
      return {
        ...resto,
        retratoId: retrato._id,
        linha,
        lojaId: lojasMap.get(l.lojaCodigo)?._id ?? null,
        produtoId: s.status === "vinculado" || s.status === "nome_exato" ? s.produtoId : null,
        fantasma: s.status === "fantasma",
      };
    });
    await EstoqueRetratoLinha.insertMany(docs, { ordered: true });
  } catch (err) {
    // Sem transacao: desfaz o que entrou para nunca deixar um retrato pela metade.
    await Promise.allSettled([
      EstoqueRetratoLinha.deleteMany({ retratoId: retrato._id }),
      EstoqueRetratoArquivo.deleteMany({ retratoId: retrato._id }),
      EstoqueRetrato.deleteOne({ _id: retrato._id }),
    ]);
    throw err;
  }

  return { jaExistia: false, retrato: retratoPublico(retrato.toObject()) };
}

async function listarRetratos(codigoRede) {
  if (!codigoRede) throw erro(400, "Informe a rede.");
  const docs = await EstoqueRetrato.find({ codigoRede }, "-mapeamentoColunas -descartadas")
    .sort({ dataRetrato: -1, createdAt: -1 }).limit(200).lean();
  return docs.map(retratoPublico);
}

async function obterArquivo(retratoId) {
  // Sem lean(): o Mongoose devolve um Buffer de verdade (com lean viria um Binary do BSON)
  const arq = await EstoqueRetratoArquivo.findOne({ retratoId }).catch(() => null);
  if (!arq) throw erro(404, "Arquivo original nao encontrado.");
  return { nome: arq.nomeArquivo, conteudo: Buffer.from(arq.conteudo) };
}

module.exports = {
  listarClientes,
  salvarDecisoesColunas,
  analisar,
  cadastrarLojas,
  vincularProdutos,
  marcarFantasmas,
  buscarProdutos,
  confirmar,
  listarRetratos,
  obterArquivo,
};
