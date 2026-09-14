// Attach to a dedicated Chrome profile launched with --remote-debugging-port=9225.
// The test uses the normal page runtime, renderer, input services and Web Audio.
import { writeFileSync } from 'node:fs';
const endpoint=process.env.TUTORIAL_CDP_URL || 'http://127.0.0.1:9225';
const appUrl=process.env.TUTORIAL_APP_URL || 'http://127.0.0.1:5173/';
const output=process.argv[2] || '/tmp/face-orchestra-tutorial-validation.json';
const pages=await fetch(`${endpoint}/json/list`).then(r=>r.json());
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(appUrl));
if(!page)throw new Error(`Open ${appUrl} in the dedicated Chrome test profile first.`);
const ws=new WebSocket(page.webSocketDebuggerUrl);
const requests=new Map();let nextId=0;const captures=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++nextId;requests.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});
ws.onmessage=({data})=>{
  const message=JSON.parse(data);
  if(message.id) {
    const pending=requests.get(message.id);requests.delete(message.id);
    message.error?pending.reject(message.error):pending.resolve(message.result);
  } else if(message.method==='Runtime.bindingCalled'&&message.params.name==='tutorialTestProgress') {
    const progress=JSON.parse(message.params.payload);
    console.log(`${progress.seconds}s ${progress.step || 'performance complete'}`);
    if(['performance','tutorial-spawn','tutorial-radial'].includes(progress.step)) captures.push((async()=>{
      await new Promise(resolve=>setTimeout(resolve,600));
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      const path=progress.step==='tutorial-radial'?'/tmp/tutorial-radial-lesson.png':progress.step==='tutorial-spawn'?'/tmp/tutorial-spawn-locked-chord.png':'/tmp/face-orchestra-two-loopers.png';writeFileSync(path,Buffer.from(shot.data,'base64'));return path;
    })());
  }
};
ws.onclose=event=>{for(const pending of requests.values())pending.reject(new Error(`Chrome test connection closed (${event.code}): ${event.reason}`));requests.clear();};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
try {
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Runtime.addBinding',{name:'tutorialTestProgress'});
  await send('Page.reload',{ignoreCache:true});
  await new Promise(resolve=>setTimeout(resolve,1500));
  const result=await send('Runtime.evaluate',{
    expression:process.env.TUTORIAL_TEST==='recording'?`(async()=>{const {app}=await import('/src/main.js');return (await import('/scripts/validate-looper-recording-browser.mjs')).validateStandalone(app);})()`:['usability','spawn','radial'].includes(process.env.TUTORIAL_TEST)?`(async()=>{const {app}=await import('/src/main.js');return (await import('/scripts/validate-tutorial-radial-browser.mjs')).validateStandalone(app);})()`:`(async()=>{
      const {app}=await import('/src/main.js');
      const {validate}=await import('/scripts/validate-tutorial-browser.mjs');
      const report=await validate(app,{onProgress:p=>tutorialTestProgress(JSON.stringify(p))});
      report.manualHonkRegression=await (await import('/scripts/validate-manual-honks-browser.mjs')).validate();
      report.presentationRegression=await (await import('/scripts/validate-honk-presentation-browser.mjs')).validate();
      return report;
    })()`,awaitPromise:true,returnByValue:true,userGesture:true,timeout:900000,
  });
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const report=result.result.value;report.screenshots=await Promise.all(captures);
  writeFileSync(output,`${JSON.stringify(report,null,2)}\n`);
  console.log(`Passed. Evidence: ${output}`);
} finally {ws.close();}
