import { createBrowserSession } from "../../scripts/browser-session.mjs";
const session = await createBrowserSession();
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const root = session.dataRoot;
const output = `${session.output}/ray-play`;
let service, browser;
try {
  await mkdir(output, { recursive: true });
  service = await session.start();
  if (process.platform === "darwin") process.env.CAPTURE_SOFTWARE_GL ??= "0";
  browser = session.browser;
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const result = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js'), THREE=await import('three');
    const { tuningForMidi } = await import("/src/instruments/honk/HonkTuning.js");
    const {BEND_LOCK_THRESHOLD_DEGREES}=await import('/src/config/honk.js');
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
    let now=performance.now();
    const frame=(dt=1000/90)=>{now+=dt;r.updateHorn(now)};
    await r.audioSystem.ensureAudio();
    point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    const id=r.getInstrumentVoiceId(r.getControllerVoiceId(c),h);
    check(!state.trigger&&!h.hasAudioVoice(id),'Aim started a voice without Trigger');
    c.rotation.z=.3;frame();check(h.getLivePerformanceState().bend===0,'Aim-only rotation bent the note');
    away();state.trigger=true;r.handleTriggerBeginIntent(c,now);frame(500);
    check(!h.hasAudioVoice(id),'Holding Trigger in empty space started a voice');
    point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    const voice=r.audioSystem.honkVoices.voices.get(id);
    check(!!voice,'Holding Trigger before aiming did not start a voice on contact');
    frame(500);c.rotation.z=.05;frame();
    check(h.getLivePerformanceState().bend>.01&&r.audioSystem.honkVoices.voices.get(id)===voice,'Small on-target bend did not keep the same voice');
    check(!state.raySqueezeLatched,'A small bend must not lock');
    away();frame();
    check(state.trigger&&!h.hasAudioVoice(id)&&!state.raySqueezeTarget,'Leaving a sustained target did not stop the sound');
    point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    check(h.hasAudioVoice(id)&&r.audioSystem.honkVoices.voices.get(id)!==voice,'Reentering the same target did not start a fresh note');
    check(h.getLivePerformanceState().bend===0,'Reentry kept the previous bend');
    away();frame();check(!h.hasAudioVoice(id),'Leaving the target again did not stop');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    check(!h.activeVoiceIds.size,'Off-target Trigger release left a voice');
    point(h.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    state.trigger=true;r.handleTriggerBeginIntent(c,now);frame();await wait(20);frame();
    check(h.hasAudioVoice(id),'Second Trigger press did not start a voice');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    check(!h.hasAudioVoice(id),'Trigger release did not stop the aimed note');
    const next=honks[3],nextId=r.getInstrumentVoiceId(r.getControllerVoiceId(c),next);
    state.trigger=true;r.handleTriggerBeginIntent(c,now);frame();await wait(20);frame();
    frame(500);check(h.hasAudioVoice(id),'First note stopped before leaving');
    away();frame();check(!h.hasAudioVoice(id),'Sound continued in the gap between Honks');
    point(next.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    check(!h.hasAudioVoice(id)&&next.hasAudioVoice(nextId),'Held Trigger did not hand off to the next squeeze collider');
    frame(200);
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
    state.trigger=true;r.handleTriggerBeginIntent(c,now);frame();await wait(20);frame();
    check(h.hasAudioVoice(id),'Trigger on the locked bounding box did not sound');
    frame(200);
    check(h.hasAudioVoice(id),'Locked Honk stopped while Trigger was held');
    away();frame();check(state.trigger&&!h.hasAudioVoice(id),'Leaving the locked bounding box did not stop the sound');
    point(next.getSqueezeColliderSphere().center);frame();await wait(20);frame();
    check(next.hasAudioVoice(nextId),'Held Trigger could not leave a locked Honk');
    point(boxOnly);frame();await wait(20);frame();
    check(h.hasAudioVoice(id)&&!next.hasAudioVoice(nextId),'Held Trigger could not enter a locked bounding box');
    state.trigger=false;r.handleTriggerEndIntent(c);frame();
    check(!h.activeVoiceIds.size,'Releasing Trigger on the locked box did not stop');
    away();frame();
    // A deliberate bend captures one Honk until release, even over another Honk.
    for(const [locked,direction] of [[false,-1],[true,1]]){
      setLocked(h,locked);
      point(h.getSqueezeColliderSphere().center);
      state.trigger=true;r.handleTriggerBeginIntent(c,now);frame();await wait(20);frame();
      const heldVoice=r.audioSystem.honkVoices.voices.get(id);
      check(heldVoice,'Bend-lock test failed to start a voice');
      c.rotation.z=THREE.MathUtils.degToRad(direction*(BEND_LOCK_THRESHOLD_DEGREES+.1));
      away();frame();
      check(state.raySqueezeLatched&&r.audioSystem.honkVoices.voices.get(id)===heldVoice,'Crossing the bend threshold and leaving in one frame lost the Honk');
      point(next.getSqueezeColliderSphere().center);frame();await wait(20);frame();
      check(state.raySqueezeInstrumentState===h&&r.audioSystem.honkVoices.voices.get(id)===heldVoice&&!next.hasAudioVoice(nextId),'Another Honk stole the bend-locked voice');
      check(Math.abs(h.getLivePerformanceState().bend)<1e-8,'Bend-lock changed the wrist reference');
      away();frame(500);
      check(r.audioSystem.honkVoices.voices.get(id)===heldVoice,'Returning to neutral cleared the bend-lock');
      state.trigger=false;r.handleTriggerEndIntent(c);frame();
      check(!h.hasAudioVoice(id)&&!state.raySqueezeLatched,'Trigger release did not clear bend-lock');
      point(h.getSqueezeColliderSphere().center);
      state.trigger=true;r.handleTriggerBeginIntent(c,now);frame();await wait(20);frame();
      away();frame();
      check(!h.hasAudioVoice(id)&&!state.raySqueezeLatched,'New press inherited the old bend-lock');
      state.trigger=false;r.handleTriggerEndIntent(c);frame();
    }
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
    return {aimingSilent:true,triggerPlays:true,triggerReleaseStops:true,heldBeforeAim:true,sustainedTriggerHandoff:true,heldTriggerHandoff:true,heldTriggerReturn:true,bendOnTarget:true,exitStopsBelowThreshold:true,bendLockThresholdDegrees:BEND_LOCK_THRESHOLD_DEGREES,bendLockOffTarget:true,bendLockIgnoresOtherHonks:true,releaseClearsBendLock:true,reentryStartsFreshNote:true,lockedBounds:true,blueLockTexture:true,octaveTintPreserved:true,colors};
  })()`);
  assert.deepEqual(browser.errors, []);
  const shot = await browser.send("Page.captureScreenshot", { format: "png" });
  await writeFile(`${output}/octaves.png`, Buffer.from(shot.data, "base64"));
  await writeFile(`${output}/browser.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  if (browser?.errors.length) console.error(browser.errors);
  await session.close();
}
