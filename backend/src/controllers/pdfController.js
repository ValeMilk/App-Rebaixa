const Encarte = require("../models/Encarte");
const Carteira = require("../models/Carteira");
const pdfService = require("../services/pdfService");

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

    // Buscar encartes/ofertas da rede com os produtos
    const encartes = await Encarte.find({ codigoRede })
      .select("_id nome tipo periodoInicio periodoFim itens")
      .lean();

    if (!encartes.length) {
      return res.status(404).json({ error: "Nenhum encarte ou oferta interna encontrado para esta rede" });
    }

    // Buscar nome da rede no Carteira (se existir)
    const carteira = await Carteira.findOne({ codigoRede }).select("redeSubrede").lean();
    const nomeRede = carteira?.redeSubrede || `Rede ${codigoRede}`;

    // Gerar PDF
    const pdfBuffer = await pdfService.gerarPdfRede(nomeRede, userName, encartes);

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


module.exports = { gerarPdfRede };
