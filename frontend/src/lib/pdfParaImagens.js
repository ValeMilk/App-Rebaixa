// Converte as paginas de um PDF em imagens, no navegador (pdf.js embutido em /noprecache/pdfjs).
// So a tela de importacao do admin usa isto; o servidor recebe as imagens prontas.

const SCRIPT = "/noprecache/pdfjs/pdf.min.js";
const WORKER = "/noprecache/pdfjs/pdf.worker.min.js";
const LARGURA_ALVO = 1800; // px da pagina renderizada (texto legivel ao ampliar)
const ALTURA_MAXIMA = 5000;
const LARGURA_MINIATURA = 560;

let carregando = null;

/** Carrega o pdf.js uma vez e devolve a biblioteca. */
export function carregarPdfJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("O leitor de PDF só roda no navegador."));
  const pronta = window["pdfjs-dist/build/pdf"];
  if (pronta) return Promise.resolve(pronta);
  if (!carregando) {
    carregando = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => {
        const lib = window["pdfjs-dist/build/pdf"];
        if (!lib) {
          carregando = null;
          return reject(new Error("O leitor de PDF não carregou."));
        }
        lib.GlobalWorkerOptions.workerSrc = WORKER;
        resolve(lib);
      };
      s.onerror = () => {
        carregando = null;
        reject(new Error("Não foi possível carregar o leitor de PDF. Recarregue a página e tente de novo."));
      };
      document.head.appendChild(s);
    });
  }
  return carregando;
}

const paraBlob = (canvas, tipo, qualidade) =>
  new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível gerar a imagem da página."))), tipo, qualidade));

/** Abre o PDF e devolve o documento (`numPages` paginas). */
export async function abrirPdf(arquivo) {
  const lib = await carregarPdfJs();
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  try {
    return await lib.getDocument({ data: dados }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") throw new Error("O PDF está protegido por senha.");
    throw new Error("Não foi possível ler este arquivo como PDF.");
  }
}

/** Renderiza a pagina `numero` (1..N): PNG em tamanho cheio + miniatura JPEG. */
export async function renderizarPagina(pdf, numero) {
  const pagina = await pdf.getPage(numero);
  try {
    const base = pagina.getViewport({ scale: 1 });
    const escala = Math.min(LARGURA_ALVO / base.width, ALTURA_MAXIMA / base.height, 4);
    const viewport = pagina.getViewport({ scale: escala });
    const largura = Math.max(1, Math.round(viewport.width));
    const altura = Math.max(1, Math.round(viewport.height));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // PDF sem fundo vira branco, nao transparente
    ctx.fillRect(0, 0, largura, altura);
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    const blob = await paraBlob(canvas, "image/png");

    const mini = document.createElement("canvas");
    mini.width = Math.min(LARGURA_MINIATURA, largura);
    mini.height = Math.max(1, Math.round((altura * mini.width) / largura));
    const mctx = mini.getContext("2d");
    mctx.fillStyle = "#ffffff";
    mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.drawImage(canvas, 0, 0, mini.width, mini.height);
    const miniatura = await paraBlob(mini, "image/jpeg", 0.82);

    canvas.width = canvas.height = 0;
    mini.width = mini.height = 0;
    return { numero, blob, largura, altura, miniatura };
  } finally {
    pagina.cleanup();
  }
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Fechamento_Setembro_2026.pdf" -> { titulo: "Fechamento Setembro 2026", referencia: "2026-09" } (referencia so se achar mes e ano). */
export function sugerirTitulo(nomeArquivo) {
  const titulo = String(nomeArquivo || "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const limpo = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const mes = MESES.findIndex((m) => limpo.includes(m));
  const ano = limpo.match(/\b(20\d{2})\b/);
  const referencia = mes >= 0 && ano ? `${ano[1]}-${String(mes + 1).padStart(2, "0")}` : "";
  return { titulo, referencia };
}

/** Sugestao para um relatorio feito de varios PDFs: "Relatório de setembro/2026" se algum nome trouxer mes e ano. */
export function sugerirParaVarios(nomes) {
  const sugestoes = (nomes || []).map(sugerirTitulo);
  if (sugestoes.length === 0) return { titulo: "", referencia: "" };
  if (sugestoes.length === 1) return sugestoes[0];
  const comMes = sugestoes.find((s) => s.referencia);
  if (comMes) return { titulo: `Relatório de ${rotuloReferencia(comMes.referencia)}`, referencia: comMes.referencia };
  return { titulo: sugestoes[0].titulo, referencia: "" };
}

/** "2026-09" -> "setembro/2026" */
export function rotuloReferencia(ref) {
  const m = String(ref || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const nome = MESES[Number(m[2]) - 1];
  return nome ? `${nome === "marco" ? "março" : nome}/${m[1]}` : "";
}
