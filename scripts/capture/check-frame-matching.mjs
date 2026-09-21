import assert from 'node:assert/strict';

export async function checkFrameMatching(chrome) {
  const evaluate=chrome.evaluate;
  await evaluate(`captureEditor.setProject({camera:{position:[0,1.4,3],rotation:[0,0,0],fov:55,center:[0,0]},observations:[],calibration:null,bookmarks:[],frameMatches:[],frameFit:null})`);
  // Measure the colored controller dots in the actual decoded fixture video.
  // Do not manufacture clicks by projecting the camera we are trying to fit.
  const clickHand=async hand=>{
    const position=await evaluate(`(()=>{
      const v=document.getElementById('video'),image=document.createElement('canvas');image.width=v.videoWidth;image.height=v.videoHeight;
      const ctx=image.getContext('2d');ctx.drawImage(v,0,0);const data=ctx.getImageData(0,0,image.width,image.height).data;
      const color=${hand==='left'?'[196,98,69]':'[66,107,157]'};let x=0,y=0,count=0;
      for(let i=0;i<data.length;i+=4)if(color.every((value,k)=>Math.abs(data[i+k]-value)<20)){const pixel=i/4;x+=pixel%image.width;y+=Math.floor(pixel/image.width);count++;}
      if(count<20)throw new Error('Synthetic controller dot missing');
      const c=document.getElementById('composite');c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect(),scale=Math.min(r.width/1080,r.height/1920);
      return {x:r.left+(r.width-1080*scale)/2+(x/count+.5)/image.width*1080*scale,y:r.top+(r.height-1920*scale)/2+(y/count+.5)/image.height*1920*scale};
    })()`);
    for(const type of ['mousePressed','mouseReleased'])await chrome.send('Input.dispatchMouseEvent',{type,...position,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  };
  const estimates=[];
  for(const time of [.35,.85,1.4,1.95,2.6,3.2]){
    await evaluate(`(async()=>{await captureEditor.seek(${time});await document.getElementById('save-frame').onclick();})()`);
    assert.equal(await evaluate(`document.getElementById('frame-matching').hidden`),false);
    assert.match(await evaluate(`document.getElementById('match-prompt').textContent`),/LEFT/);
    await clickHand('left');
    assert.match(await evaluate(`document.getElementById('match-prompt').textContent`),/RIGHT/);
    await evaluate(`window.beforeFrameFit=structuredClone(captureEditor.project.camera)`);
    await clickHand('right');
    assert.equal(await evaluate(`document.getElementById('frame-matching').hidden`),true);
    estimates.push(await evaluate(`captureEditor.project.frameFit`));
  }
  assert.equal(estimates[0].status,'provisional');assert.equal(estimates.at(-1).status,'refined');
  assert.equal(estimates.at(-1).count,12);assert.ok(estimates.at(-1).rms<15,'Six image-matched frames should fit the known synthetic camera');
  const fitted=await evaluate('structuredClone(captureEditor.project)');
  const projectionError=await evaluate(`(async()=>{
    const {projectPoint}=await import('/src/capture/calibration.js'),{demoCamera}=await import('/capture/demo.js');
    const frame=captureEditor.timeline.seek(2.3),errors=frame.xr.controllers.map(c=>{const a=projectPoint(c.grip.p,captureEditor.project.camera),b=projectPoint(c.grip.p,demoCamera);return Math.hypot(a[0]-b[0],a[1]-b[1]);});return Math.max(...errors);
  })()`);
  assert.ok(projectionError<20,'Camera should also align an unseen pose');
  await evaluate(`document.getElementById('undo-camera').onclick()`);
  assert.equal(await evaluate(`JSON.stringify(captureEditor.project.camera)===JSON.stringify(beforeFrameFit)`),true,'Automatic fit is one undoable camera edit');
  await evaluate(`captureEditor.setProject(${JSON.stringify(fitted)})`);
  await evaluate(`(async()=>{await captureEditor.seek(.35);await document.getElementById('save-frame').onclick();})()`);
  await clickHand('left');await evaluate(`document.getElementById('cancel-match').onclick()`);
  assert.deepEqual(await evaluate('captureEditor.project.frameMatches'),fitted.frameMatches,'Cancelling replacement preserves the original matches');
  await evaluate(`(async()=>{await document.getElementById('save-frame').onclick();document.getElementById('skip-match').click();document.getElementById('skip-match').click();})()`);
  assert.deepEqual(await evaluate('captureEditor.project.frameMatches'),fitted.frameMatches,'Skipping occluded controllers cannot invent matches');
  await evaluate(`document.querySelector('#saved-frames .bookmark:last-child button:last-child').click()`);
  assert.equal(await evaluate('captureEditor.project.frameMatches.length'),5,'Removing a saved frame removes its fitting constraints');
  await evaluate(`captureEditor.setProject(${JSON.stringify(fitted)});document.getElementById('crop-zoom').value=1.1;document.getElementById('crop-zoom').onchange()`);
  assert.deepEqual(await evaluate('captureEditor.project.frameMatches'),[],'Changing crop invalidates image measurements');
  await evaluate(`captureEditor.setProject(${JSON.stringify(fitted)});window.scrollTo(0,0)`);
  return {imageMeasuredClicks:true,estimates,heldOutProjectionError:projectionError,undo:true,cancelReplacement:true,skipOccluded:true,removeConstraints:true,cropInvalidation:true};
}
