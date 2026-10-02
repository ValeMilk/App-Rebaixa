const test = require("node:test");
const assert = require("node:assert/strict");

const {
  palavrasDaLoja, prefixoComumDeNomes, nomeSugeridoDeSubrede, sugerirNomesDeLojas, pontuarLoja,
} = require("../../src/services/integracaoEstoque/lojas");
const {
  gramaturaDoProduto, termosDoProduto, pontuarProduto, sugerirProdutos,
  sugestaoPreSelecionada, preSelecoesComTrava,
} = require("../../src/services/integracaoEstoque/produtos");

// ── Lojas ───────────────────────────────────────────────────────────────────────

test("palavrasDaLoja: tira UF, acento e pontuacao", () => {
  assert.deepEqual(palavrasDaLoja("MATEUS SUPERMERCADOS S.A. MIX ITAPIPOCA - CE"),
    ["MATEUS", "SUPERMERCADOS", "S", "A", "MIX", "ITAPIPOCA"]);
});

test("nome sugerido: remove prefixo comum e termos genericos; conectivos ficam minusculos", () => {
  const razoes = [
    "MATEUS SUPERMERCADOS S.A. MIX ITAPIPOCA - CE",
    "MATEUS SUPERMERCADOS S.A. MIX JUAZEIRO DO NORTE - CE",
    "MATEUS SUPERMERCADOS S.A. MIX ZE WALTER - CE",
  ];
  assert.deepEqual(sugerirNomesDeLojas(razoes), ["Itapipoca", "Juazeiro do Norte", "Ze Walter"]);
});

test("nome sugerido: com uma loja so, usa so os termos genericos (sem comer o nome inteiro)", () => {
  assert.deepEqual(sugerirNomesDeLojas(["MATEUS SUPERMERCADOS S.A. MIX ITAPIPOCA - CE"]), ["Mateus Supermercados S A Mix Itapipoca"]);
});

test("prefixoComumDeNomes: so ate a primeira divergencia", () => {
  assert.deepEqual(prefixoComumDeNomes([["A", "B", "C"], ["A", "B", "D"]]), ["A", "B"]);
  assert.deepEqual(prefixoComumDeNomes([["A"]]), []);
});

test("pontuarLoja: casa 'MIX ZE WALTER' com 'MATEUS - JOSE WALTER' (bandeira removida, apelido expandido)", () => {
  const p = pontuarLoja("MATEUS SUPERMERCADOS S.A. MIX ZE WALTER", "MATEUS - JOSE WALTER", ["MATEUS"]);
  assert.equal(p, 1);
  assert.ok(pontuarLoja("MIX ITAPIPOCA", "MATEUS - JOSE WALTER", ["MATEUS"]) < 0.5);
});

// ── Produtos ────────────────────────────────────────────────────────────────────

test("gramaturaDoProduto", () => {
  assert.deepEqual(gramaturaDoProduto("IOG MORANGO 170G"), { tipo: "gramas", valor: 170 });
  assert.deepEqual(gramaturaDoProduto("QUEIJO 1,250KG"), { tipo: "gramas", valor: 1250 });
  assert.deepEqual(gramaturaDoProduto("QUEIJO 1,25KG"), { tipo: "gramas", valor: 1250 });
  assert.deepEqual(gramaturaDoProduto("QUEIJO COALHO BARRA KG"), { tipo: "peso_variavel" });
  assert.deepEqual(gramaturaDoProduto("MANTEIGA"), { tipo: "desconhecida" });
});

test("termosDoProduto: expande abreviacoes, tira marca e gramatura, ZERO absorve LACTOSE", () => {
  assert.deepEqual([...termosDoProduto("IOG MOR 170G VALE MILK")].sort(), ["IOGURTE", "MORANGO"]);
  assert.deepEqual([...termosDoProduto("BEB LACT MIILK SF")].sort(), ["BEBIDA", "FRUTAS", "LACTEA", "SALADA"]);
  assert.ok(!termosDoProduto("REQ ZERO LACTOSE 200G").has("LACTOSE"));
  assert.ok(!termosDoProduto("REQUEIJAO ZERO LAC VALEMILK 200G").has("LAC"));
  assert.ok(termosDoProduto("BEB LACTEA").has("LACTEA"));
});

const CATALOGO = [
  { produtoId: "p1", codigo: "1", descricao: "IOGURTE MORANGO VALEMILK 170G", ativo: true },
  { produtoId: "p2", codigo: "2", descricao: "IOGURTE WHEY MORANGO VALEMILK 170G", ativo: true },
  { produtoId: "p3", codigo: "3", descricao: "IOGURTE MORANGO VALEMILK 900G", ativo: true },
  { produtoId: "p4", codigo: "4", descricao: "QUEIJO COALHO TRADICIONAL VALEMILK 500G", ativo: true },
  { produtoId: "p5", codigo: "5", descricao: "IOGURTE MORANGO VALEMILK 170G", ativo: false },
];

