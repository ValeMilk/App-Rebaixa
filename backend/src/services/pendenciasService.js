/**
 * Pendencias de contagem e push (v2.0, fase 1c).
 *
 * Interface usada pelo resto do sistema (syncJob, solicitacoes, visao do vendedor):
 *  - gerarPendencias(): apos o sync, cria as pendencias novas (ItemLoja em giro/rebaixa, Ruptura ativa) e envia push
 *  - registrarAcao({ clienteCodigo, produtoCodigo, tipo, user, solicitacaoId, motivo }): marca "acao feita"
 *    nas pendencias abertas da loja+produto (tipo: "solicitacao" | "pedido_feito" | "ja_resolvi")
 *  - enviarPushAdiados(): envia o que ficou para depois do horario de silencio (job das 7h)
 *
 * Regras (spec, Escopo 2):
 *  - UMA pendencia por loja + produto + lote + evento: chave "cliente|produto|AAAA-MM-DD da validade|evento"
 *    (ruptura: "cliente|produto|contadoEm|ruptura"). Rodar duas vezes nao duplica.
 *  - Giro que vira rebaixa no mesmo lote: nasce outra pendencia e a de giro fica "superada".
 *  - Destinatarios: vendedor e supervisor da loja (User ativo com o codigo), so quem tem pendencias.receber.
 *  - Push fora de 21h-7h (America/Fortaleza; a ultima carga do Ativmob cai ~21h15); dentro, fica pushPendente.
 *
 * As funcoes puras (montarChave, candidatosDoItem, candidatoDaRuptura, emHorarioDeSilencio,
 * agregarAcompanhamento, montarPush) sao exportadas para os testes em tests/pendencias.
 */
const Pendencia = require("../models/Pendencia");
const ItemLoja = require("../models/ItemLoja");
const Ruptura = require("../models/Ruptura");
const User = require("../models/User");
const { usuarioPode } = require("./permissoesService");
const pushService = require("./pushService");

const PERMISSAO_RECEBER = "pendencias.receber";
const EVENTOS_LOTE = new Set(["giro", "rebaixa"]);
const SILENCIO_INICIO = 21; // 21:00 inclusive
const SILENCIO_FIM = 7; // ate 06:59
const FUSO = "America/Fortaleza";
const HORAS_SEM_ACAO = 48;
const LIMITE_LISTA = 300;

const ROTULO_EVENTO = { rebaixa: "Rebaixa", giro: "Giro", ruptura: "Ruptura" };

// ---------------------------------------------------------------------------
// Funcoes puras
// ---------------------------------------------------------------------------

/** "AAAA-MM-DD" da validade (as datas de lote sao meia-noite UTC, como o montarDoc grava). */
function validadeChave(d) {
  if (!d) return "sem-validade";
  if (typeof d === "string") {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const data = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(data.getTime())) return "sem-validade";
  return data.toISOString().slice(0, 10);
}

function montarChave({ clienteCodigo, produtoCodigo, lote, evento }) {
  return `${clienteCodigo}|${produtoCodigo}|${lote}|${evento}`;
}

/** Hora (0-23) de um instante no fuso informado. */
function horaNoFuso(date, tz = FUSO) {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).formatToParts(date);
  const h = Number(partes.find((p) => p.type === "hour")?.value);
  return Number.isNaN(h) ? date.getUTCHours() : h % 24;
}

/** Horario de silencio do push: 21:00 ate 06:59 (America/Fortaleza). */
function emHorarioDeSilencio(date = new Date(), { inicio = SILENCIO_INICIO, fim = SILENCIO_FIM, tz = FUSO } = {}) {
  const h = horaNoFuso(date, tz);
  if (inicio > fim) return h >= inicio || h < fim; // atravessa a meia-noite (caso padrao)
  return h >= inicio && h < fim;
}

