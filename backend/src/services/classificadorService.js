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

module.exports = { classificarPorValidade };
