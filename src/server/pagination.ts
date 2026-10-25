import { Buffer } from "node:buffer";
import { HttpError } from "./http";
export function pageLimit(value:string|null,fallback:number) {
  if(value===null)return fallback;
  const limit=Number(value);
  if(!Number.isFinite(limit) || !Number.isInteger(limit))throw new HttpError(422,'INVALID_PAGINATION','Paginação inválida.');
  return Math.min(100,Math.max(1,limit));
}
export function encodeCursor(scope:string,time:unknown,id:unknown) {
  return `v1.${Buffer.from(JSON.stringify([scope,String(time),String(id)])).toString('base64url')}`;
}
export function decodeCursor(scope:string,value:string|null):{time:string|null;id:string|null} {
  if(!value)return {time:null,id:null};
  if(value.length<=40 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)))return {time:new Date(value).toISOString(),id:null};
  try {
    if(!/^v1\.[A-Za-z0-9_-]{1,700}$/.test(value))throw new Error();
    const decoded=JSON.parse(Buffer.from(value.slice(3),'base64url').toString('utf8')) as unknown;
    if(!Array.isArray(decoded) || decoded.length!==3 || decoded[0]!==scope || typeof decoded[1]!=='string' || !Number.isFinite(Date.parse(decoded[1])) || typeof decoded[2]!=='string' || decoded[2].length>256)throw new Error();
    return {time:decoded[1],id:decoded[2]};
  } catch {throw new HttpError(422,'INVALID_CURSOR','Atualize a lista para continuar a paginação.');}
}
