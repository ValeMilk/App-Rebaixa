/**
 * Modelos falsos via require.cache (padrao de tests/erp/getPool.test.js): o service e carregado
 * sem mongoose nem banco. Cada modelo falso responde com os dados que o teste configurar.
 */
const path = require("path");
const ExcelJS = require("exceljs");

function stubModulo(caminhoRelativo, exportsFalsos) {
  const abs = require.resolve(path.join(__dirname, "../../src", caminhoRelativo));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: exportsFalsos };
}

/** Consulta encadeavel do Mongoose (sort/select/lean/await) que devolve o resultado de `fn`. */
function consulta(fn) {
  let ordem = null;
  const exec = () => {
    const r = fn();
    if (!ordem || !Array.isArray(r)) return r;
    const [campo, dir] = Object.entries(ordem)[0];
    return [...r].sort((a, b) => (a[campo] > b[campo] ? 1 : a[campo] < b[campo] ? -1 : 0) * (dir < 0 ? -1 : 1));
  };
  const q = {
    sort(spec) { ordem = spec; return q; },
    select() { return q; },
    limit() { return q; },
    lean() { return Promise.resolve(exec()); },
    then(ok, ko) { return Promise.resolve(exec()).then(ok, ko); },
  };
  return q;
}

/**
 * Modelo falso: `dados` e a "colecao"; os metodos cobrem o que o service usa.
 * `contagem` registra quantas vezes cada metodo foi chamado.
 */
function modeloFalso(dados = [], extras = {}) {
  const contagem = {};
  const conta = (m) => { contagem[m] = (contagem[m] || 0) + 1; };
  const bate = (doc, filtro = {}) => Object.entries(filtro).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp)) {
      if ("$in" in v) return v.$in.map(String).includes(String(doc[k]));
      if ("$ne" in v) return doc[k] !== v.$ne;
      if ("$nin" in v) return !v.$nin.includes(doc[k]);
      return true;
    }
    return String(doc[k]) === String(v);
  });
  const m = {
    dados,
    contagem,
    find(filtro) { conta("find"); return consulta(() => dados.filter((d) => bate(d, filtro))); },
    findOne(filtro) { conta("findOne"); return consulta(() => dados.find((d) => bate(d, filtro)) || null); },
    distinct(campo, filtro) { conta("distinct"); return Promise.resolve([...new Set(dados.filter((d) => bate(d, filtro)).map((d) => d[campo]).filter((v) => v != null && v !== ""))]); },
    aggregate() { conta("aggregate"); return Promise.resolve(extras.aggregate ? extras.aggregate(dados) : []); },
    async create(doc) { conta("create"); const novo = { _id: `id${dados.length + 1}`, createdAt: new Date(), ...doc, toObject() { return this; } }; dados.push(novo); return novo; },
    async updateMany(filtro, upd) {
      conta("updateMany");
      const { _id, ...resto } = filtro;
      let n = 0;
      for (const d of dados) {
        if (_id && _id.$ne !== undefined && d._id === _id.$ne) continue;
        if (bate(d, resto)) { Object.assign(d, upd.$set || {}); n++; }
      }
      return { modifiedCount: n };
    },
    findOneAndUpdate(filtro, upd) { conta("findOneAndUpdate"); return consulta(() => { let d = dados.find((x) => bate(x, filtro)); if (!d) { d = { ...(upd.$setOnInsert || {}) }; dados.push(d); } Object.assign(d, upd.$set || {}); d.updatedAt = new Date(); return d; }); },
    ...extras,
  };
  return m;
}

/** Instala todos os modelos que o service usa e devolve os falsos para o teste mexer. */
function instalarModelosFalsos(cfg = {}) {
  const modelos = {
    ConfigRede: modeloFalso(cfg.configs || []),
    CustoMedioRede: modeloFalso(cfg.custos || []),
    Carteira: modeloFalso(cfg.carteira || [], {
      aggregate: (dados) => {
        const por = new Map();
        for (const d of dados) {
          if (!d.codigoRede) continue;
          const a = por.get(d.codigoRede) || { codigoRede: d.codigoRede, nome: d.redeSubrede, lojas: new Set() };
          a.lojas.add(d.clienteCodigo);
          por.set(d.codigoRede, a);
        }
        return [...por.values()].map((a) => ({ ...a, lojas: a.lojas.size }));
      },
    }),
    Produto: modeloFalso(cfg.produtos || []),
    ResponsavelRede: modeloFalso(cfg.responsaveis || []),
    IntegracaoLoja: modeloFalso(cfg.lojasRede || []),
    IntegracaoProduto: modeloFalso(cfg.vinculos || []),
  };
  for (const [nome, m] of Object.entries(modelos)) stubModulo(`models/${nome}`, m);
  stubModulo("services/permissoesService", { usuarioPode: async (user, ...chaves) => (cfg.permissoes || (() => true))(user, chaves) });
  return modelos;
}

/** Monta um .xlsx em memoria a partir de uma matriz de linhas. */
async function criarPlanilha(linhas, nomeAba = "Custo") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nomeAba);
  linhas.forEach((l) => ws.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { stubModulo, modeloFalso, instalarModelosFalsos, criarPlanilha };
