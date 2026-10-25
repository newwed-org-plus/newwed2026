import events from './events';
export default {
 ...events,
 async fetch(request,env) {
  if(env.ENVIRONMENT!=='development'||request.method!=='POST'||new URL(request.url).pathname!=='/__scheduled')return new Response(null,{status:404});
  await events.scheduled({cron:'*/5 * * * *',scheduledTime:Date.now(),noRetry(){}},env);
  return Response.json({ok:true});
 },
} satisfies ExportedHandler<Env>;