function campoComum(doc) {
  return {
    clienteCodigo: String(doc.clienteCodigo),
    cliente: doc.cliente || "",
    produtoCodigo: String(doc.produtoCodigo),
    produto: doc.produto || "",
    codigoRede: doc.codigoRede || null,
    redeSubrede: doc.redeSubrede || null,
    vendedorCodigo: doc.vendedorCodigo || null,
    supervisorCodigo: doc.supervisorCodigo || null,
  };
}

/**
 * Pendencias candidatas de um ItemLoja: uma por lote VIGENTE em giro ou rebaixa.
 * (Se o item tem situacao giro/rebaixa, e porque tem ao menos um lote vigente nesse estado.)
 */
function candidatosDoItem(item) {
  if (!item || !Array.isArray(item.lotes)) return [];
  const base = campoComum(item);
  const vistos = new Set();
  const out = [];
  for (const lote of item.lotes) {
    if (!lote || lote.vigente === false || !EVENTOS_LOTE.has(lote.status)) continue;
    const loteChave = validadeChave(lote.dataValidade);
    const chave = montarChave({ clienteCodigo: base.clienteCodigo, produtoCodigo: base.produtoCodigo, lote: loteChave, evento: lote.status });
    if (vistos.has(chave)) continue; // dois registros do mesmo lote (contagens repetidas): uma pendencia so
    vistos.add(chave);
    out.push({
      ...base,
      chave,
      evento: lote.status,
      loteChave,
      dataValidade: lote.dataValidade || null,
      quantidade: Number(lote.quantidade) || 0,
      pctShelf: lote.pctShelf ?? null,
      contadoEm: lote.contadoEm || item.ultimaContagemEm || null,
      contadoPor: lote.agente || item.ultimaContagemPor || null,
    });
  }
  return out;
}

/** Pendencia candidata de uma Ruptura ativa. */
function candidatoDaRuptura(r) {
  if (!r) return null;
  const base = campoComum(r);
  const loteChave = r.contadoEm || "sem-data";
  return {
    ...base,
    chave: montarChave({ clienteCodigo: base.clienteCodigo, produtoCodigo: base.produtoCodigo, lote: loteChave, evento: "ruptura" }),
    evento: "ruptura",
    loteChave,
    dataValidade: null,
    quantidade: 0,
    pctShelf: null,
    contadoEm: r.contadoEm || null,
    contadoPor: r.contadoPor || null,
  };
}

/** Chave da pendencia de giro que uma rebaixa do mesmo lote supera. */
function chaveGiroSuperada(cand) {
  if (cand.evento !== "rebaixa") return null;
  return montarChave({ clienteCodigo: cand.clienteCodigo, produtoCodigo: cand.produtoCodigo, lote: cand.loteChave, evento: "giro" });
}

