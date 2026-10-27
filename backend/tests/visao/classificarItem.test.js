const test = require("node:test");
const assert = require("node:assert/strict");

const { classificarItem, rupturasResolvidas, lerLinhaBi, SQL_VISAO, SQL_CONTAGEM_ANTIGA, DIAS_SEM_RECONTAGEM } = require("../../src/services/visaoLojasService");

// Lote como a consulta devolve (json_agg): vigente quando motivoSaida e nulo
const lote = (extra = {}) => ({
  dataValidade: "2099-10-10", quantidade: 10, peso: 3, pctShelf: "0.8", vigente: true, motivoSaida: null,
  agente: "Ana ", agenteCodigo: 12298, contadoEm: "2099-09-24T11:45", naUltimaVisita: true, ...extra,
});
const ultima = (extra = {}) => ({ quantidade: 10, emRuptura: false, contadoEm: "2099-09-24T11:45", agente: "Ana", agenteCodigo: "12298", ...extra });
const compra = (extra = {}) => ({ ultimaCompraEm: new Date("2099-09-01T00:00:00.000Z"), qtd90d: 48, notas90d: 2, ...extra });

test("comprou em 90 dias e nunca contou: nao_contado, sem quantidade, com os dados da compra", () => {
  const r = classificarItem({ lotes: [], ultima: null, compra: compra(), produtoCodigo: "187001" });
  assert.equal(r.situacao, "nao_contado");
  assert.equal(r.quantidade, 0);
  assert.equal(r.quantidadeTotal, 0);
  assert.equal(r.dataValidade, null);
  assert.equal(r.ultimaContagemEm, null);
  assert.equal(r.ultimaContagemQtd, null);
  assert.equal(r.comprou90d, true);
  assert.equal(r.qtd90d, 48);
  assert.equal(r.ultimaCompraEm.toISOString(), "2099-09-01T00:00:00.000Z");
  assert.equal(r.emRuptura, false);
});

test("nao_contado com contagem antiga (fora dos 30 dias): guarda a data da ultima contagem", () => {
  const r = classificarItem({ compra: compra(), contagemAntiga: { contadoEm: "2099-07-01T09:00" } });
  assert.equal(r.situacao, "nao_contado");
  assert.equal(r.ultimaContagemEm, "2099-07-01T09:00");
  assert.equal(r.ultimaContagemQtd, null);
});

test("lote contado mais de 14 dias antes da ultima visita: nao_reencontrado e fora da soma", () => {
  const r = classificarItem({
    lotes: [lote({ motivoSaida: "nao_reencontrado", vigente: false, diasDesdeContagem: 20 })],
    ultima: ultima(), compra: compra(), shelf: 55, produtoCodigo: "187001",
  });
  assert.equal(r.situacao, "nao_reencontrado");
  assert.equal(r.quantidade, 0);
  assert.equal(r.quantidadeTotal, 0);
  assert.equal(r.lotes.length, 1, "o lote nao some");
  assert.equal(r.lotes[0].vigente, false);
  assert.equal(r.lotes[0].motivoSaida, "nao_reencontrado");
  assert.equal(r.lotes[0].entraNaSoma, false);
  assert.equal(r.dataValidade, null);
  assert.equal(DIAS_SEM_RECONTAGEM, 14);
});

test("ultima contagem zero com em_ruptura = SIM: ruptura (vence lote antigo ainda vigente)", () => {
  const r = classificarItem({
    lotes: [lote({ contadoEm: "2099-09-20T10:00" })],
    ultima: ultima({ quantidade: 0, emRuptura: true, contadoEm: "2099-09-24T11:45" }),
    compra: compra(), shelf: 55,
  });
  assert.equal(r.situacao, "ruptura");
  assert.equal(r.emRuptura, true);
  assert.equal(r.ultimaContagemQtd, 0);
  assert.equal(r.ultimaContagemEm, "2099-09-24T11:45");
  assert.equal(r.ultimaContagemPor, "Ana");
});

test("ultima contagem zero SEM ruptura: zerado (lote encerrado), nao entra na lista de ruptura", () => {
  const r = classificarItem({ lotes: [], ultima: ultima({ quantidade: 0, emRuptura: false }), compra: compra() });
  assert.equal(r.situacao, "zerado");
  assert.equal(r.emRuptura, false);
});

