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

    console.log("\n========================================");
    console.log("[PDF] INICIANDO GERAÇÃO DE PDF");
    console.log("[PDF] Params:", { codigoRede, periodo_inicio, periodo_fim, userName });
    console.log("========================================\n");

    if (!codigoRede) {
      console.log("[PDF] ❌ ERRO: codigoRede não fornecido");
      return res.status(400).json({ error: "codigoRede é obrigatório" });
    }

    // Construir filtros para buscar encartes/ofertas
    // IMPORTANTE: codigoRede é String no banco, não Number
    const filters = { codigoRede: String(codigoRede) };
    
    console.log("[PDF] 1️⃣ Filtro inicial:", JSON.stringify(filters));
    
    // Filtrar por período se informado
    // Lógica: busca encartes que se SOBREPÕEM ao período selecionado
    // Um encarte se sobrepõe se: periodoFim >= periodo_inicio E periodoInicio <= periodo_fim
    if (periodo_inicio && periodo_fim) {
      console.log("[PDF] 2️⃣ Aplicando filtro de período...");
      try {
        const dataInicio = new Date(periodo_inicio);
        const dataFim = new Date(periodo_fim);
        
        console.log("[PDF]    - Data início:", dataInicio.toISOString());
        console.log("[PDF]    - Data fim:", dataFim.toISOString());
        
        if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
          console.log("[PDF] ❌ ERRO: Datas inválidas");
          return res.status(400).json({ error: "Datas inválidas fornecidas" });
        }
        
        filters.periodoFim = { $gte: dataInicio };
        filters.periodoInicio = { $lte: dataFim };
        
        console.log("[PDF]    ✅ Filtros de data aplicados");
      } catch (err) {
        console.error("[PDF] ❌ ERRO ao parsear datas:", err.message);
        return res.status(400).json({ error: "Erro ao processar datas" });
      }
    } else {
      console.log("[PDF] 2️⃣ Sem filtro de período (buscando todos)");
    }

    console.log("[PDF] 3️⃣ Filtros finais:", JSON.stringify(filters, null, 2));
    console.log("[PDF] 4️⃣ Buscando encartes no MongoDB...");

    // Buscar encartes/ofertas da rede com os produtos
    const encartes = await Encarte.find(filters)
      .select("_id nome tipo periodoInicio periodoFim itens")
      .lean();

    console.log(`[PDF] 5️⃣ Resultado da busca: ${encartes.length} encarte(s) encontrado(s)`);
    
    if (encartes.length === 0) {
      console.log("[PDF] ❌ NENHUM ENCARTE ENCONTRADO");
      console.log("[PDF] Verifique se:");
      console.log("[PDF]   - A rede tem encartes/ofertas cadastrados");
      console.log("[PDF]   - O codigoRede está correto");
      console.log("[PDF]   - O período selecionado contém ações");
      return res.status(404).json({ 
        error: "Nenhum encarte ou oferta interna encontrado para esta rede e período",
        debug: { codigoRede, periodo_inicio, periodo_fim, filters }
      });
    }
    
    console.log("[PDF] 6️⃣ Encartes encontrados:");
    encartes.forEach((e, idx) => {
      console.log(`[PDF]    ${idx + 1}. ${e.tipo === 'oferta_interna' ? '🎯' : '📋'} ${e.nome}`);
      console.log(`[PDF]       Período: ${e.periodoInicio?.toISOString()?.slice(0,10)} a ${e.periodoFim?.toISOString()?.slice(0,10)}`);
      console.log(`[PDF]       Produtos: ${e.itens?.length || 0}`);
    });

    console.log("[PDF] 7️⃣ Buscando nome da rede na Carteira...");
    const carteira = await Carteira.findOne({ codigoRede: String(codigoRede) }).select("redeSubrede").lean();
    const nomeRede = carteira?.redeSubrede || `Rede ${codigoRede}`;
    console.log(`[PDF]    Nome da rede: ${nomeRede}`);

    console.log("[PDF] 8️⃣ Chamando pdfService.gerarPdfRede()...");
    const pdfBuffer = await pdfService.gerarPdfRede(nomeRede, userName, encartes);

    console.log(`[PDF] 9️⃣ PDF gerado com sucesso! Tamanho: ${pdfBuffer.length} bytes`);
    console.log("[PDF] 🔟 Enviando PDF para o cliente...");

    // Retornar como anexo
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Encartes_${codigoRede}_${new Date().getTime()}.pdf"`);
    res.send(pdfBuffer);
    
    console.log("[PDF] ✅ PDF ENVIADO COM SUCESSO!\n");
  } catch (err) {
    console.error("\n========================================");
    console.error("[PDF] ❌❌❌ ERRO FATAL ❌❌❌");
    console.error("[PDF] Mensagem:", err.message);
    console.error("[PDF] Stack:", err.stack);
    console.error("========================================\n");
    res.status(500).json({ error: err.message || "Erro ao gerar PDF", details: err.stack });
  }
}

module.exports = { gerarPdfRede };
