import * as THREE from 'three';
import { scoreForStep } from './scoring.js';
import { timingCueState } from './timingCueState.js';

// Musical phases are derived from the attempt clock, with no timers or UI cadence.
export class TutorialTimingCues {
  constructor(adapter) {
    this.adapter=adapter;this.geometry=new THREE.RingGeometry(1,1.06,48);this.quaternion=new THREE.Quaternion();this.position=new THREE.Vector3();
    this.pool=Array.from({length:3},()=>{
      const make=color=>{const mesh=new THREE.Mesh(this.geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
        mesh.raycast=()=>{};mesh.renderOrder=100;mesh.visible=false;adapter.r.scene.add(mesh);return mesh;};
      return {yellow:make(0xffd15a),green:make(0x60ef9b)};
    });
    this.step=null;this.events=[];
  }
  reset(){for(const pair of this.pool){pair.yellow.visible=false;pair.green.visible=false;}this.step=null;}
  update(session,now,{active=true}={}) {
    for(const pair of this.pool){pair.yellow.visible=false;pair.green.visible=false;}
    if(!session?.step||!active)return;
    const step=session.step;if(this.step!==step){this.step=step;this.events=scoreForStep(step);}
    this.adapter.r.getUserCamera().getWorldQuaternion(this.quaternion);
    const percussion=['drums','strike'].includes(step.type)||(step.type==='record'&&step.looperRole==='percussionLooper');
    if(!step.timed||session.anchorMs===null) {
      const role=step.role||this.events[0]?.role||step.looperRole;
      const h=this.adapter.get(role);if(!h||h.pendingPlacement)return;
      let held=false;for(const gesture of this.adapter.gestures.values())if(gesture.role===role)held=true;
      const strike=this.adapter.lastStrikes.get(role);
      const cue=percussion&&session.mode==='demonstration'&&session.cueAnchorMs!==undefined
        ? timingCueState((now-session.cueAnchorMs)/session.beatMs,{beat:1},{percussion:true})
        : percussion&&strike!==undefined?timingCueState((now-strike)/session.beatMs,{beat:0},{percussion:true}):null;
      this.show(this.pool[0],role,cue||{yellow:held?1.2:.75,green:0},percussion);return;
    }
    const beat=(now-session.anchorMs)/session.beatMs;let index=0;
    for(const event of this.events) {
      const state=timingCueState(beat,event,{percussion,beatMs:session.beatMs});
      if(state&&index<this.pool.length)this.show(this.pool[index++],event.role,state,percussion);
    }
  }
  show(pair,role,state,percussion) {
    const h=this.adapter.get(role);if(!h?.root?.visible||h.disposed||h.pendingPlacement)return;
    const sphere=!percussion&&h.getSqueezeColliderSphere?.();
    let point=sphere?.center;
    if(!point&&!percussion)point=h.root.getWorldPosition(this.position);
    if(!point){try{point=this.adapter.cacheStrikeTarget(role)||h.root.position;}catch{return;}}
    const radius=sphere?.radius||.065;
    for(const [key,color] of [['yellow','yellow'],['green','green']]) {
      const mesh=pair[key],scale=state[color];if(!scale)continue;
      mesh.position.copy(point);mesh.quaternion.copy(this.quaternion);mesh.scale.setScalar(radius*1.12*scale);mesh.visible=true;
    }
  }
  dispose(){for(const pair of this.pool)for(const mesh of Object.values(pair)){mesh.removeFromParent();mesh.material.dispose();}this.geometry.dispose();}
}