test("em_ruptura = SIM com quantidade > 0 NAO e ruptura: classifica pelos lotes", () => {
  const r = classificarItem({ lotes: [lote({ peso: 2 })], ultima: ultima({ quantidade: 10, emRuptura: true }), shelf: 55 });
  assert.equal(r.situacao, "giro");
  assert.equal(r.emRuptura, false);
});

test("pior status entre os lotes vigentes; so giro/rebaixa entram na soma; validade = a mais proxima em acao", () => {
  const r = classificarItem({
    lotes: [
      lote({ dataValidade: "2099-10-10", quantidade: 10, peso: 3, pctShelf: "0.8" }),
      lote({ dataValidade: "2099-10-20", quantidade: 20, peso: 2, pctShelf: "0.6" }),
      lote({ dataValidade: "2099-11-30", quantidade: 99, peso: 1, pctShelf: "0.2" }),
      lote({ dataValidade: "2099-09-01", quantidade: 7, peso: 3, vigente: false, motivoSaida: "vencido" }),
    ],
    ultima: ultima(), shelf: 55, produtoCodigo: "187001",
  });
  assert.equal(r.situacao, "rebaixa");
  assert.deepEqual(r.lotes.map((l) => l.status), ["rebaixa", "giro", "ok", "rebaixa"]);
  assert.deepEqual(r.lotes.map((l) => l.entraNaSoma), [true, true, false, false]);
  assert.deepEqual(r.lotes.map((l) => l.vigente), [true, true, true, false]);
  assert.equal(r.quantidade, 30);
  assert.equal(r.quantidadeTotal, 129);
  assert.equal(r.dataValidade.toISOString(), "2099-10-10T00:00:00.000Z");
  assert.equal(r.pctShelf, 0.8);
  assert.equal(r.shelf, 55);
  assert.equal(r.abaixoMinimo, false);
  assert.ok(!("peso" in r.lotes[0]), "peso nao vai para o documento");
  assert.equal(r.lotes[0].agente, "Ana");
  assert.equal(r.lotes[0].agenteCodigo, "12298");
});

test("so lotes ok: situacao ok, todos entram na soma; sem shelf: sem_shelf com todos na soma", () => {
  const ok = classificarItem({ lotes: [lote({ peso: 1, quantidade: 4 }), lote({ dataValidade: "2099-12-01", peso: 1, quantidade: 6 })], ultima: ultima(), shelf: 55 });
  assert.equal(ok.situacao, "ok");
  assert.equal(ok.quantidade, 10);
  assert.deepEqual(ok.lotes.map((l) => l.entraNaSoma), [true, true]);
  const sem = classificarItem({ lotes: [lote({ peso: 0, pctShelf: null })], ultima: ultima(), shelf: 0 });
  assert.equal(sem.situacao, "sem_shelf");
  assert.equal(sem.pctShelf, null);
  assert.equal(sem.quantidade, 10);
});

test("abaixoMinimo: soma vigente <= 5 (<= 2 para os quatro codigos de caixa)", () => {
  assert.equal(classificarItem({ lotes: [lote({ quantidade: 5 })], ultima: ultima(), produtoCodigo: "187001" }).abaixoMinimo, true);
  assert.equal(classificarItem({ lotes: [lote({ quantidade: 6 })], ultima: ultima(), produtoCodigo: "187001" }).abaixoMinimo, false);
  assert.equal(classificarItem({ lotes: [lote({ quantidade: 3 })], ultima: ultima(), produtoCodigo: "121035" }).abaixoMinimo, false);
  assert.equal(classificarItem({ lotes: [lote({ quantidade: 2 })], ultima: ultima(), produtoCodigo: "121035" }).abaixoMinimo, true);
});

test("todos os lotes vencidos/zerados com ultima contagem > 0: zerado (nao e 'nao reencontrado')", () => {
  const r = classificarItem({ lotes: [lote({ vigente: false, motivoSaida: "vencido" })], ultima: ultima({ quantidade: 10 }) });
  assert.equal(r.situacao, "zerado");
});

test("contagem > 0 sem nenhum lote (sem validade): sem_shelf com a quantidade contada", () => {
  const r = classificarItem({ lotes: [], ultima: ultima({ quantidade: 15 }), compra: compra() });
  assert.equal(r.situacao, "sem_shelf");
  assert.equal(r.quantidade, 15);
  assert.equal(r.quantidadeTotal, 15);
});

