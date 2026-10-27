const test = require("node:test");
const assert = require("node:assert/strict");

const {
  montarChave,
  validadeChave,
  candidatosDoItem,
  candidatoDaRuptura,
  chaveGiroSuperada,
  emHorarioDeSilencio,
  montarDestinatarios,
  montarPush,
  agregarAcompanhamento,
} = require("../../src/services/pendenciasService");

// ItemLoja como o visaoLojasService grava: lotes com status, vigente e contagem
const item = (extra = {}) => ({
  clienteCodigo: "10752",
  cliente: "POPULAR ATACADISTA",
  produtoCodigo: "187001",
  produto: "IOGURTE NATURAL 150G",
  codigoRede: "77",
  redeSubrede: "POPULAR",
  vendedorCodigo: "V1",
  supervisorCodigo: "S1",
  situacao: "rebaixa",
  ultimaContagemEm: "2026-10-27T09:00",
  ultimaContagemPor: "Ana",
  lotes: [
    { dataValidade: new Date("2026-11-10T00:00:00.000Z"), quantidade: 10, status: "rebaixa", pctShelf: 0.8, vigente: true, agente: "Ana", contadoEm: "2026-10-27T09:00" },
    { dataValidade: new Date("2026-11-20T00:00:00.000Z"), quantidade: 20, status: "giro", pctShelf: 0.5, vigente: true, agente: "Bruno", contadoEm: "2026-10-26T09:00" },
    { dataValidade: new Date("2026-12-30T00:00:00.000Z"), quantidade: 99, status: "ok", pctShelf: 0.1, vigente: true, agente: "Carla", contadoEm: "2026-10-25T09:00" },
    { dataValidade: new Date("2026-11-01T00:00:00.000Z"), quantidade: 5, status: "rebaixa", pctShelf: 0.9, vigente: false, motivoSaida: "nao_reencontrado", agente: "Ana", contadoEm: "2026-10-01T09:00" },
  ],
  ...extra,
});

test("chave: cliente|produto|validade AAAA-MM-DD|evento; validade em UTC, sem fuso", () => {
  assert.equal(montarChave({ clienteCodigo: "1", produtoCodigo: "2", lote: "2026-11-10", evento: "giro" }), "1|2|2026-11-10|giro");
  assert.equal(validadeChave(new Date("2026-11-10T00:00:00.000Z")), "2026-11-10");
  assert.equal(validadeChave("2026-11-10T00:00:00.000Z"), "2026-11-10");
  assert.equal(validadeChave(null), "sem-validade");
});

test("candidatosDoItem: um por lote VIGENTE em giro/rebaixa (ok e nao vigente ficam de fora)", () => {
  const c = candidatosDoItem(item());
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((x) => x.chave), ["10752|187001|2026-11-10|rebaixa", "10752|187001|2026-11-20|giro"]);
  assert.equal(c[0].quantidade, 10);
  assert.equal(c[0].pctShelf, 0.8);
  assert.equal(c[0].contadoPor, "Ana");
  assert.equal(c[0].contadoEm, "2026-10-27T09:00");
  assert.equal(c[0].vendedorCodigo, "V1");
  assert.equal(c[0].supervisorCodigo, "S1");
  assert.equal(c[1].evento, "giro");
});

test("candidatosDoItem: dois registros do mesmo lote e evento viram UMA chave; rodar de novo da o mesmo", () => {
  const i = item({ lotes: [item().lotes[0], { ...item().lotes[0], quantidade: 3 }] });
  const a = candidatosDoItem(i);
  const b = candidatosDoItem(i);
  assert.equal(a.length, 1);
  assert.deepEqual(a.map((x) => x.chave), b.map((x) => x.chave));
});

test("candidatoDaRuptura: chave com o contadoEm da ruptura", () => {
  const c = candidatoDaRuptura({ clienteCodigo: "10752", produtoCodigo: "187001", cliente: "X", produto: "Y", contadoEm: "2026-10-27T08:30", contadoPor: "Ana", vendedorCodigo: "V1", supervisorCodigo: "S1" });
  assert.equal(c.chave, "10752|187001|2026-10-27T08:30|ruptura");
  assert.equal(c.evento, "ruptura");
  assert.equal(c.quantidade, 0);
  assert.equal(c.contadoPor, "Ana");
});

test("giro -> rebaixa no mesmo lote: a rebaixa aponta a chave de giro que supera", () => {
  const [reb, giro] = candidatosDoItem(item());
  assert.equal(chaveGiroSuperada(reb), "10752|187001|2026-11-10|giro");
  assert.equal(chaveGiroSuperada(giro), null);
});

