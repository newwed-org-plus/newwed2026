import {startLocalTunnel} from './local-tunnel';
const starting=startLocalTunnel();
const stop=async()=>{try{const tunnel=await starting;await tunnel.stop();}catch{/* Setup already restores on failure. */}};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop());
await starting.catch(error=>{console.error(error.message);process.exitCode=1;});
