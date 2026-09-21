import { PresentationCapture } from './PresentationCapture.js';
import { AudioCapture } from './AudioCapture.js';
import { poseData, TAKE_VERSION } from './format.js';

export class CaptureRecorder extends EventTarget {
  constructor(runtime) {
    super();this.runtime=runtime;this.state='idle';this.message='Pair with the local receiver';this.active=false;this.connected=false;this.maxHz=0;this.includeUI=false;this.segment=0;this.inflight=0;
    this.audio=new AudioCapture(runtime.audioSystem,(kind,data)=>this.onAudio(kind,data));
    this.hidden=()=>{if(document.hidden)this.stop('visibility-interruption',{tailMs:0});};document.addEventListener('visibilitychange',this.hidden);
  }
  notify() {this.dispatchEvent(new Event('change'));}
  get elapsed() {return this.origin ? ((this.active?performance.now():this.ended||performance.now())-this.origin)/1000 : 0;}
  async readiness() {
    try{const response=await fetch('/api/status');if(!response.ok)throw new Error('Start npm run capture:serve');const status=await response.json();this.connected=status.paired;this.message=status.paired?'Receiver ready':'Enter the receiver pairing code before XR';this.build=status.build;this.notify();return status;}
    catch(error){this.connected=false;this.message=error.message;this.notify();return {ready:false,paired:false};}
  }
  async pair(code) {
    const response=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const result=await response.json();if(!response.ok)throw new Error(result.error);return this.readiness();
  }
  command(id) {
    if(id==='capture-toggle')return this.active?this.stop():this.start();
    if(id==='capture-sync')return this.markSync();
    if(id==='capture-pose')return this.markPose();
    if(id==='capture-status'){this.notify();return this.readiness();}
  }
  async start({synthetic=false}={}) {
    if(!['idle','complete','incomplete','error'].includes(this.state))return;
    this.state='preparing';this.message='Preparing receiver and audio';this.notify();
    try {
      const status=await this.readiness();if(!status.paired)throw new Error('Pair with the receiver before recording.');
      if(!synthetic&&!this.runtime.renderer.xr.getSession())throw new Error('Enter XR before starting a take.');
      const audio=await this.audio.prepare();this.origin=performance.now();this.ended=null;this.last=-Infinity;this.lastAudioEnd=0;this.segment=0;this.gaps=[];this.metrics={frames:0,totalMs:0,maxMs:0};this.inflight=0;
      this.metadata={id:crypto.randomUUID(),version:TAKE_VERSION,created:new Date().toISOString(),build:this.build,audio,synthetic,space:{units:'meters',handedness:'right',up:'+Y',forward:'-Z',roots:'XR reference/world',children:'local',resetPolicy:'end-take-and-recalibrate'},timebase:{originPerformanceMs:this.origin,sceneUnit:'seconds',sourceTimestamp:'XR animation callback DOMHighResTimeStamp',samplingHz:this.maxHz||'native'},initialSnapshot:this.runtime.sceneSerializer?.serialize?.() || null,controllerProfiles:[...(this.runtime.renderer.xr.getSession()?.inputSources||[])].map(s=>({handedness:s.handedness,profiles:[...s.profiles]}))};
      this.worker?.terminate();this.worker=new Worker('/src/capture/stream-worker.js',{type:'module'});
      this.presentation=new PresentationCapture(this.runtime,(kind,data,t)=>this.event(kind,data,t),{includeUI:this.includeUI});
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Receiver start timed out. Check pairing and connection.')),12000);
        this.worker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);resolve();}if(data.type==='fatal'){clearTimeout(timeout);reject(new Error(data.message));}this.onWorker(data);};
        this.worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Capture worker failed to load.'));};
        this.worker.postMessage({type:'start',metadata:this.metadata,url:`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/stream`});
      });
      if(!synthetic&&(!this.runtime.renderer.xr.getSession()||document.hidden))throw new Error('XR ended or the page was hidden before recording became ready. Start a new take when visible.');
      this.active=true;this.synthetic=synthetic;this.state='recording';this.message='Recording';
      this.unsubscribeLifecycle=this.runtime.instrumentLifecycle?.subscribe?.(event=>this.event('lifecycle',{type:event.type,instrumentId:event.instrumentId,reason:event.reason}));
      this.audio.start(this.origin);this.notify();
    } catch(error){this.active=false;this.state='error';this.message=error.message;this.worker?.terminate();await this.audio.stop();this.notify();}
  }
  onWorker(data) {
    if(data.type==='ready'){this.connected=true;this.message=this.active?'Recording':'Receiver ready';}
    if(data.type==='recycle'){this.inflight--;this.presentation?.recycle(data.buffer);return;}
    if(data.type==='audio-recycle'){this.audio.recycle(data.buffer);return;}
    if(data.type==='stats'){this.queuedBytes=data.queuedBytes;if(!['complete','incomplete'].includes(this.state))this.connected=data.connected;}
    if(data.type==='connection'){this.connected=false;this.message='Reconnecting — keep this tab open';}
    if(['overflow','fatal'].includes(data.type)){this.message=data.message;this.stop('capture-error',{tailMs:0});}
    if(data.type==='warning')this.message=data.message;
    if(data.type==='finalized'){this.state=data.metadata.complete?'complete':'incomplete';this.message=data.metadata.complete?'Take saved':'Take saved with interruptions; inspect gaps in the editor';this.saved=data.metadata;this.connected=true;}
    this.notify();
  }
  event(kind,data,t=this.elapsed) {this.worker?.postMessage({type:'event',kind,data,t:Math.max(0,t)});}
  sample(now,xrFrame) {
    if(!this.active||(!xrFrame&&!this.synthetic)||now===this.last||this.maxHz&&now-this.last<1000/this.maxHz-.1)return;
    const start=performance.now(),t=Math.max(0,(now-this.origin)/1000);this.last=now;
    try {
      if(this.inflight>=4){this.gaps.push({stream:'samples',start:t,end:t,reason:'sample-worker-backpressure'});this.stop('capture-error',{tailMs:0});return;}
      const sample=this.presentation.sample(t),reference=this.runtime.renderer.xr.getReferenceSpace();
      let xr={viewer:null,controllers:[]};
      if(xrFrame&&reference) {
        xr.viewer=poseData(xrFrame.getViewerPose(reference));
        for(const source of xrFrame.session.inputSources)xr.controllers.push({handedness:source.handedness,profiles:[...source.profiles],grip:source.gripSpace?poseData(xrFrame.getPose(source.gripSpace,reference)):null,ray:poseData(xrFrame.getPose(source.targetRaySpace,reference)),buttons:[...(source.gamepad?.buttons||[])].map(b=>[b.value,Number(b.pressed),Number(b.touched)]),axes:[...(source.gamepad?.axes||[])]});
      } else if(this.syntheticXR)xr=this.syntheticXR;
      this.inflight++;this.worker.postMessage({type:'sample',...sample,xr,t,sourceTime:now,segment:this.segment},[sample.buffer]);
      // Runs after the animation callback; no JSON or asset encoding in sample().
      if(!this.resourceFlush){this.resourceFlush=true;queueMicrotask(()=>{this.resourceFlush=false;try{this.presentation.flushResources(t);}catch(error){this.message=error.message;this.stop('resource-error',{tailMs:0});}});}
      this.metrics.frames++;const duration=performance.now()-start;this.metrics.totalMs+=duration;this.metrics.maxMs=Math.max(this.metrics.maxMs,duration);
    }catch(error){this.message=error.message;this.stop('capture-error',{tailMs:0});}
  }
  onAudio(kind,data) {
    if(kind==='pcm'){this.lastAudioEnd=data.sceneTime+data.frames/this.audio.context.sampleRate;this.worker?.postMessage({type:'audio',...data},[data.buffer]);return;}
    if(kind==='anchor'&&!this.lastAudioEnd)this.lastAudioEnd=data.sceneTime;
    this.event(`audio-${kind}`,data);
    if(kind==='gap')this.gaps.push({stream:'audio',start:data.sceneTime,end:data.sceneTime+data.frames/this.audio.context.sampleRate,reason:'worklet-pool-exhausted'});
    if(kind==='state'&&data.state!=='running'){this.gaps.push({stream:'audio',start:data.sceneTime,end:data.sceneTime,reason:`audio-${data.state}`});this.stop('audio-interruption',{tailMs:0});}
  }
  markSync() {if(!this.active)return;const cue=this.audio.sync();this.event('sync',cue,cue.sceneTime);this.message='Sync cue recorded — phone microphone must hear headset speakers';this.notify();}
  markPose() {if(!this.active)return;this.event('calibration-mark',{label:`Hold ${this.elapsed.toFixed(2)}s`});this.message='Calibration hold marked';this.notify();}
  async stop(reason='stop',{tailMs=500}={}) {
    if(!this.active)return;
    if(this.state==='stopping'&&tailMs)return;
    this.state='stopping';this.message=tailMs?'Recording 0.5 s of release tails':'Flushing take';this.notify();
    // Keep sampling the real performance during the short tail; do not release voices.
    if(tailMs)await new Promise(r=>setTimeout(r,tailMs));
    if(!this.active)return;this.active=false;this.unsubscribeLifecycle?.();this.ended=performance.now();await this.audio.stop();
    if(this.lastAudioEnd<this.elapsed-256/this.audio.context.sampleRate)this.gaps.push({stream:'audio',start:this.lastAudioEnd,end:this.elapsed,reason:'audio-final-flush-unavailable'});
    try { this.presentation?.flushResources(this.elapsed); }
    catch(error){this.gaps.push({stream:'events',start:this.elapsed,end:this.elapsed,reason:`resource-finalization: ${error.message}`});}
    this.event('stop',{reason,tailMs});
    this.worker.postMessage({type:'finish',reason,duration:this.elapsed,gaps:this.gaps,metrics:this.metrics});this.message='Saving pending data — keep this tab open';this.notify();
  }
  onSession(session) {
    this.reference?.removeEventListener('reset',this.reset);
    this.reference=this.runtime.renderer.xr.getReferenceSpace();
    this.reset=()=>{if(this.active){this.event('reference-reset',{segment:this.segment});this.stop('reference-space-reset',{tailMs:0});}};
    this.reference?.addEventListener('reset',this.reset);
    session?.addEventListener('visibilitychange',()=>{if(session.visibilityState!=='visible')this.stop('xr-visibility-interruption',{tailMs:0});});
  }
  dispose(){this.stop('disposed',{tailMs:0});document.removeEventListener('visibilitychange',this.hidden);this.reference?.removeEventListener('reset',this.reset);}
}
