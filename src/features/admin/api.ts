export class AdminApiError extends Error {
  constructor(message:string,public status:number,public code?:string) {super(message);}
}
export async function adminApi<T>(url:string,init?:RequestInit):Promise<T> {
 const readOnly=['GET','HEAD'].includes((init?.method??'GET').toUpperCase());
 for(let attempt=0;;attempt++){
  let response:Response;
  try{response=await fetch(url,{...init,headers:{'content-type':'application/json',...init?.headers}});}
  catch(error){
   if(init?.signal?.aborted)throw error;
   if(readOnly&&attempt<2){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));continue;}
   throw new AdminApiError(readOnly?'Não foi possível conectar. Verifique a conexão e tente novamente.':'A conexão foi interrompida. A operação pode ter sido registrada; atualize o histórico antes de repetir.',0);
  }
  if(response.status===401){
   if(typeof window!=='undefined')window.location.replace('/admin/login');
   throw new AdminApiError('Sessão expirada. Entre novamente.',401,'UNAUTHENTICATED');
  }
  let body:T & {message?:string;code?:string};
  try{body=await response.json();}
  catch{throw new AdminApiError('O serviço retornou uma resposta inválida. Tente novamente.',response.status);}
  if(response.status===503&&body&&typeof body==='object'&&body.code==='LOCAL_RUNTIME_UNAVAILABLE'){
   if(readOnly&&attempt<2){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));continue;}
   throw new AdminApiError(readOnly?body.message??'Ambiente local temporariamente indisponível.':'O ambiente local reiniciou durante a operação. Ela pode ter sido registrada; atualize o histórico antes de repetir.',503,body.code);
  }
  if(!response.ok)throw new AdminApiError((body&&typeof body==='object'?body.message:undefined)??'Falha na solicitação.',response.status,body&&typeof body==='object'?body.code:undefined);
  return body;
 }
}
