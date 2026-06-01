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

  // 2. Buscar encartes dos últimos 30 dias
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 30);

  const encartes = await Encarte.find({
    codigoRede: { $in: redesCodigo },
    $or: [
      { periodoInicio: { $gte: dataLimite } },
      { periodoFim: { $gte: dataLimite } },
    ],
  })
    .select("codigoRede redeSubrede periodoInicio periodoFim itens")
    .lean();

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
    m.periodos.push({
      inicio: new Date(enc.periodoInicio),
      fim: new Date(enc.periodoFim),
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
  const hoje = new Date();
  const inicio30Dias = new Date();
  inicio30Dias.setDate(inicio30Dias.getDate() - 30);

  for (const [codigo, m] of redesMetricas) {
    // Calcular dias cobertos (união de intervalos)
    const diasCobertos = calcularDiasCobertos(m.periodos, inicio30Dias, hoje);
    const diasSemEncarte = 30 - diasCobertos;

    // Top 3 produtos
    const topProdutos = Object.entries(m.produtosCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([produto, count]) => ({ produto, count }));

    resultado.push({
      codigoRede: codigo,
      redeSubrede: m.redeSubrede,
      diasComEncarte: diasCobertos,
      diasSemEncarte,
      topProdutos,
      totalEncartes: m.periodos.length,
    });
  }

  // Ordenar por nome da rede
  resultado.sort((a, b) => (a.redeSubrede || "").localeCompare(b.redeSubrede || ""));

  res.json({ metricas: resultado });
}

/**
 * Calcula quantos dias únicos estão cobertos pelos períodos (união de intervalos)
 */
function calcularDiasCobertos(periodos, dataMin, dataMax) {
  if (!periodos.length) return 0;

  // Normalizar datas para início do dia
  const min = new Date(dataMin);
  min.setHours(0, 0, 0, 0);
  const max = new Date(dataMax);
  max.setHours(0, 0, 0, 0);

  // Set de dias cobertos (timestamp do início do dia)
  const diasSet = new Set();

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
      diasSet.add(atual.getTime());
      atual.setDate(atual.getDate() + 1);
    }
  }

  return diasSet.size;
}

module.exports = {
  dashboardSupervisor,
};
