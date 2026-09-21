/** Serialize video decoding during scrubbing, replacing queued intermediate
 * positions with the latest request. Offline export keeps its exact seek loop. */
export class PreviewSeekQueue {
  constructor(seek, onIdle=()=>{}) {
    this.seek=seek;this.onIdle=onIdle;this.target=null;this.pending=null;this.running=null;
  }
  request(time) {
    if(!Number.isFinite(time))return Promise.reject(new Error('Enter a finite video time.'));
    if(this.running&&this.target===time)return this.running;
    this.target=this.pending=time;
    if(!this.running)this.running=Promise.resolve().then(async()=>{
      try{while(this.pending!==null){const target=this.pending;this.pending=null;await this.seek(target);}}
      finally{this.pending=this.target=this.running=null;this.onIdle();}
    });
    return this.running;
  }
  idle(){return this.running||Promise.resolve();}
}
