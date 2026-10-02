const test = require("node:test");
const assert = require("node:assert/strict");

const { montarDoc, montarLotes, SQL_ESTOQUE } = require("../../src/services/estoqueSyncService");

// Linha como a consulta devolve (lotes ja como array, do json_agg)
const linha = (extra = {}) => ({
  codigo_destino: "10752",
  nome_fantasia_dest: "POPULAR ATACADISTA",
  produto_codigo: "187001",
  produto_nome: "IOGURTE NATURAL INTEGRAL VALEMILK 150G",
  quantidade: 30,
  data_validade: new Date("2099-10-10T00:00:00.000Z"),
  shelf: 55,
  pct_shelf: "0.7455",
  status_shelf: "rebaixa",
  peso_max: 3,
  lotes: [
    { dataValidade: "2099-10-10", quantidade: 10, peso: 3, agente: "Ana ", agenteCodigo: 12298, contadoEm: "2099-09-24T11:45" },
    { dataValidade: "2099-10-20", quantidade: 20, peso: 2, agente: "Bruno", agenteCodigo: "13166", contadoEm: "2099-09-25T09:00" },
    { dataValidade: "2099-11-30", quantidade: 99, peso: 1, agente: "Carla", agenteCodigo: "1", contadoEm: "2099-09-26T08:00" },
  ],
  ...extra,
});

test("montarDoc: so os lotes em giro/rebaixa entram na soma; o lote ok fica registrado, fora dela", () => {
  const d = montarDoc(linha());
  assert.equal(d.chave, "10752|187001");
  assert.equal(d.quantidade, 30);
  assert.equal(d.lotes.length, 3);
  assert.deepEqual(d.lotes.map((l) => l.status), ["rebaixa", "giro", "ok"]);
  assert.deepEqual(d.lotes.map((l) => l.entraNaSoma), [true, true, false]);
  assert.equal(d.lotesNaSoma, 2);
  const soma = d.lotes.filter((l) => l.entraNaSoma).reduce((s, l) => s + l.quantidade, 0);
  assert.equal(soma, d.quantidade);
});

test("montarDoc: 'contado por' e a contagem mais recente ENTRE OS LOTES USADOS (o lote ok nao conta)", () => {
  const d = montarDoc(linha());
  assert.equal(d.contadoPor, "Bruno");
  assert.equal(d.contadoPorCodigo, "13166");
  assert.equal(d.contadoEm, "2099-09-25T09:00");
});

test("montarDoc: nome do agente aparado, codigo sempre texto, validade do lote como data UTC", () => {
  const d = montarDoc(linha());
  assert.equal(d.lotes[0].agente, "Ana");
  assert.equal(d.lotes[0].agenteCodigo, "12298");
  assert.equal(d.lotes[0].dataValidade.toISOString(), "2099-10-10T00:00:00.000Z");
  assert.equal(d.lotes[0].contadoEm, "2099-09-24T11:45");
});

test("item sem shelf (peso maximo 0): todos os lotes entram na soma", () => {
  const d = montarDoc(linha({
    peso_max: 0, status_shelf: "sem_shelf", shelf: null, pct_shelf: null, quantidade: 7,
    lotes: [
      { dataValidade: "2099-10-10", quantidade: 3, peso: 0, agente: "Ana", agenteCodigo: "1", contadoEm: "2099-09-24T11:45" },
      { dataValidade: "2099-10-20", quantidade: 4, peso: 0, agente: "Ana", agenteCodigo: "1", contadoEm: "2099-09-24T11:46" },
    ],
  }));
  assert.deepEqual(d.lotes.map((l) => l.entraNaSoma), [true, true]);
  assert.deepEqual(d.lotes.map((l) => l.status), ["sem_shelf", "sem_shelf"]);
  assert.equal(d.lotesNaSoma, 2);
  assert.equal(d.statusShelf, "sem_shelf");
  assert.equal(d.pctShelf, null);
  assert.equal(d.shelf, 0);
});

