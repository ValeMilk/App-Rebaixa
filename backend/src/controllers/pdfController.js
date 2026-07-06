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

    console.log("[PDF] Iniciando geração:", { codigoRede, periodo_inicio, periodo_fim });

    if (!codigoRede) {
      return res.status(400).json({ error: "codigoRede é obrigatório" });
    }

    // Construir filtros para buscar encartes/ofertas
    const filters = { codigoRede };
    
    // Filtrar por período se informado
    if (periodo_inicio || periodo_fim) {
      console.log("[PDF] Aplicando filtro de período");
      if (periodo_inicio) {
        filters.periodoFim = { $gte: new Date(periodo_inicio) };
      }
      if (periodo_fim) {
        filters.periodoInicio = { $lte: new Date(periodo_fim) };
      }
    }

    console.log("[PDF] Filtros:", filters);

    // Buscar encartes/ofertas da rede com os produtos
    const encartes = await Encarte.find(filters)
      .select("_id nome tipo periodoInicio periodoFim itens")
      .lean();

    console.log("[PDF] Encartes encontrados:", encartes.length);

    if (!encartes.length) {
      return res.status(404).json({ error: "Nenhum encarte ou oferta interna encontrado para esta rede e período" });
    }

    // Buscar nome da rede no Carteira (se existir)
    const carteira = await Carteira.findOne({ codigoRede }).select("redeSubrede").lean();
    const nomeRede = carteira?.redeSubrede || `Rede ${codigoRede}`;

    console.log("[PDF] Gerando PDF...");

    // Gerar PDF
    const pdfBuffer = await pdfService.gerarPdfRede(nomeRede, userName, encartes);

    console.log("[PDF] PDF gerado com sucesso, enviando...");

    // Retornar como anexo
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Encartes_${codigoRede}_${new Date().getTime()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF] ERRO COMPLETO:", err);
    console.error("[PDF] Stack trace:", err.stack);
    res.status(500).json({ error: err.message || "Erro ao gerar PDF", stack: err.stack });
  }
}

module.exports = { gerarPdfRede };
