#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const target = process.argv[2];
if (!["staging", "production"].includes(target)) {
  console.error("Uso: node scripts/preflight-launch.mjs <staging|production> [--config-dir=path]");
  process.exit(2);
}
const directory = process.argv.find(arg => arg.startsWith("--config-dir="))?.slice(13) ?? fileURLToPath(new URL("..", import.meta.url));
const load = file => JSON.parse(readFileSync(resolve(directory, file), "utf8"));
const selected = config => config.env?.[target] ?? (config.vars?.ENVIRONMENT === target ? config : undefined);
const app = selected(load("wrangler.jsonc"));
const events = selected(load("wrangler.events.jsonc"));
const receiver = selected(load("wrangler.uazapi.jsonc"));
const errors = [];
const enabled = name => app?.vars?.[name] === "true";
const commercial = ["ENABLE_MANUAL_SEND","ENABLE_AGENT","ENABLE_CHECKOUT","ENABLE_CONFIRMATION","ENABLE_EMAIL"].some(enabled);
const configs = [["app",app],["receiver",receiver],...(commercial ? [["events",events]] : [])];
for (const [name, config] of configs) {
  if (!config) { errors.push(`${name}: ambiente ${target} ausente`); continue; }
  if (config.vars?.ENVIRONMENT !== target) errors.push(`${name}: ENVIRONMENT divergente`);
  if (config.vars?.ALLOW_LOCAL_ACCESS === "true") errors.push(`${name}: bypass local ativo`);
  const database = config.d1_databases?.find(db => db.binding === "DB");
  if (!database?.database_id || /^0{8}-/.test(database.database_id)) errors.push(`${name}: D1 usa ID marcador`);
  if (database?.database_name !== `new-wed-platform-${target}`) errors.push(`${name}: nome do D1 incompatível com ambiente`);
  if (target === "staging" && database?.database_id === load("wrangler.jsonc").env?.production?.d1_databases?.[0]?.database_id) errors.push(`${name}: D1 production compartilhado`);
  if (database?.database_id !== app?.d1_databases?.[0]?.database_id) errors.push(`${name}: D1 diverge do app`);
  if (!config.queues?.producers?.length) errors.push(`${name}: producer ausente`);
  if (name === "receiver" && config.queues?.consumers?.[0]?.queue !== `new-wed-uazapi-${target}`) errors.push("receiver: fila incompatível com ambiente");
  if (name !== "app" && !config.queues?.consumers?.[0]?.dead_letter_queue) errors.push(`${name}: DLQ ausente`);
}
if (!app?.durable_objects?.bindings?.some(binding => binding.name === "ADMIN_PASSWORD_VERIFIER")) errors.push("app: login próprio sem Durable Object");
for (const name of ["ENABLE_MANUAL_SEND","ENABLE_AGENT","ENABLE_CHECKOUT","ENABLE_CONFIRMATION","ENABLE_EMAIL"]) {
  if (commercial && app?.vars?.[name] !== events?.vars?.[name]) errors.push(`${name}: controles web/consumer divergentes`);
}
if (enabled("ENABLE_AGENT") && receiver?.vars?.ENABLE_AGENT !== app.vars.ENABLE_AGENT) errors.push("ENABLE_AGENT: receptor divergente");
if (enabled("ENABLE_PUBLIC_LEADS") && (!app.vars.TURNSTILE_SITE_KEY || !app.vars.TURNSTILE_HOSTNAMES)) errors.push("Turnstile: site key ou hostnames ausentes");
if (enabled("ENABLE_CHECKOUT")) {
  const origin = target === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  if (app.vars.ASAAS_API_URL !== origin || events?.vars?.ASAAS_API_URL !== origin) errors.push("Asaas: origem incompatível com ambiente");
}
if (enabled("ENABLE_EMAIL")) {
  const binding = events?.send_email?.find(binding => binding.name === "EMAIL");
  if (!binding?.allowed_sender_addresses?.length || !binding.allowed_destination_addresses?.length) errors.push("EMAIL: remetentes/destinatários restritos ausentes");
}
if (errors.length) {
  console.error(`Preflight ${target}: BLOQUEADO\n${errors.map(error => `- ${error}`).join("\n")}`);
  process.exit(1);
}
console.log(`Preflight ${target}: configuração estática aprovada (${commercial ? "comercial" : "somente recebimento"}).`);
console.log("Secrets, recursos remotos, autorizações e backlog devem ser conferidos no runbook. R2 e Access são opcionais.");
