const Encarte = require("../models/Encarte");
const Carteira = require("../models/Carteira");
const ResponsavelRede = require("../models/ResponsavelRede");

/**
 * Dashboard do supervisor: métricas por rede (últimos 30 dias)
 * - Dias com encarte negociado
 * - Dias sem encarte
 * - Top 3 produtos mais encartados
 */
async function dashboardSupervisor(req, res) {
  const { role, codigo } = req.user;

  if (role !== "supervisor" && role !== "admin" && role !== "diretoria") {
    return res.status(403).json({ error: "Acesso restrito a supervisores" });
  }

  // 1. Buscar redes do supervisor
  let redesCodigo = [];
  if (role === "supervisor") {
    // Redes da carteira + redes responsáveis
    const carteira = await Carteira.find(
      {
        supervisorCodigo: codigo,
        codigoRede: { $ne: null },
        $or: [{ redeSubrede: { $not: /INATIVO/i } }, { redeSubrede: null }],
      },
      "codigoRede redeSubrede"
    ).lean();
    const overrides = await ResponsavelRede.find(
      { supervisorCodigo: codigo },
      "codigoRede redeSubrede"
    ).lean();

    const redesMap = new Map();
    for (const c of carteira) {
      if (c.codigoRede) redesMap.set(c.codigoRede, c.redeSubrede || c.codigoRede);
    }
    for (const o of overrides) {
      if (!redesMap.has(o.codigoRede)) {
        redesMap.set(o.codigoRede, o.redeSubrede || o.codigoRede);
      }
    }
    redesCodigo = Array.from(redesMap.keys());
  } else {
    // Admin/Diretoria: todas as redes
    const carteira = await Carteira.find(
      {
        codigoRede: { $ne: null },
        $or: [{ redeSubrede: { $not: /INATIVO/i } }, { redeSubrede: null }],
      },
      "codigoRede redeSubrede"
    )
      .distinct("codigoRede")
      .lean();
    redesCodigo = carteira;
  }

  if (!redesCodigo.length) {
    return res.json({ metricas: [] });
  }

  // 2. Buscar encartes do mês civil CORRENTE (1º dia até último dia do mês)
  const hoje = new Date();
  const mesAtual = hoje.getMonth();      // 0 = jan, 11 = dez
  const anoAtual = hoje.getFullYear();

  // Primeiro dia do mês às 00:00
  const dataMin = new Date(anoAtual, mesAtual, 1, 0, 0, 0, 0);
  
  // Último dia do mês às 23:59:59
  const dataMax = new Date(anoAtual, mesAtual + 1, 0, 23, 59, 59, 999);

  const encartes = await Encarte.find({
    codigoRede: { $in: redesCodigo },
    // Buscar encartes que se SOBREPÕEM ao intervalo [dataMin, dataMax]
    periodoFim: { $gte: dataMin },        // Fim do encarte >= 1º dia do mês
    periodoInicio: { $lte: dataMax },     // Início do encarte <= último dia do mês
  })
    .select("codigoRede redeSubrede periodoInicio periodoFim itens")
    .lean();

  console.log(`[DEBUG] Período considerado: ${dataMin.toLocaleDateString('pt-BR')} até ${dataMax.toLocaleDateString('pt-BR')}`);
  console.log("[DEBUG] Total encartes encontrados:", encartes.length);
  if (encartes.length > 0) {
    console.log("[DEBUG] Primeiro encarte:", {
      codigoRede: encartes[0].codigoRede,
      redeSubrede: encartes[0].redeSubrede,
      periodoInicio: encartes[0].periodoInicio,
      periodoFim: encartes[0].periodoFim,
      itensQtd: encartes[0].itens?.length || 0
    });
  }

  // 3. Agrupar por rede e calcular métricas
  const redesMetricas = new Map();

  for (const enc of encartes) {
    const codigo = enc.codigoRede;
    if (!redesMetricas.has(codigo)) {
      redesMetricas.set(codigo, {
        codigoRede: codigo,
        redeSubrede: enc.redeSubrede || codigo,
        periodos: [],
        produtosCount: {},
      });
    }
    const m = redesMetricas.get(codigo);
    
    // Adicionar período com flag se tem produtos
    const temProdutos = Array.isArray(enc.itens) && enc.itens.length > 0;
    m.periodos.push({
      inicio: new Date(enc.periodoInicio),
      fim: new Date(enc.periodoFim),
      temProdutos
    });

    // Contar produtos
    for (const item of enc.itens || []) {
      const prod = item.produto || "Sem nome";
      m.produtosCount[prod] = (m.produtosCount[prod] || 0) + 1;
    }
  }

  // Adicionar redes sem encarte
  for (const codigo of redesCodigo) {
    if (!redesMetricas.has(codigo)) {
      const exemplo = await Carteira.findOne({ codigoRede: codigo }, "redeSubrede").lean();
      redesMetricas.set(codigo, {
        codigoRede: codigo,
        redeSubrede: exemplo?.redeSubrede || codigo,
        periodos: [],
        produtosCount: {},
      });
    }
  }

  // 4. Calcular dias cobertos e top produtos
  const resultado = [];

  for (const [codigo, m] of redesMetricas) {
    // Calcular dias cobertos (total e com produtos) dentro do mês
    const diasInfo = calcularDiasCobertos(m.periodos, dataMin, dataMax);
    const diasTotais = diasInfo.total;
    const diasNegociados = diasInfo.comProdutos;
    const percentualNegociacao = diasTotais > 0 ? Math.round((diasNegociados / diasTotais) * 100) : 0;

    // DEBUG: Se tem encarte, logar
    if (m.periodos.length > 0) {
      console.log(`[DEBUG] Rede ${m.redeSubrede}:`, {
        periodos: m.periodos.length,
        periodosDetalhes: m.periodos.map(p => ({
          inicio: p.inicio,
          fim: p.fim,
          temProdutos: p.temProdutos
        })),
        diasTotais,
        diasNegociados,
        percentualNegociacao
      });
    }

    // Top 3 produtos
    const topProdutos = Object.entries(m.produtosCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([produto, count]) => ({ produto, count }));

    resultado.push({
      codigoRede: codigo,
      redeSubrede: m.redeSubrede,
      diasTotais,          // Dias com QUALQUER encarte
      diasNegociados,      // Dias com encarte + produtos
      percentualNegociacao, // % = (diasNegociados / diasTotais) * 100
      topProdutos,
      totalEncartes: m.periodos.length,
    });
  }

  // Ordenar por nome da rede
  resultado.sort((a, b) => (a.redeSubrede || "").localeCompare(b.redeSubrede || ""));

  res.json({ metricas: resultado });
}

