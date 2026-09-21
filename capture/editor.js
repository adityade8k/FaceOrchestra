import * as THREE from 'three';
import { Timeline } from '/src/capture/Timeline.js';
import { ReplayScene } from '/src/capture/ReplayScene.js';
import { fitCamera, projectPoint, controllerLandmark, cropRect, outputPixel } from '/src/capture/calibration.js';
import { fitTimeMap, timeMap, exportTimes } from '/src/capture/format.js';

const $=id=>document.getElementById(id),number=id=>Number($(id).value);
const video=$('video'),audio=$('audio'),canvas=$('composite'),ctx=canvas.getContext('2d');
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setPixelRatio(1);renderer.setSize(540,960);
let replay=new ReplayScene(renderer),timeline=null,take=null,videoURL=null,videoTime=0,selectedPoint=false,exporting=false,cancelled=false,presentedPTS=0;
let selectedVideo=null,restoreVideoSettings=false,expectedVideo=null;
const defaultCamera=()=>({position:[0,1.4,3],rotation:[0,0,0],fov:55,center:[0,0]});
let project={version:1,takeId:null,segment:0,mapping:{a:1,b:0},camera:defaultCamera(),crop:{zoom:1,x:0,y:0},observations:[],trim:{start:0,end:1},output:{width:1080,height:1920,fps:30},layers:{...replay.layers},opacity:1,calibration:null};
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function api(path,options={}){const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw new Error(data.error||`Local service returned ${response.status}`);return data;}
const post=(path,data)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function run(fn){return async event=>{try{await fn(event);}catch(error){notice(error.message,true);}};}
async function readNDJSON(path){const response=await fetch(path);if(!response.ok)throw new Error(`Cannot read ${path}`);const records=[];let pending='';const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();for(;;){const {value,done}=await reader.read();if(done)break;pending+=value;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(line)records.push(JSON.parse(line));}}return records;}
async function refresh(){const status=await api('/api/status');$('connection').textContent=status.paired?'Local receiver connected':'Receiver available · pairing required';$('pair').hidden=status.paired;if(!status.paired)return;const takes=await api('/api/takes');$('takes').replaceChildren(new Option('Select a take',''));for(const row of takes)$('takes').add(new Option(`${row.synthetic?'SYNTHETIC · ':''}${row.created?.slice(0,19)||row.id} · ${row.status}`,row.id));if(take)$('takes').value=take.id;}
async function loadTake(id){
  if(!id)return;notice('Loading take and recorded presentation assets…');audio.pause();
  const metadata=await api(`/api/takes/${id}`);
  const receiver=await api('/api/status');
  if(!metadata.assetsBundled)for(const [path,hash] of Object.entries(metadata.build?.assets||{}))if(receiver.build.assets[path]!==hash)throw new Error(`Asset version mismatch for ${path}. Open the portable take with its matching repository assets.`);
  const [samples,events]=await Promise.all([readNDJSON(`/api/takes/${id}/samples.ndjson`),readNDJSON(`/api/takes/${id}/events.ndjson`)]);
  const next=new Timeline(samples,events,metadata.gaps||[]),scene=new ReplayScene(renderer,{assetURL:path=>metadata.assetsBundled?`/api/takes/${id}/assets${path}`:path});await scene.load(events);
  replay.dispose();replay=scene;timeline=next;take=metadata;project.takeId=id;project.takeIdentity={id,originalId:metadata.originalId,created:metadata.created,build:metadata.build};project.segment=next.frames[0].segment;
  $('takes').value=id;
  $('gaps').replaceChildren();for(const gap of [...(metadata.gaps||[]),...(metadata.missingIntervals||[])]){const item=document.createElement('li');item.textContent=`${gap.stream}: ${gap.start.toFixed(3)}–${gap.end===null?'unknown end':gap.end.toFixed(3)} s · ${gap.reason}`;$('gaps').append(item);}
  audio.src=`/api/takes/${id}/audio.wav`;audio.load();
  $('take-info').textContent=`${metadata.synthetic?'SYNTHETIC DEMO. ':''}${metadata.duration?.toFixed(2)||next.duration.toFixed(2)} s · ${metadata.status}. ${metadata.complete?'All expected streams saved.':`${metadata.reason||'Not finalized'}; inspect ${metadata.gaps?.length||0} reported gaps. Use Finalize interrupted take after disconnecting to rebuild WAV.`}`;
  $('download-take').hidden=false;$('download-take').href=`/api/takes/${id}/archive`;
  $('marks').replaceChildren();for(const e of events.filter(e=>['sync','calibration-mark','reference-reset'].includes(e.data.kind))){const b=document.createElement('button');b.textContent=`${e.data.kind} ${e.t.toFixed(3)}s`;b.onclick=run(()=>seek((e.t-project.mapping.b)/project.mapping.a));$('marks').append(b);}
  if(!videoURL){$('timeline').max=String(next.duration);project.trim.end=next.duration;}
  project.camera=defaultCamera();project.observations=[];project.calibration=null;restoreVideoSettings=false;expectedVideo=null;updateInputs();render();notice(scene.issues.length?scene.issues.join(' '):metadata.synthetic?'Synthetic take loaded. This does not validate real headset or phone capture.':'Take loaded. Select video, synchronize, then calibrate.',scene.issues.length>0);
}
function updateInputs(){
  for(const [id,value] of Object.entries({rate:project.mapping.a,offset:project.mapping.b,'crop-zoom':project.crop.zoom,'crop-x':project.crop.x,'crop-y':project.crop.y,'trim-start':project.trim.start,'trim-end':project.trim.end,resolution:project.output.width,fps:project.output.fps,opacity:project.opacity}))$(id).value=value;
  const values=[...project.camera.position,...project.camera.rotation,project.camera.fov,...project.camera.center];['cam-x','cam-y','cam-z','cam-pitch','cam-yaw','cam-roll','cam-fov','cam-cx','cam-cy'].forEach((id,i)=>$(id).value=values[i]);
  for(const box of $('layers').querySelectorAll('input'))box.checked=project.layers[box.name];updateObservations();
}
function readSettings(){
  project.mapping={a:number('rate'),b:number('offset')};if(!(project.mapping.a>.9&&project.mapping.a<1.1)||!Number.isFinite(project.mapping.b))throw new Error('Enter a finite offset and a rate between 0.9 and 1.1.');
  project.camera={position:['cam-x','cam-y','cam-z'].map(number),rotation:['cam-pitch','cam-yaw','cam-roll'].map(number),fov:number('cam-fov'),center:['cam-cx','cam-cy'].map(number)};
  if(![...project.camera.position,...project.camera.rotation,project.camera.fov,...project.camera.center].every(Number.isFinite)||project.camera.fov<10||project.camera.fov>130)throw new Error('Invalid camera values.');
  project.crop={zoom:number('crop-zoom'),x:number('crop-x'),y:number('crop-y')};project.trim={start:number('trim-start'),end:number('trim-end')};project.output={width:number('resolution'),height:number('resolution')*16/9,fps:number('fps')};project.opacity=number('opacity');
  if(!Object.values(project.crop).every(Number.isFinite)||project.crop.zoom<1||project.crop.zoom>4||Math.abs(project.crop.x)>1||Math.abs(project.crop.y)>1)throw new Error('Crop zoom must be 1–4, and crop offsets between −1 and 1.');
}
function render({time=videoTime,transparent=false,calibration=true}={}){
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if(!transparent){ctx.fillStyle='#17221b';ctx.fillRect(0,0,w,h);if(video.readyState>=2){const c=cropRect(video.videoWidth,video.videoHeight,w,h,project.crop);ctx.drawImage(video,c.sx,c.sy,c.sw,c.sh,0,0,w,h);}else {ctx.fillStyle='#afc3aa';ctx.font='18px system-ui';ctx.textAlign='center';ctx.fillText('Select a phone video',w/2,h/2);}}
  const sceneTime=timeMap(time,project.mapping);
  if(timeline){const frame=timeline.seek(sceneTime);replay.layers={...project.layers};if(!calibration){replay.layers.controllers=false;replay.layers.headset=false;}replay.setCamera(project.camera,w,h);replay.apply(frame);replay.render();ctx.globalAlpha=project.opacity;ctx.drawImage(renderer.domElement,0,0,w,h);ctx.globalAlpha=1;
    $('profiles').textContent=frame.xr.controllers.map(c=>`${c.handedness}: ${c.profiles.join(', ')||'no profile'}`).join(' · ')||'No tracked controllers at this timestamp.';
    if(calibration)for(const observation of project.observations){if(Math.abs(observation.videoTime-time)>.12)continue;const p=projectPoint(observation.world,project.camera);const x=observation.pixel[0]/1080*w,y=observation.pixel[1]/1920*h;ctx.strokeStyle=observation.heldOut?'#ffb56e':'#96edb1';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.stroke();if(p){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(p[0]/1080*w,p[1]/1920*h);ctx.stroke();ctx.fillStyle='#ff716a';ctx.fillRect(p[0]/1080*w-3,p[1]/1920*h-3,6,6);}}
  }
  $('frame-time').textContent=`VIDEO ${time.toFixed(3)} s · SCENE ${sceneTime.toFixed(3)} s`;$('seek-time').value=time.toFixed(3);$('timeline').value=time;
}
async function seek(time){
  videoTime=Math.max(0,Math.min(time,videoURL?video.duration:timeline?.duration||time));
  if(videoURL&&Math.abs(video.currentTime-videoTime)>.00001) {
    await new Promise((resolve,reject)=>{let callback,settled=false;const timeout=setTimeout(()=>finish(new Error('Video seek timed out. Convert to SDR H.264 locally.')),8000);const finish=error=>{if(settled)return;settled=true;clearTimeout(timeout);video.removeEventListener('seeked',onSeek);if(callback)video.cancelVideoFrameCallback(callback);error?reject(error):resolve();};const onSeek=()=>{if(!video.requestVideoFrameCallback)requestAnimationFrame(()=>finish());};video.addEventListener('seeked',onSeek,{once:true});if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback((_,meta)=>{presentedPTS=meta.mediaTime;finish();});video.currentTime=videoTime;});
  }
  if(!exporting&&audio.readyState>=1){audio.currentTime=Math.max(0,timeMap(videoTime,project.mapping));audio.playbackRate=project.mapping.a;}
  render();return {videoTime,presentedPTS};
}
function pause(){video.pause();audio.pause();if(videoURL&&!exporting){videoTime=video.currentTime;render();}$('play').textContent='Play';}
async function play(){if(!videoURL)throw new Error('Choose a video first.');if(!video.paused){pause();return;}readSettings();audio.currentTime=Math.max(0,timeMap(video.currentTime,project.mapping));audio.playbackRate=project.mapping.a;audio.muted=$('phone-audio').checked;video.muted=!$('phone-audio').checked;await video.play();if(take)audio.play().catch(()=>notice('Clean WAV is not ready. Finalize or recover the take.',true));$('play').textContent='Pause';}
function videoFrame(_,metadata){presentedPTS=metadata.mediaTime;if(!exporting&&!video.paused){const desired=timeMap(video.currentTime,project.mapping);if(desired<0){audio.pause();}else if(audio.readyState>=2&&Math.abs(audio.currentTime-desired)>.08){audio.currentTime=desired;audio.play().catch(()=>{});}}video.requestVideoFrameCallback(videoFrame);}
if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(videoFrame);else video.addEventListener('timeupdate',()=>{if(!exporting){videoTime=video.currentTime;render();}});
// The playhead drives the same scene-time mapping as offline output. Source PTS
// remains independent and is used when a clicked video frame supplies a landmark.
function animatePreview(){if(!exporting&&videoURL&&!video.paused){videoTime=video.currentTime;render();}requestAnimationFrame(animatePreview);}
requestAnimationFrame(animatePreview);
video.onended=pause;
function updateObservations(){
  $('observations').replaceChildren();for(const [index,o] of project.observations.entries()){const p=projectPoint(o.world,project.camera),error=p?Math.hypot(p[0]-o.pixel[0],p[1]-o.pixel[1]):Infinity;const row=document.createElement('li');row.textContent=`${o.heldOut?'VALIDATE':'FIT'} · ${o.hand} · ${o.videoTime.toFixed(3)}s · ${error.toFixed(1)} px`;const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{project.observations.splice(index,1);project.calibration=null;updateObservations();render();};row.append(remove);$('observations').append(row);}
  const c=project.calibration;$('fit-report').textContent=c?`${c.valid?'Fit accepted':'FIT FAILED'} · ${c.fitRms.toFixed(2)} px RMS\nHeld-out: ${c.heldOutRms===null?'add observations':c.heldOutRms.toFixed(2)+' px RMS'}\n${c.validated?'Held-out validation passed':'Not validated: use at least two additional observations'}`:'Manual / uncalibrated camera';$('fit-report').classList.toggle('bad',Boolean(c&&!c.valid));
}
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('pair').onsubmit=run(async e=>{e.preventDefault();await post('/api/pair',{code:$('code').value});await refresh();notice('This browser is paired.');});
$('refresh').onclick=run(refresh);$('takes').onchange=run(e=>loadTake(e.target.value));
$('recover').onclick=run(async()=>{if(!take)throw new Error('Select a take.');await post(`/api/takes/${take.id}/recover`,{});await loadTake(take.id);});
$('import-take').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;notice('Importing portable take locally…');const result=await api('/api/import',{method:'POST',body:file});await refresh();await loadTake(result.id);});
$('video-file').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;
  if(!video.requestVideoFrameCallback)throw new Error('Video presentation timestamps are unavailable. Use a current desktop Chrome browser for calibration and export.');
  if(expectedVideo&&(file.name!==expectedVideo.name||file.size!==expectedVideo.size))throw new Error(`This project expects ${expectedVideo.name}. Choose that file, or reload the take to start a new video alignment.`);
  pause();if(videoURL)URL.revokeObjectURL(videoURL);videoURL=URL.createObjectURL(file);video.src=videoURL;video.muted=true;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Unsupported video codec. Convert locally: ffmpeg -i input.mov -vf "format=yuv420p" -c:v libx264 -crf 18 -c:a aac phone-sdr.mp4 (use an SDR source; HDR needs tone mapping).'));});
  if(!Number.isFinite(video.duration))throw new Error('Video has no finite duration. Convert to a seekable local MP4.');
  selectedVideo={name:file.name,size:file.size,lastModified:file.lastModified,width:video.videoWidth,height:video.videoHeight,duration:video.duration};
  if(!restoreVideoSettings){if(project.video&&(project.video.name!==file.name||project.video.size!==file.size)){project.observations=[];project.calibration=null;}project.trim.end=video.duration;}
  project.video=selectedVideo;restoreVideoSettings=false;expectedVideo=null;$('timeline').max=video.duration;$('video-info').textContent=`${file.name} · ${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(3)}s. Rotation decoded by browser.`;updateInputs();await seek(0);notice('Video ready. Match a sync cue or controller gesture.');
});
$('play').onclick=run(play);$('previous').onclick=run(()=>{pause();return seek(videoTime-1/project.output.fps);});$('next').onclick=run(()=>{pause();return seek(videoTime+1/project.output.fps);});
$('timeline').onchange=$('seek-time').onchange=run(e=>{pause();return seek(Number(e.target.value));});
$('align').onclick=run(()=>{project.mapping=fitTimeMap({video:number('v1'),scene:number('s1')},$('v2').value!==''&&$('s2').value!==''?{video:number('v2'),scene:number('s2')}:null);project.anchors=[{video:number('v1'),scene:number('s1')},...($('v2').value!==''?[{video:number('v2'),scene:number('s2')}]:[])];updateInputs();render();notice('Time mapping applied.');});
$('phone-audio').onchange=e=>{video.muted=!e.target.checked;audio.muted=e.target.checked;};
for(const id of ['rate','offset','crop-zoom','crop-x','crop-y','trim-start','trim-end','resolution','fps','opacity','cam-x','cam-y','cam-z','cam-pitch','cam-yaw','cam-roll','cam-fov','cam-cx','cam-cy'])$(id).onchange=run(()=>{if(id.startsWith('crop')||id.startsWith('cam'))project.calibration=null;if(id.startsWith('crop')){project.observations=[];notice('Crop changed. Collect landmarks again in the new output coordinates.');}readSettings();updateObservations();render();});
for(const [name,checked] of Object.entries(project.layers)){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.name=name;box.checked=checked;box.onchange=()=>{project.layers[name]=box.checked;render();};label.append(box,document.createTextNode(name));$('layers').append(label);}
$('add-point').onclick=run(()=>{if(!timeline||!videoURL)throw new Error('Load a take and phone video first.');if(!$('offset-verified').checked||!$('landmark-name').value.trim())throw new Error('Name and verify the measured controller-local landmark offset first.');pause();selectedPoint=true;notice('Click the identified physical landmark in the portrait preview.');});
canvas.onclick=run(e=>{
  if(!selectedPoint)return;readSettings();const observedTime=videoURL?presentedPTS:videoTime;const frame=timeline.seek(timeMap(observedTime,project.mapping));if(frame.segment!==project.segment||frame.gap)throw new Error('This time belongs to a different or missing coordinate segment.');
  const hand=$('hand').value,controller=frame.xr.controllers.find(c=>c.handedness===hand),offset=['landmark-x','landmark-y','landmark-z'].map(number),world=controllerLandmark(controller?.grip,offset),rect=canvas.getBoundingClientRect();
  project.observations.push({world,pixel:outputPixel(e.clientX,e.clientY,rect),videoTime:observedTime,sceneTime:frame.t,segment:frame.segment,hand,profiles:controller.profiles,offset,landmark:$('landmark-name').value,heldOut:$('held-out').checked});selectedPoint=false;project.calibration=null;updateObservations();render();notice('Landmark added.');
});
$('fit').onclick=run(async()=>{readSettings();notice('Fitting fixed camera…');await new Promise(r=>setTimeout(r,30));const result=fitCamera(project.observations,{initial:project.camera,fitFocal:$('solve-mode').value==='focal'});project.camera=result.camera;project.calibration=result;updateInputs();render();notice(result.valid?'Camera fit complete. Check the held-out frames.':'Camera fit failed the error threshold. Remove bad observations or add better-spread holds.',!result.valid);});
$('reset-camera').onclick=()=>{project.camera=defaultCamera();project.calibration=null;updateInputs();render();};
$('save-project').onclick=run(()=>{readSettings();downloadJSON(project,`honk-project-${take?.id||'new'}.json`);});
$('load-project').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;const loaded=JSON.parse(await file.text());if(loaded.version!==1||!loaded.takeId||!loaded.camera||!loaded.output||!Array.isArray(loaded.observations))throw new Error('Unsupported project file.');if(take?.id!==loaded.takeId){const rows=await api('/api/takes');const target=rows.find(t=>t.id===loaded.takeId||t.originalId===loaded.takeId);if(!target)throw new Error('Import the project’s portable take first.');await loadTake(target.id);loaded.takeId=target.id;}
  pause();project=loaded;expectedVideo=loaded.video||null;restoreVideoSettings=true;
  const matches=videoURL&&(!expectedVideo||selectedVideo?.name===expectedVideo.name&&selectedVideo?.size===expectedVideo.size);
  if(!matches&&videoURL){URL.revokeObjectURL(videoURL);videoURL=null;video.removeAttribute('src');video.load();selectedVideo=null;}
  updateInputs();readSettings();render();notice(matches?'Project restored with the selected video.':'Project restored. Reselect the matching local video; saved crop, trim and timing will be retained.');});
