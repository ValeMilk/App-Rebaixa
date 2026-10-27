const test = require("node:test");
const assert = require("node:assert/strict");

// mssql falso: ConnectionPool que leva um tick para conectar e conta quantos pools foram criados.
// Reproduz a corrida de producao ("Connection is closed."): duas chamadas a getPool durante o
// connect criavam dois pools e a primeira devolvia o segundo, ainda desconectado.
const fake = { criados: 0, fechados: 0, falharProximo: false };
class FakePool {
  constructor() { fake.criados++; this.connected = false; this.connecting = false; this._handlers = {}; }
  on(ev, fn) { this._handlers[ev] = fn; return this; }
  emit(ev, arg) { this._handlers[ev]?.(arg); }
  async connect() {
    this.connecting = true;
    await new Promise((r) => setTimeout(r, 20));
    this.connecting = false;
    if (fake.falharProximo) { fake.falharProximo = false; throw new Error("Failed to connect"); }
    this.connected = true;
    return this;
  }
  async close() { fake.fechados++; this.connected = false; }
}
const mssqlPath = require.resolve("mssql");
require.cache[mssqlPath] = { id: mssqlPath, filename: mssqlPath, loaded: true, exports: { ConnectionPool: FakePool } };

process.env.ERP_HOST = "x"; process.env.ERP_USER = "u"; process.env.ERP_PASSWORD = "p"; process.env.ERP_DATABASE = "d";
const { getPool } = require("../../src/services/erpDbService");

test("chamadas simultaneas durante o connect recebem o MESMO pool, ja conectado", async () => {
  const [a, b, c] = await Promise.all([getPool(), getPool(), getPool()]);
  assert.equal(fake.criados, 1, "um pool so");
  assert.ok(a === b && b === c, "mesmo objeto");
  assert.equal(a.connected, true);
  // depois de conectado, reutiliza sem criar outro
  const d = await getPool();
  assert.equal(d, a);
  assert.equal(fake.criados, 1);
});

test("pool que cai (evento error) e recriado na proxima chamada; connect com falha nao trava o proximo", async () => {
  const antes = await getPool();
  antes.emit("error", new Error("socket hang up"));
  fake.falharProximo = true;
  await assert.rejects(getPool(), /Failed to connect/);
  const depois = await getPool();
  assert.notEqual(depois, antes);
  assert.equal(depois.connected, true);
  assert.equal(fake.criados, 3);
});
