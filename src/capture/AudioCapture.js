export class AudioCapture {
  constructor(audioSystem, emit) { this.system=audioSystem;this.emit=emit;this.moduleLoaded=false; }
  async prepare() {
    this.context=await this.system.ensureContext();
    if(!this.context.audioWorklet)throw new Error('AudioWorklet PCM requires a trusted HTTPS context.');
    if(!this.moduleLoaded){await this.context.audioWorklet.addModule('/src/capture/pcm-worklet.js');this.moduleLoaded=true;}
    return {sampleRate:this.context.sampleRate,channels:2,encoding:'pcm-s16le',timeline:'scene-zero-padded',blockFrames:2048};
  }
  anchor(origin) {
    // The input/sample clock, not network arrival or output-device latency.
    const before=performance.now(),contextTime=this.context.currentTime,after=performance.now();
    this.mapping={contextTime,sceneTime:((before+after)/2-origin)/1000,uncertaintyMs:(after-before)/2+128/this.context.sampleRate*1000,baseLatency:this.context.baseLatency,outputLatency:this.context.outputLatency,outputTimestamp:this.context.getOutputTimestamp?.() || null};
    this.emit('anchor',this.mapping); return this.mapping;
  }
  start(origin,{poolBlocks=8}={}) {
    this.origin=origin;this.anchor(origin);
    this.ready=new Promise((resolve,reject)=>{
      this.readyTimer=setTimeout(()=>reject(new Error('Audio capture did not produce PCM. Resume audio and try again.')),5000);
      this.resolveReady=()=>{clearTimeout(this.readyTimer);resolve();};
    });
    // Legacy callers need not await readiness; startReady() does.
    this.ready.catch(()=>{});
    this.node=new AudioWorkletNode(this.context,'capture-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{poolBlocks}});
    this.node.port.onmessage=({data})=>{
      if(data.stopped){this.stopped?.();return;}
      if(data.buffer)this.resolveReady?.();
      const sceneTime=this.mapping.sceneTime+data.contextFrame/this.context.sampleRate-this.mapping.contextTime;
      this.emit(data.gap?'gap':'pcm',{...data,sceneTime:Math.max(0,sceneTime)});
    };
    this.system.masterBus.output.connect(this.node);
    this.node.connect(this.context.destination); // Worklet output remains zero.
    this.state=()=>{
      this.emit('state',{state:this.context.state,sceneTime:(performance.now()-origin)/1000,contextTime:this.context.currentTime});
      if(this.context.state==='running')this.anchor(origin);
    };
    this.context.addEventListener('statechange',this.state);
  }
  recycle(buffer) { this.node?.port.postMessage({recycle:buffer},[buffer]); }
  async stop() {
    clearTimeout(this.readyTimer);
    if(!this.node)return;
    if(this.context.state==='running')await new Promise(resolve=>{const timeout=setTimeout(resolve,500);this.stopped=()=>{clearTimeout(timeout);resolve();};this.node.port.postMessage({stop:true});});
    this.system.masterBus.output.disconnect(this.node);this.node.disconnect();this.node=null;
    this.context.removeEventListener('statechange',this.state);
  }
  sync() {
    const ctx=this.context,at=ctx.currentTime+0.03;
    for(let i=0;i<3;i++) {
      this.cue(at+i*.11,[880,1320,1760][i],.08);
    }
    return {contextTime:at,endContextTime:at+.30,sceneTime:this.mapping.sceneTime+at-this.mapping.contextTime,pattern:'880/1320/1760Hz, 110ms spacing',outputTimestamp:ctx.getOutputTimestamp?.()||null};
  }
  cue(start,frequency,duration=.06) {
    const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain();
    this.cues??=new Set();this.cues.add(osc);
    osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(.18,start+.003);gain.gain.exponentialRampToValueAtTime(.0001,start+duration-.01);
    osc.connect(gain);gain.connect(this.system.masterBus.input);osc.start(start);osc.stop(start+duration);
    osc.onended=()=>{this.cues.delete(osc);osc.disconnect();gain.disconnect();};
  }
  countIn(start,beatSeconds) {for(let i=0;i<4;i++)this.cue(start+i*beatSeconds,i===0?880:660);}
  cancelCues() {for(const osc of this.cues||[]){try{osc.stop();}catch{}}this.cues?.clear();}
}
