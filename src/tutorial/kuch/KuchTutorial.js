import * as THREE from 'three';
import { tuningForMidi } from '../composition.js';
import { connectTutorialClock, connectTutorialHonk } from '../TutorialRoutes.js';
import { BPM, BEAT_MS, VOICINGS, PITCHES, STEPS, BANK_CHANGES, noteName, assess } from './score.js';

// Uses the shared tutorial's real controller, contact, recorder and audio paths.
// The normal INPUT phase is the only scheduler; there are no owned timers.
export class KuchTutorial {
  constructor(host) {
    this.host=host;this.r=host.r;this.a=host.adapter;this.index=0;this.banks={};this.heard=[];
    this.queue=[];this.phase=null;this.note=null;this.lastNow=null;this.feedback='Choose Demonstrate to listen, then Practice to try it. Next Step skips an exercise.';
    this.labels=[];this.results={};this.report=null;this.desktopRole=null;this.desktopStrike=null;
  }
  setup() {
    // Dense live chord recording needs more headroom than a single Honk.
    this.output=this.r.audioSystem.masterBus.output;
    const now=this.r.audioSystem.getCurrentTime(),pending=this.host.kuchOutputRestore;
    this.outputGainBefore=pending?.output===this.output&&pending.at>now?pending.value:this.output.gain.value;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.outputGainBefore*.6,now);this.host.kuchOutputRestore=null;
    this.a.begin('learner');
    const spawn=(kind,role,x,y,z,scale,midi)=>{
      const root=this.r.createSpawnedComponent(kind,{name:role,baseScale:scale,...(midi===undefined?{}:{tuning:tuningForMidi(midi)})});
      if(!root)throw new Error(`Could not create ${role}.`);
      const h=this.r.activeInstrumentState;
      h.root.position.copy(new THREE.Vector3(x,y,z).applyQuaternion(this.a.layoutRotation).add(this.a.anchor));
      h.root.quaternion.copy(this.a.layoutRotation);h.root.updateMatrixWorld(true);
      if(kind==='looper')this.r.syncLooperTransformReference(h);
      this.a.roles.set(role,[...(this.a.roles.get(role)||[]),h.id]);
      if(kind==='honk'){h.setVowel('O');h.setNose((1-80/127)/.78);this.a.labelPresentation.styleNote(h);}
      return h;
    };
    for(const [role,midis] of Object.entries(VOICINGS)) {
      midis.forEach((m,i)=>spawn('honk',role,(role==='D'?-.31:.32)+(i-(midis.length-1)/2)*.088,.02,-.20,1.65,m));
      this.label(role,`${role} major`);
    }
    PITCHES.forEach((m,i)=>{spawn('honk',`lead-${m}`,(i%6-2.5)*.175,.72-Math.floor(i/6)*.30,-.12,1.1,m);});
    spawn('looper','chordLooper',-.31,-.37,.16,.6);
    spawn('looper','percussionLooper',.24,-.37,.16,.6);
    spawn('honk','percussion',.69,-.31,.16,1.65,48);
    spawn('metronome','metronome',-.68,-.32,.16,.65);
    this.label('chordLooper','CHORD LOOP');this.label('percussionLooper','STICK LOOP · HIHAT');
    this.label('percussion','BOINK');this.label('metronome','92 BPM');
    for(const role of ['D','C','percussion'])connectTutorialHonk(this.a,role);
    for(const role of ['chordLooper','percussionLooper']){
      connectTutorialClock(this.a,role);this.r.setLooperControlValue(this.a.get(role),'recordLength',1);
      this.r.setLooperControlValue(this.a.get(role),'gap',-1);
      this.r.setLooperControlValue(this.a.get(role),'volume',role==='chordLooper'?-.62:-.66);
    }
    const metro=this.a.get('metronome');metro.setBpm(BPM);metro.setVolume(.12);this.r.updateMetronomeLabel(metro);
    this.controls();
  }
  label(role,text) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff4dd';ctx.font='600 30px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,43);
    const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));
    sprite.scale.set(.31,.039,1);sprite.userData.role=role;sprite.raycast=()=>{};
    this.r.scene.add(sprite);this.labels.push(sprite);
  }
  controls() {
    this.dom=document.createElement('aside');this.dom.className='kuch-keyboard';this.dom.setAttribute('aria-label','Kuch To Hua Hai instruments');
    const info=document.createElement('p');info.textContent='Hold a note or chord. Tap a drum. XR: use Trigger on a sphere; Grip equips the stick.';this.dom.append(info);
    const add=(role,label,drum=false)=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.role=role;
      const press=e=>{if(this.phase&&!this.phase.learner)return;e.preventDefault();if(e.pointerId!==undefined)b.setPointerCapture(e.pointerId);this.a.setVirtualsActive(true,'learner');
        if(drum){if(!this.desktopStrike){this.a.equip(true,'learner');this.desktopStrike={role,at:performance.now()};}}
        else {this.desktopRole=role;this.playNote({role},performance.now());}};
      b.addEventListener('pointerdown',press);
      const release=()=>{if(this.desktopRole===role){this.desktopRole=null;this.playNote(null,performance.now());}};
      b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
      b.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&!e.repeat)press(e);});
      b.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();release();}});
      b.addEventListener('blur',release);
      this.dom.append(b);
    };
    add('D','D major');add('C','C major');PITCHES.forEach(m=>add(`lead-${m}`,noteName(m)));
    add('percussion','Boink',true);add('percussionLooper','Hihat',true);document.body.append(this.dom);
    this.blur=()=>{if(this.phase?.learner||this.desktopRole||this.desktopStrike)this.cancel('Window lost focus. Choose Demonstrate or Practice for a fresh count-in.');};
    window.addEventListener('blur',this.blur);
  }
  get step(){return STEPS[this.index];}
  get running(){return Boolean(this.phase||this.queue.length);}
  get demonstrating(){return Boolean(this.phase&&!this.phase.learner);}
  accept(event) {if(this.phase)this.heard.push(event);}
  take(role){const h=this.a.get(role);return structuredClone(h.looperController.serializeState(h));}
  restore(role,take){const h=this.a.get(role);if(h)h.looperController.restoreState(h,structuredClone(take),{preserveConnections:true});}
  ready(){return this.banks.D&&this.banks.change&&this.a.get('percussionLooper')?.timeline.hasRecording();}
  async action(id) {
    if(this.disposed)return;
    if(id==='exit'){await this.host.enterPlay();return;}
    if(id==='recenter'){this.host.panel.recenter(this.r.getUserCamera(),true);return;}
    if(id==='previous-step'||id==='next-step'){
      this.cancel();this.index=Math.max(0,Math.min(STEPS.length-1,this.index+(id==='next-step'?1:-1)));this.feedback='Demonstrate or Practice. Next Step skips this exercise.';
    } else if(id==='step-demo'||id==='step-practice') {
      if(this.running){this.cancel('Stopped. Choose an action for a fresh count-in.');return;}
      await this.r.audioSystem.ensureAudio();
      if(this.disposed||this.host.kuch!==this)return;
      if(id==='step-practice'&&this.step.kind==='performance'&&!this.ready()){this.feedback='Record D major, C → D, and the stick groove with Practice first.';return;}
      this.start(this.step,id==='step-practice');
    }
    this.host.render(performance.now());
  }
  start(step,learner=false,{full=false}={}) {
    this.cancel();this.heard=[];this.report=null;
    // A full example may need temporary backing recordings. Preserve every learner take.
    if(!learner&&(full||step.kind==='performance'&&!this.ready())) {
      this.saved={banks:structuredClone(this.banks),chords:this.take('chordLooper'),drums:this.take('percussionLooper')};
      this.queue=[...STEPS.slice(0,3).map(s=>({...s,learner:false,record:true})),{...STEPS.at(-1),learner:false}];
    } else this.queue=[{...step,learner,record:learner&&['chords','drums'].includes(step.kind)}];
    this.full=full;this.feedback=learner?'Practice: follow the beat and highlighted target.':'Demonstration: watch the squeezes, releases and stick contacts.';
    const metro=this.a.get('metronome');if(!metro.playing)metro.pressButton('play',performance.now());
    this.next(performance.now());
  }
  next(now) {
    this.phase=this.queue.shift()||null;this.note=null;this.activeBank=null;this.lastNow=now;
    if(!this.phase){this.finish();return;}
    this.heard=[];this.a.releaseVirtuals();
    this.a.setVirtualsActive(!this.phase.learner,!this.phase.learner?'demonstration':'learner');
    const metro=this.a.get('metronome'),timing=metro.getBeatTiming(now);
    this.anchor=timing.beatOriginMs+Math.ceil((now-timing.beatOriginMs)/BEAT_MS+4)*BEAT_MS;
    this.anchorBeat=(this.anchor-timing.beatOriginMs)/BEAT_MS;
    if(this.phase.record){
      this.recordRole=this.phase.kind==='drums'?'percussionLooper':'chordLooper';
      // Cancel restores this exact pre-attempt take, including its connections.
      this.attemptTake=this.take(this.recordRole);
      this.r.pressLooperButton(this.a.get(this.recordRole),'record',null,now);
    }
    if(this.phase.kind==='drums'&&!this.phase.learner)this.a.equip(true,'demonstration');
    if(['melody','performance'].includes(this.phase.kind)&&this.ready()){
      this.activeBank=(this.phase.backingChanges||BANK_CHANGES)[0][1];
      this.restore('chordLooper',this.banks[this.activeBank]);
      for(const role of ['chordLooper','percussionLooper']){
        const h=this.a.get(role);h.looperController.armPlayback(h,now,h.looperController.getTimingForLooper(h,now),{targetBeat:this.anchorBeat});
      }
    }
  }
  playNote(note,now) {
    const id=note?.id||note?.role||null;
    if(id!==this.note){
      this.a.squeeze(null,false,0,now);
      // A same-frame release/onset must pass through the normal live voice path.
      this.r.updateHorn(now);this.a.observe(now);this.note=id||null;
    }
    if(note)this.a.squeeze(note.role,true,0,now);
  }
  strike(pattern,beat) {
    const hit=pattern.find(e=>beat>=e.beat-.3&&beat<e.beat+.32);
    if(!hit){this.a.park(this.a.virtuals[1]);return;}
    const t=beat-hit.beat;
    this.a.moveStick(hit.role,t<0?.82*(t+.3)/.3:t<=.08?.82+.18*t/.08:Math.max(0,1-(t-.08)/.24));
  }
  update(now) {
    if(this.desktopStrike){
      const elapsed=now-this.desktopStrike.at;
      this.strike([{role:this.desktopStrike.role,beat:.3}],elapsed/BEAT_MS);
      if(elapsed>BEAT_MS*.7){this.a.park(this.a.virtuals[1]);this.desktopStrike=null;}
    }
    if(!this.phase)return;
    if(this.lastNow!==null&&this.lastNow>=this.anchor&&now-this.lastNow>500){this.cancel('Playback paused after a delayed frame. Restart for a fresh count-in.');return;}
    this.lastNow=now;const p=this.phase,beat=(now-this.anchor)/BEAT_MS;
    if(['melody','performance'].includes(p.kind)&&this.ready()&&beat>=0&&beat<p.beats){
      const [at,bank]=(p.backingChanges||BANK_CHANGES).filter(([at])=>at<=beat).at(-1)||[];
      if(bank&&bank!==this.activeBank){
        this.restore('chordLooper',this.banks[bank]);const h=this.a.get('chordLooper');
        h.looperController.armPlayback(h,now,h.looperController.getTimingForLooper(h,now),{targetBeat:this.anchorBeat+at});this.activeBank=bank;
      }
    }
    if(!p.learner){
      // Leave a small articulation gap in chord strums; lead durations remain the MIDI durations.
      const note=p.kind==='drums'?null:p.events.find(e=>beat>=e.beat&&beat<e.beat+e.beats-(p.kind==='chords'?.05:0));
      this.playNote(note,now);
      if(p.kind==='drums')this.strike(p.events,beat);
    }
    if(beat>=p.beats&&!this.ending){
      this.ending=true;this.playNote(null,now);this.a.park(this.a.virtuals[1]);
      for(const role of ['chordLooper','percussionLooper'])if(!this.a.get(role).transport.recording)this.a.get(role).stop();
      if(!this.queue.length)this.a.get('metronome').pause();
    }
    if(beat>=p.beats+.5){
      if(p.record){
        const h=this.a.get(this.recordRole);
        if(h.transport.recording||h.transport.recordArmed||!h.timeline.hasRecording()){
          this.cancel('No complete four-bar take. Start on beat 1 and continue through the recording window.');return;
        }
        if(p.bank)this.banks[p.bank]=this.take('chordLooper');
        this.recordRole=null;this.attemptTake=null;
      }
      const result=assess(p.events,this.heard,this.anchor);
      if(p.learner){this.results[p.id]=result;this.feedback=`${result.score}/100 · ${result.correct}/${result.total} targets with matching timing and releases. ${result.extra} extra gestures. Practice retries; Next Step continues.`;}
      this.report={step:p.id,origin:p.learner?'learner':'demonstration',notes:this.heard.filter(e=>e.kind==='note').length,strikes:this.heard.filter(e=>e.kind==='strike').length,result,completed:true};
      this.a.releaseVirtuals();this.ending=false;this.next(now);
    }
  }
  afterFrame(now) {
    this.a.observe(now);
    const beat=this.phase?(now-this.anchor)/BEAT_MS:null;
    const target=this.phase?.events.find(e=>beat>=e.beat-.25&&beat<e.beat+e.beats);
    this.a.focus(target?.role);
    for(const sprite of this.labels){
      const members=this.a.members(sprite.userData.role);sprite.visible=members.length>0;
      if(members.length){const box=new THREE.Box3();for(const h of members)box.union(this.a.labelPresentation.instrumentBounds(h));box.getCenter(sprite.position);sprite.position.y=box.max.y+.04;}
    }
    if(this.dom){this.dom.hidden=this.host.panel.xr;for(const b of this.dom.querySelectorAll('button')){b.disabled=this.demonstrating;b.dataset.active=String(b.dataset.role===target?.role);}}
  }
  restoreSaved() {
    if(!this.saved)return;
    this.banks=this.saved.banks;this.restore('chordLooper',this.saved.chords);this.restore('percussionLooper',this.saved.drums);this.saved=null;
  }
  finish() {
    this.a.releaseVirtuals();this.a.stopSound();this.a.setVirtualsActive(false);this.restoreSaved();
    if(this.full){this.index=STEPS.length-1;this.feedback='Full demonstration complete. Both loops stopped on the final beat. Choose Previous Step to practice the parts.';}
    else if(this.report?.origin==='demonstration')this.feedback='Example complete. Choose Practice to try this part yourself.';
    this.full=false;
  }
  cancel(message='') {
    this.queue=[];this.phase=null;this.ending=false;this.desktopRole=null;this.desktopStrike=null;
    this.a.releaseAll();this.a.stopSound();this.a.setVirtualsActive(false);this.note=null;
    if(this.recordRole&&this.attemptTake)this.restore(this.recordRole,this.attemptTake);
    this.recordRole=null;this.attemptTake=null;this.restoreSaved();if(message)this.feedback=message;
  }
  model(now) {
    const p=this.phase||this.step,beat=this.phase?(now-this.anchor)/BEAT_MS:null;
    const target=p.events.find(e=>beat!==null&&e.beat+e.beats>beat);
    const sourceBeat=beat+(p.sourceStart||0);
    const rest=['melody','performance'].includes(p.kind)&&beat!==null?[40,88].find(start=>sourceBeat>=start&&sourceBeat<start+8):undefined;
    this.host.panel.setTransport(beat===null?'92 BPM · 4/4':beat<-4?'Ready for count-in…':beat<0?`Count in: ${Math.ceil(-beat)}`:
      rest!==undefined?`Interlude · ${Math.floor(sourceBeat-rest)+1} / 8 beats`:
      `Beat ${Math.min(p.beats,Math.floor(beat)+1)} / ${p.beats}${target?' · '+(target.midi?noteName(target.midi):target.sound||target.role)+(p.kind==='drums'?' · tap':' · hold '+target.beats.toFixed(2)+' beats'):''}`);
    const button=(id,label,disabled=false)=>({id,label,disabled});
    return {visible:true,title:p.title,instruction:p.instruction,progress:`KUCH TO HUA HAI · ${STEPS.findIndex(s=>s.id===p.id)+1}/${STEPS.length}${this.phase?this.phase.learner?' · Practice':' · Demonstration':''}`,
      feedback:this.feedback,navigation:[button('previous-step','Previous Step',this.index===0||this.running),button('next-step','Next Step',this.index===STEPS.length-1||this.running),button('step-demo',this.demonstrating?'Stop Example':'Demonstrate',Boolean(this.phase?.learner)),button('step-practice',this.phase?.learner?'Stop Practice':'Practice',this.demonstrating)],
      actions:[button('recenter','Recenter'),button('exit','Exit')]};
  }
  dispose() {
    this.disposed=true;
    this.cancel();window.removeEventListener('blur',this.blur);this.dom?.remove();
    if(this.output){
      const at=this.r.audioSystem.getCurrentTime()+.15;
      this.output.gain.setValueAtTime(this.outputGainBefore,at);
      this.host.kuchOutputRestore={output:this.output,value:this.outputGainBefore,at};
    }
    for(const sprite of this.labels){sprite.removeFromParent();sprite.material.map.dispose();sprite.material.dispose();}this.labels=[];
  }
}
