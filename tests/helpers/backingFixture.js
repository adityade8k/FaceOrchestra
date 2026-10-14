import { Group, Scene, Quaternion, Vector3 } from 'three';
import { createHarness } from './looperCaptureHarness.js';
import { LooperPortTransport } from '../../src/instruments/looper/LooperPortTransport.js';
export function backingFixture(definition){
  const objects=new Map(), wires=new Map(), scene=new Scene(), virtuals=[new Group(),new Group()];
  let metro; const audioCalls=[];
  const transport = new LooperPortTransport();
  const r={scene,controllerStates:new Map(virtuals.map(v=>[v,{trigger:false}])),
    audioSystem:{audioContextService:{context:{state:'running'}}},
    deleteInstrument(h){ h.looperController.stopPlayback(h);h.disposed=true;h.root.removeFromParent();objects.delete(h.id);wires.delete(h.id); },
    updateMetronomeLabel(){},syncLooperTransformReference(){},updateHorn(){},
    metronomeConnectionManager:{connect:c=>wires.set(c.targetId,c),getConnectionForTarget:(_kind,id)=>wires.get(id)},
    connectLooperTrackToHonk:(h,i,id)=>h.tracks[i].connect(id),
    createSpawnedComponent(kind,{name}){
      const recipe=definition.arrangement.recipes.find(x=>x.role===name);
      let h={id:name,kind,root:new Group(),disposed:false};
      if(kind==='looper'){
        const f=createHarness({connected:true}); h=f.looper;h.id=name;h.kind=kind;h.root=new Group();h.disposed=false;
        h.looperController=f.controller;
        f.controller.adapter.startActionVoice=(id,honk,options)=>audioCalls.push({kind:'start',id,role:honk,...options});
        f.controller.adapter.releaseActionVoice=(id,honk,options)=>audioCalls.push({kind:'release',id,role:honk,...options});
        f.controller.adapter.updateActionVoiceByHonkId=(id,honk,snapshot,volume,options)=>audioCalls.push({kind:'expression',id,role:honk,snapshot,volume,...options});
        f.controller.adapter.playStickPercussion=(sound,options)=>audioCalls.push({kind:'drum',sound,...options});
        for(const key of ['tracks','timeline','transport'])Object.defineProperty(h,key,{get:()=>h.looperData[key]});
        for(const track of h.tracks)track.disconnect();
        f.controller.adapter.getPortTransport = () => transport;
        f.controller.adapter.getTimingForLooper=(_id,now)=>({active:metro.playing,connected:true,metronomeId:metro.id,portId:wires.get(h.id)?.portId,
          beatIntervalMs:60000/metro.bpm,beatOriginMs:metro.beatOriginMs,beatPosition:metro.getBeatTiming(now).beatPosition});
      }else if(kind==='metronome'){
        Object.assign(h,{bpm:92,playing:false,beatOriginMs:null,connectionPorts:new Map([0,1,2,3].map(i=>[`port-${i}`,{}])),
          setBpm(value){this.bpm=value;},setVolume(){},play(at){this.playing=true;this.beatOriginMs=at;},pause(){this.playing=false;},
          getBeatTiming(now){return {beatPosition:(now-(this.beatOriginMs??now))*this.bpm/60000};}});
        metro=h;
      }else Object.assign(h,{midi:recipe.midi,setVowel(v){this.vowel=v;},isPlayable:()=>true,
        getSqueezeColliderSphere:()=>({center:h.root.position,radius:.08})});
      scene.add(h.root);objects.set(name,h);r.activeInstrumentState=h;return h.root;
    },
  };
  const adapter={roles:new Map(),anchor:new Vector3(),layoutRotation:new Quaternion(),virtuals,
    clear(){objects.clear();wires.clear();scene.clear();this.roles.clear();},begin(){},
    get(role){return objects.get(this.roles.get(role)?.[0]);},midi:h=>h.midi,
    labelPresentation:{styleNote(){}},releaseAll(){},focus(){},
    input(c,_button,value){r.controllerStates.get(c).trigger=value;},park(c){c.quaternion.identity();},
  };
  return {r,adapter,objects,wires,audioCalls};
}

