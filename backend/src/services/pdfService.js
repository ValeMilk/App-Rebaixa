const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

// Cores da paleta do sistema
const COLORS = {
  brand: "#0066CC",      // Azul principal
  brandLight: "#E6F2FF", // Azul claro para backgrounds
  text: "#1a1a1a",       // Texto principal
  textGray: "#666666",   // Texto secundário
  success: "#10B981",    // Verde para negociado
  border: "#E5E7EB",     // Bordas
  white: "#FFFFFF"
};

/**
 * Gera PDF personalizado com encartes/ofertas internas de uma rede.
 * Inclui: logo, nome do usuário, data/hora, produtos com preços.
 */
async function gerarPdfRede(nomeRede, userName, encartes, logoPath) {
  return new Promise((resolve, reject) => {
    try {
      console.log("[pdfService] ========================================");
      console.log("[pdfService] INICIANDO GERAÇÃO DO PDF");
      console.log("[pdfService] Rede:", nomeRede);
      console.log("[pdfService] Usuário:", userName);
      console.log("[pdfService] Total de encartes:", encartes.length);
      console.log("[pdfService] ========================================");
      
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      
      // Coleta o PDF em buffer
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        console.log("[pdfService] ✅ PDF finalizado, buffer criado");
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", (err) => {
        console.error("[pdfService] ❌ Erro no PDF document:", err);
        reject(err);
      });

      // ========== HEADER COM FUNDO COLORIDO ==========
      doc.rect(0, 0, 595, 100).fill(COLORS.brand);
      
      // Logo (se existir)
      const logoBackendPath = path.join(__dirname, "../assets/logo.png");
      if (fs.existsSync(logoBackendPath)) {
        try {
          doc.image(logoBackendPath, 50, 25, { width: 50, height: 50 });
        } catch (err) {
          console.warn("[PDF] Erro ao carregar logo:", err.message);
        }
      }

      // Informações do header (branco sobre azul)
      doc.fillColor(COLORS.white).fontSize(18).font("Helvetica-Bold")
        .text(nomeRede, 120, 30, { width: 400 });
      
      const now = new Date();
      const dataFormatada = now.toLocaleDateString("pt-BR");
      const horaFormatada = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      
      doc.fontSize(10).font("Helvetica")
        .text(`Impresso por: ${userName}`, 120, 55, { width: 400 })
        .text(`${dataFormatada} às ${horaFormatada}`, 120, 70, { width: 400 });

      // ========== CORPO DO PDF ==========
      let currentY = 130;

      console.log("[pdfService] Agrupando encartes por período...");
      // Agrupar encartes por período
      const periodos = agruparPorPeriodo(encartes);
      console.log(`[pdfService] Períodos agrupados: ${periodos.length}`);

      if (periodos.length === 0) {
        console.log("[pdfService] ⚠️ Nenhum período após agrupamento");
        doc.fillColor(COLORS.text).fontSize(12)
          .text("Nenhum encarte ou oferta interna para este período.", 50, currentY);
        doc.end();
        return;
      }

      console.log("[pdfService] Gerando conteúdo do PDF...");
      // Iterar por períodos
      periodos.forEach((periodo, idx) => {
        console.log(`[pdfService]   Período ${idx + 1}/${periodos.length}: ${periodo.inicio} - ${periodo.fim}`);
        // Verificar se precisa de nova página
        if (currentY > 680) {
          doc.addPage();
          currentY = 50;
        }

        // Box do período
        doc.roundedRect(50, currentY, 495, 35, 5).fill(COLORS.brandLight);
        
        doc.fillColor(COLORS.brand).fontSize(13).font("Helvetica-Bold")
          .text(`Período: ${formatarData(periodo.inicio)} - ${formatarData(periodo.fim)}`, 
                60, currentY + 12);
        
        currentY += 50;

        // ENCARTES
        const encartesDoPeriodo = periodo.itens.filter(e => e.tipo !== "oferta_interna");
        if (encartesDoPeriodo.length > 0) {
          doc.fillColor(COLORS.text).fontSize(11).font("Helvetica-Bold")
            .text("ENCARTES", 60, currentY);
          currentY += 20;

          encartesDoPeriodo.forEach((encarte) => {
            if (currentY > 700) {
              doc.addPage();
              currentY = 50;
            }

            // Nome do encarte
            doc.fillColor(COLORS.text).fontSize(10).font("Helvetica-Bold")
              .text(encarte.nome, 70, currentY);
            currentY += 15;

            // Produtos do encarte
            if (encarte.itens && encarte.itens.length > 0) {
              encarte.itens.forEach((item) => {
                if (currentY > 720) {
                  doc.addPage();
                  currentY = 50;
                }

                const produtoNome = item.produto || "Produto sem nome";
                const precoOferta = item.precoOferta ? formatarPreco(item.precoOferta) : "N/A";
                const negociado = item.negociado ? " ✓" : "";

                doc.fillColor(COLORS.textGray).fontSize(9).font("Helvetica")
                  .text(`   • ${produtoNome}`, 80, currentY, { continued: true })
                  .fillColor(COLORS.success).font("Helvetica-Bold")
                  .text(` - R$ ${precoOferta}${negociado}`, { align: "left" });
                
                currentY += 14;
              });
              currentY += 5;
            } else {
              doc.fillColor(COLORS.textGray).fontSize(9).font("Helvetica-Oblique")
                .text("   Sem produtos cadastrados", 80, currentY);
              currentY += 18;
            }
          });
        }

        // OFERTAS INTERNAS
        const ofertasDoPeriodo = periodo.itens.filter(e => e.tipo === "oferta_interna");
        if (ofertasDoPeriodo.length > 0) {
          if (encartesDoPeriodo.length > 0) currentY += 10;
          
          doc.fillColor(COLORS.text).fontSize(11).font("Helvetica-Bold")
            .text("OFERTAS INTERNAS", 60, currentY);
          currentY += 20;

          ofertasDoPeriodo.forEach((oferta) => {
            if (currentY > 700) {
              doc.addPage();
              currentY = 50;
            }

            // Nome da oferta
            doc.fillColor(COLORS.text).fontSize(10).font("Helvetica-Bold")
              .text(oferta.nome, 70, currentY);
            currentY += 15;

            // Produtos da oferta
            if (oferta.itens && oferta.itens.length > 0) {
              oferta.itens.forEach((item) => {
                if (currentY > 720) {
                  doc.addPage();
                  currentY = 50;
                }

                const produtoNome = item.produto || "Produto sem nome";
                const precoOferta = item.precoOferta ? formatarPreco(item.precoOferta) : "N/A";
                const negociado = item.negociado ? " ✓" : "";

                doc.fillColor(COLORS.textGray).fontSize(9).font("Helvetica")
                  .text(`   • ${produtoNome}`, 80, currentY, { continued: true })
                  .fillColor(COLORS.success).font("Helvetica-Bold")
                  .text(` - R$ ${precoOferta}${negociado}`, { align: "left" });
                
                currentY += 14;
              });
              currentY += 5;
            } else {
              doc.fillColor(COLORS.textGray).fontSize(9).font("Helvetica-Oblique")
                .text("   Sem produtos cadastrados", 80, currentY);
              currentY += 18;
            }
          });
        }

        currentY += 20; // Espaço entre períodos
      });

      console.log("[pdfService] Conteúdo gerado, adicionando rodapé...");
      // ========== RODAPÉ ==========
      const pageCount = doc.bufferedPageRange().count;
      console.log(`[pdfService] Total de páginas: ${pageCount}`);
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor(COLORS.textGray)
          .text("Gerado automaticamente pelo Sistema Rebaixa", 50, 770, { 
            align: "center",
            width: 495
          });
      }

      console.log("[pdfService] Finalizando documento PDF...");
      doc.end();
    } catch (err) {
      console.error("[pdfService] ❌❌❌ ERRO NA GERAÇÃO:", err.message);
      console.error("[pdfService] Stack:", err.stack);
      reject(err);
    }
  });
}

