import { afterEach,describe,expect,it } from "vitest";
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const paths:string[]=[];
afterEach(()=>paths.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));
function run(change:(files:Record<string,Record<string,unknown>>)=>void=()=>{}) {
  const directory=mkdtempSync(join(tmpdir(),"newwed-preflight-")); paths.push(directory);
  const files=Object.fromEntries(["wrangler.jsonc","wrangler.events.jsonc","wrangler.uazapi.jsonc"].map(file=>[file,JSON.parse(readFileSync(file,"utf8"))]));
  change(files);
  for(const [name,value] of Object.entries(files))writeFileSync(join(directory,name),JSON.stringify(value));
  return spawnSync(process.execPath,["scripts/preflight-launch.mjs","production",`--config-dir=${directory}`],{encoding:"utf8"});
}
describe("preflight por capacidade",()=>{
 it("aceita recebimento sem R2 e sem credenciais comerciais",()=>{expect(run().status).toBe(0);});
 it("bloqueia D1 divergente no receptor",()=>{const result=run(files=>{files['wrangler.uazapi.jsonc'].d1_databases=[];});expect(result.status).toBe(1);expect(result.stderr).toContain('D1');});
 it("bloqueia ativação comercial divergente entre web e consumer",()=>{const result=run(files=>{const env=files['wrangler.jsonc'].env as Record<string,{vars:Record<string,string>}>;env.production.vars.ENABLE_AGENT='true';});expect(result.status).toBe(1);expect(result.stderr).toContain('ENABLE_AGENT');});
});
