// Targeted local regression: node scripts/capture/check-phone-export.mjs PROJECT VIDEO [TIME]
// Uses the existing take, writes a NEW short export, and never changes the input files.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { startServer } from './server.mjs';
import { launchChrome } from './chrome.mjs';

const [projectPath,videoPath,time='37.066667']=process.argv.slice(2);
if(!projectPath||!videoPath)throw new Error('Provide an existing project JSON and its local phone video.');
const project=JSON.parse(await readFile(projectPath,'utf8')),at=Number(time);
assert.ok(Number.isFinite(at)&&at>=0);
const output=resolve('test-results/capture-phone-export');await mkdir(output,{recursive:true});
const service=await startServer({host:'127.0.0.1',port:0,plain:true,pairCode:'123456'}),chrome=await launchChrome();
try{
  await chrome.navigate(`http://127.0.0.1:${service.port}/capture/`);
  await chrome.evaluate(`fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'123456'})}).then(r=>r.json())`);
  await chrome.evaluate(`captureEditor.loadTake(${JSON.stringify(project.takeId)})`);
  const doc=await chrome.send('DOM.getDocument'),input=await chrome.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#video-file'});
  await chrome.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[resolve(videoPath)]});
  await chrome.evaluate(`new Promise((resolve,reject)=>{const start=performance.now(),timer=setInterval(()=>{if(captureEditor.project.video&&document.getElementById('video').readyState>=2){clearInterval(timer);resolve();}else if(performance.now()-start>20000){clearInterval(timer);reject(new Error(document.getElementById('notice').textContent));}},50);})`);
  await chrome.evaluate(`captureEditor.setProject(${JSON.stringify(project)})`);
  const report=[];
  for(const trim of [{start:Math.max(0,at-.2),end:Math.min(project.video.duration,at+.2)},{start:project.video.duration-.15,end:project.video.duration}]){
    await chrome.evaluate(`captureEditor.setProject({trim:${JSON.stringify(trim)}})`);
    const exported=await chrome.evaluate('captureEditor.exportProject()');assert.equal(exported.ffmpeg,true,'This regression checks phone compositing with FFmpeg');
    const checked=await chrome.evaluate(`(async()=>{
      const ed=captureEditor,c=document.getElementById('composite'),ctx=c.getContext('2d'),imageCanvas=document.createElement('canvas'),imageCtx=imageCanvas.getContext('2d');
      c.width=${project.output.width};c.height=${project.output.height};ed.replay.renderer.setSize(c.width,c.height);imageCanvas.width=c.width;imageCanvas.height=c.height;
      const frames=${JSON.stringify(exported.timestamps)};let changedMax=0;
      for(let i=0;i<frames.length;i++){
        await ed.seek(frames[i].video);ed.render({time:frames[i].video,calibration:false,strict:true});const expected=ctx.getImageData(0,0,c.width,c.height).data;
        const image=new Image();image.src='/api/exports/${exported.id}/frame-'+String(i).padStart(6,'0')+'.png';await image.decode();imageCtx.drawImage(image,0,0);const actual=imageCtx.getImageData(0,0,c.width,c.height).data;
        let changed=0;for(let j=0;j<actual.length;j+=4)if([0,1,2].some(k=>Math.abs(actual[j+k]-expected[j+k])>3))changed++;
        const fraction=changed/(c.width*c.height);changedMax=Math.max(changedMax,fraction);if(fraction>.001)throw new Error('Export differs from decoded phone composite at '+frames[i].video+' s: '+fraction);
      }
      return {frames:frames.length,changedMax};
    })()`);
    report.push({export:exported.id,trim,...checked});
    console.log(JSON.stringify(report.at(-1)));
  }
  assert.deepEqual(chrome.errors,[]);await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
}finally{await chrome.close();await service.close();}
