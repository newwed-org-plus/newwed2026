import {createServer} from 'node:http';
const line=process.env.LOCAL_UAZAPI_LINE??'atendimento';if(!/^[a-z0-9-]{1,64}$/.test(line))throw new Error('Linha inválida.');
const allowed=`/api/webhooks/uazapi/${line}`;
const server=createServer(async(request,response)=>{
 const url=new URL(request.url??'/','http://127.0.0.1');
 if(url.pathname!==allowed||url.search||!['GET','POST'].includes(request.method)){response.writeHead(404).end();return;}
 try {
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>1024*1024){response.writeHead(413).end();return;}chunks.push(chunk);}
  const headers={};for(const name of ['content-type','token','x-uazapi-token','x-request-id'])if(typeof request.headers[name]==='string')headers[name]=request.headers[name];
  const upstream=await fetch(`http://127.0.0.1:4173${allowed}`,{method:request.method,headers,body:request.method==='POST'?Buffer.concat(chunks):undefined,redirect:'manual',signal:AbortSignal.timeout(25000)});
  response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json'});response.end(Buffer.from(await upstream.arrayBuffer()));
 }catch{response.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({message:'Recebimento local temporariamente indisponível.'}));}
});
server.listen(Number(process.env.LOCAL_WEBHOOK_PORT??4174),'127.0.0.1',()=>console.log('Ponte local de webhook ativa. Admin e depuração não são expostos pelo túnel.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
