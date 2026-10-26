import {HttpError} from './http';
import {normalizeBillingDocument,validBillingDocument} from '@/features/billing/billing-document';
import type {RuntimeSecrets} from './secrets';
const aad=(checkoutId:string)=>new TextEncoder().encode(`newwed:billing-document:v1:${checkoutId}`);
function bytes(value:Uint8Array){return btoa(String.fromCharCode(...value));}
function decode(value:string){return Uint8Array.from(atob(value),char=>char.charCodeAt(0));}
async function key(env:RuntimeSecrets){
 if(!/^[a-f0-9]{64}$/i.test(env.BILLING_ENCRYPTION_KEY??''))throw new HttpError(503,'BILLING_ENCRYPTION_NOT_CONFIGURED','A proteção dos dados de cobrança ainda não está configurada.');
 return crypto.subtle.importKey('raw',Uint8Array.from(env.BILLING_ENCRYPTION_KEY!.match(/../g)!,value=>parseInt(value,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export function checkoutDocument(env:{ENVIRONMENT?:string},value?:string) {
 if(!value){if(env.ENVIRONMENT==='production')throw new HttpError(422,'BILLING_DOCUMENT_REQUIRED','Informe o CPF ou CNPJ do pagador para autorizar a cobrança.');return null;}
 if(!validBillingDocument(value))throw new HttpError(422,'BILLING_DOCUMENT_INVALID','Confira o CPF ou CNPJ do pagador.');
 return normalizeBillingDocument(value);
}
export async function encryptBillingDocument(env:RuntimeSecrets,checkoutId:string,document:string) {
 if(!validBillingDocument(document))throw new HttpError(422,'BILLING_DOCUMENT_INVALID','Confira o CPF ou CNPJ do pagador.');
 const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(checkoutId)},await key(env),new TextEncoder().encode(normalizeBillingDocument(document)));
 return JSON.stringify({v:1,iv:bytes(iv),data:bytes(new Uint8Array(ciphertext))});
}
export async function decryptBillingDocument(env:RuntimeSecrets,checkoutId:string,ciphertext:string) {
 try{const stored=JSON.parse(ciphertext) as {v:number;iv:string;data:string};if(stored.v!==1)throw new Error('version');const iv=decode(stored.iv);if(iv.length!==12)throw new Error('nonce');const result=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(checkoutId)},await key(env),decode(stored.data));const value=new TextDecoder().decode(result);if(!validBillingDocument(value))throw new Error('document');return value;}catch{throw new HttpError(503,'BILLING_DOCUMENT_UNAVAILABLE','Não foi possível recuperar os dados de cobrança; confira a configuração antes de tentar novamente.');}
}
