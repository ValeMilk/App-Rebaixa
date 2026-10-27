/**
 * Margens por rede e custo medio (v2.0, fase 3).
 *
 * Interface usada pela precificacao (fixa):
 *  - obterMargemECusto({ codigoRede, clienteCodigo, produtoCodigo, categoria }) ->
 *      { margem: number|null (0-100), origemMargem: "loja"|"categoria"|"rede"|null,
 *        custoMedio: number|null, custoMedioVersao: number|null, piso: "minimo"|"p3" }
 *    Regra: margem da loja > margem da categoria > margem operacional da rede.
 *    Custo medio: linha da versao ATIVA de CustoMedioRede para loja + produto (null se nao houver).
 *    `produtoCodigo` pode ser o codigoLivre (E02_LIVRE) ou o codigo ERP do Produto.
 *
 * Cache em memoria por rede (60 s): uma leitura de ConfigRede + da versao ativa do custo medio
 * por rede; limparCache(codigoRede?) ao salvar a config ou importar uma versao nova.
 *
 * Leitura da planilha de custo medio: segue a Integracao Estoque (colunas pelo NOME em qualquer
 * ordem, cabecalho nas primeiras 15 linhas, nada arredondado, linha sem loja/produto reconhecido
 * vai para "descartadas" com o motivo e nunca some).
 */
const crypto = require("crypto");
const ConfigRede = require("../models/ConfigRede");
const CustoMedioRede = require("../models/CustoMedioRede");
const Carteira = require("../models/Carteira");
const Produto = require("../models/Produto");
const ResponsavelRede = require("../models/ResponsavelRede");
const IntegracaoLoja = require("../models/IntegracaoLoja");
const IntegracaoProduto = require("../models/IntegracaoProduto");
const { usuarioPode } = require("./permissoesService");
const { lerMatriz } = require("./integracaoEstoque/leitura");
const { normalizarCabecalho, celulaTexto, separarCodigoDescricao, paraNumero } = require("./integracaoEstoque/texto");
const { nomeNormalizado } = require("./integracaoEstoque/produtos");

const CACHE_TTL_MS = 60 * 1000;
const MAX_LINHAS_PROCURA_CABECALHO = 15;
const MAX_DESCARTADAS_NA_PREVIA = 500;
const MAX_DESCARTADAS_GRAVADAS = 2000;
const PISOS = ["minimo", "p3"];

