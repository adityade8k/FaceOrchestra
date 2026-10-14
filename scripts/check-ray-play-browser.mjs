import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from './capture/server.mjs';
import {launchChrome} from './capture/chrome.mjs';

const root=await mkdtemp(join(tmpdir(),'honk-ray-play-'));
const output='test-results/ray-play';
let service,browser;
try {
  await mkdir(output,{recursive:true});
  service=await startServer({host:'127.0.0.1',port:0,plain:true,pairCode:'123456',dataRoot:root});
  if(process.platform==='darwin')process.env.CAPTURE_SOFTWARE_GL??='0';
  browser=await launchChrome();
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const result=await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js'), THREE=await import('three');
    const {tuningForMidi}=await import('/src/compositions/jog/definition.js');
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await wait(100);
    const r=app.runtime, check=(v,m)=>{if(!v)throw new Error(m)};
    await r.tutorial.action('play');
    r.renderer.setAnimationLoop(null);r.renderer.setPixelRatio(1);
    for(const h of [...r.instrumentStates])r.deleteInstrument(h);
    const honks=[];
    for(const [i,midi] of [36,48,60,72,84,96].entries()){
      const tuning=midi===96?{semitonesFromF:7,octaveOffset:2}:tuningForMidi(midi);
      r.createSpawnedComponent('honk',{name:'Color '+midi,baseScale:1.2,tuning});
      const h=r.activeInstrumentState;h.root.position.set((i-2.5)*.55,1,-1);h.root.updateMatrixWorld(true);
      honks.push(h);
    }
    r.honkContactSystem.update();r.honkContactSystem.update();
    r.applyResolvedHonkPerformanceStates(performance.now());r.scene.updateMatrixWorld(true);
    const c=r.controllers[0],state=r.controllerStates.get(c),h=honks[2];
    c.matrixAutoUpdate=true;c.visible=true;c.userData.inputConnected=true;
    const point=p=>{c.position.copy(p);c.position.z+=.6;c.quaternion.identity();c.updateMatrixWorld(true)};
    const away=()=>{c.position.set(30,30,30);c.updateMatrixWorld(true)};
    const frame=()=>r.updateHorn(performance.now());
    await r.audioSystem.ensureAudio();
    point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    const id=r.getInstrumentVoiceId(r.getControllerVoiceId(c),h);
    check(!state.trigger&&!h.hasAudioVoice(id),'Aim started a voice without Trigger');
    c.rotation.z=.3;frame();check(h.getLivePerformanceState().bend===0,'Aim-only rotation bent the note');
    state.trigger=true;r.handleTriggerBeginIntent(c);frame();await wait(20);frame();
    const voice=r.audioSystem.honkVoices.voices.get(id);
    check(!!voice,'Trigger did not start a voice');
    c.rotation.z=.6;c.position.x+=5;frame();
    check(h.getLivePerformanceState().bend>.1&&r.audioSystem.honkVoices.voices.get(id)===voice,'Bend did not retain the voice off target');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    check(!h.activeVoiceIds.size,'Off-target Trigger release left a voice');
    point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    state.trigger=true;r.handleTriggerBeginIntent(c);frame();await wait(20);frame();
    check(h.hasAudioVoice(id),'Second Trigger press did not start a voice');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    check(!h.hasAudioVoice(id),'Trigger release did not stop the aimed note');
    const next=honks[3],nextId=r.getInstrumentVoiceId(r.getControllerVoiceId(c),next);
    state.trigger=true;r.handleTriggerBeginIntent(c);frame();await wait(20);frame();
    away();frame();point(next.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    check(!h.hasAudioVoice(id)&&next.hasAudioVoice(nextId),'Held Trigger did not hand off to the next squeeze collider');
    frame();await wait(200);frame();
    check(next.hasAudioVoice(nextId),'Held note stopped under a stationary ray');
    away();frame();point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    check(h.hasAudioVoice(id)&&!next.hasAudioVoice(nextId),'Held Trigger could not return to an earlier Honk');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    away();frame();
    const materials=target=>target.gripTargetList.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]);
    r.sessionMode='practice';
    const setLocked=(target,locked)=>{
      if(target.locked!==locked){point(target.getSqueezeColliderSphere().center);r.handleContextSecondaryIntent(c);}
      away();frame();check(target.locked===locked,'Context lock did not toggle the target');
    };
    setLocked(h,true);
    check(materials(h).every(m=>m.map===r.instrumentMaterialTextures.lockedBaseMap),'Locked Honk did not get the blue texture');
    const box=h.withInteractionPose(()=>new THREE.Box3().setFromObject(h.honkVisualRoot));
    let boxOnly=null;
    for(let x=1;x<10&&!boxOnly;x++)for(let y=1;y<10&&!boxOnly;y++){
      const p=new THREE.Vector3(THREE.MathUtils.lerp(box.min.x,box.max.x,x/10),THREE.MathUtils.lerp(box.min.y,box.max.y,y/10),box.max.z);
      point(p);const locked=r.getRaySqueezeHit(c,r.getCurrentHit(c));
      h.locked=false;const unlocked=r.getCurrentHit(c);h.locked=true;
      if(locked?.object===h.squeezeCollider&&unlocked?.object!==h.squeezeCollider)boxOnly=p;
    }
    check(boxOnly,'No box-only playable point found');
    point(boxOnly);frame();await wait(20);frame();
    check(!h.hasAudioVoice(id),'Locked box sounded without Trigger');
    state.trigger=true;r.handleTriggerBeginIntent(c);frame();await wait(20);frame();
    check(h.hasAudioVoice(id),'Trigger on the locked bounding box did not sound');
    frame();await wait(200);frame();
    check(h.hasAudioVoice(id),'Locked Honk stopped while Trigger was held');
    point(next.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    check(next.hasAudioVoice(nextId),'Held Trigger could not leave a locked Honk');
    point(boxOnly);frame();await wait(20);frame();
    check(h.hasAudioVoice(id)&&!next.hasAudioVoice(nextId),'Held Trigger could not enter a locked bounding box');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    check(!h.activeVoiceIds.size,'Releasing Trigger on the locked box did not stop');
    away();frame();
    // Every octave keeps its tint while locking swaps only the painted map.
    setLocked(h,false);
    for(const target of honks){
      const before=materials(target).map(m=>({color:m.color.getHex(),normal:m.normalMap,roughness:m.roughnessMap}));
      for(const locked of [true,false,true]){
        setLocked(target,locked);
        check(materials(target).every((m,i)=>m.map===(locked?r.instrumentMaterialTextures.lockedBaseMap:r.instrumentMaterialTextures.baseMap)
          &&m.color.getHex()===before[i].color&&m.normalMap===before[i].normal&&m.roughnessMap===before[i].roughness),
          'Lock changed pitch tint or detail maps');
      }
    }
    const colors=honks.map((h,i)=>{
      let mesh;h.root.traverse(o=>{if(o.isMesh&&o.material?.map&&o.material.userData.honkPitchColorUnique)mesh??=o});
      check(mesh,'No textured pitch-colored mesh');
      return {octave:i+2,color:mesh.material.color.getHexString(),texture:mesh.material.map.uuid};
    });
    check(colors[2].color==='ffffff','Octave four is not neutral');
    check(new Set(colors.map(c=>c.color)).size===6,'Octaves lack distinct colors');
    c.visible=false;frame();
    r.tutorial.panel.dom.hidden=true;
    for(const h of honks)r.setInstrumentBaseScale(h,2.4);
    r.scene.updateMatrixWorld(true);
    const camera=r.getUserCamera();camera.position.set(0,1.1,1.5);camera.lookAt(0,1,-1);camera.updateMatrixWorld(true);
    r.renderer.render(r.scene,camera);
    return {aimingSilent:true,triggerPlays:true,triggerReleaseStops:true,heldTriggerHandoff:true,heldTriggerReturn:true,bendOffTarget:true,lockedBounds:true,blueLockTexture:true,octaveTintPreserved:true,colors};
  })()`);
  assert.deepEqual(browser.errors,[]);
  const shot=await browser.send('Page.captureScreenshot',{format:'png'});
  await writeFile(`${output}/octaves.png`,Buffer.from(shot.data,'base64'));
  await writeFile(`${output}/browser.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  if(browser?.errors.length)console.error(browser.errors);
  await browser?.close();await service?.close();await rm(root,{recursive:true,force:true});
}
