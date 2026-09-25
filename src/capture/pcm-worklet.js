// The original speaker connection is untouched. This branch produces silence.
class CapturePCM extends AudioWorkletProcessor {
  constructor(options={}) {
    super(); this.size=2048;
    // Dense prepared scenes may briefly delay the main-thread transfer path.
    // Spare buffers bound memory without changing block size or timestamps.
    const poolBlocks=Math.min(64,Math.max(8,Math.floor(options.processorOptions?.poolBlocks)||8));
    this.pool=Array.from({length:poolBlocks},()=>new Float32Array(this.size*2));
    this.buffer=this.pool.pop(); this.used=0; this.index=0; this.startFrame=0; this.enabled=true;
    this.port.onmessage=({data})=>{
      if(data.recycle)this.pool.push(new Float32Array(data.recycle));
      if(data.stop){this.flush();this.enabled=false;this.port.postMessage({stopped:true});}
    };
  }
  flush() {
    if(!this.used)return;
    if(this.buffer){this.port.postMessage({buffer:this.buffer.buffer,frames:this.used,sampleIndex:this.index-this.used,contextFrame:this.startFrame},[this.buffer.buffer]);}
    else this.port.postMessage({gap:true,frames:this.used,contextFrame:this.startFrame});
    this.buffer=this.pool.pop() || null;this.used=0;
  }
  process(inputs) {
    if(!this.enabled)return false;
    const input=inputs[0],count=input?.[0]?.length || 128;
    for(let i=0;i<count;i++) {
      if(!this.used)this.startFrame=currentFrame+i;
      if(this.buffer){this.buffer[this.used*2]=input?.[0]?.[i]||0;this.buffer[this.used*2+1]=input?.[1]?.[i]??input?.[0]?.[i]??0;}
      this.used++;this.index++;if(this.used===this.size)this.flush();
    }
    return true;
  }
}
registerProcessor('capture-pcm',CapturePCM);