function erro(status, mensagem, extra) {
  const e = new Error(mensagem);
  e.status = status;
  e.publicMessage = mensagem;
  if (extra) e.extra = extra;
  return e;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const fmtDataHora = (d) => {
  if (!d) return "";
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
};

// ── Acesso ──────────────────────────────────────────────────────────────────────

function ehAdmin(user) {
  return user?.role === "admin" || (Array.isArray(user?.roles) && user.roles.includes("admin"));
}

/** Admin ou supervisor responsavel pela rede (ResponsavelRede.supervisorCodigo === user.codigo). */
async function podeAnexar(user, codigoRede) {
  if (!user) return false;
  if (ehAdmin(user)) return true;
  if (!user.codigo) return false;
  const r = await ResponsavelRede.findOne({ codigoRede: String(codigoRede) }, "supervisorCodigo").lean();
  return !!r && String(r.supervisorCodigo) === String(user.codigo);
}

async function podeGerenciar(user) {
  if (ehAdmin(user)) return true;
  return usuarioPode(user, "margens_rede.gerenciar");
}

/** Redes que o usuario alcanca: todas (gerenciar) ou so as em que e responsavel. Retorna null = todas. */
async function redesDoUsuario(user) {
  if (await podeGerenciar(user)) return null;
  const docs = await ResponsavelRede.find({ supervisorCodigo: String(user?.codigo ?? "") }, "codigoRede").lean();
  return new Set(docs.map((d) => String(d.codigoRede)));
}

async function exigirAcessoRede(user, codigoRede) {
  const alcance = await redesDoUsuario(user);
  if (alcance && !alcance.has(String(codigoRede))) throw erro(403, "Voce nao e o responsavel por esta rede.");
}

// ── Redes e lojas (Carteira) ────────────────────────────────────────────────────

async function listarRedesDaCarteira() {
  const docs = await Carteira.aggregate([
    { $match: { codigoRede: { $ne: null }, $or: [{ redeSubrede: { $not: /INATIVO/i } }, { redeSubrede: null }] } },
    { $group: { _id: "$codigoRede", nome: { $first: "$redeSubrede" }, lojas: { $addToSet: "$clienteCodigo" } } },
    { $project: { _id: 0, codigoRede: "$_id", nome: 1, lojas: { $size: "$lojas" } } },
    { $sort: { nome: 1 } },
  ]);
  return docs.map((d) => ({ codigoRede: String(d.codigoRede), nome: (d.nome || String(d.codigoRede)).trim(), lojas: d.lojas }));
}

async function lojasDaRede(codigoRede) {
  const docs = await Carteira.find({ codigoRede: String(codigoRede) }, "clienteCodigo clienteNome subrede").lean();
  const vistos = new Map();
  for (const d of docs) {
    if (!vistos.has(d.clienteCodigo)) vistos.set(d.clienteCodigo, { clienteCodigo: d.clienteCodigo, clienteNome: d.clienteNome || null, subrede: d.subrede || null });
  }
  return [...vistos.values()].sort((a, b) => (a.clienteNome || a.clienteCodigo).localeCompare(b.clienteNome || b.clienteCodigo, "pt-BR"));
}

async function exigirRede(codigoRede) {
  if (!codigoRede) throw erro(400, "Informe a rede.");
  const c = await Carteira.findOne({ codigoRede: String(codigoRede) }, "redeSubrede").lean();
  if (!c) throw erro(404, "Rede nao encontrada na carteira.");
  return (c.redeSubrede || String(codigoRede)).trim();
}

async function categoriasDoCatalogo() {
  const cats = await Produto.distinct("categoria", { categoria: { $nin: [null, ""] } });
  return cats.map((c) => String(c).trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ── Versoes do custo medio ──────────────────────────────────────────────────────

const CAMPOS_VERSAO = "codigoRede versao ativa nomeArquivo hashArquivo importadoEm importadoPorNome resumo createdAt";

function versaoPublica(v) {
  return {
    versao: v.versao,
    ativa: !!v.ativa,
    nomeArquivo: v.nomeArquivo,
    hashArquivo: v.hashArquivo || null,
    importadoEm: v.importadoEm || v.createdAt,
    importadoPorNome: v.importadoPorNome || null,
    resumo: v.resumo || {},
    linhas: v.resumo?.validas ?? 0,
  };
}

/** Versoes importadas da rede, sem o Buffer nem as linhas (mais recente primeiro). */
async function listarVersoes(codigoRede) {
  const docs = await CustoMedioRede.find({ codigoRede: String(codigoRede) }, CAMPOS_VERSAO).sort({ versao: -1 }).lean();
  return docs.map(versaoPublica);
}

async function obterArquivoVersao(codigoRede, versao) {
  const n = Number(versao);
  if (!Number.isInteger(n) || n < 1) throw erro(400, "Versao invalida.");
  // Sem lean(): o Mongoose devolve um Buffer de verdade (com lean viria um Binary do BSON)
  const doc = await CustoMedioRede.findOne({ codigoRede: String(codigoRede), versao: n }, "nomeArquivo arquivo");
  if (!doc) throw erro(404, "Versao nao encontrada.");
  return { nome: doc.nomeArquivo, conteudo: Buffer.from(doc.arquivo) };
}

// ── Listagem e config ───────────────────────────────────────────────────────────

/** Redes da carteira com config, margem operacional e versao ativa do custo medio. */
async function listarRedes(user) {
  const alcance = await redesDoUsuario(user);
  const gerencia = alcance === null;
  const redes = (await listarRedesDaCarteira()).filter((r) => !alcance || alcance.has(r.codigoRede));
  const codigos = redes.map((r) => r.codigoRede);
  const [configs, ativas, responsaveis] = await Promise.all([
    ConfigRede.find({ codigoRede: { $in: codigos } }, "codigoRede margemOperacional piso margensPorLoja margensPorCategoria updatedAt atualizadoPorNome").lean(),
    CustoMedioRede.find({ codigoRede: { $in: codigos }, ativa: true }, CAMPOS_VERSAO).lean(),
    ResponsavelRede.find({ codigoRede: { $in: codigos } }, "codigoRede supervisorCodigo supervisorNome").lean(),
  ]);
  const cfg = new Map(configs.map((c) => [String(c.codigoRede), c]));
  const cm = new Map(ativas.map((v) => [String(v.codigoRede), v]));
  const resp = new Map(responsaveis.map((r) => [String(r.codigoRede), r]));
  const admin = ehAdmin(user);

  return redes.map((r) => {
    const c = cfg.get(r.codigoRede);
    const v = cm.get(r.codigoRede);
    const rp = resp.get(r.codigoRede);
    return {
      codigoRede: r.codigoRede,
      nome: r.nome,
      lojas: r.lojas,
      temConfig: !!c,
      margemOperacional: c?.margemOperacional ?? null,
      piso: c?.piso || "minimo",
      margensPorLoja: c?.margensPorLoja?.length || 0,
      margensPorCategoria: c?.margensPorCategoria?.length || 0,
      atualizadoEm: c?.updatedAt || null,
      custoMedio: v ? versaoPublica(v) : null,
      responsavel: rp ? { supervisorCodigo: rp.supervisorCodigo, supervisorNome: rp.supervisorNome } : null,
      podeGerenciar: gerencia,
      podeAnexar: admin || (!!rp && !!user?.codigo && String(rp.supervisorCodigo) === String(user.codigo)),
    };
  });
}

function configPublica(c, codigoRede, nome) {
  return {
    codigoRede: String(codigoRede),
    redeSubrede: c?.redeSubrede || nome || null,
    margemOperacional: c?.margemOperacional ?? null,
    margensPorLoja: (c?.margensPorLoja || []).map((m) => ({ clienteCodigo: m.clienteCodigo, clienteNome: m.clienteNome || null, margem: m.margem })),
    margensPorCategoria: (c?.margensPorCategoria || []).map((m) => ({ categoria: m.categoria, margem: m.margem })),
    piso: c?.piso || "minimo",
    diaLimite: { diaSemana: c?.diaLimite?.diaSemana ?? null, hora: c?.diaLimite?.hora ?? null },
    modeloEmail: { assunto: c?.modeloEmail?.assunto ?? null, texto: c?.modeloEmail?.texto ?? null },
    modeloExcel: c?.modeloExcel ?? null,
    atualizadoPorNome: c?.atualizadoPorNome || null,
    atualizadoEm: c?.updatedAt || null,
    existe: !!c,
  };
}

/** Config + lojas da rede + categorias do catalogo + versoes do custo medio (sem Buffer). */
async function obterConfig(codigoRede, user) {
  await exigirAcessoRede(user, codigoRede);
  const nome = await exigirRede(codigoRede);
  const [config, lojas, categorias, versoes, responsavel, anexa, gerencia] = await Promise.all([
    ConfigRede.findOne({ codigoRede: String(codigoRede) }).lean(),
    lojasDaRede(codigoRede),
    categoriasDoCatalogo(),
    listarVersoes(codigoRede),
    ResponsavelRede.findOne({ codigoRede: String(codigoRede) }, "supervisorCodigo supervisorNome").lean(),
    podeAnexar(user, codigoRede),
    podeGerenciar(user),
  ]);
  return {
    rede: { codigoRede: String(codigoRede), nome },
    config: configPublica(config, codigoRede, nome),
    lojas,
    categorias,
    versoes,
    versaoAtiva: versoes.find((v) => v.ativa) || null,
    responsavel: responsavel ? { supervisorCodigo: responsavel.supervisorCodigo, supervisorNome: responsavel.supervisorNome } : null,
    podeAnexar: anexa,
    podeGerenciar: gerencia,
  };
}

function margemValida(v, rotulo) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw erro(400, `${rotulo}: informe um percentual entre 0 e 100.`);
  return n;
}

const texto = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/** Valida e grava a config da rede (substitui os campos enviados; os ausentes ficam como estao). */
async function salvarConfig(codigoRede, dados, user) {
  const nome = await exigirRede(codigoRede);
  const d = dados || {};
  const set = { redeSubrede: nome, atualizadoPorId: user?.id || null, atualizadoPorNome: user?.nome || null };

  if ("margemOperacional" in d) set.margemOperacional = margemValida(d.margemOperacional, "Margem operacional");

  if ("piso" in d) {
    if (!PISOS.includes(d.piso)) throw erro(400, "Piso da escalada invalido: use \"minimo\" ou \"p3\".");
    set.piso = d.piso;
  }

  if ("margensPorLoja" in d) {
    if (!Array.isArray(d.margensPorLoja)) throw erro(400, "Margens por loja: envie uma lista.");
    const lojas = await lojasDaRede(codigoRede);
    const porCodigo = new Map(lojas.map((l) => [String(l.clienteCodigo), l]));
    const vistos = new Set();
    set.margensPorLoja = d.margensPorLoja.map((m) => {
      const codigo = String(m?.clienteCodigo ?? "").trim();
      const loja = porCodigo.get(codigo);
      if (!loja) throw erro(400, `Loja ${codigo || "(vazia)"} nao pertence a esta rede.`);
      if (vistos.has(codigo)) throw erro(400, `Loja ${codigo} repetida nas margens por loja.`);
      vistos.add(codigo);
      const margem = margemValida(m.margem, `Margem da loja ${codigo}`);
      if (margem === null) throw erro(400, `Informe a margem da loja ${codigo}.`);
      return { clienteCodigo: codigo, clienteNome: loja.clienteNome || null, margem };
    });
  }

  if ("margensPorCategoria" in d) {
    if (!Array.isArray(d.margensPorCategoria)) throw erro(400, "Margens por categoria: envie uma lista.");
    const categorias = new Set(await categoriasDoCatalogo());
    const vistos = new Set();
    set.margensPorCategoria = d.margensPorCategoria.map((m) => {
      const categoria = String(m?.categoria ?? "").trim();
      if (!categorias.has(categoria)) throw erro(400, `Categoria "${categoria || "(vazia)"}" nao existe no catalogo de produtos.`);
      if (vistos.has(categoria)) throw erro(400, `Categoria "${categoria}" repetida nas margens por categoria.`);
      vistos.add(categoria);
      const margem = margemValida(m.margem, `Margem da categoria ${categoria}`);
      if (margem === null) throw erro(400, `Informe a margem da categoria ${categoria}.`);
      return { categoria, margem };
    });
  }

  if ("diaLimite" in d) {
    const dl = d.diaLimite || {};
    let diaSemana = dl.diaSemana;
    if (diaSemana === "" || diaSemana === undefined) diaSemana = null;
    if (diaSemana !== null) {
      diaSemana = Number(diaSemana);
      if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) throw erro(400, "Dia limite: dia da semana invalido (0 = domingo ... 6 = sabado).");
    }
    let hora = texto(dl.hora, 5);
    if (hora !== null) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
      if (!m || +m[1] > 23 || +m[2] > 59) throw erro(400, "Dia limite: hora invalida (use HH:MM).");
      hora = `${String(+m[1]).padStart(2, "0")}:${m[2]}`;
    }
    set.diaLimite = { diaSemana, hora };
  }

  if ("modeloEmail" in d) {
    const me = d.modeloEmail || {};
    set.modeloEmail = { assunto: texto(me.assunto, 200), texto: texto(me.texto, 5000) };
  }
  if ("modeloExcel" in d) set.modeloExcel = texto(d.modeloExcel, 200);

  const doc = await ConfigRede.findOneAndUpdate(
    { codigoRede: String(codigoRede) },
    { $set: set, $setOnInsert: { codigoRede: String(codigoRede) } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  limparCache(codigoRede);
  return configPublica(doc, codigoRede, nome);
}

// ── Cache + consulta da precificacao ────────────────────────────────────────────

const cache = new Map(); // codigoRede -> { em, promessa }

function limparCache(codigoRede) {
  if (codigoRede === undefined || codigoRede === null) cache.clear();
  else cache.delete(String(codigoRede));
}

const chaveCategoria = (c) => String(c ?? "").trim().toUpperCase();

async function montarDadosDaRede(codigoRede) {
  const [config, ativa] = await Promise.all([
    ConfigRede.findOne({ codigoRede }, "margemOperacional margensPorLoja margensPorCategoria piso").lean(),
    CustoMedioRede.findOne({ codigoRede, ativa: true }, "versao linhas").sort({ versao: -1 }).lean(),
  ]);
  const porLoja = new Map();
  for (const m of config?.margensPorLoja || []) if (m.margem !== null && m.margem !== undefined) porLoja.set(String(m.clienteCodigo), m.margem);
  const porCategoria = new Map();
  for (const m of config?.margensPorCategoria || []) if (m.margem !== null && m.margem !== undefined) porCategoria.set(chaveCategoria(m.categoria), m.margem);
  const custo = new Map();
  for (const l of ativa?.linhas || []) {
    custo.set(`${l.clienteCodigo}|${l.produtoCodigo}`, l.custoMedio);
    if (l.produtoCodigoErp) custo.set(`${l.clienteCodigo}|${l.produtoCodigoErp}`, l.custoMedio);
  }
  return {
    margemOperacional: config?.margemOperacional ?? null,
    piso: PISOS.includes(config?.piso) ? config.piso : "minimo",
    porLoja,
    porCategoria,
    custo,
    versao: ativa ? ativa.versao : null,
  };
}

async function dadosDaRede(codigoRede) {
  const k = String(codigoRede);
  const agora = Date.now();
  const hit = cache.get(k);
  if (hit && agora - hit.em < CACHE_TTL_MS) return hit.promessa;
  const promessa = montarDadosDaRede(k).catch((err) => { cache.delete(k); throw err; });
  cache.set(k, { em: agora, promessa });
  return promessa;
}

/** Interface da precificacao. Uma chamada por item do modal: le do cache por rede (60 s). */
async function obterMargemECusto({ codigoRede, clienteCodigo, produtoCodigo, categoria } = {}) {
  const vazio = { margem: null, origemMargem: null, custoMedio: null, custoMedioVersao: null, piso: "minimo" };
  if (!codigoRede) return vazio;
  const d = await dadosDaRede(codigoRede);

  let margem = null;
  let origemMargem = null;
  const loja = clienteCodigo !== null && clienteCodigo !== undefined ? d.porLoja.get(String(clienteCodigo).trim()) : undefined;
  const cat = categoria ? d.porCategoria.get(chaveCategoria(categoria)) : undefined;
  if (loja !== undefined) { margem = loja; origemMargem = "loja"; }
  else if (cat !== undefined) { margem = cat; origemMargem = "categoria"; }
  else if (d.margemOperacional !== null && d.margemOperacional !== undefined) { margem = d.margemOperacional; origemMargem = "rede"; }

  let custoMedio = null;
  if (clienteCodigo !== null && clienteCodigo !== undefined && produtoCodigo !== null && produtoCodigo !== undefined) {
    const c = d.custo.get(`${String(clienteCodigo).trim()}|${String(produtoCodigo).trim()}`);
    if (c !== undefined) custoMedio = c;
  }
  return { margem, origemMargem, custoMedio, custoMedioVersao: custoMedio === null ? null : d.versao, piso: d.piso };
}

// ── Leitura da planilha de custo medio (puro) ───────────────────────────────────

/**
 * Campos reconhecidos pelo NOME do cabecalho (normalizado: minusculas, sem acento, sem pontuacao).
 *  - loja: codigo da loja (Lacteus direto ou codigo da rede cadastrado na Integracao Estoque)
 *  - produto: codigo do produto (codigoLivre, codigo ERP ou codigo da rede ja vinculado)
 *  - descricao: descricao do produto (reconhece por nome igual ao catalogo quando o codigo falha)
 *  - custo: custo medio
 *  - loja_nome: so informativo
 */
const CAMPOS = [
  { chave: "loja", rotulo: "Loja (código)", obrigatorio: true },
  { chave: "produto", rotulo: "Produto (código)", obrigatorio: false },
  { chave: "descricao", rotulo: "Descrição do produto", obrigatorio: false },
  { chave: "custo", rotulo: "Custo médio", obrigatorio: true },
  { chave: "loja_nome", rotulo: "Nome da loja", obrigatorio: false },
];
const POR_CHAVE = new Map(CAMPOS.map((c) => [c.chave, c]));

const SINONIMOS = new Map(Object.entries({
  loja: "loja", "cod loja": "loja", "codigo loja": "loja", "cod da loja": "loja", "codigo da loja": "loja", "loja codigo": "loja", "loja cod": "loja",
  filial: "loja", "cod filial": "loja", "codigo filial": "loja", "cod da filial": "loja", "codigo da filial": "loja",
  cliente: "loja", "cod cliente": "loja", "codigo cliente": "loja", "codigo do cliente": "loja", "cod do cliente": "loja",
  subrede: "loja", unidade: "loja", "cod unidade": "loja", "codigo unidade": "loja", "codigo lacteus": "loja", "cod lacteus": "loja",
  "nome loja": "loja_nome", "nome da loja": "loja_nome", "loja nome": "loja_nome", "descricao loja": "loja_nome", "descricao da loja": "loja_nome",
  "razao social": "loja_nome", "nome filial": "loja_nome", "nome da filial": "loja_nome", "nome fantasia": "loja_nome",
  produto: "produto", "cod produto": "produto", "codigo produto": "produto", "cod do produto": "produto", "codigo do produto": "produto",
  "produto codigo": "produto", "produto cod": "produto", codigo: "produto", cod: "produto", sku: "produto", item: "produto", "cod item": "produto",
  "codigo item": "produto", "cod do item": "produto", "codigo do item": "produto", "cod interno": "produto", "codigo interno": "produto",
  material: "produto", "cod material": "produto", "codigo material": "produto", ean: "produto", "codigo de barras": "produto", "cod barras": "produto",
  descricao: "descricao", desc: "descricao", "descricao produto": "descricao", "descricao do produto": "descricao", "produto descricao": "descricao",
  "nome produto": "descricao", "nome do produto": "descricao", "descricao item": "descricao", "descricao do item": "descricao", "nome item": "descricao",
  "descricao material": "descricao", "desc produto": "descricao", "desc item": "descricao",
  "custo medio": "custo", "custo medio unitario": "custo", "custo medio unit": "custo", "custo medio unit r$": "custo", "custo medio r$": "custo",
  "custo medio unitario r$": "custo", custo: "custo", "custo unitario": "custo", "custo unit": "custo", "custo r$": "custo", "custo unitario r$": "custo",
  "custo med": "custo", "custo med unit": "custo", cmv: "custo", "cm unit": "custo", "custo liquido": "custo", "custo liq": "custo", "preco de custo": "custo",
  "vlr custo": "custo", "valor custo": "custo", "vlr custo medio": "custo", "valor custo medio": "custo", "custo medio liquido": "custo",
}));

/** Resolve um cabecalho (texto cru) para um campo, ou null. */
function campoDoCabecalho(celula) {
  const norm = normalizarCabecalho(celula);
  if (!norm) return null;
  if (SINONIMOS.has(norm)) return SINONIMOS.get(norm);
  if (/^custo\b/.test(norm)) return "custo";
  if (/^(cod|codigo|cd)\s+(da\s+|do\s+|de\s+)?(loja|filial|cliente|subrede|unidade)\b/.test(norm)) return "loja";
  if (/^(cod|codigo|cd)\s+(do\s+|de\s+)?(produto|item|sku|material)\b/.test(norm)) return "produto";
  if (/^(descricao|desc|nome)\b/.test(norm) && !/loja|filial|cliente|unidade/.test(norm)) return "descricao";
  return null;
}

/** Linha do cabecalho nas primeiras N: vence a que reconhece MAIS campos distintos (>= 2); empate fica com a primeira. */
function acharCabecalhoCustoMedio(matriz, { maxLinhas = MAX_LINHAS_PROCURA_CABECALHO } = {}) {
  let melhor = null;
  const limite = Math.min(maxLinhas, matriz.length);
  for (let i = 0; i < limite; i++) {
    const vistos = new Set();
    for (const cel of matriz[i] || []) {
      const campo = campoDoCabecalho(cel);
      if (campo) vistos.add(campo);
    }
    const n = vistos.size;
    if (n >= 2 && vistos.has("custo") && (!melhor || n > melhor.reconhecidas)) melhor = { indice: i, reconhecidas: n };
  }
  return melhor;
}

/** Sem cabecalho reconhecido: a linha com mais celulas preenchidas (nas primeiras N) vira candidata, para a tela mostrar o que foi lido. */
function cabecalhoCandidato(matriz, { maxLinhas = MAX_LINHAS_PROCURA_CABECALHO } = {}) {
  let melhor = null;
  const limite = Math.min(maxLinhas, matriz.length);
  for (let i = 0; i < limite; i++) {
    const n = (matriz[i] || []).filter((c) => celulaTexto(c) !== null).length;
    if (n >= 2 && (!melhor || n > melhor.n)) melhor = { indice: i, n };
  }
  return melhor ? melhor.indice : null;
}

/** Mapeia colunas do cabecalho; campo repetido marca a segunda como duplicada (nao lida). */
function mapearColunasCustoMedio(celulasCabecalho) {
  const vistos = new Set();
  const colunas = [];
  celulasCabecalho.forEach((c, i) => {
    const original = celulaTexto(c);
    if (!original) return;
    const campo = campoDoCabecalho(original);
    const col = { indice: i, cabecalhoOriginal: original, campo, duplicada: false, status: campo ? "reconhecida" : "ignorada" };
    if (campo) {
      if (vistos.has(campo)) { col.duplicada = true; col.status = "duplicada"; }
      else vistos.add(campo);
    }
    colunas.push(col);
  });
  const obrigatoriosAusentes = CAMPOS.filter((c) => c.obrigatorio && !vistos.has(c.chave)).map((c) => ({ chave: c.chave, rotulo: c.rotulo }));
  if (!vistos.has("produto") && !vistos.has("descricao")) obrigatoriosAusentes.push({ chave: "produto", rotulo: "Produto (código ou descrição)" });
  return { colunas, obrigatoriosAusentes };
}

function resumoDaLinha(row) {
  return row.map(celulaTexto).filter((c) => c !== null).slice(0, 6).join(" | ");
}

/**
 * Extrai as linhas de dado (todas depois do cabecalho), sem resolver loja/produto.
 * Retorna { linhas: [{ linha, lojaCodigo, lojaNome, produtoCodigo, produtoDescricao, custoMedio, conteudo }], descartadas, totalLinhas }.
 */
function extrairLinhasCustoMedio(matriz, indiceCabecalho, colunas) {
  const porCampo = new Map();
  for (const c of colunas) if (c.campo && !c.duplicada) porCampo.set(c.campo, c.indice);
  const linhas = [];
  const descartadas = [];
  for (let i = indiceCabecalho + 1; i < matriz.length; i++) {
    const row = matriz[i] || [];
    const numeroLinha = i + 1;
    const descartar = (motivo) => descartadas.push({ linha: numeroLinha, motivo, conteudo: resumoDaLinha(row) });
    if (row.every((c) => celulaTexto(c) === null)) { descartar("linha em branco"); continue; }

    const cel = (campo) => (porCampo.has(campo) ? row[porCampo.get(campo)] : null);
    const loja = separarCodigoDescricao(cel("loja"));
    const produto = separarCodigoDescricao(cel("produto"));
    const descricao = celulaTexto(cel("descricao"));
    const lojaNome = celulaTexto(cel("loja_nome"));

    if (!loja.codigo && !produto.codigo && !descricao) { descartar("sem loja e sem produto"); continue; }
    if (!loja.codigo) { descartar("sem código de loja"); continue; }
    if (!produto.codigo && !descricao) { descartar("sem código nem descrição de produto"); continue; }

    const bruto = cel("custo");
    const n = paraNumero(bruto);
    if (!n.ok) { descartar(`custo médio inválido: ${JSON.stringify(celulaTexto(bruto))}`); continue; }
    if (n.vazio) { descartar("custo médio vazio"); continue; }

    linhas.push({
      linha: numeroLinha,
      lojaCodigo: loja.codigo,
      lojaNome: lojaNome || (loja.descricao !== loja.codigo ? loja.descricao : null),
      produtoCodigo: produto.codigo,
      produtoDescricao: descricao || (produto.descricao !== produto.codigo ? produto.descricao : null),
      custoMedio: n.valor,
      conteudo: resumoDaLinha(row),
    });
  }
  return { linhas, descartadas, totalLinhas: Math.max(0, matriz.length - (indiceCabecalho + 1)) };
}

/** Le a matriz inteira (puro). */
function lerPlanilhaCustoMedio(matriz) {
  const achado = acharCabecalhoCustoMedio(matriz);
  if (!achado) {
    const cand = cabecalhoCandidato(matriz);
    if (cand === null) {
      return { semCabecalho: true, cabecalhoIncerto: false, linhaCabecalho: null, colunas: [], obrigatoriosAusentes: CAMPOS.filter((c) => c.obrigatorio).map((c) => ({ chave: c.chave, rotulo: c.rotulo })), linhas: [], descartadas: [], totalLinhas: 0, bloqueada: true };
    }
    const { colunas, obrigatoriosAusentes } = mapearColunasCustoMedio(matriz[cand]);
    return { semCabecalho: false, cabecalhoIncerto: true, linhaCabecalho: cand + 1, colunas, obrigatoriosAusentes, linhas: [], descartadas: [], totalLinhas: Math.max(0, matriz.length - (cand + 1)), bloqueada: true };
  }
  const { colunas, obrigatoriosAusentes } = mapearColunasCustoMedio(matriz[achado.indice]);
  const bloqueada = obrigatoriosAusentes.length > 0;
  const extraido = bloqueada ? { linhas: [], descartadas: [], totalLinhas: Math.max(0, matriz.length - (achado.indice + 1)) } : extrairLinhasCustoMedio(matriz, achado.indice, colunas);
  return { semCabecalho: false, cabecalhoIncerto: false, linhaCabecalho: achado.indice + 1, colunas, obrigatoriosAusentes, ...extraido, bloqueada };
}

// ── Resolucao de lojas e produtos (puro, recebe os indices) ─────────────────────

const semZeros = (s) => String(s ?? "").trim().replace(/^0+(?=\d)/, "");

/**
 * indices = {
 *   lojasLacteus: [{ clienteCodigo, clienteNome }]           // lojas da rede na Carteira
 *   lojasRede:    [{ codigo, clienteCodigo }]                 // IntegracaoLoja da rede (codigo da rede -> loja Lacteus)
 *   catalogo:     [{ codigo, codigoLivre, descricao }]        // Produto
 *   vinculos:     [{ valor, produtoCodigo, fantasma }]        // IntegracaoProduto da rede (codigo da rede -> Produto.codigo)
 * }
 * Devolve { validas: [{ linha, clienteCodigo, produtoCodigo, produtoCodigoErp, custoMedio, ... }], descartadas, lojasNaoReconhecidas, produtosNaoReconhecidos, lojas, produtos }.
 */
function resolverLinhasCustoMedio(linhas, indices) {
  const lojaExata = new Map();
  const lojaSemZeros = new Map();
  for (const l of indices.lojasLacteus || []) {
    lojaExata.set(String(l.clienteCodigo).trim(), l);
    if (!lojaSemZeros.has(semZeros(l.clienteCodigo))) lojaSemZeros.set(semZeros(l.clienteCodigo), l);
  }
  const lojaDaRede = new Map();
  for (const l of indices.lojasRede || []) {
    if (!l.clienteCodigo) continue;
    const alvo = lojaExata.get(String(l.clienteCodigo).trim());
    if (alvo) lojaDaRede.set(String(l.codigo).trim(), alvo);
  }
  const lojaRedeSemVinculo = new Set((indices.lojasRede || []).filter((l) => !l.clienteCodigo).map((l) => String(l.codigo).trim()));

  const porLivre = new Map();
  const porCodigoErp = new Map();
  const porNome = new Map();
  for (const p of indices.catalogo || []) {
    if (p.codigoLivre) porLivre.set(String(p.codigoLivre).trim(), p);
    if (p.codigo) porCodigoErp.set(String(p.codigo).trim(), p);
    const k = nomeNormalizado(p.descricao || "");
    if (!k) continue;
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(p);
  }
  const vinculoPorValor = new Map();
  for (const v of indices.vinculos || []) vinculoPorValor.set(String(v.valor).trim(), v);

  const resolverLoja = (codigo) => {
    const c = String(codigo).trim();
    return lojaExata.get(c) || lojaDaRede.get(c) || lojaSemZeros.get(semZeros(c)) || null;
  };
  const resolverProduto = (codigo, descricao) => {
    if (codigo) {
      const c = String(codigo).trim();
      const direto = porLivre.get(c) || porCodigoErp.get(c);
      if (direto) return { produto: direto, metodo: porLivre.get(c) ? "codigoLivre" : "codigoErp" };
      const v = vinculoPorValor.get(c);
      if (v) {
        if (v.fantasma) return { produto: null, metodo: "fantasma" };
        const p = porCodigoErp.get(String(v.produtoCodigo ?? "").trim());
        if (p) return { produto: p, metodo: "vinculo" };
      }
    }
    if (descricao) {
      const iguais = porNome.get(nomeNormalizado(descricao));
      if (iguais && iguais.length === 1) return { produto: iguais[0], metodo: "descricao" };
      if (iguais && iguais.length > 1) return { produto: null, metodo: "descricao_ambigua" };
    }
    return { produto: null, metodo: null };
  };

  const validas = [];
  const descartadas = [];
  const lojasNao = new Map();
  const produtosNao = new Map();
  const lojasOk = new Set();
  const produtosOk = new Set();
  const chaves = new Map(); // clienteCodigo|produtoCodigo -> linha

  for (const l of linhas) {
    const loja = resolverLoja(l.lojaCodigo);
    if (!loja) {
      const motivo = lojaRedeSemVinculo.has(String(l.lojaCodigo).trim())
        ? `loja ${l.lojaCodigo} cadastrada na Integração Estoque sem vínculo com a loja do Lacteus`
        : `loja não reconhecida: ${l.lojaCodigo}`;
      descartadas.push({ linha: l.linha, motivo, conteudo: l.conteudo });
      const k = String(l.lojaCodigo).trim();
      const agg = lojasNao.get(k) || { codigo: k, nome: l.lojaNome || null, linhas: 0 };
      agg.linhas += 1;
      if (!agg.nome && l.lojaNome) agg.nome = l.lojaNome;
      lojasNao.set(k, agg);
      continue;
    }
    const { produto, metodo } = resolverProduto(l.produtoCodigo, l.produtoDescricao);
    if (!produto) {
      const rotulo = l.produtoCodigo || l.produtoDescricao;
      const motivo = metodo === "fantasma" ? `produto ${rotulo} marcado como fantasma na Integração Estoque`
        : metodo === "descricao_ambigua" ? `descrição "${l.produtoDescricao}" corresponde a mais de um produto do catálogo`
        : `produto não reconhecido: ${rotulo}`;
      descartadas.push({ linha: l.linha, motivo, conteudo: l.conteudo });
      const k = String(rotulo).trim();
      const agg = produtosNao.get(k) || { codigo: l.produtoCodigo || null, descricao: l.produtoDescricao || null, linhas: 0 };
      agg.linhas += 1;
      if (!agg.descricao && l.produtoDescricao) agg.descricao = l.produtoDescricao;
      produtosNao.set(k, agg);
      continue;
    }
    const produtoCodigo = produto.codigoLivre ? String(produto.codigoLivre).trim() : String(produto.codigo).trim();
    const chave = `${loja.clienteCodigo}|${produtoCodigo}`;
    if (chaves.has(chave)) {
      descartadas.push({ linha: l.linha, motivo: `loja e produto repetidos (mesma combinação da linha ${chaves.get(chave)})`, conteudo: l.conteudo });
      continue;
    }
    chaves.set(chave, l.linha);
    lojasOk.add(String(loja.clienteCodigo));
    produtosOk.add(produtoCodigo);
    validas.push({
      linha: l.linha,
      clienteCodigo: String(loja.clienteCodigo),
      clienteNome: loja.clienteNome || null,
      produtoCodigo,
      produtoCodigoErp: produto.codigo ? String(produto.codigo).trim() : null,
      produtoDescricao: produto.descricao || l.produtoDescricao || null,
      custoMedio: l.custoMedio,
      metodo,
      lojaCodigoArquivo: l.lojaCodigo,
      produtoCodigoArquivo: l.produtoCodigo || null,
    });
  }
  descartadas.sort((a, b) => a.linha - b.linha);
  return {
    validas,
    descartadas,
    lojasNaoReconhecidas: [...lojasNao.values()],
    produtosNaoReconhecidos: [...produtosNao.values()],
    lojas: lojasOk.size,
    produtos: produtosOk.size,
  };
}

// ── Leitura + resolucao contra o banco ──────────────────────────────────────────

async function carregarIndices(codigoRede) {
  const [lojasLacteus, lojasRede, catalogo, vinculos] = await Promise.all([
    lojasDaRede(codigoRede),
    IntegracaoLoja.find({ codigoRede: String(codigoRede) }, "codigo clienteCodigo").lean(),
    Produto.find({}, "codigo codigoLivre descricao").lean(),
    IntegracaoProduto.find({ codigoRede: String(codigoRede) }, "valor produtoCodigo fantasma").lean(),
  ]);
  return { lojasLacteus, lojasRede, catalogo, vinculos };
}

async function lerEResolver({ codigoRede, buffer }) {
  const matriz = await lerMatriz(buffer);
  const leitura = lerPlanilhaCustoMedio(matriz);
  if (leitura.bloqueada) return { leitura, resolvido: null };
  const indices = await carregarIndices(codigoRede);
  const resolvido = resolverLinhasCustoMedio(leitura.linhas, indices);
  return { leitura, resolvido };
}

function montarResumo(leitura, resolvido) {
  const descartadasLeitura = leitura.descartadas.length;
  const validas = resolvido ? resolvido.validas.length : 0;
  const descartadas = descartadasLeitura + (resolvido ? resolvido.descartadas.length : 0);
  return {
    totalLinhas: leitura.totalLinhas,
    validas,
    descartadas,
    lojas: resolvido ? resolvido.lojas : 0,
    lojasNaoReconhecidas: resolvido ? resolvido.lojasNaoReconhecidas.length : 0,
    produtos: resolvido ? resolvido.produtos : 0,
    produtosNaoReconhecidos: resolvido ? resolvido.produtosNaoReconhecidos.length : 0,
  };
}

function todasDescartadas(leitura, resolvido) {
  return [...leitura.descartadas, ...(resolvido ? resolvido.descartadas : [])].sort((a, b) => a.linha - b.linha);
}

async function jaImportado(codigoRede, hash) {
  const v = await CustoMedioRede.findOne({ codigoRede: String(codigoRede), hashArquivo: hash }, "versao importadoEm importadoPorNome createdAt").lean();
  return v ? { versao: v.versao, importadoEm: v.importadoEm || v.createdAt, importadoPorNome: v.importadoPorNome || null } : null;
}

function exigirBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw erro(400, "Envie o arquivo .xlsx no corpo da requisicao.");
}

/** Previa: nao grava nada. */
async function analisarCustoMedio({ codigoRede, buffer, nomeArquivo }) {
  exigirBuffer(buffer);
  await exigirRede(codigoRede);
  const hash = sha256(buffer);
  const [existente, { leitura, resolvido }] = await Promise.all([jaImportado(codigoRede, hash), lerEResolver({ codigoRede, buffer })]);
  const resumo = montarResumo(leitura, resolvido);
  const descartadas = todasDescartadas(leitura, resolvido);
  return {
    arquivo: { nome: nomeArquivo || "planilha.xlsx", tamanhoBytes: buffer.length, hashSha256: hash },
    jaImportado: existente,
    cabecalho: { linha: leitura.linhaCabecalho, incerto: leitura.cabecalhoIncerto, semCabecalho: leitura.semCabecalho },
    colunas: leitura.colunas,
    obrigatoriosAusentes: leitura.obrigatoriosAusentes,
    bloqueada: leitura.bloqueada,
    resumo,
    descartadas: descartadas.slice(0, MAX_DESCARTADAS_NA_PREVIA),
    descartadasTotal: descartadas.length,
    lojasNaoReconhecidas: resolvido ? resolvido.lojasNaoReconhecidas : [],
    produtosNaoReconhecidos: resolvido ? resolvido.produtosNaoReconhecidos : [],
    podeConfirmar: !leitura.bloqueada && resumo.validas > 0 && !existente,
  };
}

/** Grava uma versao nova (max + 1), desativa a anterior e guarda o original. Mesmo hash => 409. */
async function importarCustoMedio({ codigoRede, buffer, nomeArquivo, user }) {
  exigirBuffer(buffer);
  await exigirRede(codigoRede);
  const rede = String(codigoRede);
  const hash = sha256(buffer);
  const existente = await jaImportado(rede, hash);
  if (existente) {
    throw erro(409, `Este arquivo ja foi importado em ${fmtDataHora(existente.importadoEm)} por ${existente.importadoPorNome || "—"} (versao ${existente.versao}).`, { jaImportado: existente });
  }
  const { leitura, resolvido } = await lerEResolver({ codigoRede: rede, buffer });
  if (leitura.semCabecalho) throw erro(422, "Nao foi possivel identificar a linha de cabecalho do arquivo.");
  if (leitura.bloqueada) throw erro(422, `Faltam colunas obrigatorias: ${leitura.obrigatoriosAusentes.map((o) => o.rotulo).join(", ")}.`, { obrigatoriosAusentes: leitura.obrigatoriosAusentes });
  if (!resolvido.validas.length) throw erro(422, "Nenhuma linha com loja e produto reconhecidos. Nada foi importado.");

  const resumo = montarResumo(leitura, resolvido);
  const descartadas = todasDescartadas(leitura, resolvido).slice(0, MAX_DESCARTADAS_GRAVADAS);
  const ultima = await CustoMedioRede.findOne({ codigoRede: rede }, "versao").sort({ versao: -1 }).lean();
  const versao = (ultima?.versao || 0) + 1;

  let doc;
  try {
    doc = await CustoMedioRede.create({
      codigoRede: rede,
      versao,
      ativa: true,
      nomeArquivo: String(nomeArquivo || "planilha.xlsx").slice(0, 200),
      arquivo: buffer,
      hashArquivo: hash,
      importadoEm: new Date(),
      importadoPorId: user?.id || null,
      importadoPorNome: user?.nome || null,
      resumo,
      descartadas,
      linhas: resolvido.validas.map((l) => ({ clienteCodigo: l.clienteCodigo, produtoCodigo: l.produtoCodigo, produtoCodigoErp: l.produtoCodigoErp, custoMedio: l.custoMedio })),
    });
  } catch (err) {
    if (err && err.code === 11000) throw erro(409, "Outra importacao desta rede entrou ao mesmo tempo. Tente de novo.");
    throw err;
  }
  await CustoMedioRede.updateMany({ codigoRede: rede, _id: { $ne: doc._id }, ativa: true }, { $set: { ativa: false } });
  limparCache(rede);
  return { versao: versaoPublica(doc.toObject ? doc.toObject() : doc), resumo, descartadasTotal: descartadas.length };
}

module.exports = {
  // interface da precificacao
  obterMargemECusto,
  limparCache,
  // acesso
  podeAnexar,
  podeGerenciar,
  exigirAcessoRede,
  // cadastro
  listarRedes,
  obterConfig,
  salvarConfig,
  // custo medio
  analisarCustoMedio,
  importarCustoMedio,
  listarVersoes,
  obterArquivoVersao,
  // puros (testes)
  campoDoCabecalho,
  acharCabecalhoCustoMedio,
  mapearColunasCustoMedio,
  extrairLinhasCustoMedio,
  lerPlanilhaCustoMedio,
  resolverLinhasCustoMedio,
  CACHE_TTL_MS,
};