test("horario de silencio: 21:00 a 06:59 em America/Fortaleza (UTC-3)", () => {
  // 21:00 local = 00:00 UTC do dia seguinte
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T00:00:00Z")), true);
  assert.equal(emHorarioDeSilencio(new Date("2026-10-27T23:59:00Z")), false); // 20:59 local
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T09:59:00Z")), true); // 06:59 local
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T10:00:00Z")), false); // 07:00 local
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T15:30:00Z")), false); // 12:30 local
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T03:00:00Z")), true); // 00:00 local
  // janela que nao atravessa a meia-noite
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T15:30:00Z"), { inicio: 12, fim: 14 }), true);
  assert.equal(emHorarioDeSilencio(new Date("2026-10-28T18:30:00Z"), { inicio: 12, fim: 14 }), false);
});

test("destinatarios: vendedor e supervisor da loja pelo codigo; sem usuario, sem destinatario; mesmo usuario entra uma vez", () => {
  const porCodigo = new Map([
    ["V1", { userId: "u1", codigo: "V1", nome: "Vendedor Um" }],
    ["S1", { userId: "u2", codigo: "S1", nome: "Sup Um" }],
  ]);
  const d = montarDestinatarios({ vendedorCodigo: "V1", supervisorCodigo: "S1" }, porCodigo);
  assert.deepEqual(d.map((x) => [x.papel, x.nome, x.vistaEm]), [["vendedor", "Vendedor Um", null], ["supervisor", "Sup Um", null]]);
  assert.equal(montarDestinatarios({ vendedorCodigo: "V9", supervisorCodigo: null }, porCodigo).length, 0);
  assert.equal(montarDestinatarios({ vendedorCodigo: "V1", supervisorCodigo: "V1" }, porCodigo).length, 1);
});

test("push: titulo com o evento e o produto; corpo com loja, quantidade, validade e shelf; ruptura mostra quem contou", () => {
  const [reb] = candidatosDoItem(item());
  const p = montarPush(reb);
  assert.equal(p.title, "Rebaixa: IOGURTE NATURAL 150G");
  assert.equal(p.body, "POPULAR ATACADISTA · 10 un · vence 10/11 · 80% do shelf");
  assert.equal(p.url, "/pendencias");
  assert.equal(p.tag, "pendencia-10752|187001|2026-11-10|rebaixa");
  const r = montarPush(candidatoDaRuptura({ clienteCodigo: "1", produtoCodigo: "2", cliente: "LOJA", produto: "PROD", contadoEm: "2026-10-27T08:30", contadoPor: "Ana" }));
  assert.equal(r.title, "Ruptura: PROD");
  assert.equal(r.body, "LOJA · ruptura contada em 27/10 08:30 por Ana");
});

test("acompanhamento: por destinatario (enviadas, vistas, com acao, sem acao 48h) e lista das atrasadas; superada nao conta", () => {
  const agora = new Date("2026-10-27T12:00:00Z");
  const h = (n) => new Date(agora.getTime() - n * 3600 * 1000);
  const dest = (id, nome, papel, vistaEm = null) => ({ userId: id, nome, papel, vistaEm });
  const lista = [
    // vista pelos dois, com acao do vendedor
    { _id: "p1", chave: "a", evento: "rebaixa", cliente: "L1", produto: "P1", createdAt: h(60), acao: { tipo: "solicitacao", porNome: "V" }, destinatarios: [dest("u1", "V", "vendedor", h(50)), dest("u2", "S", "supervisor", h(40))] },
    // sem acao ha 49h, so o supervisor viu
    { _id: "p2", chave: "b", evento: "giro", cliente: "L2", produto: "P2", createdAt: h(49), acao: { tipo: null }, destinatarios: [dest("u1", "V", "vendedor"), dest("u2", "S", "supervisor", h(10))] },
    // sem acao ha 10h: ainda nao atrasada
    { _id: "p3", chave: "c", evento: "ruptura", cliente: "L3", produto: "P3", createdAt: h(10), acao: null, destinatarios: [dest("u1", "V", "vendedor")] },
    // superada: fora de tudo
    { _id: "p4", chave: "d", evento: "giro", cliente: "L1", produto: "P1", createdAt: h(100), superadaPor: "p1", destinatarios: [dest("u1", "V", "vendedor")] },
  ];
  const r = agregarAcompanhamento(lista, { agora });
  assert.deepEqual(r.totais, { enviadas: 3, comAcao: 1, semAcao48h: 1 });
  const v = r.usuarios.find((u) => u.userId === "u1");
  const s = r.usuarios.find((u) => u.userId === "u2");
  assert.deepEqual([v.enviadas, v.vistas, v.comAcao, v.semAcao48h, v.pctVistas, v.pctComAcao], [3, 1, 1, 1, 33, 33]);
  assert.deepEqual([s.enviadas, s.vistas, s.comAcao, s.semAcao48h, s.pctVistas, s.pctComAcao], [2, 2, 1, 1, 100, 50]);
  assert.equal(r.semAcao48h.length, 1);
  assert.equal(r.semAcao48h[0]._id, "p2");
  assert.equal(r.semAcao48h[0].horasSemAcao, 49);
  assert.deepEqual(r.semAcao48h[0].destinatarios.map((d) => [d.papel, !!d.vistaEm]), [["vendedor", false], ["supervisor", true]]);
});
