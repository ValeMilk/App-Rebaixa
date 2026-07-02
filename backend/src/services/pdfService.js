const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

/**
 * Gera PDF personalizado com encartes/ofertas internas de uma rede.
 * Inclui: logo, nome do usuário, data/hora, e agrupamento por período.
 */
async function gerarPdfRede(nomeRede, userName, encartes, logoPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      
      // Coleta o PDF em buffer
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on("error", reject);

      // ========== HEADER ==========
      const logoY = 30;
      
      // Adicionar logo se existe
      if (logoPath && fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 40, logoY, { width: 60, height: 60 });
        } catch (err) {
          console.warn("[PDF] Erro ao carregar logo:", err.message);
        }
      }

      // Informações do header (lado direito)
      const infoX = 120;
      doc.fontSize(16).font("Helvetica-Bold").text(nomeRede, infoX, logoY, { width: 400 });
      
      const now = new Date();
      const dataFormatada = now.toLocaleDateString("pt-BR");
      const horaFormatada = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      
      doc.fontSize(11).font("Helvetica").text(`Impresso por: ${userName}`, infoX, logoY + 30, { width: 400 });
      doc.fontSize(11).text(`Data: ${dataFormatada}  Hora: ${horaFormatada}`, infoX, logoY + 48, { width: 400 });

      // Linha separadora
      doc.moveTo(40, 110).lineTo(555, 110).stroke();
      
      // ========== CORPO DO PDF ==========
      let currentY = 130;

      // Agrupar encartes por período
      const periodos = agruparPorPeriodo(encartes);

      if (periodos.length === 0) {
        doc.fontSize(12).text("Nenhum encarte ou oferta interna para este período.", 40, currentY);
        doc.end();
        return;
      }

      // Iterar por períodos
      periodos.forEach((periodo, idx) => {
        // Verificar se precisa de nova página
        if (currentY > 700) {
          doc.addPage();
          currentY = 40;
        }

        // Título do período
        doc.fontSize(13).font("Helvetica-Bold")
          .text(`Período: ${formatarData(periodo.inicio)} - ${formatarData(periodo.fim)}`, 40, currentY);
        currentY += 25;

        // ENCARTES (coloridos)
        const encartesDoPeriodo = periodo.itens.filter(e => e.tipo !== "oferta_interna");
        if (encartesDoPeriodo.length > 0) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#333333")
            .text("ENCARTES", 45, currentY);
          currentY += 18;

          encartesDoPeriodo.forEach((encarte) => {
            if (currentY > 720) {
              doc.addPage();
              currentY = 40;
            }

            // Bullet + dados
            doc.fontSize(10).font("Helvetica").fillColor("#000000");
            const texto = `• ${encarte.nome} (${encarte.itensQtd || 0} produtos)`;
            doc.text(texto, 50, currentY);
            
            currentY += 15;
          });
        }

        // OFERTAS INTERNAS (preto)
        const ofertasDoPeriodo = periodo.itens.filter(e => e.tipo === "oferta_interna");
        if (ofertasDoPeriodo.length > 0) {
          if (encartesDoPeriodo.length > 0) currentY += 8;
          
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a1a")
            .text("OFERTAS INTERNAS", 45, currentY);
          currentY += 18;

          ofertasDoPeriodo.forEach((oferta) => {
            if (currentY > 720) {
              doc.addPage();
              currentY = 40;
            }

            doc.fontSize(10).font("Helvetica").fillColor("#000000");
            const texto = `• ${oferta.nome} (${oferta.itensQtd || 0} produtos)`;
            doc.text(texto, 50, currentY);
            
            currentY += 15;
          });
        }

        currentY += 15; // Espaço entre períodos
      });

      // ========== RODAPÉ ==========
      doc.fontSize(9).fillColor("#999999")
        .text("Gerado automaticamente pelo sistema Rebaixa", 40, 750, { align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Agrupa encartes por período (periodoInicio → periodoFim).
 */
function agruparPorPeriodo(encartes) {
  const periodos = {};

  encartes.forEach((e) => {
    const key = `${e.periodoInicio}__${e.periodoFim}`;
    if (!periodos[key]) {
      periodos[key] = {
        inicio: e.periodoInicio,
        fim: e.periodoFim,
        itens: [],
      };
    }
    periodos[key].itens.push({
      nome: e.nome,
      tipo: e.tipo,
      itensQtd: (e.itens && e.itens.length) || 0,
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

module.exports = {
  gerarPdfRede,
};
