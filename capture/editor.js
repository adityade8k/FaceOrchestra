import * as THREE from 'three';
import { Timeline } from '/src/capture/Timeline.js';
import { ReplayScene, DEFAULT_REPLAY_LAYERS } from '/src/capture/ReplayScene.js';
import { fitCamera, projectPoint, controllerLandmark, cropRect, outputPixel } from '/src/capture/calibration.js';
import { fitTimeMap, timeMap, exportTimes } from '/src/capture/format.js';
import { CameraHistory, defaultCamera, validCamera, cameraFromHandle, normalizeBookmarks, sameVideo } from '/src/capture/alignment.js';
import { SceneInspector } from './SceneInspector.js';
import { PreviewSeekQueue } from '/src/capture/PreviewSeekQueue.js';
import { readVideoFrame } from '/src/capture/videoFrame.js';
import { normalizeFrameMatches, savedFrameObservations, fitSavedFrames, cameraMatchError } from '/src/capture/savedFrames.js';
import { normalizeRayStyle } from '/src/capture/rayStyle.js';

const $=id=>document.getElementById(id),number=id=>Number($(id).value);
const video=$('video'),audio=$('audio'),canvas=$('composite'),ctx=canvas.getContext('2d');
const exportVideo=document.createElement('canvas'),exportVideoContext=exportVideo.getContext('2d');
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setPixelRatio(1);renderer.setSize(540,960);
let replay=new ReplayScene(renderer),timeline=null,take=null,videoURL=null,videoTime=0,selectedPoint=false,exporting=false,cancelled=false,presentedPTS=0;
let selectedVideo=null,restoreVideoSettings=false,expectedVideo=null;
let pendingFrame=null;
let observationCache=null;
let project={version:1,takeId:null,segment:0,mapping:{a:1,b:0},camera:defaultCamera(),crop:{zoom:1,x:0,y:0},observations:[],bookmarks:[],frameMatches:[],frameFit:null,trim:{start:0,end:1},output:{width:1080,height:1920,fps:30},layers:{...replay.layers},rayStyle:normalizeRayStyle(),opacity:1,calibration:null};
const cameraHistory=new CameraHistory();
const previewSeeks=new PreviewSeekQueue(time=>seek(time,{preview:true}),()=>render());
let handleStartCamera=null;
const inspector=new SceneInspector($('scene-inspector'),{
  begin:()=>{beginCameraEdit();handleStartCamera=structuredClone(project.camera);},
  change:(object,mode)=>applyCamera(cameraFromHandle(project.camera,object,mode,{startCamera:handleStartCamera||project.camera,axis:inspector.transform.axis||'XYZ'})),
  end:()=>{finishCameraEdit();handleStartCamera=null;}
});
const cameraFields=['cam-x','cam-y','cam-z','cam-pitch','cam-yaw','cam-roll','cam-fov','cam-cx','cam-cy'];
const cameraState=()=>({camera:project.camera,calibration:project.calibration,frameFit:project.frameFit});
function updateCameraInputs(){
  const values=[...project.camera.position,...project.camera.rotation,project.camera.fov,...project.camera.center];
  cameraFields.forEach((id,i)=>{if(document.activeElement!==$(id))$(id).value=values[i];});
  // Only this readout is rounded. Project data and fine inputs keep exact values.
  $('lens-fov').value=project.camera.fov;$('lens-value').textContent=`${project.camera.fov.toFixed(1)}°`;
  $('undo-camera').disabled=exporting||!cameraHistory.available(cameraState());
}
function beginCameraEdit(){
  if(exporting)return;cancelFrameMatching();pause();cameraHistory.begin(cameraState());selectedPoint=false;canvas.classList.remove('pick-landmark');
}
function applyCamera(camera){
  if(exporting||!validCamera(camera))return;
  project.camera=camera;project.calibration=null;project.frameFit=null;updateCameraInputs();updateObservations();updateFrameFit();render();
}
function finishCameraEdit(){cameraHistory.commit(cameraState());updateCameraInputs();}
function updateBookmarks(){
  $('save-frame').disabled=exporting||!timeline||!videoURL;
  $('saved-frames').replaceChildren();
  if(!project.bookmarks.length){const empty=document.createElement('span');empty.className='empty-frames';empty.textContent='Save clear controller poses to start matching.';$('saved-frames').append(empty);}
  for(const time of project.bookmarks){
    const group=document.createElement('span');group.className='bookmark';
    const count=project.frameMatches.find(frame=>Math.abs(frame.videoTime-time)<.001)?.points.length||0;
    const visit=document.createElement('button');visit.textContent=`${time.toFixed(3)} s${count?` · ${count} matched`:''}`;visit.dataset.time=time;visit.disabled=!timeline||!videoURL;visit.title=videoURL?`Check video time ${time} seconds. Save this frame again to replace its matches.`:'Reselect the matching video to check this frame';visit.onclick=run(()=>scrub(time));
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Remove saved frame ${time.toFixed(3)} seconds`);remove.onclick=()=>{cancelFrameMatching();project.bookmarks=project.bookmarks.filter(value=>value!==time);project.frameMatches=normalizeFrameMatches(project.frameMatches,project.bookmarks);refineSavedCamera();updateBookmarks();render();};
    group.append(visit,remove);$('saved-frames').append(group);
  }
  updateFrameFit();
}
function frameObservations(){
  if(!timeline)return [];
  if(observationCache?.timeline!==timeline||observationCache.matches!==project.frameMatches||observationCache.mapping!==project.mapping||observationCache.segment!==project.segment){
    observationCache={timeline,matches:project.frameMatches,mapping:project.mapping,segment:project.segment,points:savedFrameObservations(project.frameMatches,timeline,project.mapping,project.segment)};
  }
  return observationCache.points;
}
function updateFrameFit(){
  const points=frameObservations(),rms=cameraMatchError(points,project.camera),fit=project.frameFit;
  $('frame-fit').textContent=points.length?`${fit?.message||'Saved controller matches. Save another frame to refine.'} ${points.length} matches · ${Number.isFinite(rms)?rms.toFixed(1)+' px match error':'points outside camera view'} (1080 × 1920). Approximate grip fit, not independently validated.`:'Save a frame, then click its left and right controllers to estimate the camera.';
  $('frame-fit').classList.toggle('bad',fit?.status==='rejected');
}
function cancelFrameMatching(){pendingFrame=null;$('frame-matching').hidden=true;canvas.classList.remove('pick-landmark');}
function refineSavedCamera(){
  const result=fitSavedFrames(frameObservations(),project.camera);
  if(result.applied){finishCameraEdit();beginCameraEdit();project.camera=result.camera;project.calibration=null;}
  const {camera,...report}=result;project.frameFit=report;
  if(result.applied)finishCameraEdit();updateCameraInputs();updateObservations();updateFrameFit();
}
function advanceFrameMatching(){
  if(!pendingFrame)return;
  if(pendingFrame.index>=pendingFrame.hands.length){
    const completed=pendingFrame;cancelFrameMatching();
    if(completed.points.length){
      project.frameMatches=normalizeFrameMatches([...project.frameMatches.filter(frame=>Math.abs(frame.videoTime-completed.videoTime)>=.001),completed],project.bookmarks);
      refineSavedCamera();notice(project.frameFit.message);
    }else notice('Frame saved as a bookmark. No controller matches changed.');
    updateBookmarks();render();return;
  }
  const hand=pendingFrame.hands[pendingFrame.index];
  $('frame-matching').hidden=false;$('match-prompt').textContent=`Click the ${hand.toUpperCase()} controller in the phone video`;
  canvas.classList.add('pick-landmark');notice(`Saved frame: click the ${hand} controller's grip center, or skip it if hidden.`);render();
}
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function api(path,options={}){const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw new Error(data.error||`Local service returned ${response.status}`);return data;}
const post=(path,data)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function run(fn){return async event=>{try{await fn(event);}catch(error){notice(error.message,true);}};}
async function readNDJSON(path){const response=await fetch(path);if(!response.ok)throw new Error(`Cannot read ${path}`);const records=[];let pending='';const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();for(;;){const {value,done}=await reader.read();if(done)break;pending+=value;let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(line)records.push(JSON.parse(line));}}return records;}
async function refresh(){const status=await api('/api/status');$('connection').textContent=status.paired?'Local receiver connected':'Receiver available · pairing required';$('pair').hidden=status.paired;if(!status.paired)return;const takes=await api('/api/takes');$('takes').replaceChildren(new Option('Select a take',''));for(const row of takes)$('takes').add(new Option(`${row.synthetic?'SYNTHETIC · ':''}${row.performance?.label?row.performance.label+' · ':''}${row.created?.slice(0,19)||row.id} · ${row.performance?.completionAction?row.performance.completionAction+' · ':''}${row.status}`,row.id));if(take)$('takes').value=take.id;}
async function loadTake(id){
  if(!id)return;await previewSeeks.idle();cancelFrameMatching();notice('Loading take and recorded presentation assets…');pause();const changed=take?.id!==id;
  const metadata=await api(`/api/takes/${id}`);
  const receiver=await api('/api/status');
  if(!metadata.assetsBundled)for(const [path,hash] of Object.entries(metadata.build?.assets||{}))if(receiver.build.assets[path]!==hash)throw new Error(`Asset version mismatch for ${path}. Open the portable take with its matching repository assets.`);
  const [samples,events]=await Promise.all([readNDJSON(`/api/takes/${id}/samples.ndjson`),readNDJSON(`/api/takes/${id}/events.ndjson`)]);
  const next=new Timeline(samples,events,metadata.gaps||[]),scene=new ReplayScene(renderer,{assetURL:path=>metadata.assetsBundled?`/api/takes/${id}/assets${path}`:path});await scene.load(events);
  replay.dispose();replay=scene;timeline=next;take=metadata;project.takeId=id;project.takeIdentity={id,originalId:metadata.originalId,created:metadata.created,build:metadata.build};project.segment=next.frames[0].segment;
  $('takes').value=id;
  $('gaps').replaceChildren();for(const gap of [...(metadata.gaps||[]),...(metadata.missingIntervals||[])]){const item=document.createElement('li');item.textContent=`${gap.stream}: ${gap.start.toFixed(3)}–${gap.end===null?'unknown end':gap.end.toFixed(3)} s · ${gap.reason}`;$('gaps').append(item);}
  audio.src=`/api/takes/${id}/audio.wav`;audio.load();
  $('take-info').textContent=`${metadata.synthetic?'SYNTHETIC DEMO. ':''}${metadata.performance?.label?metadata.performance.label+' · '+(metadata.performance.completionAction||'in progress')+' · ':''}${metadata.performance?.performanceStart!=null?'Play starts at '+metadata.performance.performanceStart.toFixed(2)+' s · ':''}${metadata.duration?.toFixed(2)||next.duration.toFixed(2)} s · ${metadata.status}. ${metadata.complete?'All expected streams saved.':`${metadata.reason||'Not finalized'}; inspect ${metadata.gaps?.length||0} reported gaps. Use Finalize interrupted take after disconnecting to rebuild WAV.`}`;
  $('download-take').hidden=false;$('download-take').href=`/api/takes/${id}/archive`;
  $('marks').replaceChildren();for(const e of events.filter(e=>['sync','calibration-mark','reference-reset'].includes(e.data.kind))){const b=document.createElement('button');b.textContent=`${e.data.kind} ${e.t.toFixed(3)}s`;b.onclick=run(()=>scrub((e.t-project.mapping.b)/project.mapping.a));$('marks').append(b);}
  if(!videoURL){$('timeline').max=String(next.duration);project.trim.end=next.duration;}
  project.camera=defaultCamera();project.observations=[];project.calibration=null;project.frameMatches=[];project.frameFit=null;if(changed)project.bookmarks=[];cameraHistory.clear();restoreVideoSettings=false;expectedVideo=null;updateInputs();render();notice(scene.issues.length?scene.issues.join(' '):metadata.synthetic?'Synthetic take loaded. This does not validate real headset or phone capture.':'Take loaded. Select video, match timing, then position the phone camera.',scene.issues.length>0);
}
function updateInputs(){
  for(const [id,value] of Object.entries({rate:project.mapping.a,offset:project.mapping.b,'crop-zoom':project.crop.zoom,'crop-x':project.crop.x,'crop-y':project.crop.y,'trim-start':project.trim.start,'trim-end':project.trim.end,resolution:project.output.width,fps:project.output.fps,opacity:project.opacity}))$(id).value=value;
  updateCameraInputs();$('preview-guides').checked=project.layers.controllers;$('preview-rays').checked=project.layers.controllerRays;$('preview-headset').checked=project.layers.headset;
  updateRayInputs();
  for(const box of $('layers').querySelectorAll('input'))box.checked=project.layers[box.name];updateObservations();updateBookmarks();
}
function updateRayInputs(){
  project.rayStyle=normalizeRayStyle(project.rayStyle);
  $('ray-left-color').value=project.rayStyle.leftColor;$('ray-right-color').value=project.rayStyle.rightColor;
  $('ray-opacity').value=project.rayStyle.opacity;$('ray-length').value=project.rayStyle.length;
  $('ray-opacity-value').textContent=`${Math.round(project.rayStyle.opacity*100)}%`;
  $('ray-length-value').textContent=`${project.rayStyle.length.toFixed(2)} m`;
}
function readSettings(){
  project.mapping={a:number('rate'),b:number('offset')};if(!(project.mapping.a>.9&&project.mapping.a<1.1)||!Number.isFinite(project.mapping.b))throw new Error('Enter a finite offset and a rate between 0.9 and 1.1.');
  if(!validCamera(project.camera))throw new Error('Invalid camera values.');
  project.crop={zoom:number('crop-zoom'),x:number('crop-x'),y:number('crop-y')};project.trim={start:number('trim-start'),end:number('trim-end')};project.output={width:number('resolution'),height:number('resolution')*16/9,fps:number('fps')};project.opacity=number('opacity');
  if(!Object.values(project.crop).every(Number.isFinite)||project.crop.zoom<1||project.crop.zoom>4||Math.abs(project.crop.x)>1||Math.abs(project.crop.y)>1)throw new Error('Crop zoom must be 1–4, and crop offsets between −1 and 1.');
}
function render({time=videoTime,transparent=false,calibration=!exporting,videoSource=video,strict=false}={}){
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if(!transparent){
    const ready=videoSource===video?video.readyState>=2&&!video.seeking:videoSource?.width>0&&videoSource?.height>0;
    if(strict&&!ready)throw new Error(`Phone video is missing at ${time.toFixed(3)} s. Export stopped before saving this frame.`);
    ctx.fillStyle='#17221b';ctx.fillRect(0,0,w,h);
    if(ready){const c=cropRect(videoSource.videoWidth||videoSource.width,videoSource.videoHeight||videoSource.height,w,h,project.crop);ctx.drawImage(videoSource,c.sx,c.sy,c.sw,c.sh,0,0,w,h);}
    else {ctx.fillStyle='#afc3aa';ctx.font='18px system-ui';ctx.textAlign='center';ctx.fillText(videoURL?'Loading video frame…':'Select a phone video',w/2,h/2);}
  }
  const sceneTime=timeMap(time,project.mapping);
  replay.setRayStyle(project.rayStyle);
  replay.setCamera(project.camera,w,h);
  const frame=timeline?.seek(sceneTime);
  if(frame){replay.layers={...project.layers};if(!calibration){replay.layers.controllers=false;replay.layers.headset=false;}replay.apply(frame);replay.render({guides:calibration});if(!pendingFrame||!calibration){ctx.globalAlpha=project.opacity;ctx.drawImage(renderer.domElement,0,0,w,h);ctx.globalAlpha=1;}
    $('profiles').textContent=frame.xr.controllers.map(c=>`${c.handedness}: ${c.profiles.join(', ')||'no profile'}`).join(' · ')||'No tracked controllers at this timestamp.';
    if(calibration&&!pendingFrame)for(const observation of [...project.observations,...frameObservations()]){if(Math.abs(observation.videoTime-time)>.12)continue;const p=projectPoint(observation.world,project.camera);const x=observation.pixel[0]/1080*w,y=observation.pixel[1]/1920*h;ctx.strokeStyle=observation.hand==='right'?'#ffb56e':'#96edb1';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.stroke();if(p){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(p[0]/1080*w,p[1]/1920*h);ctx.stroke();ctx.fillStyle='#ff716a';ctx.fillRect(p[0]/1080*w-3,p[1]/1920*h-3,6,6);}}
  }
  if(calibration&&pendingFrame)for(const point of pendingFrame.points){ctx.fillStyle=point.hand==='left'?'#66edbe':'#ffa96c';ctx.beginPath();ctx.arc(point.pixel[0]/1080*w,point.pixel[1]/1920*h,5,0,Math.PI*2);ctx.fill();}
  if(!exporting)inspector.update(replay,frame);
  const requested=previewSeeks.target??time;
  $('frame-time').textContent=`VIDEO ${time.toFixed(3)} s · SCENE ${sceneTime.toFixed(3)} s`;$('seek-time').value=requested.toFixed(3);$('timeline').value=requested;
  for(const button of $('saved-frames').querySelectorAll('[data-time]'))button.setAttribute('aria-current',String(Math.abs(Number(button.dataset.time)-time)<.001));
}
async function seek(time,{preview=false}={}){
  videoTime=Math.max(0,Math.min(time,videoURL?video.duration:timeline?.duration||time));
  let decoded;
  if(videoURL)decoded=await readVideoFrame(video,videoTime,{presentedTime:presentedPTS,capture:exporting?source=>{
    // Freeze the decoded pixels while readiness is known, before yielding back
    // to the export loop. Later media events cannot replace this with a slate.
    exportVideo.width=source.videoWidth;exportVideo.height=source.videoHeight;
    exportVideoContext.drawImage(source,0,0);return exportVideo;
  }:undefined});
  if(decoded)presentedPTS=decoded.presentedPTS;
  if(!exporting&&audio.readyState>=1){audio.currentTime=Math.max(0,timeMap(videoTime,project.mapping));audio.playbackRate=project.mapping.a;}
  if(!exporting)render();return {videoTime,presentedPTS,source:decoded?.source};
}
function stopPlayback(){video.pause();audio.pause();$('play').textContent='Play';}
function pause(){stopPlayback();if(videoURL&&!exporting){videoTime=video.currentTime;render();}}
function scrub(time){
  if(exporting)return Promise.resolve();
  if(!Number.isFinite(time))throw new Error('Enter a finite video time.');
  const target=Math.max(0,Math.min(time,videoURL?video.duration:timeline?.duration||time));
  // Stop without redrawing: a redraw here would overwrite the slider's input.
  cancelFrameMatching();stopPlayback();$('timeline').value=target;$('seek-time').value=target.toFixed(3);
  return previewSeeks.request(target);
}
async function play(){if(!videoURL)throw new Error('Choose a video first.');cancelFrameMatching();if(!video.paused){pause();return;}await previewSeeks.idle();readSettings();audio.currentTime=Math.max(0,timeMap(video.currentTime,project.mapping));audio.playbackRate=project.mapping.a;audio.muted=$('phone-audio').checked;video.muted=!$('phone-audio').checked;await video.play();if(take)audio.play().catch(()=>notice('Clean WAV is not ready. Finalize or recover the take.',true));$('play').textContent='Pause';}
function videoFrame(_,metadata){presentedPTS=metadata.mediaTime;if(!exporting&&!video.paused){const desired=timeMap(video.currentTime,project.mapping);if(desired<0){audio.pause();}else if(audio.readyState>=2&&Math.abs(audio.currentTime-desired)>.08){audio.currentTime=desired;audio.play().catch(()=>{});}}video.requestVideoFrameCallback(videoFrame);}
if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(videoFrame);else video.addEventListener('timeupdate',()=>{if(!exporting){videoTime=video.currentTime;render();}});
// The playhead drives the same scene-time mapping as offline output. Source PTS
// remains independent and is used when a clicked video frame supplies a landmark.
function animatePreview(){if(!exporting&&videoURL&&!video.paused){videoTime=video.currentTime;render();}requestAnimationFrame(animatePreview);}
requestAnimationFrame(animatePreview);
video.onended=pause;
function updateObservations(){
  $('observations').replaceChildren();for(const [index,o] of project.observations.entries()){const p=projectPoint(o.world,project.camera),error=p?Math.hypot(p[0]-o.pixel[0],p[1]-o.pixel[1]):Infinity;const row=document.createElement('li');row.textContent=`${o.heldOut?'VALIDATE':'FIT'} · ${o.hand} · ${o.videoTime.toFixed(3)}s · ${error.toFixed(1)} px`;const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{project.observations.splice(index,1);project.calibration=null;cameraHistory.clear();updateCameraInputs();updateObservations();render();};row.append(remove);$('observations').append(row);}
  const c=project.calibration;$('fit-report').textContent=c?`${c.valid?'Fit accepted':'FIT FAILED'} · ${c.fitRms.toFixed(2)} px RMS\nHeld-out: ${c.heldOutRms===null?'add observations':c.heldOutRms.toFixed(2)+' px RMS'}\n${c.validated?'Held-out validation passed':'Not validated: use at least two additional observations'}`:'Manual / uncalibrated camera';$('fit-report').classList.toggle('bad',Boolean(c&&!c.valid));
}
function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('pair').onsubmit=run(async e=>{e.preventDefault();await post('/api/pair',{code:$('code').value});await refresh();notice('This browser is paired.');});
$('refresh').onclick=run(refresh);$('takes').onchange=run(e=>loadTake(e.target.value));
$('recover').onclick=run(async()=>{if(!take)throw new Error('Select a take.');await post(`/api/takes/${take.id}/recover`,{});await loadTake(take.id);});
$('import-take').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;notice('Importing portable take locally…');const result=await api('/api/import',{method:'POST',body:file});await refresh();await loadTake(result.id);});
$('video-file').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;
  await previewSeeks.idle();cancelFrameMatching();
  if(!video.requestVideoFrameCallback)throw new Error('Video presentation timestamps are unavailable. Use a current desktop Chrome browser for calibration and export.');
  const previousVideo=expectedVideo||project.video;
  pause();if(videoURL)URL.revokeObjectURL(videoURL);videoURL=URL.createObjectURL(file);video.src=videoURL;video.muted=true;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Unsupported video codec. Convert locally: ffmpeg -i input.mov -vf "format=yuv420p" -c:v libx264 -crf 18 -c:a aac phone-sdr.mp4 (use an SDR source; HDR needs tone mapping).'));});
  if(!Number.isFinite(video.duration))throw new Error('Video has no finite duration. Convert to a seekable local MP4.');
  selectedVideo={name:file.name,size:file.size,lastModified:file.lastModified,width:video.videoWidth,height:video.videoHeight,duration:video.duration};
  const changed=Boolean(previousVideo&&!sameVideo(previousVideo,selectedVideo));
  if(changed){project.bookmarks=[];project.observations=[];project.calibration=null;project.frameMatches=[];project.frameFit=null;cameraHistory.clear();}
  if(!restoreVideoSettings||changed)project.trim.end=video.duration;
  project.bookmarks=normalizeBookmarks(project.bookmarks,video.duration);
  project.frameMatches=normalizeFrameMatches(project.frameMatches,project.bookmarks);
  project.video=selectedVideo;restoreVideoSettings=false;expectedVideo=null;$('timeline').max=video.duration;$('video-info').textContent=`${file.name} · ${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(3)}s. Rotation decoded by browser.`;updateInputs();await seek(0);notice(changed?'Different video selected. Saved frames and calibration observations cleared; match timing again.':'Video ready. Match a sync cue or controller gesture.');
});
$('play').onclick=run(play);
const currentPlayhead=()=>previewSeeks.target??(videoURL&&!video.paused?video.currentTime:videoTime);
$('previous').onclick=run(()=>scrub(currentPlayhead()-1/project.output.fps));$('next').onclick=run(()=>scrub(currentPlayhead()+1/project.output.fps));
$('timeline').onpointerdown=stopPlayback;
$('timeline').oninput=$('timeline').onchange=$('seek-time').onchange=run(e=>{const target=e.target.valueAsNumber;return scrub(target);});
$('align').onclick=run(()=>{cancelFrameMatching();project.mapping=fitTimeMap({video:number('v1'),scene:number('s1')},$('v2').value!==''&&$('s2').value!==''?{video:number('v2'),scene:number('s2')}:null);project.anchors=[{video:number('v1'),scene:number('s1')},...($('v2').value!==''?[{video:number('v2'),scene:number('s2')}]:[])];project.observations=[];project.calibration=null;refineSavedCamera();updateInputs();render();notice('Time mapping applied. Saved controller matches now use the updated scene times.');});
$('phone-audio').onchange=e=>{video.muted=!e.target.checked;audio.muted=e.target.checked;};
for(const id of ['rate','offset','crop-zoom','crop-x','crop-y','trim-start','trim-end','resolution','fps','opacity'])$(id).onchange=run(()=>{
  cancelFrameMatching();readSettings();
  if(id.startsWith('crop')){project.calibration=null;project.observations=[];project.frameMatches=[];project.frameFit=null;cameraHistory.clear();updateCameraInputs();notice('Crop changed. Save frames and click controllers again in the new crop.');}
  if(id==='rate'||id==='offset'){project.calibration=null;project.observations=[];refineSavedCamera();}
  updateObservations();updateBookmarks();render();
});
const layerLabels={instruments:'Instruments',labels:'Instrument labels',wires:'Wires',tutorial:'Tutorial',rays:'Recorded rays'};
for(const [name,title] of Object.entries(layerLabels)){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.name=name;box.checked=project.layers[name];box.onchange=()=>{project.layers[name]=box.checked;render();};label.append(box,document.createTextNode(title));$('layers').append(label);}
for(const [id,layer] of [['preview-guides','controllers'],['preview-rays','controllerRays'],['preview-headset','headset']])$(id).onchange=e=>{project.layers[layer]=e.target.checked;render();};
for(const [id,key] of [['ray-left-color','leftColor'],['ray-right-color','rightColor'],['ray-opacity','opacity'],['ray-length','length']]){
  $(id).oninput=$(id).onchange=e=>{
    project.rayStyle=normalizeRayStyle({...project.rayStyle,[key]:e.target.type==='color'?e.target.value:e.target.valueAsNumber});
    updateRayInputs();render();
  };
}
$('reset-rays').onclick=()=>{project.rayStyle=normalizeRayStyle();updateRayInputs();render();};
const cameraModes=[['inspect-scene','inspect'],['move-camera','translate'],['rotate-camera','rotate'],['scale-camera','scale']];
const cameraHints={
  inspect:'Drag to orbit · right-drag to pan · scroll to zoom. This view does not move the phone camera.',
  translate:'Drag the camera’s arrows or squares to move it. Drag elsewhere to orbit; scroll to zoom.',
  rotate:'Drag the camera’s rings to rotate it. Drag elsewhere to orbit; scroll to zoom.',
  scale:'Drag the camera’s boxes outward to widen the view, inward to narrow it. Scale adjusts the lens; scene size stays fixed.'
};
for(const [id,mode] of cameraModes)$(id).onclick=()=>{
  finishCameraEdit();inspector.setMode(mode);
  for(const [other] of cameraModes)$(other).setAttribute('aria-pressed',String(other===id));
  $('scene-hint').textContent=cameraHints[mode];
};
document.addEventListener('keydown',event=>{
  if(exporting||inspector.transform.dragging||event.ctrlKey||event.metaKey||event.altKey||event.repeat||event.target.closest('input,select,textarea,[contenteditable]'))return;
  const id={q:'inspect-scene',w:'move-camera',e:'rotate-camera',r:'scale-camera'}[event.key.toLowerCase()];
  if(id){event.preventDefault();$(id).click();}
});
for(const id of cameraFields){
  const input=$(id);
  input.onfocus=beginCameraEdit;
  input.oninput=()=>{
    if(input.value===''||!Number.isFinite(input.valueAsNumber))return;
    const candidate=structuredClone(project.camera),index=cameraFields.indexOf(id);
    if(index<3)candidate.position[index]=input.valueAsNumber;
    else if(index<6)candidate.rotation[index-3]=input.valueAsNumber;
    else if(index===6)candidate.fov=input.valueAsNumber;
    else candidate.center[index-7]=input.valueAsNumber;
    if(!validCamera(candidate))return;
    beginCameraEdit();applyCamera(candidate);
  };
  input.onchange=input.onblur=()=>{
    finishCameraEdit();
    // An incomplete/invalid number leaves the last valid camera unchanged.
    const values=[...project.camera.position,...project.camera.rotation,project.camera.fov,...project.camera.center];input.value=values[cameraFields.indexOf(id)];
  };
}
$('lens-fov').onpointerdown=beginCameraEdit;
$('lens-fov').onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))beginCameraEdit();};
$('lens-fov').oninput=()=>{beginCameraEdit();applyCamera({...project.camera,fov:number('lens-fov')});};
$('lens-fov').onchange=$('lens-fov').onblur=finishCameraEdit;
$('undo-camera').onclick=()=>{cancelFrameMatching();pause();const previous=cameraHistory.undo(cameraState());if(previous){project.camera=previous.camera;project.calibration=previous.calibration;project.frameFit=previous.frameFit;}updateCameraInputs();updateObservations();updateFrameFit();render();};
$('reset-camera').onclick=()=>{finishCameraEdit();beginCameraEdit();applyCamera(defaultCamera());finishCameraEdit();};
$('save-frame').onclick=run(async()=>{
  if(!timeline||!videoURL)throw new Error('Load a take and video first.');
  await previewSeeks.idle();cancelFrameMatching();pause();await seek(videoTime);readSettings();selectedPoint=false;
  const savedTime=project.bookmarks.find(time=>Math.abs(time-videoTime)<.001)??videoTime;
  project.bookmarks=normalizeBookmarks([...project.bookmarks,savedTime],video.duration);updateBookmarks();
  const sceneTime=timeMap(presentedPTS,project.mapping),frame=timeline.seek(sceneTime);
  const hands=sceneTime>=timeline.frames[0].t&&sceneTime<=timeline.duration&&!frame.gap&&frame.segment===project.segment?['left','right'].filter(hand=>frame.xr.controllers.some(c=>c.handedness===hand&&c.grip)):[];
  if(!hands.length){notice('Frame bookmarked, but no tracked controllers at this mapped time. Check synchronization or choose another frame.');render();return;}
  pendingFrame={videoTime:savedTime,sampleTime:presentedPTS,points:[],hands,index:0};advanceFrameMatching();$('frame-matching').scrollIntoView({block:'nearest'});
});
$('skip-match').onclick=()=>{if(pendingFrame){pendingFrame.index++;advanceFrameMatching();}};
$('cancel-match').onclick=()=>{cancelFrameMatching();render();notice('Matching cancelled. Existing saved matches are unchanged.');};
$('add-point').onclick=run(async()=>{if(!timeline||!videoURL)throw new Error('Load a take and phone video first.');if(!$('offset-verified').checked||!$('landmark-name').value.trim())throw new Error('Name and verify the measured controller-local landmark offset first.');await previewSeeks.idle();cancelFrameMatching();pause();selectedPoint=true;canvas.classList.add('pick-landmark');notice('Click the identified physical landmark in the portrait preview.');});
canvas.onclick=run(e=>{
  if(pendingFrame){pendingFrame.points.push({hand:pendingFrame.hands[pendingFrame.index],pixel:outputPixel(e.clientX,e.clientY,canvas.getBoundingClientRect())});pendingFrame.index++;advanceFrameMatching();return;}
  if(!selectedPoint)return;readSettings();const observedTime=videoURL?presentedPTS:videoTime;const frame=timeline.seek(timeMap(observedTime,project.mapping));if(frame.segment!==project.segment||frame.gap)throw new Error('This time belongs to a different or missing coordinate segment.');
  const hand=$('hand').value,controller=frame.xr.controllers.find(c=>c.handedness===hand),offset=['landmark-x','landmark-y','landmark-z'].map(number),world=controllerLandmark(controller?.grip,offset),rect=canvas.getBoundingClientRect();
  project.observations.push({world,pixel:outputPixel(e.clientX,e.clientY,rect),videoTime:observedTime,sceneTime:frame.t,segment:frame.segment,hand,profiles:controller.profiles,offset,landmark:$('landmark-name').value,heldOut:$('held-out').checked});selectedPoint=false;canvas.classList.remove('pick-landmark');project.calibration=null;cameraHistory.clear();updateCameraInputs();updateObservations();render();notice('Landmark added.');
});
$('fit').onclick=run(async()=>{readSettings();finishCameraEdit();beginCameraEdit();notice('Fitting fixed camera…');await new Promise(r=>setTimeout(r,30));try{const result=fitCamera(project.observations,{initial:project.camera,fitFocal:$('solve-mode').value==='focal'});project.camera=result.camera;project.calibration=result;updateInputs();render();notice(result.valid?'Camera fit complete. Check the held-out frames.':'Camera fit failed the error threshold. Remove bad observations or add better-spread holds.',!result.valid);}finally{finishCameraEdit();}});
$('save-project').onclick=run(()=>{readSettings();downloadJSON(project,`honk-project-${take?.id||'new'}.json`);});
$('load-project').onchange=run(async e=>{const file=e.target.files[0];if(!file)return;const loaded=JSON.parse(await file.text());if(loaded.version!==1||!loaded.takeId||!validCamera(loaded.camera)||!loaded.output||!Array.isArray(loaded.observations))throw new Error('Unsupported project file.');if(take?.id!==loaded.takeId){const rows=await api('/api/takes');const target=rows.find(t=>t.id===loaded.takeId||t.originalId===loaded.takeId);if(!target)throw new Error('Import the project’s portable take first.');await loadTake(target.id);loaded.takeId=target.id;}
  await previewSeeks.idle();cancelFrameMatching();pause();project={...loaded,frameFit:loaded.frameFit||null,layers:{...DEFAULT_REPLAY_LAYERS,...loaded.layers},rayStyle:normalizeRayStyle(loaded.rayStyle),bookmarks:normalizeBookmarks(loaded.bookmarks,loaded.video?.duration)};project.frameMatches=normalizeFrameMatches(loaded.frameMatches,project.bookmarks);cameraHistory.clear();expectedVideo=loaded.video||null;restoreVideoSettings=true;selectedPoint=false;canvas.classList.remove('pick-landmark');
  const matches=videoURL&&(!expectedVideo||sameVideo(selectedVideo,expectedVideo));
  if(!matches&&videoURL){URL.revokeObjectURL(videoURL);videoURL=null;video.removeAttribute('src');video.load();selectedVideo=null;}
  $('timeline').max=matches?video.duration:loaded.video?.duration||timeline.duration;
  if(!matches){videoTime=0;$('video-info').textContent=expectedVideo?`Reselect ${expectedVideo.name} to keep its saved frames and alignment.`:'Choose the local phone video.';}
  updateInputs();readSettings();render();notice(matches?'Project restored with the selected video.':'Project restored. Reselect the matching local video; saved camera, frames, crop, trim and timing will be retained.');});
