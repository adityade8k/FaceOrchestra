import { LIMITS, STREAMS } from './format.js';

let socket, metadata, url, ready=false, closing=null, retry, failed=false, finalized=false;
let seq={samples:-1,events:-1,audio:-1}, ack={...seq}, queue=[], queueBytes=0, db=null, previous={}, previousSemantic='', lastKey=-Infinity, maxQueue=0;
let pendingIDB=Promise.resolve(), gaps=[],spoolBytes=0,pendingSpoolBytes=0;
const post = value => self.postMessage(value);
const key = p => `${metadata.id}/${p.stream}/${String(p.seq).padStart(10,'0')}`;
async function openSpool() {
  try {
    db=await new Promise((resolve,reject)=>{const r=indexedDB.open('honk-capture-recovery',1);r.onupgradeneeded=()=>{r.result.createObjectStore('packets');r.result.createObjectStore('takes');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    spoolBytes=await new Promise((resolve,reject)=>{let bytes=0;const request=db.transaction('packets').objectStore('packets').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(bytes);return;}bytes+=cursor.value.length*2;cursor.continue();};request.onerror=()=>reject(request.error);});
  }
  catch { post({type:'warning',message:'Recovery spool unavailable; keep this tab open until the receiver acknowledges the take.'}); }
}
function transaction(store,operation) {
  if(!db)return Promise.resolve();
  return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');operation(tx.objectStore(store));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
function spool(operation,bytes=512) {
  if(!db)return;
  if(pendingSpoolBytes+bytes>LIMITS.queue){post({type:'warning',message:'Recovery spool write queue is full; keep this tab open.'});db=null;return;}
  pendingSpoolBytes+=bytes;
  pendingIDB=pendingIDB.then(operation).catch(()=>{post({type:'warning',message:'Recovery spool could not be written; keep this tab open.'});db=null;}).finally(()=>{pendingSpoolBytes-=bytes;});
}
function enqueue(stream,t,data) {
  if(failed)return;
  const packet={stream,seq:++seq[stream],t,data},wire=JSON.stringify({type:'packet',packet}),bytes=wire.length*2;
  if(bytes>LIMITS.message || queueBytes+bytes>LIMITS.queue) {
    seq[stream]--; failed=true;
    const gap={stream,start:t,end:t,reason:bytes>LIMITS.message?'message-limit':'client-queue-limit'};gaps.push(gap);
    post({type:'overflow',gap,message:'Capture stopped: bounded queue exceeded. Reconnect to recover acknowledged and spooled data.'});return;
  }
  queue.push({packet,wire,bytes,sent:false});queueBytes+=bytes;maxQueue=Math.max(maxQueue,queueBytes);
  if(db&&spoolBytes+bytes>LIMITS.spool){post({type:'warning',message:'128 MiB recovery spool limit reached. Recover older pending takes; keep this tab open.'});db=null;}
  if(db){spoolBytes+=bytes;spool(()=>transaction('packets',s=>s.put(wire,key(packet))),bytes);}
  spool(()=>transaction('takes',s=>s.put({metadata,url,seq,gaps},metadata.id)));
}
function event(t,kind,data) {
  if(kind==='resource') {
    const text=JSON.stringify(data),chunkSize=256*1024,parts=Math.ceil(text.length/chunkSize);
    for(let part=0;part<parts;part++)enqueue('events',t,{kind:'resource-part',id:data.id,part,parts,text:text.slice(part*chunkSize,(part+1)*chunkSize)});
  } else enqueue('events',t,{kind,...data});
}
function connect(create=false) {
  clearTimeout(retry); ready=false;
  socket=new WebSocket(url);
  socket.onopen=()=>socket.send(JSON.stringify(create?{type:'hello',create:true,metadata}:{type:'hello',id:metadata.id}));
  socket.onmessage=({data})=>{
    const msg=JSON.parse(data);
    if(msg.type==='ready') {
      ready=true;if(closing)closing.sent=false;for(const stream of STREAMS)acknowledge(stream,msg.last[stream]);for(const q of queue)q.sent=false;
      post({type:'ready',id:metadata.id,last:msg.last});pump();
    } else if(msg.type==='ack') {acknowledge(msg.stream,msg.seq);pump();}
    else if(msg.type==='finalized') {closing=null;failed=true;finalized=true;post(msg);spool(()=>transaction('takes',s=>s.delete(metadata.id)));socket.close();pendingIDB.then(()=>self.close());}
    else if(msg.type==='error')post({type:'warning',message:msg.message});
  };
  socket.onclose=()=>{ready=false;if(finalized)return;post({type:'connection',connected:false,queuedBytes:queueBytes});if(!failed||closing||queue.length)retry=setTimeout(()=>connect(false),1500);};
  socket.onerror=()=>{};
}
function acknowledge(stream,last) {
  if(!Number.isInteger(last))return;
  ack[stream]=Math.max(ack[stream],last);
  const kept=[];
  for(const item of queue) {
    if(item.packet.stream===stream&&item.packet.seq<=last){queueBytes-=item.bytes;spoolBytes=Math.max(0,spoolBytes-item.bytes);spool(()=>transaction('packets',s=>s.delete(key(item.packet))));}
    else kept.push(item);
  }
  queue=kept;
}
function pump() {
  if(!ready||socket?.readyState!==1)return;
  let inFlight=queue.filter(q=>q.sent).length;
  for(const item of queue) {
    if(inFlight>=24||socket.bufferedAmount>1024*1024)break;
    if(!item.sent){socket.send(item.wire);item.sent=true;inFlight++;}
  }
  if(closing&&!queue.length&&!closing.sent) {
    closing.sent=true;socket.send(JSON.stringify({type:'finish',...closing,expected:seq,gaps:[...gaps,...(closing.gaps||[])],metrics:{...closing.metrics,maxQueueBytes:maxQueue}}));
  }
}
setInterval(()=>{pump();if(metadata)post({type:'stats',queuedBytes:queueBytes,connected:ready,ack});},500);
self.onmessage=async({data:m})=>{
  try {
    if(m.type==='start') {metadata=m.metadata;url=m.url;await openSpool();spool(()=>transaction('takes',s=>s.put({metadata,url,seq,gaps},metadata.id)));connect(true);}
    else if(m.type==='sample') {
      const floats=new Float32Array(m.buffer),current={},changed={};
      const full=m.t-lastKey>=1;
      for(const node of m.nodes) {
        const {id,offset,length,...rest}=node;
        const value={...rest,x:Array.from(floats.subarray(offset,offset+length))};current[id]=value;
        const encoded=JSON.stringify(value);if(full||previous[id]?.encoded!==encoded)changed[id]=value;
        current[id]={value,encoded};
      }
      const removed=Object.keys(previous).filter(id=>!current[id]);
      const semantic=JSON.stringify(m.semantic);if(semantic!==previousSemantic){event(m.t,'state',{entities:m.semantic});previousSemantic=semantic;}
      enqueue('samples',m.t,{sourceTime:m.sourceTime,segment:m.segment,full,nodes:changed,removed,xr:m.xr});
      previous=current;if(full)lastKey=m.t;
      self.postMessage({type:'recycle',buffer:m.buffer},[m.buffer]);
    } else if(m.type==='event')event(m.t,m.kind,m.data);
    else if(m.type==='audio') {
      const values=new Float32Array(m.buffer),bytes=new Uint8Array(m.frames*4),view=new DataView(bytes.buffer);
      for(let i=0;i<m.frames*2;i++)view.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,values[i]))*(values[i]<0?32768:32767)),true);
      let binary='';for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));
      enqueue('audio',m.sceneTime,{pcm:btoa(binary),sampleIndex:m.sampleIndex,contextFrame:m.contextFrame,frames:m.frames,sceneTime:m.sceneTime});
      self.postMessage({type:'audio-recycle',buffer:m.buffer},[m.buffer]);
    } else if(m.type==='finish') {closing={...m,sent:false};if(gaps.length)gaps[gaps.length-1].end=m.duration;pump();}
    else if(m.type==='recover-list') {
      await openSpool();const takes=db?await new Promise((resolve,reject)=>{const r=db.transaction('takes').objectStore('takes').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}):[];
      post({type:'recover-list',takes});
    } else if(m.type==='recover') {
      await openSpool(); metadata=m.take.metadata;url=m.url;seq=m.take.seq;gaps=m.take.gaps||[];
      const records=await new Promise(resolve=>{const r=db.transaction('packets').objectStore('packets').getAll(IDBKeyRange.bound(`${metadata.id}/`,`${metadata.id}/\uffff`));r.onsuccess=()=>resolve(r.result);});
      queue=records.map(wire=>({packet:JSON.parse(wire).packet,wire,bytes:wire.length*2,sent:false}));queueBytes=queue.reduce((n,p)=>n+p.bytes,0);
      closing={reason:'recovered-client',duration:Math.max(0,...queue.map(q=>q.packet.t)),sent:false};connect(false);
    }
    pump();
  } catch(error) {post({type:'fatal',message:error.message});}
};
