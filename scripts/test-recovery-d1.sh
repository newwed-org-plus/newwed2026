#!/usr/bin/env bash
set -euo pipefail
umask 077
unset CLOUDFLARE_ENV
recovery_dir="$(mktemp -d /tmp/newwed-recovery.XXXXXX)"
trap 'rm -rf "$recovery_dir"' EXIT
node --input-type=module - "$recovery_dir" <<'JS'
import {mkdirSync,writeFileSync} from 'node:fs';import {join,resolve} from 'node:path';
for(const directory of ['source','restored']){const folder=join(process.argv[2],directory);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'wrangler.json'),JSON.stringify({name:'newwed-recovery-test',compatibility_date:'2026-10-20',d1_databases:[{binding:'DB',database_name:'new-wed-platform-development',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:resolve('migrations')}]}));}
JS
npx wrangler d1 migrations apply new-wed-platform-development --local --config "$recovery_dir/source/wrangler.json"
npx wrangler d1 execute new-wed-platform-development --local --config "$recovery_dir/source/wrangler.json" --file tests/fixtures/local-demo.sql
npx wrangler d1 export new-wed-platform-development --local --config "$recovery_dir/source/wrangler.json" --no-data --output "$recovery_dir/schema.sql"
npx wrangler d1 export new-wed-platform-development --local --config "$recovery_dir/source/wrangler.json" --no-schema --output "$recovery_dir/data.sql"
node --input-type=module - "$recovery_dir" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';const folder=process.argv[2];writeFileSync(join(folder,'backup.sql'),'PRAGMA defer_foreign_keys=ON;\n'+readFileSync(join(folder,'schema.sql'),'utf8')+'\n'+readFileSync(join(folder,'data.sql'),'utf8')+'\nPRAGMA defer_foreign_keys=OFF;\n');
JS
npx wrangler d1 execute new-wed-platform-development --local --config "$recovery_dir/restored/wrangler.json" --file "$recovery_dir/backup.sql"
npx wrangler d1 execute new-wed-platform-development --local --config "$recovery_dir/restored/wrangler.json" --command "CREATE TABLE recovery_assertion(ok INTEGER CHECK(ok=1)); INSERT INTO recovery_assertion SELECT CASE WHEN (SELECT count(*) FROM messages WHERE id='validacao-local-message')=1 AND (SELECT count(*) FROM sqlite_master WHERE name='operational_health')=1 AND (SELECT count(*) FROM sqlite_master WHERE name='outbox_operations_idx')=1 THEN 1 ELSE 0 END; PRAGMA foreign_key_check;"