/**
 * Calcula quantos dias únicos estão cobertos pelos períodos (com ou sem produtos)
 */
function calcularDiasCobertos(periodos, dataMin, dataMax) {
  if (!periodos.length) return { total: 0, comProdutos: 0 };

  // Normalizar datas para início do dia
  const min = new Date(dataMin);
  min.setHours(0, 0, 0, 0);
  const max = new Date(dataMax);
  max.setHours(0, 0, 0, 0);

  // Set de dias cobertos
  const diasTotal = new Set();      // Todos os dias com encarte
  const diasComProdutos = new Set(); // Apenas dias com encarte + produtos

  for (const p of periodos) {
    let inicio = new Date(p.inicio);
    inicio.setHours(0, 0, 0, 0);
    let fim = new Date(p.fim);
    fim.setHours(0, 0, 0, 0);

    // Limitar ao intervalo dos últimos 30 dias
    if (inicio < min) inicio = new Date(min);
    if (fim > max) fim = new Date(max);

    // Adicionar todos os dias do período
    const atual = new Date(inicio);
    while (atual <= fim) {
      diasTotal.add(atual.getTime());
      
      // Adicionar ao set de produtos se houver itens
      if (p.temProdutos) {
        diasComProdutos.add(atual.getTime());
      }
      
      atual.setDate(atual.getDate() + 1);
    }
  }

  return {
    total: diasTotal.size,
    comProdutos: diasComProdutos.size
  };
}

module.exports = {
  dashboardSupervisor,
};
