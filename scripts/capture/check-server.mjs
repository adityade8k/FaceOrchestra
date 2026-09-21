import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { startServer } from './server.mjs';
const directory=await mkdtemp(join(tmpdir(),'honk-protocol-'));
let service=await startServer({host:'127.0.0.1',port:0,plain:true,dataRoot:directory,pairCode:'123456'}),base=`http://127.0.0.1:${service.port}`;
async function pair(){const response=await fetch(`${base}/api/pair`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({code:'123456'})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
let cookie=await pair();
async function connect(hello){
  const ws=new WebSocket(base.replace('http','ws')+'/api/stream',{headers:{Origin:base,Cookie:cookie}}),messages=[],waiting=[];
  ws.on('message',raw=>{const data=JSON.parse(raw);const wait=waiting.shift();wait?wait(data):messages.push(data);});
  const next=()=>messages.length?Promise.resolve(messages.shift()):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Protocol reply timed out')),5000);waiting.push(value=>{clearTimeout(timer);resolve(value);});});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.send(JSON.stringify(hello));return {ws,next,ready:await next()};
}
const metadata={id:'resumable',version:1,created:new Date().toISOString(),audio:{sampleRate:48000,channels:2}};
try {
  assert.equal((await fetch(`${base}/api/takes`)).status,401);
  assert.equal((await fetch(`${base}/api/takes`,{headers:{Cookie:cookie,Origin:'https://untrusted.invalid'}})).status,403);
  for(const path of ['/certs/localhost-key.pem','/captures/resumable/take.json','/.git/config','/package.json','/scripts/capture/server.mjs'])assert.equal((await fetch(base+path)).status,404);
  let client=await connect({type:'hello',create:true,metadata});assert.equal(client.ready.type,'ready');
  const packet={stream:'samples',seq:0,t:0,data:{full:true,nodes:{}}};
  for(let i=0;i<2;i++){client.ws.send(JSON.stringify({type:'packet',packet}));assert.equal((await client.next()).seq,0);}
  client.ws.terminate();await new Promise(r=>setTimeout(r,100));await service.close();
  service=await startServer({host:'127.0.0.1',port:0,plain:true,dataRoot:directory,pairCode:'123456'});base=`http://127.0.0.1:${service.port}`;cookie=await pair();
  client=await connect({type:'hello',id:'resumable'});assert.equal(client.ready.last.samples,0);
  client.ws.send(JSON.stringify({type:'packet',packet:{...packet,seq:1,t:.1}}));assert.equal((await client.next()).seq,1);
  client.ws.send(JSON.stringify({type:'finish',expected:{samples:1,events:-1,audio:-1},gaps:[],reason:'stop',duration:.1}));assert.equal((await client.next()).metadata.complete,true);client.ws.close();
  const lines=(await readFile(join(directory,'resumable','samples.ndjson'),'utf8')).trim().split('\n');assert.equal(lines.length,2);
  client=await connect({type:'hello',create:true,metadata:{...metadata,id:'gap'}});client.ws.send(JSON.stringify({type:'packet',packet:{...packet,seq:2}}));assert.match((await client.next()).message,/Sequence gap/);client.ws.terminate();
  await new Promise(r=>setTimeout(r,100));
  const imported=await fetch(`${base}/api/import`,{method:'POST',headers:{Cookie:cookie},body:Buffer.from('not a take')});assert.equal(imported.status,400);
  console.log('Passed: paired Origin checks, private paths, durable acknowledgements, duplicates, restart/resume, final flush, sequence rejection, invalid archive.');
}finally{await service.close();await rm(directory,{recursive:true,force:true});}
