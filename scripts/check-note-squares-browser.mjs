import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './capture/server.mjs';
import { launchChrome } from './capture/chrome.mjs';

const root = await mkdtemp(join(tmpdir(), 'honk-note-squares-'));
const output = 'test-results/note-squares';
let service, browser;
try {
  service = await startServer({host:'127.0.0.1',port:0,plain:true,dataRoot:root});
  if (process.platform === 'darwin') process.env.CAPTURE_SOFTWARE_GL ??= '0';
  browser = await launchChrome();
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const result = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js'), THREE=await import('three');
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    while(!app.runtime.tutorial.ready)await wait(100);
    const r=app.runtime,t=r.tutorial,check=(ok,message)=>{if(!ok)throw new Error(message)};
    await t.action('play');await t.selectComposition('tu-kisi-rail-si','tutorials');
    r.renderer.setAnimationLoop(null);
    const hands=t.dataTutorial.ensemble.hands;
    check(hands.labels.size===10,'Missing melody squares');
    const role=hands.labels.keys().next().value,square=hands.labels.get(role);
    const events=[{id:'a',role,beat:0,beats:1},{id:'b',role,beat:1,beats:1},{id:'c',role,beat:2.05,beats:1}];
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.18,.18,.09,-.09,.01,10);
    camera.position.z=1;
    const snapshots=[],states=[['Inactive',-1],['Hold',.5],['Release',2.025],['Replay',2.05]];
    let steady;
    for(const [index,[name,beat]] of states.entries()){
      hands.update(events,beat,60000/115);
      const active=name==='Hold'||name==='Replay';
      check(square.visible&&square.userData.activeNote===active,'Wrong note state');
      check(square.material.color.getHex()===0xffffff&&square.children[0].material.color.getHex()===0xffffff,'Square is not white');
      check(square.material.opacity===(active?1:0),'Inactive square retained its fill');
      if(name==='Hold'){steady=square.scale.x;check(steady<.07,'Square was not made smaller');}
      if(name==='Replay')check(square.scale.x<steady*.85,'Replay did not shrink');
      const clone=square.clone(true);
      clone.traverse(mesh=>{if(mesh.material)mesh.material=mesh.material.clone()});
      clone.position.set((index-1.5)*.085,0,0);clone.quaternion.identity();
      scene.add(clone);snapshots.push({name,size:square.scale.x,filled:active});
    }
    hands.update(events,1,60000/115);
    check(square.scale.x<steady*.85,'Abutting repeated attack stayed full size');
    hands.update(events,1.5,60000/115);
    check(Math.abs(square.scale.x-steady)<1e-10,'Square did not grow back after replay');
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setSize(960,480);renderer.setClearColor(0x14211d,1);renderer.render(scene,camera);
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=480;
    const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0);
    for(const [index,state] of snapshots.entries()){
      const x=Math.round(480+(index-1.5)*.085/.36*960),pixel=ctx.getImageData(x,240,1,1).data;
      check(state.filled?pixel[0]>240&&pixel[1]>240&&pixel[2]>240:pixel[0]<100,'Rendered center does not match fill/outline state');
      ctx.fillStyle='white';ctx.font='22px system-ui';ctx.textAlign='center';ctx.fillText(state.name,x,365);
    }
    const image=canvas.toDataURL('image/png').split(',')[1];renderer.dispose();
    return {whiteSquares:true,inactiveOutlines:true,smaller:true,repeatedAttackPulse:true,snapshots,image};
  })()`);
  assert.deepEqual(browser.errors,[]);
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'states.png'),Buffer.from(result.image,'base64'));
  delete result.image;
  await writeFile(join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  if(browser?.errors.length)console.error(browser.errors);
  await browser?.close();await service?.close();await rm(root,{recursive:true,force:true});
}