test("pontuarProduto: mesma gramatura vence; gramatura diferente penaliza forte; termo de linha penaliza", () => {
  const igual = pontuarProduto("IOG MORANGO 170G", CATALOGO[0]);
  const gram = pontuarProduto("IOG MORANGO 170G", CATALOGO[2]);
  const whey = pontuarProduto("IOG MORANGO 170G", CATALOGO[1]);
  assert.equal(igual.pontuacao, 1);
  assert.ok(gram.pontuacao < igual.pontuacao * 0.6);
  assert.ok(whey.pontuacao < igual.pontuacao);
  assert.ok(igual.motivos.some((m) => m.includes("gramatura igual (170 g)")));
  assert.ok(whey.motivos.some((m) => m.includes("WHEY")));
});

test("pontuarProduto: nome sem variante e implicitamente 'tradicional'", () => {
  const sem = pontuarProduto("QUEIJO COALHO 500G", CATALOGO[3]);
  assert.ok(sem.pontuacao > 0.9);
});

test("pontuarProduto: inativo e candidato mas pontua um pouco menos", () => {
  const ativo = pontuarProduto("IOG MORANGO 170G", CATALOGO[0]).pontuacao;
  const inativo = pontuarProduto("IOG MORANGO 170G", CATALOGO[4]).pontuacao;
  assert.ok(inativo < ativo && inativo > ativo * 0.95);
});

test("sugerirProdutos: top-3 ordenado, sem pontuacao zero; empate mantem a ordem do catalogo", () => {
  const s = sugerirProdutos("IOG MORANGO 170G", CATALOGO, 3);
  assert.equal(s.length, 3);
  assert.equal(s[0].produtoId, "p1");
  assert.ok(s[0].pontuacao >= s[1].pontuacao && s[1].pontuacao >= s[2].pontuacao);
  assert.equal(sugerirProdutos("XYZ QWERTY", CATALOGO).length, 0);
  const empatado = sugerirProdutos("IOGURTE", [
    { produtoId: "a", descricao: "IOGURTE A", ativo: true }, { produtoId: "b", descricao: "IOGURTE B", ativo: true },
  ]);
  assert.deepEqual(empatado.map((x) => x.produtoId), ["a", "b"]);
});

test("pre-selecao: so marca quando a melhor e boa (>= 0,8) e se destaca da segunda (>= 0,1)", () => {
  assert.equal(sugestaoPreSelecionada([{ pontuacao: 0.79 }]), null);
  assert.equal(sugestaoPreSelecionada([{ pontuacao: 0.9 }, { pontuacao: 0.85 }]), null); // empate tecnico
  assert.equal(sugestaoPreSelecionada([{ pontuacao: 0.9 }, { pontuacao: 0.7 }]).pontuacao, 0.9);
  assert.equal(sugestaoPreSelecionada([{ pontuacao: 0.8 }]).pontuacao, 0.8);
  assert.equal(sugestaoPreSelecionada([]), null);
});

test("TRAVA DE LOTE: dois codigos apontando para o MESMO item nao vem marcados nenhum dos dois", () => {
  const real = [{ produtoId: "X", pontuacao: 0.81 }, { produtoId: "Y", pontuacao: 0.5 }];
  const fantasma = [{ produtoId: "X", pontuacao: 0.95 }, { produtoId: "Y", pontuacao: 0.4 }];
  const outro = [{ produtoId: "Z", pontuacao: 0.9 }];
  const r = preSelecoesComTrava([
    { codigo: "real", sugestoes: real },
    { codigo: "fantasma", sugestoes: fantasma },
    { codigo: "outro", sugestoes: outro },
  ]);
  assert.equal(r.get("real").sugestao, null);
  assert.equal(r.get("fantasma").sugestao, null);
  assert.equal(r.get("fantasma").motivo, "outro codigo tambem aponta para este item");
  assert.equal(r.get("outro").sugestao.produtoId, "Z");
});

test("TRAVA DE LOTE: item do catalogo ja vinculado a OUTRO codigo do cliente nao vem marcado", () => {
  const sug = [{ produtoId: "X", pontuacao: 0.95 }];
  const antes = new Map([["X", new Set(["codigo-antigo"])]]);
  const r = preSelecoesComTrava([{ codigo: "novo", sugestoes: sug }], antes);
  assert.equal(r.get("novo").sugestao, null);
  assert.equal(r.get("novo").motivo, "ja vinculado a outro codigo");
  // o proprio codigo ja vinculado ao item nao e "outro"
  const mesmo = preSelecoesComTrava([{ codigo: "codigo-antigo", sugestoes: sug }], antes);
  assert.equal(mesmo.get("codigo-antigo").sugestao.produtoId, "X");
});
