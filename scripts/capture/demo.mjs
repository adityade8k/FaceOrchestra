import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launchChrome } from './chrome.mjs';

export async function generateDemo({ service,chrome,output }={}) {
  const own=!service;
  if(own){service=await startServer({host:'127.0.0.1',port:0,plain:true,pairCode:'123456'});chrome=await launchChrome();}
  output ||= resolve('captures/demo');await mkdir(output,{recursive:true});const base=`http://127.0.0.1:${service.port}`;
  try {
    await chrome.navigate(`${base}/`);
    await chrome.evaluate(`fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:${JSON.stringify(service.pairCode)}})}).then(r=>r.json())`);
    console.log('Recording synthetic performance with actual app assets and PCM audio…');
    const result=await chrome.evaluate(`import('/capture/demo.js').then(m=>m.recordDemo())`);
    await writeFile(join(output,'phone.webm'),Buffer.from(result.videoBase64,'base64'));delete result.videoBase64;
    await writeFile(join(output,'project.json'),JSON.stringify(result.project,null,2));await writeFile(join(output,'evidence.json'),JSON.stringify(result,null,2));
    console.log(`Synthetic take ${result.id}\nVideo and project: ${output}`);return result;
  }finally{if(own){await chrome.close();await service.close();}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await generateDemo();
