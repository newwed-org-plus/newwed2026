import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
if(config.vars.ENVIRONMENT!=='development'||config.d1_databases[0].database_name!=='new-wed-platform-development')throw new Error('Configuração local inesperada.');
const childEnv={...process.env};delete childEnv.CLOUDFLARE_ENV;
function wrangler(args){try{execFileSync('npx',['wrangler',...args,'--config','wrangler.jsonc'],{env:childEnv,stdio:'pipe'});}catch{throw new Error('Preparação local falhou. Verifique configuração e migrations; nenhum recurso remoto foi alterado.');}}
wrangler(['d1','migrations','apply','new-wed-platform-development','--local']);
wrangler(['d1','execute','new-wed-platform-development','--local','--file','tests/fixtures/local-demo.sql']);
console.log('Banco local preparado com a edição VALIDACAO local e uma conversa sintética. Integrações externas continuam pausadas.');
