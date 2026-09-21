// Explicitly synthetic desktop fixture. No physical controller landmark claim.
import * as THREE from 'three';
import { projectPoint } from '/src/capture/calibration.js';
import { updateWireMeshGeometry } from '/src/instruments/looper/view/wireUtils.js';
export const demoCamera={position:[.25,1.55,3.5],rotation:[-3,5,0],fov:52,center:[0,0]};
export function demoPose(time,hand) {
  const phase=time*1.2+(hand==='right'?2.4:0);
  return {p:[Math.sin(phase)*.6,1.25+Math.cos(phase*1.4)*.5,Math.sin(phase*.7)*.4],q:new THREE.Quaternion().setFromEuler(new THREE.Euler(.2*Math.sin(phase),.4*Math.cos(phase),0)).toArray()};
}
export async function recordDemo() {
  const {app}=await import('/src/main.js');
  for(let i=0;!app.initialized&&i<300;i++)await new Promise(r=>setTimeout(r,50));
  if(!app.initialized)throw new Error('App did not initialize.');app.stopCompute();
  const r=app.runtime;r.tutorial.panel.group.visible=false;
  const root=r.createSpawnedComponent('honk',{name:'Synthetic bent Honk',baseScale:1}),honk=r.activeInstrumentState;root.position.set(0,1.3,0);
  const looperRoot=r.createSpawnedComponent('looper',{name:'Synthetic Looper',baseScale:1}),looper=r.activeInstrumentState;looperRoot.position.set(-.5,.85,0);
  const metronomeRoot=r.createSpawnedComponent('metronome',{name:'Synthetic Metronome',baseScale:1}),metronome=r.activeInstrumentState;metronomeRoot.position.set(.5,.85,0);
  looper.transport.play(); // Recording begins while playback is already active.
  const controller=r.controllers[0];controller.visible=true;r.activateStick(controller);
  const wire=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0xe7af52}));wire.name='LOOPER_wire_synthetic';r.scene.add(wire);
  const recorder=r.capture;await recorder.start({synthetic:true});if(!recorder.active)throw new Error(recorder.message);
  const heapBefore=performance.memory?.usedJSHeapSize;
  const source=document.createElement('canvas');source.width=540;source.height=960;const context=source.getContext('2d');
  const stream=source.captureStream(0),track=stream.getVideoTracks()[0],media=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2500000}),chunks=[];
  media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};media.start();const videoOrigin=performance.now();const videoOffset=(videoOrigin-recorder.origin)/1000;
  const observations=[],frameCosts=[],sampleSnapshots=[];let duplicate=null;
  recorder.markSync();
  await honk.startAudioVoice('synthetic-capture-honk');
  for(let i=0;i<120;i++) {
    const start=performance.now(),t=(start-videoOrigin)/1000;
    const left=demoPose(t,'left'),right=demoPose(t,'right');recorder.syntheticXR={viewer:{p:[0,1.6,0],q:[0,0,0,1]},controllers:[{handedness:'left',profiles:['synthetic-fixture'],grip:left,ray:{p:left.p.map((v,k)=>v+(k===2?-.07:0)),q:left.q},buttons:[[.5,0,1]],axes:[.1,-.2]},{handedness:'right',profiles:['synthetic-fixture'],grip:right,ray:{p:right.p.map((v,k)=>v+(k===2?-.07:0)),q:right.q},buttons:[[0,0,0]],axes:[0,0]}]};
    controller.position.fromArray(left.p);controller.quaternion.fromArray(left.q);
    honk.setLivePerformance({squeeze:(Math.sin(t*4)+1)/2,bend:Math.sin(t*2)*.8,vowel:i%40<20?'A':'O'});honk.applyMorphPerformanceState(honk.getResolvedPerformanceState());
    honk.updateAudioVoice('synthetic-capture-honk',honk.getResolvedPerformanceState());
    if(i===30||i===75)await r.audioSystem.triggerStickPercussion('boink',{volume:.5});
    honk.honkVisualRoot.rotation.z=Math.sin(t*2)*.2;honk.honkVisualRoot.scale.setScalar(1+.07*Math.sin(t*4));root.scale.setScalar(1+.1*Math.sin(t));
    if(i===35){honk.locked=true;r.updateLockVisual(honk);}
    if(i===50){const created=r.createSpawnedComponent('honk',{name:'Synthetic spawn',baseScale:.5});created.position.set(.3,1.8,-.3);duplicate=r.activeInstrumentState;}
    if(i===80&&duplicate)r.instrumentRegistry.remove(duplicate.id);
    if(i===90)looper.transport.stop();
    if(i===30||i===60||i===90)recorder.markPose();
    metronome.pendulumRig?.update?.({nowMs:start,bpm:93,beatOriginMs:videoOrigin,playing:true});updateWireMeshGeometry(wire,looperRoot.position,root.position);
    recorder.sample(start);frameCosts.push(performance.now()-start);
    context.fillStyle='#cfcbbd';context.fillRect(0,0,540,960);context.fillStyle='#b2b2a1';context.fillRect(0,640,540,320);context.strokeStyle='#888f7a';context.lineWidth=1;for(let row=0;row<8;row++){context.beginPath();context.moveTo(0,640+row*40);context.lineTo(540,640+row*40);context.stroke();}
    context.fillStyle='#244134';context.font='bold 20px sans-serif';context.textAlign='center';context.fillText('SYNTHETIC FIXTURE',270,52);context.font='14px sans-serif';context.fillText('No real headset or camera validation',270,78);
    for(const [hand,pose] of [['left',left],['right',right]]){const p=projectPoint(pose.p,demoCamera);context.fillStyle=hand==='left'?'#c46245':'#426b9d';context.beginPath();context.arc(p[0]/2,p[1]/2,9,0,2*Math.PI);context.fill();if(i%10===0&&i>0)observations.push({world:pose.p,pixel:p,videoTime:t,sceneTime:t+videoOffset,segment:0,hand,profiles:['synthetic-fixture'],offset:[0,0,0],landmark:'Synthetic dot (known generated grip origin)',heldOut:i>=90});}
    context.fillStyle='#244134';context.fillText(`${t.toFixed(3)} s`,270,914);track.requestFrame();
    if(i%20===0)sampleSnapshots.push({t:(start-recorder.origin)/1000,honkScale:root.scale.toArray(),childScale:honk.honkVisualRoot.scale.toArray(),left:left.p,locked:honk.locked});
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,33-(performance.now()-start))));
  }
  honk.releaseAudioVoice('synthetic-capture-honk');recorder.markSync();await recorder.stop('stop',{tailMs:500});
  await new Promise(resolve=>{media.onstop=resolve;media.stop();});track.stop();
  for(let i=0;recorder.state==='stopping'&&i<300;i++)await new Promise(r=>setTimeout(r,100));
  if(recorder.state!=='complete')throw new Error(`Demo finalization: ${recorder.state} — ${recorder.message}`);
  const blob=new Blob(chunks,{type:'video/webm'}),base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});
  const project={version:1,takeId:recorder.metadata.id,segment:0,mapping:{a:1,b:videoOffset},camera:demoCamera,crop:{zoom:1,x:0,y:0},observations,trim:{start:.3,end:Math.min(2.3,(performance.now()-videoOrigin)/1000-.2)},output:{width:270,height:480,fps:30},layers:{instruments:true,labels:true,wires:true,tutorial:false,rays:false,controllers:false,headset:false},opacity:1,calibration:null};
  return {id:recorder.metadata.id,videoBase64:base64,project,sampleSnapshots,metrics:recorder.metrics,frameCosts,heapBefore,heapBytes:performance.memory?.usedJSHeapSize};
}
