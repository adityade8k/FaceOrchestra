import * as THREE from 'three';

export function installCaptureControls(recorder) {
  const panel=document.createElement('details');panel.className='capture-controls';panel.innerHTML=`
    <summary>Mixed Reality Capture</summary>
    <p role="status" aria-live="polite"></p>
    <label>Receiver pairing code <input name="code" inputmode="numeric" maxlength="6" size="8" autocomplete="off"></label>
    <button data-command="pair">Pair receiver</button>
    <button data-command="capture-toggle">Start Mixed Reality Recording</button>
    <button data-command="capture-sync">Mark Sync</button><button data-command="capture-pose">Mark Calibration Pose</button>
    <label>Sampling <select name="rate"><option value="0">Native XR</option><option value="60">60 Hz maximum</option><option value="30">30 Hz maximum</option></select></label>
    <label><input name="ui" type="checkbox"> Record menu, tutorial and ray layers</label>
    <button data-command="recover">Recover this browser’s pending takes</button>
    <a href="/capture/" target="_blank" rel="noopener">Open local editor</a>`;
  document.body.append(panel);
  const style=document.createElement('style');style.textContent='.capture-controls{position:fixed;right:12px;top:12px;z-index:2000;width:290px;max-height:85vh;overflow:auto;background:#172c29ee;color:#fff4dd;padding:12px;border:1px solid #83dfbd;border-radius:10px;font:14px system-ui}.capture-controls summary{cursor:pointer;font-weight:700}.capture-controls button,.capture-controls label,.capture-controls a{display:block;margin:9px 0}.capture-controls button{padding:7px;color:#102321}.capture-controls a{color:#83dfbd}.capture-controls input,.capture-controls select{max-width:170px}';document.head.append(style);
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const statusMesh=new THREE.Mesh(new THREE.PlaneGeometry(.31,.048),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));statusMesh.name='Mixed Reality Capture status';statusMesh.position.set(0,.08,-.22);statusMesh.renderOrder=1200;
  let last='';
  const refresh=()=>{
    const active=recorder.active, label=recorder.owner?(active?'Stop Recording':'Start Raag Jog Recording'):(active?'Stop Mixed Reality Recording':'Start Mixed Reality Recording');
    panel.querySelector('[data-command="capture-toggle"]').textContent=label;
    panel.querySelector('[data-command="capture-toggle"]').disabled=['preparing','stopping'].includes(recorder.state);
    for(const selector of ['[name="rate"]','[name="ui"]','[data-command="recover"]'])panel.querySelector(selector).disabled=Boolean(recorder.owner)||active||['preparing','stopping'].includes(recorder.state);
    for(const id of ['capture-sync','capture-pose'])panel.querySelector(`[data-command="${id}"]`).disabled=!active||Boolean(recorder.owner&&id==='capture-sync');
    const message=`${recorder.state.toUpperCase()} · ${recorder.elapsed.toFixed(1)}s · ${recorder.connected?'Connected':'Offline'} — ${recorder.message}`;
    panel.querySelector('p').textContent=message;
    if(message!==last){last=message;const ctx=canvas.getContext('2d');ctx.fillStyle='#102321';ctx.fillRect(0,0,1024,160);ctx.fillStyle=recorder.connected?'#a7f1c5':'#ffd591';ctx.font='bold 35px sans-serif';ctx.fillText(`${recorder.state.toUpperCase()}  ${recorder.elapsed.toFixed(1)}s  ${recorder.connected?'Connected':'Offline'}`,20,52);ctx.font='25px sans-serif';ctx.fillText(recorder.message.slice(0,75),20,106);texture.needsUpdate=true;}
    const controller=recorder.runtime.controllers[0];if(controller&&statusMesh.parent!==controller)controller.add(statusMesh);statusMesh.visible=recorder.state!=='idle'||Boolean(controller?.userData.radialMenu?.visible);
    for(const c of recorder.runtime.controllers){const ring=c.userData.radialMenu?.userData.childRings?.get('category-capture');if(ring){recorder.runtime.radialSpawnMenu.setLabelText(ring.userData.labels[0],label);}}
  };
  panel.addEventListener('click',async event=>{
    const command=event.target.dataset.command;if(!command)return;
    try {
      if(command==='pair')await recorder.pair(panel.querySelector('[name="code"]').value);
      else if(command==='recover') {
        const worker=new Worker('/src/capture/stream-worker.js',{type:'module'});
        worker.onmessage=({data})=>{if(data.type==='recover-list'){const take=data.takes[0];if(!take){recorder.message='No pending browser takes';worker.terminate();}else {recorder.message='Recovering pending take; keep this tab open';worker.postMessage({type:'recover',take,url:`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/stream`});}}else if(data.type==='finalized'){recorder.message='Pending take recovered';worker.terminate();}else if(data.message)recorder.message=data.message;refresh();};worker.postMessage({type:'recover-list'});
      } else await recorder.command(command);
    }catch(error){recorder.message=error.message;}refresh();
  });
  panel.querySelector('[name="rate"]').onchange=e=>{recorder.maxHz=Number(e.target.value);};
  panel.querySelector('[name="ui"]').onchange=e=>{recorder.includeUI=e.target.checked;};
  recorder.addEventListener('change',refresh);const timer=setInterval(refresh,500);recorder.readiness();refresh();
  return ()=>{clearInterval(timer);recorder.removeEventListener('change',refresh);panel.remove();style.remove();statusMesh.removeFromParent();statusMesh.geometry.dispose();statusMesh.material.dispose();texture.dispose();};
}
