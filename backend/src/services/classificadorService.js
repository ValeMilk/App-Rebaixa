/**
 * Classifica produtos pela proximidade do vencimento.
 *  vencido  : data <= hoje
 *  critico  : <= 15 dias
 *  alerta   : <= 30 dias
 *  atencao  : <= 60 dias
 *  ok       : > 60 dias
 */
function classificarPorValidade(dataValidade) {
  if (!dataValidade) return { diasParaVencer: null, classificacao: "ok" };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dv = new Date(dataValidade);
  dv.setHours(0, 0, 0, 0);

  const dias = Math.floor((dv - hoje) / (1000 * 60 * 60 * 24));

  let classe = "ok";
  if (dias <= 0) classe = "vencido";
  else if (dias <= 15) classe = "critico";
  else if (dias <= 30) classe = "alerta";
  else if (dias <= 60) classe = "atencao";

  return { diasParaVencer: dias, classificacao: classe };
}

/**
 * Recebe um array de eventos da ATIVMOB e retorna documentos prontos para Estoque.
 */
function eventosParaEstoque(eventos) {
  return eventos.map((ev) => {
    const form = ev.form || [];
    const get = (label) => form.find((f) => (f.label || "").toLowerCase().includes(label.toLowerCase()));

    const produtoItem = get("produto");
    const qtdItem = get("quantidade");
    const validadeItem = get("data de validade");
    const rupturaItem = get("ruptura");
    const linkItem = get("link de rastreamento");

    const produtoValor = produtoItem?.value || "";
    const produtoCodigo = produtoItem?.codigo || produtoItem?.code || null;

    const qtd = Number(qtdItem?.value ?? 0) || 0;

    let dataValidade = null;
    if (validadeItem?.value) {
      const v = String(validadeItem.value).trim();
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) dataValidade = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
      else if (!isNaN(Date.parse(v))) dataValidade = new Date(v);
    }

    const ruptura = String(rupturaItem?.value || "").toUpperCase().includes("SIM");

    const { diasParaVencer, classificacao } = classificarPorValidade(dataValidade);

    return {
      eventId: String(ev.event_id),
      eventDth: ev.event_dth ? new Date(ev.event_dth) : new Date(),
      cliente: ev.nome_fantasia_dest || "",
      clienteCodigo: String(ev.codigo_destino || ""),
      promotor: ev.agent_name || "",
      produto: produtoValor,
      produtoCodigo: produtoCodigo ? String(produtoCodigo) : null,
      quantidade: qtd,
      dataValidade,
      ruptura,
      diasParaVencer,
      classificacao,
      linkRastreamento: linkItem?.url || linkItem?.value || null,
      raw: ev,
    };
  });
}

module.exports = { classificarPorValidade, eventosParaEstoque };
