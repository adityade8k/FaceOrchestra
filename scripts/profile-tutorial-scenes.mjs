// Comparable desktop CPU/frame measurements using real instruments and conductor.
export async function profile(app,{frames=240,stopAfterChord=false}={}) {
  const r=app.runtime,t=r.tutorial,a=t.adapter,results={};
  const wait=async predicate=>{const end=performance.now()+180000;while(!predicate()){
    if(t.session?.failed||t.conductor?.paused)throw new Error(JSON.stringify({step:t.session?.step?.id,message:t.session?.feedback,takes:Object.fromEntries(Object.entries(a.takes).map(([role,take])=>[role,{durationMs:take?.durationMs,contentEndMs:take?.contentEndMs}]))}));
    if(performance.now()>end)throw new Error(`Profile setup timeout: ${t.session?.step?.id}`);
    await new Promise(resolve=>setTimeout(resolve,30));
  }};
  await wait(()=>app.initialized);await r.audioSystem.ensureAudio();
  let current=null;
  const originals=[];
  const wrap=(object,key,metric)=>{const original=object[key];originals.push(()=>object[key]=original);
    object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(current){current[metric].push(performance.now()-start);}}};};
  wrap(app.frameScheduler,'run','frameCpuMs');wrap(a,'moveStick','moveStickMs');
  wrap(a,'cacheStrikeTarget','strikeTargetMs');wrap(a.ray,'intersectObjects','targetRaycastMs');
  const callbacks=[];
  for(const [phase,entries] of app.frameScheduler.callbacks)for(const entry of entries){
    const original=entry.callback;callbacks.push(()=>entry.callback=original);
    entry.callback=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{if(current)(current.phases[phase]||=[]).push(performance.now()-start);}};
  }
  const observer=new MutationObserver(records=>{if(current)current.domMutations+=records.length;});
  observer.observe(t.panel.dom,{childList:true,subtree:true,characterData:true,attributes:true});
  const sample=async name=>{
    await new Promise(resolve=>setTimeout(resolve,300));
    const beforeTexture=t.panel.texture.version;
    current={frameCpuMs:[],frameIntervalMs:[],moveStickMs:[],strikeTargetMs:[],targetRaycastMs:[],drawCalls:[],phases:{},domMutations:0};
    let last=null;
    for(let i=0;i<frames;i++)await new Promise(resolve=>requestAnimationFrame(now=>{
      if(last!==null)current.frameIntervalMs.push(now-last);last=now;current.drawCalls.push(r.renderer.info.render.calls);resolve();
    }));
    const raw=current;current=null;
    const stats=values=>{const v=values.toSorted((a,b)=>a-b);return {samples:v.length,p50:v[Math.floor(v.length*.5)]||0,p95:v[Math.floor(v.length*.95)]||0,p99:v[Math.floor(v.length*.99)]||0,max:v.at(-1)||0,total:values.reduce((n,x)=>n+x,0)};};
    results[name]={instruments:r.instrumentRegistry.size,frames,domMutations:raw.domMutations,
      panelTextureUpdates:t.panel.texture.version-beforeTexture,
      ...Object.fromEntries(Object.entries(raw).filter(([,value])=>Array.isArray(value)).map(([key,value])=>[key,stats(value)])),
      phases:Object.fromEntries(Object.entries(raw.phases).map(([key,value])=>[key,stats(value)]))};
  };
  let seed;
  try {
    await t.enterPlay();r.createSpawnedComponent('honk');seed=r.activeInstrumentState;
    seed.root.position.set(0,1.2,-1.2);await sample('freePlay');r.deleteInstrument(seed);seed=null;
    await t.enter('simulation');
    await wait(()=>t.session?.step?.id==='record-chords');
    t.conductor.paused=true;a.squeeze('group-1',true);await sample('chord');a.releaseVirtuals();
    if(stopAfterChord)return {results};
    await new Promise(resolve=>setTimeout(resolve,100));t.session.retry(performance.now(),{recording:true});
    t.conductor.paused=false;t.conductor.stepId=null;t.conductor.lastNow=performance.now();
    await wait(()=>t.session?.step?.id==='record-percussion'&&t.session.anchorMs!==null&&performance.now()>=t.session.anchorMs);
    await sample('percussionDemonstration');
    await wait(()=>t.session?.step?.id==='unequip'||t.session?.step?.id==='melody');
    t.conductor.paused=true;await sample('twoLoopers');
    return {platform:navigator.userAgent,viewport:[innerWidth,innerHeight],framesPerScene:frames,results,
      method:'240 requestAnimationFrame samples per scene; CPU wall time around actual frame phases; real controller/conductor inputs. Draw calls and DOM mutations observed. Desktop only; no GPU or headset timing claim.'};
  } finally {current=null;observer.disconnect();for(const restore of [...originals,...callbacks])restore();if(seed)r.deleteInstrument(seed);await t.enterPlay();}
}
