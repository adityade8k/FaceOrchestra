import * as THREE from 'three';
import { scoreForStep } from './scoring.js';
import { timingCueState } from './timingCueState.js';
import { bendCueState, bendCueDisplacement, BEND_PRACTICE_DURATION_MS } from './bendCueState.js';

// Musical phases are derived from the attempt clock, with no timers or UI cadence.
export class TutorialTimingCues {
  constructor(adapter) {
    this.adapter=adapter;this.geometry=new THREE.RingGeometry(1,1.06,48);this.quaternion=new THREE.Quaternion();this.position=new THREE.Vector3();
    this.startQuaternion=new THREE.Quaternion();this.right=new THREE.Vector3();this.localRight=new THREE.Vector3();this.localUp=new THREE.Vector3();
    this.bendInstruction='';this.releasedGuide=null;
    this.pool=Array.from({length:3},()=>{
      const make=color=>{const mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
        mesh.raycast=()=>{};mesh.renderOrder=100;mesh.visible=false;adapter.r.scene.add(mesh);return mesh;};
      const reference=make(0xfff4dd);reference.material.opacity=.45;
      return {yellow:make(0xffd15a),green:make(0x60ef9b),reference,bend:make(0xffad38)};
    });
    this.step=null;this.events=[];
  }
  reset(){for(const pair of this.pool)for(const mesh of Object.values(pair))mesh.visible=false;this.step=null;this.bendInstruction='';this.releasedGuide=null;}
  update(session,now,{active=true}={}) {
    for(const pair of this.pool)for(const mesh of Object.values(pair))mesh.visible=false;
    this.bendInstruction='';
    if(!session?.step||!active)return;
    const step=session.step;if(this.step!==step){this.step=step;this.events=scoreForStep(step);this.releasedGuide=null;}
    this.adapter.r.getUserCamera().getWorldQuaternion(this.quaternion);
    this.right.set(1,0,0).applyQuaternion(this.quaternion);
    const percussion=['drums','strike'].includes(step.type)||(step.type==='record'&&step.looperRole==='percussionLooper');
    if(!step.timed||session.anchorMs===null) {
      const role=step.role||this.events[0]?.role||step.looperRole;
      const h=this.adapter.get(role);if(!h||h.pendingPlacement)return;
      let held=false,gesture=null,controller=null;
      for(const [candidate,g] of this.adapter.gestures)if(g.role===role){held=true;gesture=g;controller=candidate;break;}
      const strike=this.adapter.lastStrikes.get(role);
      const cue=percussion&&session.mode==='demonstration'&&session.cueAnchorMs!==undefined
        ? timingCueState((now-session.cueAnchorMs)/session.beatMs,{beat:1},{percussion:true})
        : percussion&&strike!==undefined?timingCueState((now-strike)/session.beatMs,{beat:0},{percussion:true}):null;
      let state=cue||{yellow:held?1.2:.75,green:0};
      if(gesture){
        const elapsed=now-gesture.startMs;
        this.releasedGuide={role,at:now};
        state={phase:'hold',yellow:1.2+.18*Math.sin(Math.min(elapsed/120,1)*Math.PI),green:0};
        // Waiting consumes no bend-guide time. Keep the settled target until
        // actual release even if the learner holds beyond the example duration.
        state.bend=bendCueState(step.bend,Math.min(1,elapsed/BEND_PRACTICE_DURATION_MS));
      }else if(this.releasedGuide?.role===role){
        const since=(now-this.releasedGuide.at)/session.beatMs;
        state={phase:'release',yellow:1.2*Math.max(0,1-since/.3),green:0};
      }
      this.show(this.pool[0],role,state,percussion,controller);return;
    }
    const beat=session.beatAt(now);let index=0;
    for(const event of this.events) {
      const state=timingCueState(beat,event,{percussion,beatMs:session.beatMs});
      if(state&&index<this.pool.length){
        state.bend=bendCueState(event.bend,(beat-event.beat)/event.beats);
        this.show(this.pool[index++],event.role,state,percussion);
      }
    }
  }
  show(pair,role,state,percussion,controller=null) {
    const h=this.adapter.get(role);if(!h?.root?.visible||h.disposed||h.pendingPlacement)return;
    const sphere=!percussion&&h.getSqueezeColliderSphere?.();
    let point=sphere?.center;
    if(!point&&!percussion)point=h.root.getWorldPosition(this.position);
    if(!point){try{point=this.adapter.cacheStrikeTarget(role)||h.root.position;}catch{return;}}
    const radius=sphere?.radius||.065;
    pair.reference.position.copy(point);pair.reference.quaternion.copy(this.quaternion);pair.reference.scale.setScalar(radius*1.12);pair.reference.visible=true;
    for(const [key,color] of [['yellow','yellow'],['green','green']]) {
      const mesh=pair[key],scale=state[color];if(!scale)continue;
      mesh.position.copy(point);mesh.quaternion.copy(this.quaternion);mesh.scale.setScalar(radius*1.12*scale);mesh.visible=true;
    }
    if(percussion)return;
    if(!controller)for(const [candidate,g] of this.adapter.gestures)if(g.role===role){controller=candidate;break;}
    controller ||= this.adapter.r.controllers?.find(c=>!c.userData.virtualTutorial) || this.adapter.virtuals?.[0];
    const input=this.adapter.r.controllerStates.get(controller);
    const inverse=input?.activeTriggerInteraction?.bendStartInverseQuaternion || input?.raySqueezeStartInverseQuaternion;
    if(inverse&&this.adapter.gestures.has(controller))this.startQuaternion.copy(inverse).invert();
    else if(controller)controller.getWorldQuaternion(this.startQuaternion);
    else this.startQuaternion.copy(this.quaternion);
    this.localRight.set(1,0,0).applyQuaternion(this.startQuaternion);
    this.localUp.set(0,1,0).applyQuaternion(this.startQuaternion);
    const displacement=bendCueDisplacement(state.bend?.rollRadians||0,this.localRight.dot(this.right),this.localUp.dot(this.right));
    const marker=pair.bend;
    marker.position.copy(point).addScaledVector(this.right,displacement*radius);
    marker.quaternion.copy(this.quaternion);marker.scale.setScalar(radius*.24);
    marker.visible=Boolean(state.bend||state.phase==='hold'||!state.phase&&state.yellow);
    if(state.bend)this.bendInstruction=state.bend.instruction;
  }
  dispose(){for(const pair of this.pool)for(const mesh of Object.values(pair)){mesh.removeFromParent();mesh.material.dispose();}this.geometry.dispose();}
}
