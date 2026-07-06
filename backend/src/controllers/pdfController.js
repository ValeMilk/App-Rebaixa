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

    console.log("[PDF] Iniciando geração:", { codigoRede, periodo_inicio, periodo_fim, userName });

    if (!codigoRede) {
      return res.status(400).json({ error: "codigoRede é obrigatório" });
    }

    // Construir filtros para buscar encartes/ofertas
    const filters = { codigoRede: Number(codigoRede) };
    
    // Filtrar por período se informado
    // Lógica: busca encartes que se SOBREPÕEM ao período selecionado
    // Um encarte se sobrepõe se: periodoFim >= periodo_inicio E periodoInicio <= periodo_fim
    if (periodo_inicio && periodo_fim) {
      console.log("[PDF] Aplicando filtro de período");
      try {
        const dataInicio = new Date(periodo_inicio);
        const dataFim = new Date(periodo_fim);
        
        if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
          return res.status(400).json({ error: "Datas inválidas fornecidas" });
        }
        
        filters.periodoFim = { $gte: dataInicio };
        filters.periodoInicio = { $lte: dataFim };
        
        console.log("[PDF] Filtros de data aplicados:", {
          dataInicio: dataInicio.toISOString(),
          dataFim: dataFim.toISOString()
        });
      } catch (err) {
        console.error("[PDF] Erro ao parsear datas:", err);
        return res.status(400).json({ error: "Erro ao processar datas" });
      }
    }

    console.log("[PDF] Filtros finais:", JSON.stringify(filters, null, 2));

    // Buscar encartes/ofertas da rede com os produtos
    const encartes = await Encarte.find(filters)
      .select("_id nome tipo periodoInicio periodoFim itens")
      .lean();

    console.log("[PDF] Encartes encontrados:", encartes.length);
    
    if (encartes.length > 0) {
      console.log("[PDF] Primeiro encarte:", {
        nome: encartes[0].nome,
        tipo: encartes[0].tipo,
        periodoInicio: encartes[0].periodoInicio,
        periodoFim: encartes[0].periodoFim,
        itensCount: encartes[0].itens?.length || 0
      });
    }

    if (!encartes.length) {
      return res.status(404).json({ error: "Nenhum encarte ou oferta interna encontrado para esta rede e período" });
    }

    // Buscar nome da rede no Carteira (se existir)
    const carteira = await Carteira.findOne({ codigoRede: Number(codigoRede) }).select("redeSubrede").lean();
    const nomeRede = carteira?.redeSubrede || `Rede ${codigoRede}`;

    console.log("[PDF] Nome da rede:", nomeRede);
    console.log("[PDF] Gerando PDF...");

    // Gerar PDF
    const pdfBuffer = await pdfService.gerarPdfRede(nomeRede, userName, encartes);

    console.log("[PDF] PDF gerado com sucesso, tamanho:", pdfBuffer.length, "bytes");

    // Retornar como anexo
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Encartes_${codigoRede}_${new Date().getTime()}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF] ERRO COMPLETO:", err);
    console.error("[PDF] Stack trace:", err.stack);
    res.status(500).json({ error: err.message || "Erro ao gerar PDF", details: err.stack });
  }
}

module.exports = { gerarPdfRede };
