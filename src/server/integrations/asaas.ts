import { HttpError } from "@/server/http";
import type { RuntimeSecrets } from "@/server/secrets";
import {readJsonWithLimit} from '@/server/request-context';

const DEFAULT_BASE_URL = "https://api-sandbox.asaas.com/v3";

export type AsaasEnvironment = RuntimeSecrets & { ASAAS_API_URL?: string };
export type AsaasFetcher = typeof fetch;

export type AsaasPaymentSnapshot = {
  id: string;
  externalReference?: string;
  customer?: string;
  installment?: string;
  installmentNumber?: number;
  invoiceUrl?: string;
  billingType?: string;
  value: number;
  dueDate?: string;
  status: string;
  paymentDate?: string;
  confirmedDate?: string;
};

type LeadForBilling = { id:string;name:string;email:string;normalizedPhone:string };

function baseUrl(env: AsaasEnvironment) {
  const url=(env.ASAAS_API_URL || DEFAULT_BASE_URL).replace(/\/$/,"");
  if(!['https://api-sandbox.asaas.com/v3','https://api.asaas.com/v3'].includes(url))throw new HttpError(503,'ASAAS_INVALID_ORIGIN','Configure uma origem oficial do Asaas.');
  const sandbox=url===DEFAULT_BASE_URL;
  if(env.LOCAL_TEST_MODE==='true'&&!sandbox)throw new HttpError(503,'ASAAS_PRODUCTION_BLOCKED_LOCAL','O perfil local aceita somente Asaas Sandbox.');
  if(sandbox&&env.ASAAS_API_KEY?.startsWith('$aact_prod_')||!sandbox&&env.ASAAS_API_KEY?.startsWith('$aact_hmlg_'))throw new HttpError(503,'ASAAS_ENVIRONMENT_MISMATCH','A chave Asaas não pertence ao ambiente configurado.');
  return url;
}

export async function asaasRequest<T>(env: AsaasEnvironment,path: string,init: RequestInit = {},fetcher: AsaasFetcher = fetch): Promise<T> {
  if (!env.ASAAS_API_KEY) throw new HttpError(503,"ASAAS_NOT_CONFIGURED","Integração Asaas ainda não configurada.");
  if(!/^\/[A-Za-z]/.test(path)||path.includes('\\'))throw new HttpError(503,'ASAAS_INVALID_PATH','Caminho Asaas inválido.');
  const response = await fetcher(`${baseUrl(env)}${path}`,{
    ...init,redirect:'manual',signal:AbortSignal.timeout(25000),
    headers:{ "content-type":"application/json",access_token:env.ASAAS_API_KEY,"user-agent":"NewWedPlatform/1.0",...init.headers },
  });
  let body:Record<string,unknown>={};
  if(response.body){try{body=await readJsonWithLimit(response,512*1024) as Record<string,unknown>;}catch{if(response.ok)throw new HttpError(502,'ASAAS_INVALID_RESPONSE','O Asaas retornou uma resposta inválida.');}}
  if (!response.ok) {
    console.error(JSON.stringify({ level:"error",event:"asaas.request_failed",route:path.split('/')[1]?.split('?')[0],status:response.status }));
    if (response.status === 404) throw new HttpError(404,"ASAAS_RESOURCE_NOT_FOUND","Recurso Asaas não encontrado.");
    if(response.status===401||response.status===403)throw new HttpError(503,'ASAAS_AUTH_FAILED','Confira a chave e o ambiente Asaas configurados.');
    throw new HttpError(502,"ASAAS_ERROR","O Asaas não aceitou a solicitação.");
  }
  return body as T;
}
const asaas=asaasRequest;

export async function findOrCreateCustomer(env: AsaasEnvironment,lead: LeadForBilling,fetcher: AsaasFetcher = fetch) {
  const document=env.ASAAS_SANDBOX_TEST_DOCUMENT;
  if(document&&(env.LOCAL_TEST_MODE!=='true'||baseUrl(env)!==DEFAULT_BASE_URL||!env.ASAAS_API_KEY?.startsWith('$aact_hmlg_')||!/^\d{11}(\d{3})?$/.test(document)))throw new HttpError(503,'ASAAS_TEST_DATA_BLOCKED','Documento sintético permitido somente no Sandbox local autorizado.');
  const found = await asaas<{ data:Array<{ id:string }> }>(env,`/customers?externalReference=${encodeURIComponent(lead.id)}&limit=1`,{},fetcher);
  if (found.data[0]) return found.data[0].id;
  const created = await asaas<{ id:string }>(env,"/customers",{
    method:"POST",
    body:JSON.stringify({ name:lead.name,email:lead.email,mobilePhone:lead.normalizedPhone.replace(/^\+55/,""),externalReference:lead.id,notificationDisabled:true,...(document?{cpfCnpj:document}:{}) }),
  },fetcher);
  return created.id;
}

export function buildAsaasPaymentPayload(input: {
  customerId:string;
  checkoutId:string;
  method:"PIX"|"CREDIT_CARD";
  amountCents:number;
  installmentCount:number;
  dueDate:string;
  description:string;
}) {
  const common = {
    customer:input.customerId,
    billingType:input.method,
    dueDate:input.dueDate,
    description:input.description,
    externalReference:input.checkoutId,
  };
  if (input.installmentCount > 1) {
    return { ...common,installmentCount:input.installmentCount,totalValue:input.amountCents / 100 };
  }
  return { ...common,value:input.amountCents / 100 };
}

export async function findPaymentsByExternalReference(env: AsaasEnvironment,checkoutId: string,fetcher: AsaasFetcher = fetch) {
  const response = await asaas<{ data:AsaasPaymentSnapshot[] }>(env,`/payments?externalReference=${encodeURIComponent(checkoutId)}&limit=100`,{},fetcher);
  return response.data.filter((payment) => payment.externalReference === checkoutId);
}

export async function createAsaasPayment(env: AsaasEnvironment,input: {
  customerId:string;
  checkoutId:string;
  method:"PIX"|"CREDIT_CARD";
  amountCents:number;
  installmentCount:number;
  dueDate:string;
  description:string;
},fetcher: AsaasFetcher = fetch) {
  return asaas<AsaasPaymentSnapshot>(env,"/payments",{
    method:"POST",
    body:JSON.stringify(buildAsaasPaymentPayload(input)),
  },fetcher);
}

export async function listInstallmentPayments(env: AsaasEnvironment,installmentId: string,fetcher: AsaasFetcher = fetch) {
  const response = await asaas<{ data:AsaasPaymentSnapshot[] }>(env,`/installments/${encodeURIComponent(installmentId)}/payments?limit=100`,{},fetcher);
  return response.data;
}

export async function getAsaasPayment(env: AsaasEnvironment,paymentId: string,fetcher: AsaasFetcher = fetch) {
  return asaas<AsaasPaymentSnapshot>(env,`/payments/${encodeURIComponent(paymentId)}`,{},fetcher);
}

export async function cancelAsaasPayment(env: AsaasEnvironment,input: { paymentId:string;installmentId?:string|null },fetcher: AsaasFetcher = fetch) {
  const path = input.installmentId
    ? `/installments/${encodeURIComponent(input.installmentId)}/payments`
    : `/payments/${encodeURIComponent(input.paymentId)}`;
  try {
    await asaas<Record<string,unknown>>(env,path,{ method:"DELETE" },fetcher);
    return { cancelled:true as const,alreadyMissing:false };
  } catch (error) {
    if (error instanceof HttpError && error.code === "ASAAS_RESOURCE_NOT_FOUND") {
      return { cancelled:true as const,alreadyMissing:true };
    }
    throw error;
  }
}
