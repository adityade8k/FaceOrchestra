import assert from 'node:assert/strict';

export async function checkScrubbing(chrome) {
  const evaluate=chrome.evaluate;
  const mouse=(type,x,y,buttons=0)=>chrome.send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:type==='mousePressed'||type==='mouseReleased'?1:0});
  await evaluate(`(async()=>{
    await captureEditor.seek(.7);
    window.scrubCheck={camera:JSON.stringify(captureEditor.project.camera),pixels:document.getElementById('composite').toDataURL()};
    document.getElementById('timeline').scrollIntoView({block:'center'});
  })()`);
  const rect=await evaluate(`(()=>{const input=document.getElementById('timeline'),r=input.getBoundingClientRect();return {x:r.left+8,y:r.top+r.height/2,width:r.width-16,max:Number(input.max)};})()`);
  const settled=async fraction=>{
    const result=await evaluate(`(async()=>{
      const slider=document.getElementById('timeline'),video=document.getElementById('video'),audio=document.getElementById('audio');
      const target=Number(slider.value),start=performance.now();
      while(video.seeking||Math.abs(video.currentTime-target)>.001||!document.getElementById('frame-time').textContent.startsWith('VIDEO '+target.toFixed(3)+' s')){
        if(performance.now()-start>4000)throw new Error('Scrub did not render its requested frame while dragging');
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      const ed=captureEditor,frame=ed.timeline.seek(target*ed.project.mapping.a+ed.project.mapping.b),left=frame.xr.controllers.find(c=>c.handedness==='left');
      if(left?.ray&&ed.replay.controllerRays.get('left').position.toArray().some((value,i)=>Math.abs(value-left.ray.p[i])>1e-8))throw new Error('Scene did not follow scrubbed video');
      if(JSON.stringify(ed.project.camera)!==scrubCheck.camera)throw new Error('Scrubbing changed the fixed camera');
      return {target,thumb:Number(slider.value),video:video.currentTime,audio:audio.currentTime,expectedAudio:Math.max(0,target*ed.project.mapping.a+ed.project.mapping.b),paused:video.paused&&audio.paused,changedPixels:document.getElementById('composite').toDataURL()!==scrubCheck.pixels};
    })()`);
    assert.ok(Math.abs(result.target-rect.max*fraction)<.04,'The thumb stays where it was dragged');
    assert.equal(result.thumb,result.target);assert.equal(result.paused,true);
    assert.ok(Math.abs(result.audio-result.expectedAudio)<.00001,'Clean audio follows the same time mapping');
    return result;
  };
  await evaluate(`document.getElementById('play').onclick()`);
  await mouse('mousePressed',rect.x+rect.width*.7/rect.max,rect.y,1);
  await mouse('mouseMoved',rect.x+rect.width*.8,rect.y,1);
  assert.equal((await settled(.8)).changedPixels,true,'Forward scrubbing renders before mouse-up');
  await mouse('mouseMoved',rect.x+rect.width*.2,rect.y,1);
  assert.equal((await settled(.2)).changedPixels,true,'Backward scrubbing renders before mouse-up');
  for(const fraction of [.9,.1,.8,.2,.7,.3,.9,.15])await mouse('mouseMoved',rect.x+rect.width*fraction,rect.y,1);
  await settled(.15);
  // Both endpoints must settle even if there is no newer presented video frame.
  await mouse('mouseMoved',rect.x,rect.y,1);await settled(0);
  await mouse('mouseMoved',rect.x+rect.width,rect.y,1);await settled(1);
  await mouse('mouseReleased',rect.x+rect.width,rect.y);
  await settled(1);
  for(const time of [.401,.402,1.234,.5]){
    await evaluate(`(async()=>{const input=document.getElementById('seek-time');input.value=${JSON.stringify(String(time))};await input.onchange({target:input});})()`);
    assert.ok(Math.abs(await evaluate(`document.getElementById('video').currentTime`)-time)<.00001,'Numeric playhead retains the entered value');
  }
  await evaluate(`document.getElementById('timeline').focus()`);
  await chrome.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await chrome.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await settled(.501/rect.max);
  assert.ok(Math.abs(await evaluate(`document.getElementById('video').currentTime`)-.501)<.00001,'Keyboard scrubbing works within the same source frame');
  await evaluate(`(async()=>{await document.getElementById('previous').onclick();await document.getElementById('next').onclick();window.scrollTo(0,0);await captureEditor.seek(.7);})()`);
  return {forwardDuringDrag:true,backwardDuringDrag:true,rapidDirectionChanges:true,endpoints:true,numericTime:true,keyboard:true,pausesBothStreams:true,sceneAndAudioFollow:true,cameraUnchanged:true};
}
