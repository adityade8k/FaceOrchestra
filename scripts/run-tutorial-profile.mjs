import {writeFileSync} from 'node:fs';
const output=process.argv[2]||'/tmp/face-tutorial-profile.json';
const appUrl=process.env.TUTORIAL_APP_URL||'http://127.0.0.1:5173/';
const pages=await fetch('http://127.0.0.1:9225/json/list').then(r=>r.json());
const page=pages.find(p=>p.type==='page');
if(!page)throw new Error('Open the app in the dedicated Chrome profile on port 9225.');
const ws=new WebSocket(page.webSocketDebuggerUrl),requests=new Map();let nextId=0;
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;requests.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
try {
  const visual=await send('Runtime.evaluate',{expression:'globalThis.tutorialResultPanelPng',returnByValue:true});
  if(visual.result?.value?.startsWith('data:image/png;base64,'))writeFileSync('/tmp/tutorial-result-panel.png',Buffer.from(visual.result.value.split(',')[1],'base64'));
  await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Page.navigate',{url:appUrl});await new Promise(resolve=>setTimeout(resolve,1500));
  const result=await send('Runtime.evaluate',{expression:`(async()=>{const {app}=await import('/src/main.js');return (await import('/scripts/profile-tutorial-scenes.mjs')).profile(app,{stopAfterChord:${process.env.TUTORIAL_PROFILE==='chord'}});})()`,awaitPromise:true,returnByValue:true,userGesture:true,timeout:240000});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  writeFileSync(output,JSON.stringify(result.result.value,null,2)+'\n');console.log(`Profile saved: ${output}`);
} finally {ws.close();}
