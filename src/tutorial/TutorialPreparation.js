import * as THREE from 'three';
import { LESSON_STEPS } from './lessonSteps.js';
import { COMPOSITION as C, TUTORIAL_PRESETS, tuningForMidi } from './composition.js';
import { validateSetup } from './validation.js';

export const isSetupStep=step=>['spawn','clock-wire','wire','tempo','timbre'].includes(step.type);
export function requiredSetupSteps(step,{includeCurrent=false}={}) {
  const index=LESSON_STEPS.findIndex(s=>s.id===step.id);
  return LESSON_STEPS.slice(0,index+(includeCurrent?1:0)).filter(isSetupStep);
}
export function requiredRecordings(step) {
  const index=LESSON_STEPS.findIndex(s=>s.id===step.id),roles=[];
  if(index>=LESSON_STEPS.findIndex(s=>s.id==='finalize-chords'))roles.push('chordLooper');
  if(index>=LESSON_STEPS.findIndex(s=>s.id==='finalize-percussion'))roles.push('percussionLooper');
  return roles;
}

export class TutorialPreparation {
  constructor(runtime){this.t=runtime;this.a=runtime.adapter;this.r=runtime.r;}
  async prepare(step,{includeCurrent=false,check=()=>{}}={}) {
    const changed=[];
    for(const setup of requiredSetupSteps(step,{includeCurrent})) {
      check();this.a.snapshotAt=-Infinity;
      const before=validateSetup(setup,this.a.snapshot(performance.now()),null);
      if(before?.ok)continue;
      if(setup.type==='spawn')await this.ensureRole(setup,check);
      else this.a.command(setup.action,performance.now(),'assistance');
      changed.push(setup.title);this.t.session?.assisted.add(setup.id);
      const end=performance.now()+2000;let result;
      do {
        await this.frame();check();this.a.snapshotAt=-Infinity;
        result=validateSetup(setup,this.a.snapshot(performance.now()),null);
      }while(!result.ok&&performance.now()<end);
      if(!result.ok)throw new Error(`${setup.title}: ${result.message} Choose Prepare after fixing it.`);
    }
    check();this.a.snapshotAt=-Infinity;
    return changed;
  }
  async ensureRole(step,check=()=>{}) {
    const a=this.a,preset=TUTORIAL_PRESETS.find(p=>p.role===step.role),existing=a.members(step.role);
    if(existing.length) {
      if(preset) {
        const ids=[...a.ids(step.role)],reference=existing[0],firstIndex=ids.indexOf(reference.id);
        for(let i=0;i<preset.midis.length;i++){
          let h=this.r.instrumentRegistry.get(ids[i]);
          if(!h){
            const root=this.r.createSpawnedComponent('honk',{tuning:tuningForMidi(preset.midis[i])});
            if(!root)throw new Error(`Could not create the missing voice in ${step.role}.`);
            h=this.r.activeInstrumentState;ids[i]=h.id;
            reference.root.getWorldQuaternion(root.quaternion);
            reference.root.getWorldPosition(root.position);root.position.add(new THREE.Vector3((i-firstIndex)*preset.spacing,0,0).applyQuaternion(root.quaternion));
            if(h.noteLabelGroup)h.noteLabelGroup.visible=false;
          }
          h.applyTuning(tuningForMidi(preset.midis[i]));
        }
        a.roles.set(step.role,ids);
        if(step.role==='melody')for(const [i,pitch] of Object.keys(C.pitches).entries())a.roles.set(`melody-${pitch}`,[ids[i]]);
        await this.frame();check();a.snapshotAt=-Infinity;
        if(!a.snapshot(performance.now()).roles[step.role]?.contactExact){
          const origin=reference.root.getWorldPosition(new THREE.Vector3()),rotation=reference.root.getWorldQuaternion(new THREE.Quaternion());
          for(const [i,id] of ids.entries()){
            const h=this.r.instrumentRegistry.get(id),point=new THREE.Vector3((i-firstIndex)*preset.spacing,0,0).applyQuaternion(rotation).add(origin);
            h.root.position.copy(h.root.parent.worldToLocal(point));h.root.updateWorldMatrix(true,true);
          }
          const shift=this.findFreePlacement({instruments:a.members(step.role)});
          for(const h of a.members(step.role)){
            const point=h.root.getWorldPosition(new THREE.Vector3()).add(shift);
            h.root.position.copy(h.root.parent.worldToLocal(point));h.root.updateWorldMatrix(true,true);
          }
        }
      }
      return;
    }
    const controller=a.virtuals[0];controller.userData.tutorialOrigin='assistance';
    a.select(step,controller,'assistance');await this.frame();check();
    const preview=this.r.pendingSpawnPlacement;
    if(preview) {
      const shift=this.findFreePlacement(preview);
      controller.position.add(shift);controller.updateMatrixWorld(true);await this.frame();check();a.place();await this.frame();
    }
    if(!a.get(step.role))throw new Error(`Could not place ${step.title}. Make room near the composition and choose Prepare again.`);
    a.snapshotAt=-Infinity;
  }
  findFreePlacement(preview) {
    const pendingIds=new Set(preview.instruments.map(h=>h.id)),bounds=new THREE.Box3();
    for(const h of preview.instruments){h.root.updateWorldMatrix(true,true);bounds.union(new THREE.Box3().setFromObject(h.root));}
    const obstacles=[];
    for(const h of this.r.instrumentRegistry.values())if(h.kind!=='stick'&&!pendingIds.has(h.id)&&h.root?.visible)obstacles.push(new THREE.Box3().setFromObject(h.root).expandByScalar(.025));
    // The panel remains an obstacle even in desktop mode, matching XR preparation.
    this.t.panel.group.updateWorldMatrix(true,true);
    obstacles.push(new THREE.Box3().setFromObject(this.t.panel.surface).expandByScalar(.06));
    const viewer=this.r.getUserCamera().getWorldPosition(new THREE.Vector3()),center=new THREE.Vector3();
    const candidates=[new THREE.Vector3()];
    for(let ring=1;ring<=4;ring++)for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,0,-1],[1,0,-1],[-1,0,-1],[0,1,0],[0,-1,0]])
      candidates.push(new THREE.Vector3(x*.24*ring,y*.18*ring,z*.22*ring).applyQuaternion(this.a.layoutRotation));
    for(const shift of candidates){
      const candidate=bounds.clone().translate(shift);candidate.getCenter(center);
      if(center.distanceTo(viewer)>2.65||center.y<viewer.y-1||center.y>viewer.y+.45)continue;
      if(!obstacles.some(box=>box.intersectsBox(candidate)))return shift;
    }
    throw new Error('No clear placement space within reach. Move nearby instruments, cancel the preview, then choose Prepare again.');
  }
  frame(){return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
}