test("lerLinhaBi: tipos da consulta (numeric como texto, boolean, json) viram o que classificarItem espera", () => {
  const b = lerLinhaBi({
    codigo_destino: " 10752", nome_fantasia_dest: "POPULAR ", produto_codigo: 187001, produto_nome: "IOGURTE",
    shelf: "55", lotes: [lote()], ultima_qtd: "0", ultima_ruptura: true, ultima_contado_em: "2099-09-24T11:45",
    ultima_agente: "Ana", ultima_agente_codigo: 12298, visita_em: "2099-09-24T12:00", visita_por: "Ana ",
  });
  assert.equal(b.clienteCodigo, "10752");
  assert.equal(b.produtoCodigo, "187001");
  assert.equal(b.shelf, 55);
  assert.deepEqual(b.ultima, { quantidade: 0, emRuptura: true, contadoEm: "2099-09-24T11:45", agente: "Ana", agenteCodigo: 12298 });
  assert.equal(b.ultimaVisitaPor, "Ana");
  assert.equal(classificarItem({ lotes: b.lotes, ultima: b.ultima, shelf: b.shelf }).situacao, "ruptura");
  // linha sem lotes (COALESCE para '[]') e sem visita
  const vazia = lerLinhaBi({ codigo_destino: "1", produto_codigo: "2", lotes: [], ultima_qtd: 3, ultima_ruptura: false });
  assert.deepEqual(vazia.lotes, []);
  assert.equal(vazia.ultimaVisitaEm, null);
});

test("rupturasResolvidas: so quando ha contagem POSTERIOR com quantidade > 0", () => {
  const ativas = [
    { _id: "a", clienteCodigo: "1", produtoCodigo: "X", contadoEm: "2099-09-20T10:00" },
    { _id: "b", clienteCodigo: "1", produtoCodigo: "Y", contadoEm: "2099-09-20T10:00" },
    { _id: "c", clienteCodigo: "1", produtoCodigo: "Z", contadoEm: "2099-09-20T10:00" },
    { _id: "d", clienteCodigo: "2", produtoCodigo: "X", contadoEm: "2099-09-20T10:00" },
  ];
  const itens = new Map([
    ["1|X", { ultimaContagemEm: "2099-09-25T10:00", ultimaContagemQtd: 12 }], // resolvida
    ["1|Y", { ultimaContagemEm: "2099-09-25T10:00", ultimaContagemQtd: 0 }],  // ainda zero
    ["1|Z", { ultimaContagemEm: "2099-09-20T10:00", ultimaContagemQtd: 0 }],  // a mesma contagem
    // 2|X: sem contagem nos ultimos 30 dias (nao_contado) -> fica ativa
    ["2|X", { ultimaContagemEm: "2099-07-01T10:00", ultimaContagemQtd: null }],
  ]);
  assert.deepEqual(rupturasResolvidas(ativas, itens), [{ _id: "a", resolvidaEm: "2099-09-25T10:00", resolvidaQtd: 12 }]);
});

test("o SQL da visao mantem as regras do Painel e nao descarta nada", () => {
  assert.match(SQL_VISAO, /FROM public\.ativmob_estoque/);
  assert.match(SQL_VISAO, /BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE/);
  assert.match(SQL_VISAO, /DISTINCT ON \(codigo_destino, produto_codigo, data_validade\)/);
  assert.match(SQL_VISAO, /ROUND\(s\.shelf_dias \* 0\.73\)/);
  assert.match(SQL_VISAO, /ROUND\(s\.shelf_dias \* 0\.45\)/);
  assert.match(SQL_VISAO, /THEN 'vencido'/);
  assert.match(SQL_VISAO, /THEN 'zerado'/);
  assert.match(SQL_VISAO, /> 14 THEN 'nao_reencontrado'/);
  assert.match(SQL_VISAO, /= 'SIM'\) AS em_ruptura/);
  assert.match(SQL_VISAO, /BOOL_OR\(x\.em_ruptura\)/);
  // ruptura vem do evento (ultima contagem, inclusive sem validade), nao do lote
  assert.match(SQL_VISAO, /FROM ultima u/);
  assert.match(SQL_VISAO, /LEFT JOIN lotes_agg/);
  assert.doesNotMatch(SQL_VISAO, /estoque_total >/);
  assert.doesNotMatch(SQL_VISAO, /\$\{/);
  assert.match(SQL_CONTAGEM_ANTIGA, /CURRENT_DATE - 180 AND CURRENT_DATE - 31/);
  assert.doesNotMatch(SQL_CONTAGEM_ANTIGA, /\$\{/);
});
