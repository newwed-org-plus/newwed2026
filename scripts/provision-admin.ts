import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { hashPassword } from "../src/server/auth/password";

const email = z.email().parse(process.argv[2]).toLowerCase();
const local = process.argv.includes("--local");
const prepare = process.argv.find(value => value.startsWith("--prepare="))?.slice(10);
const profile = process.argv.find(value => value.startsWith("--profile="))?.slice(10);
if (!local && !profile && !prepare) throw new Error("Informe --profile=<perfil Cloudflare> ou --local.");

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = "";
    for await (const chunk of process.stdin) input += String(chunk);
    return input.replace(/\r?\n$/, "");
  }
  process.stdout.write("Senha (entrada oculta): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let input = "";
    const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData); process.stdout.write("\n"); };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") { finish(); reject(new Error("Cancelado.")); return; }
        if (character === "\r" || character === "\n") { finish(); resolve(input); return; }
        if (character === "\u007f") input = input.slice(0, -1);
        else input += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

const password = z.string().min(10).max(256).parse(await readPassword());
const passwordHash = await hashPassword(password);
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const now = quote(new Date().toISOString());
const identity = quote(email);
const sql = `INSERT INTO users (id,email,name,active,created_at,updated_at)
  SELECT ${quote(crypto.randomUUID())},${identity},'Administrador New Wed',1,${now},${now}
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email)=${identity});
UPDATE users SET active=1,updated_at=${now} WHERE lower(email)=${identity};
INSERT INTO roles (id,user_id,role,created_at)
  SELECT ${quote(crypto.randomUUID())},id,'admin',${now} FROM users WHERE lower(email)=${identity}
  ON CONFLICT(user_id,role) DO NOTHING;
INSERT INTO admin_credentials (user_id,password_hash,updated_at)
  SELECT id,${quote(passwordHash)},${now} FROM users WHERE lower(email)=${identity}
  ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=excluded.updated_at;
DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email)=${identity});`;
const directory = await mkdtemp(join(tmpdir(), "newwed-admin-"));
try {
  const file = join(directory, "provision.sql");
  await writeFile(file, sql, { mode: 0o600 });
  if (prepare) {
    await writeFile(prepare, sql, { mode: 0o600 });
    console.log("SQL preparado em arquivo protegido. Copie-o diretamente no console D1 e execute; não compartilhe o conteúdo.");
  } else {
    const args = ["wrangler", "d1", "execute", `new-wed-platform-${local ? "development" : "production"}`, local ? "--local" : "--remote", "--file", file];
    if (!local) args.push("--env", "production", "--profile", profile!);
    await promisify(execFile)("npx", args, { env: { ...process.env, WRANGLER_LOG_LEVEL: "none" } });
    console.log("Administrador provisionado. Sessões anteriores revogadas.");
  }
} catch {
  // D1 errors may contain SQL: never print the captured subprocess output.
  process.exitCode = 1;
  console.error("Falha ao provisionar. Verifique perfil, ambiente e migrations; nenhum segredo foi exibido.");
} finally { await rm(directory, { recursive: true, force: true }); }
