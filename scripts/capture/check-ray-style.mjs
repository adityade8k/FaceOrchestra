import assert from 'node:assert/strict';

export async function checkRayStyle(chrome) {
  const result=await chrome.evaluate(`(async()=>{
    const ed=captureEditor,$=id=>document.getElementById(id),canvas=$('composite');
    await ed.seek(.7);if(!$('preview-rays').checked)$('preview-rays').click();
    $('ray-appearance').open=true;$('reset-rays').click();
    const set=(id,value)=>{const input=$(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
    let previous=canvas.toDataURL();
    for(const [id,value] of [['ray-left-color','#ff00ff'],['ray-right-color','#00ffff'],['ray-opacity','.42'],['ray-length','2.1']]){
      set(id,value);const current=canvas.toDataURL();if(current===previous)throw new Error(id+' did not change preview pixels');previous=current;
    }
    const chosen=structuredClone(ed.project.rayStyle),sphereColor=ed.replay.proxies.get('left').material.color.getHexString();
    if(ed.replay.controllerRays.get('left').material.color.getHexString()!=='ff00ff'||ed.replay.controllerRays.get('right').material.color.getHexString()!=='00ffff')throw new Error('Independent ray colors were not applied');
    if(sphereColor!=='44ffaa')throw new Error('Ray color changed preview sphere color');
    $('preview-rays').click();const hidden=canvas.toDataURL();$('preview-rays').click();
    set('ray-opacity','0');if(canvas.toDataURL()!==hidden)throw new Error('Zero ray opacity should hide only rays');
    set('ray-opacity','.42');set('ray-length','0');if(canvas.toDataURL()!==hidden)throw new Error('Zero ray length should hide only rays');
    $('reset-rays').click();const defaults=structuredClone(ed.project.rayStyle);
    for(const [id,value] of [['ray-left-color',chosen.leftColor],['ray-right-color',chosen.rightColor],['ray-opacity',chosen.opacity],['ray-length',chosen.length]])set(id,value);
    $('ray-appearance').open=false;return {chosen,defaults,livePreview:true,independentColors:true,zeroOpacityAndLength:true,sphereUnchanged:true};
  })()`);
  assert.deepEqual(result.chosen,{leftColor:'#ff00ff',rightColor:'#00ffff',opacity:.42,length:2.1});
  assert.deepEqual(result.defaults,{leftColor:'#44ffaa',rightColor:'#ffaa44',opacity:.85,length:1.5});
  return result;
}

// Compare actual PNGs used by the MP4 encoder to the preview at the same size,
// excluding the deliberately preview-only guides / matching annotations.
export async function checkRayExportParity(chrome,exported) {
  return chrome.evaluate(`(async()=>{
    const ed=captureEditor,canvas=document.getElementById('composite'),ctx=canvas.getContext('2d');
    const old={width:canvas.width,height:canvas.height,time:document.getElementById('video').currentTime};
    canvas.width=ed.project.output.width;canvas.height=ed.project.output.height;ed.replay.renderer.setSize(canvas.width,canvas.height);
    const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const copyCtx=copy.getContext('2d');
    let checked=0,maxChannelDifference=0;
    try{
      for(const [i,time] of ${JSON.stringify([[0,exported.timestamps[0].video],[exported.frames-1,exported.timestamps.at(-1).video]])}){
        await ed.seek(time);ed.render({time,calibration:false,strict:true,transparent:${!exported.ffmpeg}});const preview=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const image=new Image();image.src='/api/exports/${exported.id}/frame-'+String(i).padStart(6,'0')+'.png';await image.decode();copyCtx.clearRect(0,0,copy.width,copy.height);copyCtx.drawImage(image,0,0);const output=copyCtx.getImageData(0,0,copy.width,copy.height).data;
        // Export snapshots phone pixels before scaling; preview draws the media
        // element directly. That extra 8-bit copy can round a video channel by
        // one level. Transparent ray/scene exports must match exactly.
        for(let j=0;j<preview.length;j++){
          const difference=Math.abs(preview[j]-output[j]);maxChannelDifference=Math.max(maxChannelDifference,difference);
          if(difference>${exported.ffmpeg?1:0})throw new Error('Styled rays / composite differed between preview and exported frame '+i+' at channel '+j+' by '+difference);
        }
        checked++;
      }
      const saved=await fetch('/api/exports/${exported.id}/project.json').then(r=>r.json());
      if(JSON.stringify(saved.rayStyle)!==JSON.stringify(ed.project.rayStyle))throw new Error('Export project lost ray style');
      return {framesCompared:checked,maxChannelDifference,transparent:${!exported.ffmpeg},exportProjectPreservesStyle:true};
    }finally{canvas.width=old.width;canvas.height=old.height;ed.replay.renderer.setSize(old.width,old.height);await ed.seek(old.time);}
  })()`);
}
