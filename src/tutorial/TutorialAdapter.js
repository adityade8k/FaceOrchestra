import * as THREE from 'three';
import { LooperController } from '../instruments/looper/LooperController.js';
import { COMPOSITION as C, PITCHES, TUTORIAL_PRESETS, TUTORIAL_LOOPERS } from './composition.js';
import { pitchesMatch, sameMembers } from './validation.js';
import { getHonkFrequency } from '../audio/honk/pitch.js';
import { MAX_PITCH_BEND_SEMITONES, BEND_SENSITIVITY } from '../config/honk.js';
import { isStickPercussionMesh } from '../instruments/stick/StickCollisionSystem.js';

export class TutorialAdapter {
  constructor(runtime, emit) {
    this.r = runtime; this.emit = emit; this.roles = new Map(); this.bindings = new Map();
    this.membershipSince = new Map(); this.gestures = new Map(); this.pendingStrikes = [];
    this.sequence = 0; this.tempoSince = null; this.snapshotCache = null; this.snapshotAt = -Infinity;
    this.takes = {}; this.takeState = {}; this.startAllRequest = null;
    this.virtuals = []; this.stickHand = 1; this.origin = 'learner'; this.playbackVoicesObserved = false;
    this.anchor = new THREE.Vector3(); this.scratch = new THREE.Vector3(); this.ray = new THREE.Raycaster();
    this.labels = new Map(); this.strikeTargets = new Map(); this.initialized = false;
    this.focusRole = null;
    this.focusRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.09, 48),
      new THREE.MeshBasicMaterial({color:0xffd18b,transparent:true,opacity:0.9,depthTest:false,side:THREE.DoubleSide}));
    this.focusRing.visible=false;this.focusRing.renderOrder=100;runtime.scene.add(this.focusRing);
  }
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    for (let i=0;i<2;i++) {
      const controller = new THREE.Group();
      controller.name = `Tutorial controller ${i+1}`;
      controller.userData = {controllerId:`tutorial-controller-${i}`,handedness:`tutorial-${i}`,tutorialOrigin:'simulation',virtualTutorial:true};
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.018,12,8),new THREE.MeshBasicMaterial({color:i ? 0xffb45c : 0x73e0c1}));
      controller.add(marker);
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-0.5)]),new THREE.LineBasicMaterial({color:0x73e0c1}));
      controller.add(ray); controller.userData.tutorialRay = ray;
      this.r.scene.add(controller);
      this.r.interactionCoordinator.registerController(controller); this.virtuals.push(controller);
      this.park(controller); controller.visible = false;
    }
  }
  setVirtualsActive(active, origin=this.origin) {
    const controllers=this.r.inputSourceManager.controllers;
    for(const v of this.virtuals) {
      const index=controllers.indexOf(v);
      if(active && index<0)controllers.push(v);
      if(!active && index>=0)controllers.splice(index,1);
      v.visible=active;v.userData.tutorialOrigin=origin;
    }
  }
  begin(origin) {
    this.origin = origin;this.setVirtualsActive(origin==='simulation',origin); this.r.getUserCamera().getWorldPosition(this.anchor);
    this.anchor.x += 0.25; this.anchor.y -= 0.3; this.anchor.z -= 1.45;
    for (const v of this.virtuals) { this.park(v); v.visible = origin === 'simulation'; v.userData.tutorialOrigin = origin; }
  }
  get(role) { const id = this.roles.get(role)?.[0]; return this.r.instrumentRegistry.get(id); }
  ids(role) { return this.roles.get(role) || []; }
  members(role) { return this.ids(role).map(id=>this.r.instrumentRegistry.get(id)).filter(Boolean); }
  bindPreview(preview, entry, controller) {
    const preset = TUTORIAL_PRESETS.find(p=>p.id === entry.id);
    const role = preset?.role || TUTORIAL_LOOPERS.find(l=>l.catalogId === entry.id)?.role || (entry.id === 'metronome' ? 'metronome' : null);
    if (!role) return;
    const source = controller?.userData.tutorialOrigin || 'learner';
    const ids = preview.instruments.map(h=>h.id);
    for (const h of preview.instruments) {
      if (h.kind === 'metronome') this.r.setInstrumentBaseScale(h, 0.75);
      if (h.kind === 'looper') this.r.setInstrumentBaseScale(h, 0.65);
      if (h.noteLabelGroup) h.noteLabelGroup.visible = false;
    }
    this.roles.set(role,ids); this.bindings.set(role,{source,entryId:entry.id});
    if (role === 'melody') Object.keys(PITCHES).forEach((pitch,i)=>{
      this.roles.set(`melody-${pitch}`,[ids[i]]); this.bindings.set(`melody-${pitch}`,{source,entryId:entry.id});
    });
    this.snapshotAt = -Infinity;
  }
  placed(instruments) {
    for (const h of instruments) {
      const role = this.roleForId(h.id);
      if (role) this.addLabel(h,role);
    }
    this.snapshotAt = -Infinity;
  }
  roleForId(id) {
    for (const [role,ids] of this.roles) {
      if (role === 'melody') continue;
      if (ids.includes(id)) return role;
    }
    return null;
  }
  addLabel(h,role) {
    if (this.labels.has(h.id) || (role.startsWith('group-') && this.ids(role)[0] !== h.id)) return;
    const canvas = document.createElement('canvas'); canvas.width=512;canvas.height=80;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#0c201f';ctx.fillRect(0,0,512,80);
    ctx.font='bold 46px sans-serif';ctx.fillStyle='#f2eee3';ctx.textAlign='center';ctx.textBaseline='middle';
    const pitch=role.replace('melody-','');
    const group=C.backing.find(g=>g.role===role);
    const text = PITCHES[pitch] ? `${PITCHES[pitch].syllable} = ${pitch}` : group ? `${group.label}: ${group.notes}` : TUTORIAL_LOOPERS.find(l=>l.role===role)?.label || ({metronome:'Metronome',percussion:'Percussion Honk'}[role] || role);
    if(group)ctx.font='bold 34px sans-serif';
    ctx.fillText(text,256,40);
    const texture=new THREE.CanvasTexture(canvas);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));
    label.userData.isNoteLabel=true;label.scale.set(group?0.52:role.endsWith('Looper')||role==='percussion'?0.36:0.28,0.056,1);
    label.position.copy(h.root.position);label.userData.labelOffset=role==='metronome'?0.27:0.17;label.position.y += label.userData.labelOffset;
    this.r.scene.add(label);this.labels.set(h.id,label);
  }
  positionFor(role) {
    const p=this.anchor.clone();
    if (role.startsWith('group-')) {
      const i=Number(role.slice(-1))-1; return p.add(new THREE.Vector3(i%2 ? 0.50 : -0.50, i<2 ? 0.07 : -0.40, -0.22));
    }
    if (role==='metronome') return p.add(new THREE.Vector3(-0.62,-0.10,0.36));
    if (role==='chordLooper') return p.add(new THREE.Vector3(-0.28,-0.13,0.40));
    if (role==='percussionLooper') return p.add(new THREE.Vector3(0.30,-0.13,0.40));
    if (role==='percussion') return p.add(new THREE.Vector3(0.65,-0.18,0.40));
    if (role==='melody') return p.add(new THREE.Vector3(0,0.37,-0.10));
    return p;
  }
  select(step, controller, origin) {
    this.releaseVirtuals();
    if(step.kind==='metronome' && this.r.instrumentRegistry.getByKind('metronome').length) {
      this.r.beginPendingSpawnPlacement(controller,step.catalogId);return;
    }
    // Replacing an invalid role is explicit, confined to this lesson.
    for (const id of this.ids(step.role)) { const h=this.r.instrumentRegistry.get(id); if (h) this.r.deleteInstrument(h); }
    this.roles.delete(step.role);
    this.r.beginPendingSpawnPlacement(controller,step.catalogId);
    const pending=this.r.pendingSpawnPlacement;
    if (pending) {
      this.bindPreview(pending,{id:step.catalogId},controller);
      if (controller.userData.virtualTutorial) {
        controller.quaternion.identity(); controller.position.copy(this.positionFor(step.role)); controller.position.z += pending.distance;
        controller.updateMatrixWorld(true);
      }
    }
    this.origin=origin;
  }
  place() {
    const p=this.r.pendingSpawnPlacement;
    if (!p) return;
    this.input(p.controller,'trigger',true); this.input(p.controller,'trigger',false);
  }
  command(action, now, origin = this.origin) {
    const chords=this.get('chordLooper'), percussion=this.get('percussionLooper'), metro=this.get('metronome');
    if (action.startsWith('clock-')) {
      const binding=TUTORIAL_LOOPERS.find(l=>l.role===action.slice(6)), looper=this.get(binding?.role);
      if (metro && looper) this.r.metronomeConnectionManager.connect({metronomeId:metro.id,portId:binding.portId,targetKind:'looper',targetId:looper.id,targetPortId:looper.tracks[5].trackId});
    } else if (action==='tempo' && metro && chords && percussion) {
      metro.setBpm(C.bpm,now);metro.pressButton('play',now);this.r.updateMetronomeLabel(metro);
      for(const l of [chords,percussion]) this.r.setLooperControlValue(l,'gap',-1);
    } else if (action.startsWith('wire-')) {
      const role=action.slice(5), group=C.backing.find(g=>g.role===role), h=this.get(role);
      const looper=role==='percussion'?percussion:chords;
      if(h && looper) this.r.connectLooperTrackToHonk(looper,group?.trackIndex ?? 4,h.id);
    } else if (action.startsWith('vowel-')) {
      for (const group of C.backing) for (const h of this.members(group.role)) h.setVowel(action.slice(6));
    } else if (action==='timbre') {
      for (const group of C.backing) for (const h of this.members(group.role)) { h.setVowel(C.backingVowel);h.setNose(C.backingNose); }
      if (chords) this.r.setLooperControlValue(chords,'volume',-0.55);
    } else if (action==='start-all') {
      this.startAllRequest=LooperController.startAll([chords,percussion],now);
      this.r.showRuntimeFeedback(this.startAllRequest.message);
    } else {
      const match=/^(record|stop-record|play)-(chordLooper|percussionLooper)$/.exec(action);
      if(match) {
        const looper=this.get(match[2]);
        if(looper && match[1]==='record') {
          // Metronome stick routing stays global; only the intended recorder is armed.
          const other=match[2]==='chordLooper'?percussion:chords;
          if(other?.transport.recording || other?.transport.recordArmed) other.stop();
          this.r.pressLooperButton(looper,'record',null,now);
        } else if(looper && match[1]==='stop-record') this.r.pressLooperButton(looper,'stop',null,now);
        else if(looper && match[1]==='play') {
          (match[2]==='chordLooper'?percussion:chords)?.stop();
          this.r.pressLooperButton(looper,'play',null,now);
        }
      }
    }
    this.snapshotAt=-Infinity;
    this.emit({id:`command-${++this.sequence}`,kind:'command',origin,action,startMs:now});
  }
  input(controller,button,pressed,now=performance.now()) {
    const state=this.r.controllerStates.get(controller);
    if (state?.[button]===pressed) return;
    this.r.interactionCoordinator.receiveInput({type:'button.transition',controller,button,pressed,timestamp:now});
  }
  park(controller) {
    controller.position.set(20,20,20); controller.quaternion.identity();controller.updateMatrixWorld(true);
  }
  squeeze(role, active, semitones=0, now=performance.now()) {
    const controller=this.virtuals[0], state=this.r.controllerStates.get(controller);
    if (!active) {this.input(controller,'trigger',false,now);this.park(controller);return;}
    const h=this.get(role);
    if (!h?.isPlayable?.()) return;
    if (!state.trigger) {
      const sphere=h.getSqueezeColliderSphere();
      controller.position.copy(sphere.center);controller.position.z+=0.38;
      controller.quaternion.identity();controller.updateMatrixWorld(true);
      // The ordinary ray selector is authoritative; never inject a hit result.
      const hit=this.r.getCurrentHit(controller);
      if (hit?.object !== h.squeezeCollider) throw new Error(`Cannot select the squeeze sphere for ${role}. Move it away from other controls.`);
      this.input(controller,'trigger',true,now);
    }
    controller.rotation.z=semitones/MAX_PITCH_BEND_SEMITONES/BEND_SENSITIVITY;
    controller.updateMatrixWorld(true);
  }
  equip(active, origin=this.origin) {
    const controller=this.virtuals[1];controller.userData.tutorialOrigin=origin;
    if (active) this.park(controller);
    this.input(controller,'grip',active);
    controller.userData.tutorialRay.visible=!active;
  }
  // Find a real body-triangle surface with a ray, then approach it with the actual stick collider.
  cacheStrikeTarget(role) {
    const h=this.get(role);if (!h) return null;
    h.root.updateMatrixWorld(true);
    const meshes=[];h.root.traverse(o=>{if(isStickPercussionMesh(o))meshes.push(o);});
    const box=new THREE.Box3().setFromObject(h.root), size=box.getSize(new THREE.Vector3());
    const center=box.getCenter(new THREE.Vector3());
    this.ray.set(new THREE.Vector3(center.x,center.y,box.max.z+0.6),new THREE.Vector3(0,0,-1));
    let hits=this.ray.intersectObjects(meshes,false);
    if (!hits.length) {
      for(let i=0;i<5 && !hits.length;i++) {
        this.ray.ray.origin.y=box.min.y+size.y*(i+0.5)/5;
        hits=this.ray.intersectObjects(meshes,false);
      }
    }
    if (!hits.length) throw new Error(`No visible stick surface found for ${role}.`);
    return hits[0].point.clone();
  }
  moveStick(role, approach) {
    const controller=this.virtuals[1];
    const stick=this.r.stickEquipmentSystem.getEquippedStick(controller.userData.controllerId);
    if (!stick) return;
    const h=this.get(role);if (!h) return;
    const point=this.cacheStrikeTarget(role);
    controller.quaternion.identity();controller.position.set(0,0,0);controller.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(stick.collider);
    const offset=bounds.getCenter(new THREE.Vector3());
    // Contact at the front surface; the box tip reaches the actual mesh at approach=1.
    const halfZ=(bounds.max.z-bounds.min.z)/2;
    controller.position.copy(point).sub(offset);controller.position.z+=halfZ + (1-approach)*0.32 - 0.035;
    controller.updateMatrixWorld(true);
  }
  observeStrike(event, {stick,target}, recordedCount) {
    const controller=this.r.controllers.find(c=>c.userData.controllerId===stick.controllerId);
    const origin=controller?.userData.tutorialOrigin || 'learner';
    const role=this.roleForId(target.id)||'unrelated';
    let lane=null;
    if(target.kind==='looper') lane='looper-self-percussion';
    else if(target.kind==='honk') lane=this.get('percussionLooper')?.tracks.find(t=>t.connectedHonkId===target.id)?.trackId;
    else if(target.kind==='metronome') lane=this.r.metronomeConnectionManager.getConnectionsForMetronome(target.id).find(c=>c.targetId===this.get('percussionLooper')?.id)?.targetPortId;
    this.pendingStrikes.push({id:`strike-${++this.sequence}`,kind:'strike',origin,role,targetId:target.id,
      percussionType:event.percussionType,lane,recordedCount,startMs:event.timestamp,stickId:stick.id});
  }
  focus(role) {
    this.focusRole=role;
    const h=this.get(role);
    this.focusRing.visible=Boolean(h && !h.pendingPlacement);
    if(!this.focusRing.visible)return;
    const sphere=h.getSqueezeColliderSphere?.();
    if(sphere) {this.focusRing.position.copy(sphere.center);this.focusRing.scale.setScalar(sphere.radius*1.12);}
    else {this.focusRing.position.copy(h.root.position);this.focusRing.scale.setScalar(0.11);}
    this.r.getUserCamera().getWorldQuaternion(this.focusRing.quaternion);
  }
  observe(now) {
    for (const controller of this.r.controllers) {
      const state=this.r.controllerStates.get(controller), previous=this.gestures.get(controller);
      const h=state?.raySqueezeInstrumentState || (state?.activeTriggerInteraction?.type==='holdSqueeze' ? state.activeTriggerInteraction.instrumentState : null);
      const active=state?.trigger && !state.stickActive && h && h.hornHolders.size>0;
      if (previous && (!active || h.id!==previous.targetId)) {
        previous.endMs=now;previous.durationBeats=(now-previous.startMs)/C.beatMs;
        previous.released=!state?.trigger;
        previous.allReleased=previous.memberIds.every(id=>!this.r.instrumentRegistry.get(id)?.hornHolders.size);
        previous.articulated &&= previous.released;
        this.emit({...previous});this.gestures.delete(controller);
      }
      if (!active) continue;
      let gesture=this.gestures.get(controller);
      const members=this.r.getTouchingInstrumentChain(h);
      const midis=members.map(m=>this.midi(m));
      if (!gesture) {
        gesture={id:`note-${++this.sequence}`,kind:'note',origin:controller.userData.tutorialOrigin||'learner',
          role:this.roleForId(h.id)||'unrelated',targetId:h.id,startMs:now,midis,memberIds:members.map(m=>m.id),
          vowel:h.getLivePerformanceState().vowel,articulated:!previous,bendSamples:[],maxAbsBend:0,voiced:false};
        this.gestures.set(controller,gesture);
      }
      if (!sameMembers(gesture.memberIds,members.map(m=>m.id)) || !pitchesMatch(midis,gesture.midis)) gesture.invalidMembers=true;
      const semitones=(h.getProcessedLivePerformanceState().bend||0)*MAX_PITCH_BEND_SEMITONES;
      gesture.maxAbsBend=Math.max(gesture.maxAbsBend,Math.abs(semitones));
      const last=gesture.bendSamples.at(-1);
      if (!last || now-gesture.startMs-last.offsetMs >= 30) gesture.bendSamples.push({offsetMs:now-gesture.startMs,semitones});
      if(gesture.bendSamples.length>320) gesture.bendSamples.splice(1,1);
      if (members.every(m=>m.hasAudioVoice(this.r.getInstrumentVoiceId(this.r.getControllerVoiceId(controller),m)))) gesture.voiced=true;
    }
    for(const e of [...this.pendingStrikes]) {
      const stick=this.r.instrumentRegistry.get(e.stickId);
      if(!stick?.contactTargetIds.has(e.targetId)) {
        this.emit({...e,withdrawn:true,endMs:now});this.pendingStrikes.splice(this.pendingStrikes.indexOf(e),1);
      }
    }
    for(const [id,label] of this.labels) {
      const h=this.r.instrumentRegistry.get(id);
      if(!h) {label.removeFromParent();label.material.map.dispose();label.material.dispose();this.labels.delete(id);}
      else {label.position.copy(h.root.position);label.position.y+=label.userData.labelOffset;}
    }
  }
  midi(h) {
    const s=h.getLivePerformanceState();
    return 69+12*Math.log2(getHonkFrequency({leftEar:s.earLeft,rightEar:s.earRight,pitchSnap:h.pitchSnap})/440);
  }
  snapshot(now) {
    const looper=this.get('chordLooper'),metro=this.get('metronome');
    if(!this.snapshotCache || now-this.snapshotAt>=100) {
      const roles={};
      for(const [role,ids] of this.roles) {
        const hs=ids.map(id=>this.r.instrumentRegistry.get(id));
        const group=C.backing.find(g=>g.role===role);
        const preset=TUTORIAL_PRESETS.find(p=>p.role===role);
        const pitches=group?.midis || preset?.midis || (role.startsWith('melody-') ? [PITCHES[role.slice(7)]?.midi] : []);
        const ready=hs.every(h=>h && !h.disposed && h.root.visible && (h.kind!=='honk'||h.isPlayable()));
        const midis=hs.filter(h=>h?.kind==='honk').map(h=>this.midi(h));
        const exact=ready && hs.every(h=>h.kind!=='honk' || sameMembers([...this.r.honkContactGraph.getConnectedComponent(h.id)],group ? ids : [h.id]));
        if(!exact) this.membershipSince.delete(role);
        else if(!this.membershipSince.has(role)) this.membershipSince.set(role,now);
        roles[role]={ids,kind:hs[0]?.kind,ready,placed:ready&&hs.every(h=>!h.pendingPlacement),
          correctPitch:!pitches.length || pitchesMatch(midis,pitches),contactExact:exact,
          stableMs:now-(this.membershipSince.get(role) ?? now),source:this.bindings.get(role)?.source};
      }
      if(!metro?.playing || Math.abs(metro.bpm-C.bpm)>1) this.tempoSince=null; else this.tempoSince??=now;
      const wires={};
      for(const g of [...C.backing,{role:'percussion',trackIndex:4}]) {
        const owner=g.role==='percussion'?this.get('percussionLooper'):looper;
        wires[g.role]=Boolean(owner && owner.tracks[g.trackIndex]?.connectedHonkId===this.get(g.role)?.id);
      }
      const timbreReady=C.backing.every(g=>this.members(g.role).length===3 && this.members(g.role).every(h=>{
        const s=h.getLivePerformanceState();return s.vowel===C.backingVowel&&s.nose>=0.25&&Math.abs(s.bend)<0.125;
      })) && looper?.looperData.volume<=0.45;
      this.snapshotCache={roles,wires,timbreReady};this.snapshotAt=now;
    }
    const sticks=this.r.instrumentRegistry.getByKind('stick');
    const stickController=this.r.controllers.find(c=>!c.userData.virtualTutorial && this.r.isControllerStickActive(c));
    const simActive=this.virtuals.some(c=>this.r.isControllerStickActive(c));
    const loopers={};
    for(const {role,portId} of TUTORIAL_LOOPERS) {
      const h=this.get(role), recording=Boolean(h?.transport.recording);
      const previous=this.takeState[role] || {};
      if(h?.timeline && !recording && (previous.recording || previous.timeline!==h.timeline || previous.duration!==h.timeline.durationMs)) {
        this.takes[role]=h.timeline.hasRecording()?h.timeline.toJSON():null;
      }
      this.takeState[role]={recording,timeline:h?.timeline,duration:h?.timeline?.durationMs};
      const timing=h?.looperController.getTimingForLooper(h,now);
      const connection=h && this.r.metronomeConnectionManager.getConnectionForTarget('looper',h.id);
      if(role==='chordLooper') {
        if(h?.transport.playing && C.backing.some(g=>this.members(g.role).some(m=>m.hasAutomation()&&m.getResolvedPerformanceState().squeeze>0.1))) this.playbackVoicesObserved=true;
        if(!h?.transport.playing) this.playbackVoicesObserved=false;
      }
      const startBeat=h?.looperData.clockPlaybackStartBeatPosition;
      const source=h?.looperController.getAbsoluteSourcePosition(h,now);
      loopers[role]={id:h?.id,recording,recordArmed:Boolean(h?.transport.recordArmed),playing:Boolean(h?.transport.playing),
        playArmed:Boolean(h?.looperData.playArmed),gapBeats:h?.looperData.gapBeats,timeline:this.takes[role],
        clockWired:Boolean(connection && connection.metronomeId===metro?.id && connection.portId===portId && connection.targetPortId===h.tracks[5].trackId),
        startBeat,phase:Number.isFinite(source)&&h?.timeline.durationMs ? ((source%h.timeline.durationMs)+h.timeline.durationMs)%h.timeline.durationMs/h.timeline.durationMs : null,
        playbackObserved:role==='chordLooper'?this.playbackVoicesObserved:Boolean(h?.looperData.audioScheduling.percussionTimes?.some(time=>time<=this.r.audioSystem.audioContextService.context?.currentTime)),
        tempoLabel:timing?.connected ? `${timing.bpm} BPM` : '70 BPM · Internal'};
    }
    const [a,b]=TUTORIAL_LOOPERS.map(l=>loopers[l.role]);
    const aligned=Boolean(a.playing && b.playing && Number.isFinite(a.startBeat) && a.startBeat===b.startBeat && Math.abs(a.phase-b.phase)<1e-7);
    return {...this.snapshotCache,loopers,aligned,startAllRequest:this.startAllRequest,bpm:metro?.bpm,clockPlaying:Boolean(metro?.playing),tempoStableMs:this.tempoSince===null?0:now-this.tempoSince,
      liveGestures:this.gestures.size,anyStickContact:sticks.some(s=>s.contactTargetIds.size>0),
      anyStickActive:sticks.some(s=>s.equipped),stickActive:simActive || Boolean(stickController),stickOrigin:simActive ? this.virtuals[1].userData.tutorialOrigin : 'learner',
      audioRunning:this.r.audioSystem.audioContextService.context?.state==='running'};
  }
  nextBoundary(now, beats=1, countIn=4) {
    const metro=this.get('metronome'), looper=this.get('chordLooper');
    const timing=metro?.getBeatTiming(now);
    if(!metro?.playing || !Number.isFinite(timing?.beatOriginMs)) return null;
    const base=beats===16 && Number.isFinite(looper?.looperData.clockPlaybackStartBeatPosition)
      ? timing.beatOriginMs + looper.looperData.clockPlaybackStartBeatPosition*timing.beatIntervalMs : timing.beatOriginMs;
    const interval=timing.beatIntervalMs;
    return base+Math.ceil((now+countIn*interval-base)/(beats*interval))*beats*interval;
  }
  releaseVirtuals() {
    for(const v of this.virtuals) { this.input(v,'trigger',false);this.input(v,'grip',false);this.park(v); }
  }
  releaseAll() {
    for(const controller of this.r.controllers) {
      const heldPhysicalTrigger=!controller.userData.virtualTutorial && this.r.controllerStates.get(controller)?.trigger;
      this.input(controller,'trigger',false);this.input(controller,'grip',false);
      const state=this.r.controllerStates.get(controller);this.r.clearControllerTriggerInteraction(state);
      if(state) {state.tutorialPanelCapture=false;state.suppressTriggerUntilRelease=Boolean(heldPhysicalTrigger);}
      this.r.gripTransformSystem.release(controller);this.r.closeRadialMenu(controller);
    }
    this.gestures.clear();this.pendingStrikes.length=0;
    this.r.clearLiveHornInteractionState();
  }
  stopSound() { for(const {role} of TUTORIAL_LOOPERS)this.get(role)?.stop();this.get('metronome')?.pause();this.r.audioSystem.releaseAll(); }
  clear() {
    this.focusRing.visible=false;
    this.releaseAll();this.stopSound();this.r.deletePendingSpawnPlacement();
    for(const h of [...this.r.instrumentRegistry.values()]) this.r.deleteInstrument(h);
    this.r.honkContactSystem.reset();this.r.stickCollisionSystem.motionByStickId.clear();
    for(const label of this.labels.values()) {label.removeFromParent();label.material.map.dispose();label.material.dispose();}
    this.labels.clear();this.roles.clear();this.bindings.clear();this.membershipSince.clear();this.strikeTargets.clear();
    this.tempoSince=null;this.snapshotCache=null;this.takes={};this.takeState={};this.startAllRequest=null;
    for(const v of this.virtuals) this.park(v);
    this.setVirtualsActive(false);
  }
  dispose() {
    this.focusRing.removeFromParent();this.focusRing.geometry.dispose();this.focusRing.material.dispose();
    this.releaseAll();
    for(const v of this.virtuals) {
      const index=this.r.inputSourceManager.controllers.indexOf(v);
      if(index>=0)this.r.inputSourceManager.controllers.splice(index,1);
      this.r.controllerStates.delete(v);v.removeFromParent();v.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    }
    this.virtuals=[];
    for(const label of this.labels.values()) {label.removeFromParent();label.material.map.dispose();label.material.dispose();}this.labels.clear();
  }
}
