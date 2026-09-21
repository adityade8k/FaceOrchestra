// A presentation callback can arrive before seeked / HAVE_CURRENT_DATA. Never
// use it alone as permission to draw a video (or to export the empty preview).
export function readVideoFrame(video,time,{timeoutMs=8000,presentedTime=time,capture=()=>undefined}={}) {
  return new Promise((resolve,reject)=>{
    let settled=false,callback=null,paint=null,pts=presentedTime;
    let sought=Math.abs(video.currentTime-time)<.00001&&!video.seeking;
    const finish=(error,result)=>{
      if(settled)return;settled=true;clearTimeout(timeout);
      for(const name of ['seeked','loadeddata','canplay'])video.removeEventListener(name,onReady);
      video.removeEventListener('error',onError);
      if(callback!==null)video.cancelVideoFrameCallback(callback);
      if(paint!==null)cancelAnimationFrame(paint);
      error?reject(error):resolve(result);
    };
    const check=()=>{
      paint=null;
      if(!sought||video.seeking||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
      try{finish(null,{videoTime:time,presentedPTS:pts,source:capture(video)});}catch(error){finish(error);}
    };
    const onReady=event=>{
      if(event?.type==='seeked')sought=true;
      // Even same-source-frame seeks and the video endpoint must settle: Chrome
      // need not deliver a new presentation callback for those positions.
      if(paint===null)paint=requestAnimationFrame(check);
    };
    const onError=()=>finish(new Error(`Phone video could not decode at ${time.toFixed(3)} s. Export stopped; no placeholder frame was saved.`));
    const timeout=setTimeout(()=>finish(new Error(`Phone video was not ready at ${time.toFixed(3)} s. Export stopped; retry or convert the source to SDR H.264.`)),timeoutMs);
    for(const name of ['seeked','loadeddata','canplay'])video.addEventListener(name,onReady);
    video.addEventListener('error',onError);
    if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback((_,meta)=>{callback=null;pts=meta.mediaTime;onReady();});
    try{if(!sought)video.currentTime=time;onReady();}catch(error){finish(error);}
  });
}