$('cancel-export').onclick=()=>{cancelled=true;};
async function exportProject(){
  await previewSeeks.idle();
  if(!timeline||!videoURL)throw new Error('Load a take and a phone video before exporting.');readSettings();
  if(project.trim.end>video.duration+.001)throw new Error('Trim extends beyond the video.');
  if(project.calibration&&!project.calibration.valid)throw new Error('Calibration fit failed. Correct it or adjust the manual camera before exporting.');
  const times=exportTimes({...project.trim,fps:project.output.fps});pause();exporting=true;inspector.setLocked(true);cancelled=false;$('export').disabled=true;$('cancel-export').hidden=false;$('export-progress').hidden=false;$('export-progress').max=times.count;$('export-result').replaceChildren();
  selectedPoint=false;cancelFrameMatching();
  const controls=[...document.querySelectorAll('input,select,button')].filter(el=>el.id!=='cancel-export').map(el=>[el,el.disabled]);
  for(const [el] of controls)el.disabled=true;
  const oldTime=videoTime;const pts=[];
  try {
    const job=await post('/api/exports',project);canvas.width=project.output.width;canvas.height=project.output.height;renderer.setSize(canvas.width,canvas.height);
    for(let i=0;i<times.count;i++) {
      if(cancelled)throw new Error('Export cancelled. Partial frames remain on the local service; no completed movie was produced.');
      const decoded=await seek(times.at(i));render({time:times.at(i),transparent:!job.ffmpeg,calibration:false,videoSource:decoded.source,strict:true});pts.push({output:i/project.output.fps,video:times.at(i),presentedPTS,scene:timeMap(times.at(i),project.mapping)});
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
  } finally {exporting=false;inspector.setLocked(false);for(const [el,disabled] of controls)el.disabled=disabled;$('export').disabled=false;$('cancel-export').hidden=true;canvas.width=540;canvas.height=960;renderer.setSize(540,960);await seek(oldTime);}
}
$('export').onclick=run(exportProject);
// Used by the local synthetic browser verification, never needed for normal editing.
window.captureEditor={loadTake,seek,render,exportProject,inspector,get project(){return project;},get timeline(){return timeline;},get take(){return take;},get replay(){return replay;},setProject(value){cancelFrameMatching();project={...project,...value};project.layers={...DEFAULT_REPLAY_LAYERS,...project.layers};project.bookmarks=normalizeBookmarks(project.bookmarks,project.video?.duration);project.frameMatches=normalizeFrameMatches(project.frameMatches,project.bookmarks);cameraHistory.clear();updateInputs();render();},refresh};
updateInputs();render();
refresh().catch(error=>notice(`${error.message} Run npm run capture:serve and open this editor through that service.`,true));
