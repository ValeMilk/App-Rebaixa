/**
 * seedFromERP.js
 * Cria usuarios de vendedores e supervisores a partir da carteira do ERP.
 *
 * Regras:
 *  - Vendedores   → role "vendedor",   senha = codigo do vendedor
 *  - Supervisores → role "supervisor", senha = codigo do supervisor
 *  - Email        → {codigo}@valemilk.com.br
 *  - Upsert: nao sobrescreve senha se usuario ja existir
 *
 * Uso na VPS:
 *   docker exec -it rebaixa-backend node src/scripts/seedFromERP.js
 */

require("dotenv").config();
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");
const User = require("../models/User");
const { query, erpConfigurado } = require("../services/erpDbService");

const SQL = `
SELECT
    c.A00_ID_VEND     AS vendedorCodigo,
    v.A00_FANTASIA    AS vendedorNome,
    c.A00_ID_VEND_2   AS supervisorCodigo,
    s.A00_FANTASIA    AS supervisorNome
FROM A00 c
INNER JOIN A14 a  ON c.A00_ID_A14 = a.A14_ID
INNER JOIN A02 b  ON c.A00_ID_A02 = b.A02_ID
LEFT  JOIN A00 v  ON c.A00_ID_VEND   = v.A00_ID
LEFT  JOIN A00 s  ON c.A00_ID_VEND_2 = s.A00_ID
WHERE
    c.A00_EN_CL = 1
    AND c.A00_ID_VEND IS NOT NULL
    AND a.A14_DESC NOT IN (
        '999 - L80-INDUSTRIA',
        '700 - L81 - REMESSA VENDA',
        '142 - L82-PARACURU-LICITAÇÃO',
        '147 - L82-PARAIPABA-LICITAÇÃO',
        '149 - L82-SGA-LICITAÇÃO',
        '000 - L82-EXTRA ROTA'
    )
`;

async function main() {
  if (!erpConfigurado()) {
    console.error("[seed] ERP não configurado. Preencha ERP_* no .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[seed] MongoDB conectado");

  const rows = await query(SQL);
  console.log(`[seed] ${rows.length} registros da carteira recebidos`);

  // Deduplica vendedores e supervisores
  const vendedores = new Map();
  const supervisores = new Map();

  for (const r of rows) {
    if (r.vendedorCodigo && r.vendedorNome) {
      vendedores.set(String(r.vendedorCodigo).trim(), String(r.vendedorNome).trim());
    }
    if (r.supervisorCodigo && r.supervisorNome) {
      supervisores.set(String(r.supervisorCodigo).trim(), String(r.supervisorNome).trim());
    }
  }

  console.log(`[seed] Vendedores únicos: ${vendedores.size}`);
  console.log(`[seed] Supervisores únicos: ${supervisores.size}`);

  let criados = 0;
  let jaExistiam = 0;

  async function upsertUser(codigo, nome, role) {
    const email = `${codigo.toLowerCase()}@valemilk.com.br`;
    const existe = await User.findOne({ $or: [{ codigo }, { email }] });
    if (existe) {
      jaExistiam++;
      return;
    }
    const senhaHash = await User.gerarHash(codigo);
    await User.create({ nome, email, codigo, senhaHash, role, ativo: true });
    criados++;
  }

  for (const [codigo, nome] of vendedores) {
    await upsertUser(codigo, nome, "vendedor");
  }

  for (const [codigo, nome] of supervisores) {
    await upsertUser(codigo, nome, "supervisor");
  }

  console.log(`[seed] Criados: ${criados} | Já existiam: ${jaExistiam}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Erro:", err.message);
  process.exit(1);
});
