const Encarte = require("../models/Encarte");
const { gerarPdfRede } = require("../services/pdfService");
const path = require("path");

/**
 * GET /api/encartes/pdf/rede/:codigoRede
 * Gera e retorna PDF com encartes/ofertas internas de uma rede.
 */
async function gerarPdfRede(req, res) {
  try {
    const { codigoRede } = req.params;
    const { nome: userName } = req.user || { nome: "Usuário" };

    if (!codigoRede) {
      return res.status(400).json({ error: "codigoRede é obrigatório" });
    }

    // Buscar encartes/ofertas da rede (exceto estoque que não é publicável)
    const encartes = await Encarte.find({ codigoRede })
      .select("_id nome tipo periodoInicio periodoFim itens")
      .lean();

    if (!encartes.length) {
      return res.status(404).json({ error: "Nenhum encarte ou oferta interna encontrado para esta rede" });
    }

    // Preparar info da rede para o PDF
    // (nota: poderia buscar nome da rede no Carteira, mas por agora usa código)
    const nomeRede = codigoRede;

    // Caminho da logo (arquivo público do frontend)
    const logoPath = path.join(__dirname, "../../frontend/public/logo.png");

    // Gerar PDF
    const pdfBuffer = await gerarPdfRede(nomeRede, userName, encartes, logoPath);

    // Retornar como anexo
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Encartes_${codigoRede}_${new Date().getTime()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF] Erro ao gerar PDF:", err);
    res.status(500).json({ error: err.message || "Erro ao gerar PDF" });
  }
}

module.exports = { gerarPdfRede };
