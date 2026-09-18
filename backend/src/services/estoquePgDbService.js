/**
 * Conexao com o PostgreSQL de BI (VPS) que substitui a API da ATIVMOB
 * como fonte de dados de estoque/validade por loja.
 *
 * Variaveis de ambiente necessarias:
 *   PG_HOST      - IP ou hostname do Postgres
 *   PG_PORT      - porta (padrao 5432)
 *   PG_DATABASE  - nome do banco
 *   PG_USER      - usuario
 *   PG_PASSWORD  - senha
 */

const { Pool } = require("pg");

let pool = null;

function pgConfigurado() {
  return !!(
    process.env.PG_HOST &&
    process.env.PG_DATABASE &&
    process.env.PG_USER &&
    process.env.PG_PASSWORD
  );
}

function getPool() {
  if (!pgConfigurado()) {
    throw new Error("Postgres nao configurado. Preencha PG_HOST, PG_PORT, PG_DATABASE, PG_USER e PG_PASSWORD no .env");
  }
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT || 5432),
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      ssl: false, // mesma rede interna da VPS, sem TLS — igual aos dois SQL Server (ERP/Esigma)
      connectionTimeoutMillis: 15000,
      max: 5,
    });
    // Evita derrubar o processo Node inteiro se a conexao cair em background
    pool.on("error", (err) => {
      console.error("[estoquePgDbService] erro inesperado no pool:", err.message);
    });
  }
  return pool;
}

async function query(sql, params) {
  const p = getPool();
  const result = await p.query(sql, params);
  return result.rows;
}

module.exports = { query, pgConfigurado, getPool };
