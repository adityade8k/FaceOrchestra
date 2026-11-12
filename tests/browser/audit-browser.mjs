import { createBrowserSession } from "../../scripts/browser-session.mjs";
const session = await createBrowserSession();
import { writeFile, mkdir } from "node:fs/promises";

const root = session.dataRoot;
let service, browser;
try {
  service = await session.start();
  browser = session.browser;
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const result = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
    const r=app.runtime,t=r.tutorial;
    const check=(value,message)=>{if(!value)throw new Error(message);};
    check(t.ready,'App did not initialize');
    check(t.panel.model.actions.map(a=>a.label).join('|')==='Play|Tutorials|Record Songs','Root options');
    await t.action('play');check(r.instrumentRegistry.size===0,'Play must be empty');
    await t.action('menu-home');await t.action('tutorials');
    check(t.panel.model.navigation[0].label==='Basics','Basics first');
    await t.navigation.selectComposition('virag-2-jog-study','tutorials');
    t.session.index=t.session.steps.findIndex(s=>s.type==='switch');t.panels.render(performance.now());
    check(['recenter','exit','play-alternativeLooper','play-chordLooper'].every(id=>t.panel.buttons.some(b=>b.visible&&b.userData.action===id)),'Switching exercise displaced XR session controls');
    await t.navigation.enterPlay();await t.action('tutorials');
    await t.action('composition:kuch-to-hua-hai');
    check(t.dataTutorial?.ensemble.prepared,'Kuch tutorial failed: '+t.uiFeedback);
    const count=r.instrumentRegistry.size;
    t.navigation.menu.toggle();check(!t.panel.group.visible&&t.panel.dom.hidden,'Menu hide');t.navigation.menu.toggle();check(r.instrumentRegistry.size===count,'Menu must preserve scene');
    await t.navigation.enterPlay();check(r.instrumentRegistry.size===0,'Restore empty Play');
    const jog=await t.navigation.catalog.load('virag-2-jog-study'),kuch=await t.navigation.catalog.load('kuch-to-hua-hai');
    const scenes=[];
    for(const module of [jog,kuch]){
      const ensemble=module.createEnsemble(t);ensemble.prepare();ensemble.validate();await new Promise(resolve=>requestAnimationFrame(resolve));r.renderer.render(r.scene,r.camera);
      scenes.push({id:module.definition.id,instruments:r.instrumentRegistry.size,render:{...r.renderer.info.render},memory:{...r.renderer.info.memory}});
      const clocks=JSON.stringify(r.metronomeConnectionManager.getConnections());
      r.resetSubsystemsAfterSession();
      check(JSON.stringify(r.metronomeConnectionManager.getConnections())===clocks,'XR interruption lost saved clock relationships');
      ensemble.dispose?.();t.adapter.clear();
    }
    for(let i=0;i<50;i++){await t.action('basics');await t.navigation.enterPlay();}
    await t.navigation.selectComposition('tu-kisi-rail-si','tutorials');check(t.dataTutorial,'Data tutorial failed: '+t.uiFeedback);
    await t.dataTutorial.action('step-practice');check(t.dataTutorial.phase==='practice','Data practice');await t.navigation.enterPlay();
    const {AsyncSceneStore}=await import('/src/persistence/AsyncSceneStore.js');
    const legacy={load:()=>null,save:()=>false};
    const options={indexedDB:{open:(_,version)=>indexedDB.open('honk-audit-recovery',version)}};
    const saved=new AsyncSceneStore(legacy,options),a={schemaVersion:3,instruments:[],marker:'previous'},b={...a,marker:'current'};
    check(await saved.save(a),'First IndexedDB save');check(await saved.save(b),'Second IndexedDB save');await saved.close();
    const reopened=new AsyncSceneStore(legacy,options);check((await reopened.load()).marker==='current','Database reopen');
    const db=await reopened.database();
    await new Promise((resolve,reject)=>{const tx=db.transaction('scenes','readwrite');tx.objectStore('scenes').put({schemaVersion:999},'play');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    check((await reopened.load()).marker==='previous','Previous database copy not recovered');
    check(!(await reopened.save(b)),'Future source must remain protected');await reopened.close();indexedDB.deleteDatabase('honk-audit-recovery');
    await t.action('basics');r.createSpawnedComponent('honk',{name:'Preserved practice'});const practiceHonk=r.activeInstrumentState;
    r.createSpawnedComponent('looper',{name:'Preserved practice take'});const practiceLooper=r.activeInstrumentState,track=practiceLooper.tracks[0];
    r.connectLooperTrackToHonk(practiceLooper,track.index,practiceHonk.id);
    const {compilePattern}=await import('/src/compositions/CompositionCompiler.js');
    const practicePattern=compilePattern({events:[{role:'seed',beat:0,beats:.5}],beats:2,beatMs:500,routes:{seed:{trackId:track.trackId,trackIndex:track.index}}});
    practiceLooper.looperController.stateCodec.restoreState(practiceLooper,{timeline:practicePattern.toJSON(),controls:{recordBeats:2,gap:-1,volume:0}},{preserveConnections:true});
    const before=r.sceneSerializer.serialize();await t.basics.action('step-help');
    check(JSON.stringify(r.sceneSerializer.serialize())===JSON.stringify(before),'Basics help changed the practice scene');
    await t.basics.action('next-step');check(t.basics.index===0,'Unfinished Basics step was skipped');
    check(practiceLooper.timeline.hasRecording(),'Help changed the prior take');
    check(Object.values(t.basics.outcomes).every(v=>v!=='passed'),'Help awarded mastery');await t.navigation.enterPlay();
    const manualHonkRegression=await (await import('/tests/browser/validate-manual-honks-browser.mjs')).validate();
    return {userAgent:navigator.userAgent,scenes,transitions:50,instrumentsAfter:r.instrumentRegistry.size,xrClockPersistence:true,indexedDBRecovery:true,basicsHelpPreservation:true,manualHonkRegression,errors:[]};
  })()`);
  result.errors = browser.errors;
  await mkdir(`${session.output}/audits`, { recursive: true });
  await writeFile(`${session.output}/audits/browser.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await session.close();
}
