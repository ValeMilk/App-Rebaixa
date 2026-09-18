/**
 * Sincronizacao de estoque via ATIVMOB — DESATIVADA.
 * O estoque passou a vir de um Postgres de BI na VPS (ver estoquePgDbService.js);
 * a integracao real (query + mapeamento de colunas) ainda esta pendente.
 * Este stub mantem a mesma assinatura/formato de retorno de antes para nao
 * quebrar os chamadores (cron em jobs/syncJob.js, botao manual e trigger de
 * login em syncController.js) enquanto a nova integracao nao fica pronta.
 */
async function sincronizarEstoque() {
  return {
    eventosBaixados: 0,
    upserts: 0,
    observacao: "Sincronizacao via ATIVMOB desativada — aguardando integracao com Postgres (nova query pendente)",
  };
}

module.exports = { sincronizarEstoque };