/**
 * Agrupa encartes por período (periodoInicio → periodoFim).
 * Mantém os itens (produtos) dentro de cada encarte.
 */
function agruparPorPeriodo(encartes) {
  const periodos = {};

  encartes.forEach((e) => {
    if (!e.periodoInicio || !e.periodoFim) {
      console.warn("[pdfService] Encarte sem período:", e._id, e.nome);
      return; // Pula encartes sem período definido
    }
    
    const key = `${e.periodoInicio}__${e.periodoFim}`;
    if (!periodos[key]) {
      periodos[key] = {
        inicio: e.periodoInicio,
        fim: e.periodoFim,
        itens: [],
      };
    }
    periodos[key].itens.push({
      nome: e.nome || "Sem nome",
      tipo: e.tipo || "encarte",
      itens: Array.isArray(e.itens) ? e.itens : [], // Array de produtos
    });
  });

  // Converter para array e ordenar por data
  return Object.values(periodos).sort((a, b) => {
    const dataA = new Date(a.inicio);
    const dataB = new Date(b.inicio);
    return dataA - dataB;
  });
}

/**
 * Formata data para PT-BR (DD/MM/YYYY).
 */
function formatarData(dataStr) {
  if (!dataStr) return "N/A";
  const date = new Date(dataStr);
  return date.toLocaleDateString("pt-BR");
}

/**
 * Formata preço para exibição (ex: 12.50 → "12,50").
 */
function formatarPreco(valor) {
  if (!valor && valor !== 0) return "N/A";
  return Number(valor).toFixed(2).replace(".", ",");
}

module.exports = {
  gerarPdfRede,
};
