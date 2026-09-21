import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

// Exercises the real DOM controls and Three pickers using Chrome pointer input.
// Runs inside the existing synthetic capture/replay fixture, without another take.
export async function checkAlignment({chrome,output}) {
  const evaluate=chrome.evaluate;
  const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).onclick()`);
  const mouse=(type,x,y,button='left',buttons=0)=>chrome.send('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:type==='mousePressed'||type==='mouseReleased'?1:0});
  await evaluate(`(async()=>{
    const ed=captureEditor,canvas=document.getElementById('composite');
    const toggle=(id,enabled)=>{const input=document.getElementById(id);if(input.checked!==enabled)input.click();};
    await ed.seek(.7);toggle('preview-guides',false);toggle('preview-rays',false);toggle('preview-headset',false);
    const clean=canvas.toDataURL();
    toggle('preview-guides',true);
    if(canvas.toDataURL()===clean)throw new Error('Controller spheres did not change composite pixels');
    if(!['left','right'].every(hand=>{const sphere=ed.replay.proxies.get(hand);return sphere.visible&&sphere.geometry.type==='SphereGeometry'&&!sphere.material.wireframe;}))throw new Error('Solid controller spheres missing');
    toggle('preview-guides',false);toggle('preview-rays',true);
    if(canvas.toDataURL()===clean)throw new Error('Controller rays did not change composite pixels');
    if([...ed.replay.nodes.values()].some(node=>node.userData.capture.layer==='rays'))throw new Error('Fixture must test rays without optional recorded ray visuals');
    toggle('preview-guides',true);
    for(const time of [.7,1.4,.7]){
      await ed.seek(time);const frame=ed.timeline.seek(time*ed.project.mapping.a+ed.project.mapping.b);
      for(const controller of frame.xr.controllers){
        const sphere=ed.replay.proxies.get(controller.handedness),ray=ed.replay.controllerRays.get(controller.handedness);
        if(!ray.visible||ray.parent!==ed.replay.controllerRayScene)throw new Error('Tracked ray missing from its output layer');
        if(sphere.position.toArray().some((value,i)=>Math.abs(value-controller.grip.p[i])>1e-9))throw new Error('Sphere did not follow recorded grip');
        if(ray.position.toArray().some((value,i)=>Math.abs(value-controller.ray.p[i])>1e-9)||ray.quaternion.toArray().some((value,i)=>Math.abs(value-controller.ray.q[i])>1e-9))throw new Error('Ray did not follow target-ray pose');
      }
    }
  })()`);
  await evaluate(`(async()=>{await captureEditor.seek(.7);window.alignmentCheck={camera:structuredClone(captureEditor.project.camera),calibration:captureEditor.project.calibration,pixels:document.getElementById('composite').toDataURL()};})()`);
  assert.equal(await evaluate('captureEditor.inspector.mode'),'translate','Camera handles are visible by default');
  for(const [mode,button,axis,key] of [['translate','move-camera','X','position'],['rotate','rotate-camera','Y','rotation'],['scale','scale-camera','X','fov']]) {
    await click(button);
    const point=await evaluate(`(async()=>{
      const {Vector2,Vector3,Raycaster}=await import('three');
      const i=captureEditor.inspector,t=i.transform,r=i.renderer.domElement.getBoundingClientRect();
      i.render();t.updateMatrixWorld(true);
      const center=i.phone.position.clone().project(i.camera),cx=(center.x+1)*r.width/2,cy=(1-center.y)*r.height/2,ray=new Raycaster();
      for(let y=cy-100;y<cy+100;y+=3)for(let x=cx-100;x<cx+100;x+=3){
        if(x<5||y<5||x>r.width-5||y>r.height-5)continue;
        ray.setFromCamera(new Vector2(x/r.width*2-1,1-y/r.height*2),i.camera);
        const hit=ray.intersectObject(t._gizmo.picker[${JSON.stringify(mode)}],true).find(hit=>hit.object.visible);
        if(hit?.object.name===${JSON.stringify(axis)})return {x:r.left+x,y:r.top+y};
      }
      throw new Error('No visible ${mode} handle');
    })()`);
    await evaluate(`document.getElementById('play').onclick()`);
    assert.equal(await evaluate(`!document.getElementById('video').paused&&!document.getElementById('audio').paused`),true,'Both streams play before editing');
    await mouse('mouseMoved',point.x,point.y,'none');
    await mouse('mousePressed',point.x,point.y,'left',1);
    assert.deepEqual(await evaluate(`({dragging:captureEditor.inspector.transform.dragging,orbit:captureEditor.inspector.orbit.enabled,video:document.getElementById('video').paused,audio:document.getElementById('audio').paused})`),{dragging:true,orbit:false,video:true,audio:true});
    for(let step=1;step<=5;step++)await mouse('mouseMoved',point.x+step*7,point.y-step*4,'left',1);
    await mouse('mouseReleased',point.x+35,point.y-20);
    assert.equal(await evaluate('captureEditor.inspector.orbit.enabled'),true);
    assert.equal(await evaluate(`JSON.stringify(captureEditor.project.camera.${key})!==JSON.stringify(alignmentCheck.camera.${key})`),true,`${mode} changes camera`);
    if(mode==='scale')assert.equal(await evaluate(`(()=>{const ed=captureEditor;return JSON.stringify(ed.project.camera.position)===JSON.stringify(alignmentCheck.camera.position)&&JSON.stringify(ed.project.camera.rotation)===JSON.stringify(alignmentCheck.camera.rotation)&&ed.inspector.phone.scale.toArray().every(value=>value===1)&&ed.inspector.phoneVisual.scale.toArray().every(value=>value===1)&&ed.replay.scene.scale.toArray().every(value=>value===1);})()`),true,'Scale only changes lens and releases adapter scale after dragging');
    await evaluate('captureEditor.seek(.7)');
    assert.equal(await evaluate(`document.getElementById('composite').toDataURL()!==alignmentCheck.pixels`),true,`${mode} changes composite pixels`);
    await click('undo-camera');
    assert.equal(await evaluate(`JSON.stringify(captureEditor.project.camera)===JSON.stringify(alignmentCheck.camera)`),true,`${mode} undo restores exact camera`);
  }
  await evaluate(`captureEditor.inspector.renderer.domElement.focus()`);
  for(const [key,mode] of [['r','scale'],['e','rotate'],['w','translate'],['q','inspect']]){
    await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:`Key${key.toUpperCase()}`});
    await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:`Key${key.toUpperCase()}`});
    assert.equal(await evaluate('captureEditor.inspector.mode'),mode,'Camera keyboard shortcut');
  }
  await evaluate(`document.getElementById('seek-time').focus()`);
  await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR'});
  await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR'});
  assert.equal(await evaluate('captureEditor.inspector.mode'),'inspect','Typing does not change the camera tool');
  await click('inspect-scene');
  const orbit=await evaluate(`(()=>{const i=captureEditor.inspector,r=i.renderer.domElement.getBoundingClientRect();alignmentCheck.orbit=i.camera.position.toArray();alignmentCheck.pixels=document.getElementById('composite').toDataURL();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await mouse('mousePressed',orbit.x,orbit.y,'left',1);
  await mouse('mouseMoved',orbit.x+80,orbit.y+30,'left',1);
  await mouse('mouseReleased',orbit.x+80,orbit.y+30);
  assert.equal(await evaluate(`JSON.stringify(captureEditor.inspector.camera.position.toArray())!==JSON.stringify(alignmentCheck.orbit)`),true,'Orbit changed inspection camera');
  assert.equal(await evaluate(`JSON.stringify(captureEditor.project.camera)===JSON.stringify(alignmentCheck.camera)&&document.getElementById('composite').toDataURL()===alignmentCheck.pixels`),true,'Orbit leaves camera and composite unchanged');

  // Lens changes use the real range input, including the keyboard editing path.
  await evaluate(`document.getElementById('play').onclick()`);
  await evaluate(`document.getElementById('lens-fov').focus()`);
  await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  assert.equal(await evaluate(`captureEditor.project.camera.fov!==alignmentCheck.camera.fov&&document.getElementById('video').paused&&document.getElementById('audio').paused`),true,'Lens pauses and changes camera');
  await click('undo-camera');
  assert.equal(await evaluate(`JSON.stringify(captureEditor.project.camera)===JSON.stringify(alignmentCheck.camera)`),true,'Lens undo restores precise FOV');

  // Exact numeric edits must survive a save even though the slider readout rounds.
  await evaluate(`(()=>{
    document.getElementById('fine-camera').open=true;
    const input=document.getElementById('cam-x');input.focus();input.value='0.12345678901234568';input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));input.blur();
    document.getElementById('fine-camera').open=false;
  })()`);
  assert.equal(await evaluate('captureEditor.project.camera.position[0]'),.12345678901234568);
  await evaluate('captureEditor.seek(.7)');await click('save-frame');await click('cancel-match');
  await evaluate('captureEditor.seek(1.4)');await click('save-frame');await click('cancel-match');
  assert.deepEqual(await evaluate('captureEditor.project.bookmarks'),[.7,1.4]);
  await evaluate(`(async()=>{const camera=JSON.stringify(captureEditor.project.camera);await document.querySelector('#saved-frames [data-time="0.7"]').onclick();if(camera!==JSON.stringify(captureEditor.project.camera))throw new Error('Bookmark changed camera');})()`);
  assert.equal(await evaluate('document.getElementById("video").currentTime'),.7);
  assert.ok(await evaluate('Math.abs(document.getElementById("audio").currentTime-(captureEditor.project.mapping.a*.7+captureEditor.project.mapping.b))<.00001'),'Bookmark seeks clean audio to the mapped time (media clocks quantize)');
  await evaluate(`document.querySelector('#saved-frames .bookmark:last-child button:last-child').click()`);
  assert.deepEqual(await evaluate('captureEditor.project.bookmarks'),[.7]);
  await evaluate('captureEditor.seek(1.4)');await click('save-frame');await click('cancel-match');

  await chrome.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output});
  const expected=await evaluate('structuredClone(captureEditor.project)');await click('save-project');
  const name=`honk-project-${expected.takeId}.json`;
  let downloaded;
  for(let i=0;i<100;i++){
    try{if((await readdir(output)).includes(name)){downloaded=JSON.parse(await readFile(join(output,name),'utf8'));break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.deepEqual(downloaded,expected,'Actual Save project download preserves full camera precision and bookmarks');
  await evaluate(`(()=>{
    const ed=captureEditor,helpers=ed.inspector.helpers;
    if(helpers.parent||ed.replay.guides.parent)throw new Error('Helpers attached to recorded scene');
    for(const proxy of ed.replay.proxies.values())if(proxy.parent!==ed.replay.guides)throw new Error('Proxy in recorded scene');
    const guide=document.getElementById('preview-guides');if(!guide.checked)guide.click();
    ed.render({calibration:false});const clean=document.getElementById('composite').toDataURL();
    ed.render();if(clean===document.getElementById('composite').toDataURL())throw new Error('Guide toggle did not draw visible proxies');
    ed.render({calibration:false});if(clean!==document.getElementById('composite').toDataURL())throw new Error('Helpers leaked into export rendering');
    alignmentCheck.exportPixels=clean;
  })()`);
  await evaluate('captureEditor.seek(.7)');
  return {controllerSpheres:true,trackedControllerRays:true,independentGuideToggles:true,guidePoseSeeking:true,pointerTranslation:true,pointerRotation:true,pointerScale:true,scalePreservesMetricPose:true,keyboardCameraTools:true,orbitIndependent:true,pauseVideoAndAudio:true,undoMoveRotateScaleLens:true,preciseNumericEdit:true,bookmarksRetainCamera:true,removeBookmark:true,downloadPreservesPrecision:true,previewGuidesIsolated:true};
}
