import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer} from './capture/server.mjs';
import {launchChrome} from './capture/chrome.mjs';

const root=await mkdtemp(join(tmpdir(),'honk-frame-'));
let service,browser;
try {
  await mkdir('test-results/frame',{recursive:true});
  service=await startServer({host:'127.0.0.1',port:0,plain:true,dataRoot:root});
  if(process.platform==='darwin')process.env.CAPTURE_SOFTWARE_GL??='0';
  browser=await launchChrome();
  await browser.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const reports=[];
  for(const song of ['tu-kisi-rail-si','rishte-naate']){
    const report=await browser.evaluate(`(async()=>{
      const {app}=await import('/src/main.js'),THREE=await import('three');
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const check=(v,m)=>{if(!v)throw new Error(m)};
      for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await wait(100);
      const r=app.runtime,t=r.tutorial;
      await t.action('play');
      await t.action('tutorials');await t.action('composition:${song}');
      const d=t.dataTutorial,f=d.ensemble.layoutFrame,a=t.adapter;
      check(f?.members.length>0,'Frame missing');
      app.stopCompute();
      const controller=new THREE.Group();controller.userData.handedness='right';
      r.scene.add(controller);r.interactionCoordinator.registerController(controller);r.controllers.push(controller);
      const state=r.controllerStates.get(controller);
      const input=(button,pressed)=>r.interactionCoordinator.receiveInput({type:'button.transition',controller,
        handedness:'right',button,pressed,timestamp:performance.now()});
      const point=(target,rotation)=>{
        controller.position.copy(target).add(new THREE.Vector3(0,0,.6).applyQuaternion(rotation));
        controller.quaternion.copy(rotation);controller.updateMatrixWorld(true);
      };
      const h=f.members[0],initialCount=r.instrumentRegistry.size;
      const untouched=new Map(f.members.map(h=>[h.id,h]));
      // Rearrange one Honk through the ordinary instrument grab implementation.
      point(h.getSqueezeColliderSphere().center,h.root.quaternion);
      state.grip=true;
      check(r.gripTransformSystem.begin(controller,{object:h.gripTargetList[0]}),'Individual grab failed');
      controller.position.add(new THREE.Vector3(.055,.035,.07));controller.rotateZ(.12);
      r.updateGripTransform();r.handleGripEndIntent(controller);state.grip=false;
      r.setInstrumentBaseScale(h,h.baseScale*1.08);
      const local=f.root.worldToLocal(h.root.position.clone());
      const relativeRotation=f.root.quaternion.clone().invert().multiply(h.root.quaternion),relativeSize=h.baseScale/f.scale;
      const verifyEdited=()=>{
        check(f.root.worldToLocal(h.root.position.clone()).distanceTo(local)<1e-7,'Edited Honk snapped back');
        check(f.root.quaternion.clone().invert().multiply(h.root.quaternion).angleTo(relativeRotation)<1e-6,'Edited rotation was lost');
        check(Math.abs(h.baseScale/f.scale-relativeSize)<1e-7,'Edited size was lost');
      };
      // Grab the actual frame handle, preserving its controller-relative pose.
      for(const turn of [.3,-.2]){
        point(f.moveHandle.getWorldPosition(new THREE.Vector3()),f.root.quaternion);
        input('grip',true);check(f.drag?.controller===controller,'Frame grab missed');
        const offset=controller.matrixWorld.clone().invert().multiply(f.root.matrixWorld);
        controller.position.add(new THREE.Vector3(.1,-.02,.06));
        controller.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.12,turn,.08)));
        controller.updateMatrixWorld(true);f.update();
        const expected=new THREE.Matrix4().multiplyMatrices(controller.matrixWorld,offset),p=new THREE.Vector3(),q=new THREE.Quaternion();
        expected.decompose(p,q,new THREE.Vector3());
        check(f.root.position.distanceTo(p)<1e-7&&f.root.quaternion.angleTo(q)<1e-6,'Frame differs from ordinary grab transform');
        verifyEdited();
        r.interactionCoordinator.receiveInput({type:'axis.step',axis:'thumbstickX',direction:1,controller});
        f.update();verifyEdited();input('grip',false);
        check(!f.drag&&!f.blocked.size,'Frame failed to release');
      }
      // The frame's actual XR Reset button restores a deleted real instrument.
      const victimPose=f.poses[1],victim=a.get(victimPose.recipe.role),oldId=victim.id;
      r.deleteInstrument(victim);check(!a.get(victimPose.recipe.role),'Deletion failed');
      f.apply(f.root.position.clone().add(new THREE.Vector3(.05,0,0)),f.scale);verifyEdited();
      check(r.instrumentRegistry.size===initialCount-1,'Move unexpectedly recreated a deleted Honk');
      point(f.resetHandle.getWorldPosition(new THREE.Vector3()),f.root.quaternion);
      input('trigger',true);input('trigger',false);
      const restored=a.get(victimPose.recipe.role);
      check(restored&&restored.id!==oldId&&!restored.disposed,'Reset did not recreate deleted Honk');
      check(Math.abs(a.midi(restored)-victimPose.recipe.midi)<.25,'Restored Honk has wrong pitch');
      check(r.instrumentRegistry.size===initialCount,'Reset changed the instrument count');
      check(f.root.position.distanceTo(f.home)<1e-7&&f.root.quaternion.angleTo(f.homeRotation)<1e-6&&f.scale===1,'Reset did not restore frame pose');
      for(const pose of f.poses){
        check(a.get(pose.recipe.role)===pose.h&&pose.h.root.visible,'Stale role or missing visibility');
        check(pose.h.root.position.distanceTo(pose.home.offset.clone().applyMatrix4(f.root.matrixWorld))<1e-7,'Reset did not restore Honk pose');
        if(pose.h.id!==restored.id)check(untouched.get(pose.h.id)===pose.h,'Reset replaced a surviving Honk');
      }
      f.controls.querySelector('[data-layout="reset"]').click();
      check(r.instrumentRegistry.size===initialCount&&a.get(victimPose.recipe.role)===restored,'Repeated Reset duplicated a Honk');
      await r.audioSystem.ensureAudio();
      point(restored.getSqueezeColliderSphere().center,restored.root.quaternion);
      input('trigger',true);
      r.updateHorn(performance.now());await wait(20);r.updateHorn(performance.now());
      check(restored.activeVoiceIds.size>0,'Recovered Honk does not play');
      input('trigger',false);
      controller.position.set(20,20,20);controller.updateMatrixWorld(true);r.updateHorn(performance.now());
      r.controllers.splice(r.controllers.indexOf(controller),1);r.controllerStates.delete(controller);controller.removeFromParent();
      const placedRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.12,.4,.1)).multiply(f.homeRotation);
      f.apply(f.home.clone().add(new THREE.Vector3(.1,.02,0)),1.1,placedRotation);
      d.ensemble.validate();
      app.computeSuspended=false;app.start();await wait(700);
      await t.action('step-demo');
      const deadline=performance.now()+23000;
      while(d.phase&&performance.now()<deadline)await wait(40);
      check(!d.phase&&d.feedback.includes('complete'),'Rotated demonstration failed: '+d.feedback);
      check(f.root.quaternion.angleTo(placedRotation)<1e-6,'Demonstration changed frame rotation');
      check(f.members.every(h=>h.root.visible),'Demonstration hid frame members');
      const result={song:'${song}',members:f.members.length,editedPosesPreserved:true,fullGrabRotation:true,
        resetRecoversDeleted:true,recoveredNotePlays:true,rotatedDemonstration:true};
      await t.action('exit');return result;
    })()`);
    reports.push(report);console.log(JSON.stringify(report));
  }
  assert.deepEqual(browser.errors,[]);
  await writeFile('test-results/frame/browser.json',JSON.stringify({reports,errors:browser.errors},null,2)+'\n');
}finally{
  if(browser?.errors.length)console.error(browser.errors);
  await browser?.close();await service?.close();await rm(root,{recursive:true,force:true});
}
