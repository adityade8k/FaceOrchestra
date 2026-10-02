import { startServer } from "./server.mjs";
import { launchChrome } from "./chrome.mjs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = await mkdtemp(join(tmpdir(), "honk-practice-ui-"));
let service, browser;
try {
  service = await startServer({
    host: "127.0.0.1",
    port: 0,
    plain: true,
    dataRoot: root,
  });
  browser = await launchChrome();
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');while(!app.initialized)await new Promise(r=>setTimeout(r,50));
    const t=app.runtime.tutorial;await t.action('tutorials');await t.action('composition:kuch-to-hua-hai');await t.action('composition-quick-practice');
    t.panel.tempoControls.input.focus();
  })()`);
  for (const type of ["keyDown", "keyUp"])
    await browser.send("Input.dispatchKeyEvent", {
      type,
      key: "Home",
      code: "Home",
      windowsVirtualKeyCode: 36,
    });
  assert.equal(
    await browser.evaluate(
      `(async()=>{const {app}=await import('/src/main.js');return app.runtime.tutorial.adapter.get('metronome').bpm;})()`,
    ),
    40,
  );
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await browser.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  const bpm = await browser.evaluate(
    `(async()=>{const {app}=await import('/src/main.js');const t=app.runtime.tutorial;return {metro:t.adapter.get('metronome').bpm,slider:Number(t.panel.tempoControls.input.value),session:t.kuch.selectedBpm()};})()`,
  );
  assert.deepEqual(bpm, { metro: 41, slider: 41, session: 41 });
  await mkdir("test-results/practice-ui", { recursive: true });
  const screenshot = await browser.send("Page.captureScreenshot", {
    format: "png",
  });
  await writeFile(
    "test-results/practice-ui/desktop.png",
    Buffer.from(screenshot.data, "base64"),
  );
  const images = await browser.evaluate(`(async()=>{
    const THREE=await import('three');const {app}=await import('/src/main.js');const t=app.runtime.tutorial;
    const {bendGaugeState}=await import('/src/tutorial/bendGaugeState.js');
    const e=t.kuch.arrangement.events.find(e=>e.bend),g=t.cues.gauge,scene=new THREE.Scene();scene.background=new THREE.Color('#102321');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1024,900);
    const camera=new THREE.PerspectiveCamera(40,1024/900,.01,10);camera.position.z=3;
    scene.add(g.root);const images={};
    let visualTime=performance.now()+1000;
    for(const [name,value] of [['missing',null],['under',1],['matched',2],['overshoot',3],['wrong',-1]]){
      const state=bendGaugeState(e,1,value===null?null:{semitones:value});
      g.update(state,new THREE.Vector3(0,.15,0),.35,new THREE.Quaternion(),1,null,visualTime+=200);
      renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    app.runtime.scene.add(g.root);g.reset();renderer.dispose();
    const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=1560;
    const ctx=canvas.getContext('2d');ctx.drawImage(t.panel.canvas,0,0);ctx.drawImage(t.panel.statusCanvas,40,726);ctx.drawImage(t.panel.tempoControls.canvas,40,1119);
    images.panel=canvas.toDataURL('image/png').split(',')[1];
    const {TutorialTimingCues}=await import('/src/tutorial/TutorialTimingCues.js');
    const h=t.adapter.get(e.role),sphere=h.getSqueezeColliderSphere();
    const cueScene=new THREE.Scene();cueScene.background=new THREE.Color('#102321');
    const cueCamera=new THREE.OrthographicCamera(-sphere.radius*3.6,sphere.radius*3.6,sphere.radius*3.2,-sphere.radius*3.2,.001,10);
    cueCamera.position.copy(sphere.center).add(new THREE.Vector3(0,0,1));cueCamera.updateMatrixWorld();
    const cues=new TutorialTimingCues({get:role=>t.adapter.get(role),gestures:new Map(),lastStrikes:new Map(),r:{scene:cueScene,controllerStates:new Map(),controllers:[],getUserCamera:()=>cueCamera}});
    const cueRenderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});cueRenderer.setSize(1024,900);
    const guide={step:{timed:true,events:[e]},mode:'practice',anchorMs:0,beatMs:1500,beatAt:now=>now/1500};
    for(const [name,beat] of [['green-early',e.beat-.8],['green-late',e.beat-.08],['yellow-attack',e.beat],['yellow-roll',e.beat+e.beats*.45],['yellow-release',e.endBeat-.01],['released',e.endBeat+.01]]){
      cues.update(guide,beat*1500);
      const pair=cues.pool[0],active=name!=='released';
      if(pair.reference.visible!==active)throw new Error('White active-note boundary: '+name);
      if(name==='yellow-attack' && pair.yellow.visible)throw new Error('Yellow must start at zero');
      if(name==='yellow-roll' && Math.abs(pair.yellow.scale.x/pair.reference.scale.x-.45)>1e-8)throw new Error('Yellow hold progress must grow toward white');
      if(name==='yellow-release' && (!pair.yellow.visible || pair.yellow.scale.x>=pair.reference.scale.x || pair.yellow.scale.x/pair.reference.scale.x<.98))throw new Error('Yellow must approach white at release');
      if(name==='released' && pair.yellow.visible)throw new Error('No yellow after release');
      cueRenderer.render(cueScene,cueCamera);images[name]=cueRenderer.domElement.toDataURL('image/png').split(',')[1];
    }
    cues.dispose();cueRenderer.dispose();
    await t.enterPlay();return images;
  })()`);
  for (const [name, data] of Object.entries(images))
    await writeFile(
      `test-results/practice-ui/${name}.png`,
      Buffer.from(data, "base64"),
    );
  assert.deepEqual(browser.errors, []);
  console.log(
    "Native Home commits 40 BPM; ArrowRight commits 41 BPM to slider, session and metronome. Saved UI, gauge, and green/yellow phase snapshots in test-results/practice-ui/.",
  );
} finally {
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