/** "dd/mm" e "dd/mm hh:mm" para o texto do push (sem depender de fuso: a validade e UTC, contadoEm e hora de relogio). */
function dataCurta(d) {
  const s = validadeChave(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : "";
}
function contadoCurto(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : "";
}

/** Titulo, corpo, url e tag do push de uma pendencia. */
function montarPush(p) {
  const title = `${ROTULO_EVENTO[p.evento] || "Pendência"}: ${p.produto || p.produtoCodigo}`;
  const partes = [p.cliente || p.clienteCodigo];
  if (p.evento === "ruptura") {
    const quando = contadoCurto(p.contadoEm);
    partes.push(`ruptura contada${quando ? ` em ${quando}` : ""}${p.contadoPor ? ` por ${p.contadoPor}` : ""}`);
  } else {
    partes.push(`${p.quantidade} un`);
    const venc = dataCurta(p.dataValidade);
    if (venc) partes.push(`vence ${venc}`);
    if (p.pctShelf != null) partes.push(`${Math.round(Number(p.pctShelf) * 100)}% do shelf`);
  }
  return { title, body: partes.join(" · "), url: "/pendencias", tag: `pendencia-${p.chave}` };
}

/**
 * Acompanhamento do admin: por destinatario, enviadas / vistas / com acao / sem acao ha mais de 48 h,
 * e a lista das pendencias sem acao ha mais de 48 h. Pendencias superadas nao entram.
 */
function agregarAcompanhamento(pendencias, { agora = new Date(), horas = HORAS_SEM_ACAO } = {}) {
  const limite = agora.getTime() - horas * 3600 * 1000;
  const porUsuario = new Map();
  const semAcao48h = [];
  let totalEnviadas = 0;
  let totalComAcao = 0;

  for (const p of pendencias) {
    if (p.superadaPor) continue;
    const comAcao = !!(p.acao && p.acao.tipo);
    const enviadaEm = new Date(p.createdAt || 0);
    const atrasada = !comAcao && enviadaEm.getTime() <= limite;
    totalEnviadas++;
    if (comAcao) totalComAcao++;

    for (const d of p.destinatarios || []) {
      const id = String(d.userId);
      let u = porUsuario.get(id);
      if (!u) {
        u = { userId: id, nome: d.nome || null, papel: d.papel || null, codigo: d.codigo || null, enviadas: 0, vistas: 0, comAcao: 0, semAcao48h: 0 };
        porUsuario.set(id, u);
      }
      u.enviadas++;
      if (d.vistaEm) u.vistas++;
      if (comAcao) u.comAcao++;
      if (atrasada) u.semAcao48h++;
    }

    if (atrasada) {
      semAcao48h.push({
        _id: p._id,
        chave: p.chave,
        evento: p.evento,
        clienteCodigo: p.clienteCodigo,
        cliente: p.cliente,
        produtoCodigo: p.produtoCodigo,
        produto: p.produto,
        redeSubrede: p.redeSubrede || null,
        quantidade: p.quantidade,
        dataValidade: p.dataValidade || null,
        enviadaEm: p.createdAt || null,
        horasSemAcao: Math.floor((agora.getTime() - enviadaEm.getTime()) / 3600000),
        destinatarios: (p.destinatarios || []).map((d) => ({ userId: String(d.userId), nome: d.nome, papel: d.papel, vistaEm: d.vistaEm || null })),
      });
    }
  }

  const usuarios = [...porUsuario.values()]
    .map((u) => ({
      ...u,
      pctVistas: u.enviadas ? Math.round((u.vistas / u.enviadas) * 100) : 0,
      pctComAcao: u.enviadas ? Math.round((u.comAcao / u.enviadas) * 100) : 0,
    }))
    .sort((a, b) => b.semAcao48h - a.semAcao48h || b.enviadas - a.enviadas || String(a.nome).localeCompare(String(b.nome), "pt-BR"));

  semAcao48h.sort((a, b) => new Date(a.enviadaEm) - new Date(b.enviadaEm)); // mais antiga primeiro

  return {
    usuarios,
    semAcao48h,
    totais: { enviadas: totalEnviadas, comAcao: totalComAcao, semAcao48h: semAcao48h.length },
  };
}

// ---------------------------------------------------------------------------
// Destinatarios
// ---------------------------------------------------------------------------

/**
 * Carrega os usuarios ativos dos codigos informados que tem a permissao de receber pendencias.
 * Devolve Map codigo -> { userId, codigo, nome }.
 */
async function carregarDestinatarios(codigos) {
  const lista = [...new Set(codigos.filter(Boolean).map(String))];
  if (!lista.length) return new Map();
  const users = await User.find({ codigo: { $in: lista }, ativo: true }, { nome: 1, codigo: 1, role: 1, roles: 1 }).lean();
  const mapa = new Map();
  for (const u of users) {
    const pode = await usuarioPode({ role: u.role, roles: u.roles || [] }, PERMISSAO_RECEBER);
    if (pode) mapa.set(String(u.codigo), { userId: u._id, codigo: String(u.codigo), nome: u.nome });
  }
  return mapa;
}

/** Vendedor e supervisor da loja (pura, dado o mapa de usuarios por codigo). */
function montarDestinatarios(cand, porCodigo) {
  const out = [];
  const ids = new Set();
  const pares = [
    ["vendedor", cand.vendedorCodigo],
    ["supervisor", cand.supervisorCodigo],
  ];
  for (const [papel, codigo] of pares) {
    if (!codigo) continue;
    const u = porCodigo.get(String(codigo));
    if (!u || ids.has(String(u.userId))) continue;
    ids.add(String(u.userId));
    out.push({ userId: u.userId, codigo: u.codigo, nome: u.nome, papel, enviadaEm: new Date(), vistaEm: null, pushEnviadoEm: null, pushErro: null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** Envia o push de uma pendencia a todos os destinatarios e grava o resultado em cada um. */
async function enviarPushDaPendencia(p) {
  const payload = montarPush(p);
  const agora = new Date();
  let enviados = 0;
  const set = {};
  for (let i = 0; i < (p.destinatarios || []).length; i++) {
    const d = p.destinatarios[i];
    try {
      const r = await pushService.enviarParaUsuario(d.userId, payload);
      if (r.desligado) {
        set[`destinatarios.${i}.pushErro`] = "push desligado (sem chaves VAPID)";
      } else if (r.enviados > 0) {
        enviados += r.enviados;
        set[`destinatarios.${i}.pushEnviadoEm`] = agora;
        set[`destinatarios.${i}.pushErro`] = null;
      } else {
        set[`destinatarios.${i}.pushErro`] = r.semInscricao ? "sem inscricao de push" : `falhas: ${r.falhas}`;
      }
    } catch (err) {
      set[`destinatarios.${i}.pushErro`] = String(err.message || err).slice(0, 200);
    }
  }
  set.pushPendente = false;
  await Pendencia.updateOne({ _id: p._id }, { $set: set });
  return enviados;
}

// ---------------------------------------------------------------------------
// Interface publica
// ---------------------------------------------------------------------------

async function gerarPendencias() {
  const [itens, rupturas] = await Promise.all([
    ItemLoja.find({ situacao: { $in: ["giro", "rebaixa"] } }).lean(),
    Ruptura.find({ ativa: true }).lean(),
  ]);

  const candidatos = [];
  for (const item of itens) candidatos.push(...candidatosDoItem(item));
  for (const r of rupturas) {
    const c = candidatoDaRuptura(r);
    if (c) candidatos.push(c);
  }
  if (!candidatos.length) return { criadas: 0, pushEnviados: 0, pushAdiados: 0, semDestinatario: 0, superadas: 0 };

  // Idempotente: so o que ainda nao existe
  const chaves = candidatos.map((c) => c.chave);
  const existentes = new Set();
  for (let i = 0; i < chaves.length; i += 1000) {
    const docs = await Pendencia.find({ chave: { $in: chaves.slice(i, i + 1000) } }, { chave: 1 }).lean();
    for (const d of docs) existentes.add(d.chave);
  }
  const novos = candidatos.filter((c) => !existentes.has(c.chave));
  if (!novos.length) return { criadas: 0, pushEnviados: 0, pushAdiados: 0, semDestinatario: 0, superadas: 0 };

  const porCodigo = await carregarDestinatarios(novos.flatMap((c) => [c.vendedorCodigo, c.supervisorCodigo]));
  const silencio = emHorarioDeSilencio(new Date());

  let semDestinatario = 0;
  const docs = [];
  for (const c of novos) {
    const destinatarios = montarDestinatarios(c, porCodigo);
    if (!destinatarios.length) {
      semDestinatario++;
      continue; // sem usuario cadastrado: tenta de novo no proximo sync (quando o usuario existir)
    }
    docs.push({
      chave: c.chave,
      evento: c.evento,
      clienteCodigo: c.clienteCodigo,
      cliente: c.cliente,
      produtoCodigo: c.produtoCodigo,
      produto: c.produto,
      codigoRede: c.codigoRede,
      redeSubrede: c.redeSubrede,
      dataValidade: c.dataValidade,
      quantidade: c.quantidade,
      pctShelf: c.pctShelf,
      contadoEm: c.contadoEm,
      contadoPor: c.contadoPor,
      destinatarios,
      pushPendente: silencio,
      _loteChave: c.loteChave,
    });
  }

  let criadas = [];
  if (docs.length) {
    try {
      criadas = await Pendencia.insertMany(docs.map(({ _loteChave, ...d }) => d), { ordered: false });
    } catch (err) {
      // Corrida com outro gerador (chave duplicada): fica com o que entrou
      if (err && err.code === 11000 && err.insertedDocs) criadas = err.insertedDocs;
      else if (err && err.writeErrors && err.insertedDocs) criadas = err.insertedDocs;
      else throw err;
    }
  }

  // Giro -> rebaixa no mesmo lote: marca a de giro como superada
  let superadas = 0;
  const porChave = new Map(docs.map((d) => [d.chave, d]));
  for (const p of criadas) {
    const d = porChave.get(p.chave);
    if (!d) continue;
    const giro = chaveGiroSuperada({ evento: p.evento, clienteCodigo: p.clienteCodigo, produtoCodigo: p.produtoCodigo, loteChave: d._loteChave });
    if (!giro) continue;
    const r = await Pendencia.updateOne({ chave: giro, superadaPor: null }, { $set: { superadaPor: p._id, superadaEm: new Date() } });
    superadas += r.modifiedCount || 0;
  }

  // Push (ou adia)
  let pushEnviados = 0;
  let pushAdiados = 0;
  for (const p of criadas) {
    if (silencio) {
      pushAdiados += (p.destinatarios || []).length;
      continue;
    }
    pushEnviados += await enviarPushDaPendencia(p.toObject ? p.toObject() : p);
  }

  return { criadas: criadas.length, pushEnviados, pushAdiados, semDestinatario, superadas };
}

/**
 * Marca "acao feita" em TODAS as pendencias abertas (sem acao) da loja+produto.
 * user: req.user ({ id, nome, role }) ou documento User.
 */
async function registrarAcao({ clienteCodigo, produtoCodigo, tipo, user, solicitacaoId = null, motivo = null } = {}) {
  if (!clienteCodigo || !produtoCodigo || !tipo) return { atualizadas: 0 };
  if (!["solicitacao", "pedido_feito", "ja_resolvi"].includes(tipo)) return { atualizadas: 0 };
  const userId = user?.id || user?._id || null;
  const abertas = await Pendencia.find(
    { clienteCodigo: String(clienteCodigo), produtoCodigo: String(produtoCodigo), "acao.tipo": null },
    { destinatarios: 1 }
  ).lean();
  if (!abertas.length) return { atualizadas: 0 };

  const em = new Date();
  const ops = abertas.map((p) => {
    const dest = userId ? (p.destinatarios || []).find((d) => String(d.userId) === String(userId)) : null;
    return {
      updateOne: {
        filter: { _id: p._id, "acao.tipo": null },
        update: {
          $set: {
            acao: {
              tipo,
              porUserId: userId,
              porNome: user?.nome || dest?.nome || null,
              porPapel: dest?.papel || user?.role || null,
              em,
              motivo: motivo ? String(motivo).slice(0, 500) : null,
              solicitacaoId: solicitacaoId || null,
            },
          },
        },
      },
    };
  });
  const r = await Pendencia.bulkWrite(ops, { ordered: false });
  return { atualizadas: r.modifiedCount || 0 };
}

/** Envia o push das pendencias que ficaram para depois do horario de silencio e limpa o flag. */
async function enviarPushAdiados() {
  const pendentes = await Pendencia.find({ pushPendente: true }).lean();
  let enviados = 0;
  for (const p of pendentes) enviados += await enviarPushDaPendencia(p);
  return { pendencias: pendentes.length, enviados };
}

module.exports = {
  gerarPendencias,
  registrarAcao,
  enviarPushAdiados,
  // puras (testes)
  montarChave,
  validadeChave,
  candidatosDoItem,
  candidatoDaRuptura,
  chaveGiroSuperada,
  emHorarioDeSilencio,
  montarDestinatarios,
  montarPush,
  agregarAcompanhamento,
  HORAS_SEM_ACAO,
  LIMITE_LISTA,
};
