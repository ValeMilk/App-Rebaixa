const Encarte = require("../models/Encarte");
const Carteira = require("../models/Carteira");
const pdfService = require("../services/pdfService");

/**
 * GET /api/encartes/pdf/rede/:codigoRede?periodo_inicio=YYYY-MM-DD&periodo_fim=YYYY-MM-DD
 * Gera e retorna PDF com encartes/ofertas internas de uma rede.
 * Query params opcionais:
 *   - periodo_inicio: Filtra apenas encartes que começam a partir desta data
 *   - periodo_fim: Filtra apenas encartes que terminam até esta data
 */
async function gerarPdfRede(req, res) {
  try {
    const { codigoRede } = req.params;
    const { periodo_inicio, periodo_fim } = req.query;
    const { nome: userName } = req.user || { nome: "Usuário" };

    if (!codigoRede) {
      return res.status(400).json({ error: "codigoRede é obrigatório" });
    }

    // Buscar encartes/ofertas da rede com os produtos
    let query = Encarte.find({ codigoRede })
      .select("_id nome tipo periodoInicio periodoFim itens")
      .lean();

    // Filtrar por período se informado
    if (periodo_inicio || periodo_fim) {
      const filters = {};
      if (periodo_inicio) {
        filters.periodoFim = { $gte: new Date(periodo_inicio) };
      }
      if (periodo_fim) {
        filters.periodoInicio = { $lte: new Date(periodo_fim) };
      }
      query = Encarte.find({ codigoRede, ...filters })
        .select("_id nome tipo periodoInicio periodoFim itens")
        .lean();
    }

    const encartes = await query;

    if (!encartes.length) {
      return res.status(404).json({ error: "Nenhum encarte ou oferta interna encontrado para esta rede e período" });
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
