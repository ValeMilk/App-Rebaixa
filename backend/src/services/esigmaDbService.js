/**
 * Conexao com o SQL Server do segundo ERP (Esigma).
 * Roda na VPS (72.61.62.17) onde o SQL Server e acessivel na rede interna.
 *
 * Variaveis de ambiente necessarias:
 *   ERP_HOST2      - IP ou hostname do SQL Server
 *   ERP_PORT2      - porta (padrao 1433)
 *   ERP_USER2      - usuario SQL
 *   ERP_PASSWORD2  - senha
 *   ERP_DATABASE2  - nome do banco
 */

const sql = require("mssql");

let pool = null;
let conectando = null; // promise do connect em andamento: chamadas simultaneas esperam o mesmo pool

function esigmaConfigurado() {
  return !!(
    process.env.ERP_HOST2 &&
    process.env.ERP_USER2 &&
    process.env.ERP_PASSWORD2 &&
    process.env.ERP_DATABASE2
  );
}

async function getPool() {
  if (!esigmaConfigurado()) {
    throw new Error("Esigma nao configurado. Preencha ERP_HOST2, ERP_USER2, ERP_PASSWORD2 e ERP_DATABASE2 no .env");
  }
  if (pool && pool.connected) return pool;
  if (conectando) return conectando;

  const config = {
    server:   process.env.ERP_HOST2,
    user:     process.env.ERP_USER2,
    password: process.env.ERP_PASSWORD2,
    database: process.env.ERP_DATABASE2,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };

  // Instancia nomeada (ex: 10.1.0.22\GC-SERVER-02):
  // porta descoberta via SQL Server Browser (UDP 1434)
  if (process.env.ERP_INSTANCE2) {
    config.options.instanceName = process.env.ERP_INSTANCE2;
  } else {
    config.port = Number(process.env.ERP_PORT2 || 1433);
  }

  // IMPORTANTE: usar `new sql.ConnectionPool()` em vez do atalho `sql.connect()`.
  // `sql.connect()` usa um pool GLOBAL unico do pacote mssql — como o erpDbService.js
  // (Lacteus) tambem conecta via mssql, usar o atalho faria os dois compartilharem
  // a mesma conexao (o que conectar primeiro "vence" e o outro reusa essa conexao errada).
  //
  // Um unico connect por vez, devolvendo o pool local (mesma correcao do erpDbService.js:
  // duas chamadas simultaneas durante o connect geravam "Connection is closed").
  conectando = (async () => {
    const anterior = pool;
    const novo = new sql.ConnectionPool(config);
    try {
      await novo.connect();
      novo.on("error", (err) => {
        console.error("[esigmaDbService] pool com erro, sera recriado na proxima consulta:", err.message);
        if (pool === novo) pool = null;
      });
      pool = novo;
      if (anterior && anterior !== novo) anterior.close().catch(() => {});
      return novo;
    } finally {
      conectando = null;
    }
  })();
  return conectando;
}

async function query(sql_str) {
  const p = await getPool();
  const result = await p.request().query(sql_str);
  return result.recordset;
}

module.exports = { query, esigmaConfigurado, getPool };
