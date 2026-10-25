export class AdminApiError extends Error {
  constructor(message:string,public status:number,public code?:string) {super(message);}
}
export async function adminApi<T>(url:string,init?:RequestInit):Promise<T> {
  let response:Response;
  try {response=await fetch(url,{...init,headers:{"content-type":"application/json",...init?.headers}});}
  catch(error) {if(init?.signal?.aborted)throw error;throw new AdminApiError('Não foi possível conectar. Verifique a conexão e tente novamente.',0);}
  if(response.status===401) {
    if(typeof window!=='undefined')window.location.replace('/admin/login');
    throw new AdminApiError('Sessão expirada. Entre novamente.',401,'UNAUTHENTICATED');
  }
  let body:T & {message?:string;code?:string};
  try {body=await response.json();}
  catch {throw new AdminApiError('O serviço retornou uma resposta inválida. Tente novamente.',response.status);}
  if(!response.ok)throw new AdminApiError(body.message??'Falha na solicitação.',response.status,body.code);
  return body;
}
