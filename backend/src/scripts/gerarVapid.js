/**
 * Gera um par de chaves VAPID para o Web Push das pendencias.
 * Uso: cd backend && node src/scripts/gerarVapid.js
 * Cole as linhas impressas no backend/.env e reinicie a API. A chave privada nunca vai para o front.
 */
const webpush = require("web-push");

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("# Web Push (pendencias). Cole no backend/.env e reinicie a API:");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:ti@valemilk.com.br");
console.log("");
console.log("# Trocar as chaves invalida as inscricoes existentes: os usuarios precisam ativar o push de novo.");