$('cancel-export').onclick=()=>{cancelled=true;};
async function exportProject(){
  if(!timeline||!videoURL)throw new Error('Load a take and a phone video before exporting.');readSettings();
  if(project.trim.end>video.duration+.001)throw new Error('Trim extends beyond the video.');
  if(project.calibration&&!project.calibration.valid)throw new Error('Calibration fit failed. Correct it or adjust the manual camera before exporting.');
  const times=exportTimes({...project.trim,fps:project.output.fps});pause();exporting=true;cancelled=false;$('export').disabled=true;$('cancel-export').hidden=false;$('export-progress').hidden=false;$('export-progress').max=times.count;$('export-result').replaceChildren();
  selectedPoint=false;
  const controls=[...document.querySelectorAll('input,select,button')].filter(el=>el.id!=='cancel-export').map(el=>[el,el.disabled]);
  for(const [el] of controls)el.disabled=true;
  const oldTime=videoTime;const pts=[];
  try {
    const job=await post('/api/exports',project);canvas.width=project.output.width;canvas.height=project.output.height;renderer.setSize(canvas.width,canvas.height);
    for(let i=0;i<times.count;i++) {
      if(cancelled)throw new Error('Export cancelled. Partial frames remain on the local service; no completed movie was produced.');
      await seek(times.at(i));render({time:times.at(i),transparent:!job.ffmpeg,calibration:false});pts.push({output:i/project.output.fps,video:times.at(i),presentedPTS,scene:timeMap(times.at(i),project.mapping)});
      const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('PNG rendering failed.');
      await api(`/api/exports/${job.id}/frame/${i}`,{method:'PUT',body:png});$('export-progress').value=i+1;notice(`Rendering ${i+1} / ${times.count} frames locally${job.ffmpeg?'':' · transparent PNG fallback'}`);
    }
    notice('Finalizing clean audio and local export…');const result=await post(`/api/exports/${job.id}/finish`,{});
    const addLink=(name,label)=>{const a=document.createElement('a');a.href=`/api/exports/${job.id}/${name}`;a.textContent=label;a.download=name;$('export-result').append(a);};
    if(result.ffmpeg)addLink('composite.mp4','Download MP4');
    addLink('archive.tar',result.ffmpeg?'PNG sequence + WAV':'Transparent PNG sequence + WAV');
    addLink('audio.wav','Clean WAV');addLink('project.json','Project');addLink('README.txt','Premiere instructions');
    notice(result.ffmpeg?'MP4 export complete. Clean audio and frame timestamps use the project mapping.':'Transparent PNG sequence + aligned WAV ready. Files are also in captures/exports on this laptop.');
    return {...result,timestamps:pts};
  } finally {exporting=false;for(const [el,disabled] of controls)el.disabled=disabled;$('export').disabled=false;$('cancel-export').hidden=true;canvas.width=540;canvas.height=960;renderer.setSize(540,960);await seek(oldTime);}
}
$('export').onclick=run(exportProject);
// Used by the local synthetic browser verification, never needed for normal editing.
window.captureEditor={loadTake,seek,render,exportProject,get project(){return project;},get timeline(){return timeline;},get take(){return take;},get replay(){return replay;},setProject(value){project={...project,...value};updateInputs();render();},refresh};
refresh().catch(error=>notice(`${error.message} Run npm run capture:serve and open this editor through that service.`,true));
