/**
 * Conexao com o SQL Server do ERP.
 * Roda na VPS (72.61.62.17) onde o SQL Server e acessivel na rede interna.
 *
 * Variaveis de ambiente necessarias:
 *   ERP_HOST      - IP ou hostname do SQL Server
 *   ERP_PORT      - porta (padrao 1433)
 *   ERP_USER      - usuario SQL
 *   ERP_PASSWORD  - senha
 *   ERP_DATABASE  - nome do banco
 */

const sql = require("mssql");

let pool = null;
let conectando = null; // promise do connect em andamento: chamadas simultaneas esperam o mesmo pool

function erpConfigurado() {
  return !!(
    process.env.ERP_HOST &&
    process.env.ERP_USER &&
    process.env.ERP_PASSWORD &&
    process.env.ERP_DATABASE
  );
}

async function getPool() {
  if (!erpConfigurado()) {
    throw new Error("ERP nao configurado. Preencha ERP_HOST, ERP_USER, ERP_PASSWORD e ERP_DATABASE no .env");
  }
  if (pool && pool.connected) return pool;
  if (conectando) return conectando;

  const config = {
    server:   process.env.ERP_HOST,
    user:     process.env.ERP_USER,
    password: process.env.ERP_PASSWORD,
    database: process.env.ERP_DATABASE,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 60000,
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  };

  // Instancia nomeada (ex: 10.1.0.3\SQLSTANDARD):
  // porta descoberta via SQL Server Browser (UDP 1434)
  if (process.env.ERP_INSTANCE) {
    config.options.instanceName = process.env.ERP_INSTANCE;
  } else {
    config.port = Number(process.env.ERP_PORT || 1433);
  }

  // IMPORTANTE: usar `new sql.ConnectionPool()` em vez do atalho `sql.connect()`.
  // `sql.connect()` usa um pool GLOBAL unico do pacote mssql — como o sistema
  // tambem conecta num segundo ERP (Esigma, esigmaDbService.js), usar o atalho
  // faria os dois compartilharem a mesma conexao (o que conectar primeiro "vence"
  // e o outro silenciosamente reusa essa conexao errada).
  //
  // Um unico connect por vez, e cada chamada devolve o pool que ELA viu conectar (variavel
  // local), nunca a variavel do modulo: antes, duas chamadas simultaneas durante o connect
  // criavam dois pools e a primeira devolvia o segundo ainda desconectado ("Connection is closed").
  conectando = (async () => {
    const anterior = pool;
    const novo = new sql.ConnectionPool(config);
    try {
      await novo.connect();
      novo.on("error", (err) => {
        console.error("[erpDbService] pool com erro, sera recriado na proxima consulta:", err.message);
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

module.exports = { query, erpConfigurado, getPool };