test("lote sem agente (contagem nao localizada) e linha sem lotes nao quebram", () => {
  const d = montarDoc(linha({ lotes: [{ dataValidade: "2099-10-10", quantidade: 30, peso: 3, agente: null, agenteCodigo: null, contadoEm: null }] }));
  assert.equal(d.contadoPor, null);
  assert.equal(d.contadoEm, null);
  assert.equal(d.lotesNaSoma, 1);
  assert.deepEqual(montarLotes(null, 3), []);
  assert.equal(montarDoc(linha({ lotes: undefined })).lotes.length, 0);
});

test("o documento nao carrega mais o campo raw", () => {
  assert.equal("raw" in montarDoc(linha()), false);
});

test("lote de visita anterior (nao recontado) entra normalmente na soma e fica identificado", () => {
  const d = montarDoc(linha({
    quantidade: 730,
    lotes: [
      { dataValidade: "2099-10-10", quantidade: 720, peso: 3, agente: "Ana", agenteCodigo: "1", contadoEm: "2099-09-24T11:45", naUltimaVisita: false },
      { dataValidade: "2099-10-20", quantidade: 10, peso: 2, agente: "Ana", agenteCodigo: "1", contadoEm: "2099-10-02T11:23", naUltimaVisita: true },
      { dataValidade: "2099-11-21", quantidade: 104, peso: 1, agente: "Ana", agenteCodigo: "1", contadoEm: "2099-10-02T11:23", naUltimaVisita: true },
    ],
  }));
  assert.deepEqual(d.lotes.map((l) => l.naUltimaVisita), [false, true, true]);
  assert.deepEqual(d.lotes.map((l) => l.entraNaSoma), [true, true, false]);
  assert.equal(d.lotesNaSoma, 2);
  assert.equal(d.contadoEm, "2099-10-02T11:23"); // a contagem mais recente entre os lotes usados
  // consulta antiga (sem o campo) continua valendo como "na ultima visita"
  assert.equal(montarDoc(linha()).lotes.every((l) => l.naUltimaVisita === true), true);
});

test("o SQL mantem a regra do shelf (45% giro, 73% rebaixa) e a regra de quais lotes valem", () => {
  assert.match(SQL_ESTOQUE, /ROUND\(s\.shelf_dias \* 0\.73\)/);
  assert.match(SQL_ESTOQUE, /ROUND\(s\.shelf_dias \* 0\.45\)/);
  assert.match(SQL_ESTOQUE, /WHERE peso_max >= 2 OR peso_max = 0/);
  // fonte: tabela de contagens, janela de 15 dias, ultima contagem DE CADA LOTE
  assert.match(SQL_ESTOQUE, /FROM public\.ativmob_estoque/);
  assert.doesNotMatch(SQL_ESTOQUE, /vw_ativmob_estoque_critico/);
  assert.match(SQL_ESTOQUE, /BETWEEN CURRENT_DATE - 15 AND CURRENT_DATE/);
  assert.match(SQL_ESTOQUE, /DISTINCT ON \(codigo_destino, produto_codigo, data_validade\)/);
  // saida do lote: vencido, zerado, ou visita posterior sem o produto
  assert.match(SQL_ESTOQUE, /u\.data_validade > CURRENT_DATE/);
  assert.match(SQL_ESTOQUE, /u\.quantidade > 0/);
  assert.match(SQL_ESTOQUE, /u\.data_visita >= z\.data_zero/);
  // minimo de unidades na loja: 2 para os quatro codigos, 5 para os demais
  assert.match(SQL_ESTOQUE, /IN \('121035', '121135', '121235', '121835'\) THEN 2 ELSE 5/);
  assert.doesNotMatch(SQL_ESTOQUE, /\$\{/); // nenhuma interpolacao ficou sem resolver
});
