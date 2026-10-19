import { createServers } from './server.js';
import { dispatcher } from './transport.js';
const port=Number(process.env.PORT || 3000); const merchantPort=Number(process.env.MERCHANT_PORT || 3001);
if (![port,merchantPort].every(n=>Number.isInteger(n)&&n>1023&&n<65536)||port===merchantPort) throw new Error('Invalid ports');
const {app,merchant}=createServers(port,merchantPort);
for (const server of [app,merchant]) server.on('error',()=>{ console.error('Local listener failed. Check that both configured ports are free.');process.exit(1); });
app.listen(port,'127.0.0.1',()=>console.log(`Temby: http://localhost:${port}`));
merchant.listen(merchantPort,'127.0.0.1',()=>console.log(`Merchant sandbox: http://localhost:${merchantPort}`));
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{app.close();merchant.close();void dispatcher.close();});
