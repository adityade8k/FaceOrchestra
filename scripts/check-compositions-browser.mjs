import assert from 'node:assert/strict';
import {withBrowser} from './browser-session.mjs';
const ids=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const reports=await withBrowser(async browser=>{
 const catalog=await browser.evaluate(`(async()=>{
  const {compositionRegistry}=await import('/src/compositions/CompositionRegistry.js');
  return compositionRegistry.list();
 })()`);
 assert.deepEqual(catalog.map(e=>e.id),['virag-2-jog-study','kuch-to-hua-hai','rishte-naate','tu-kisi-rail-si','nazariya-honk-bends']);
 assert.equal(catalog.at(-1).title,'Nazariya Ki Maari');
 const reports=[];
 for(const id of ids.length?ids:catalog.map(e=>e.id)) {
  if(id==='virag-2-jog-study') {
   const report=await browser.evaluate(`(async()=>{const{app}=await import('/src/main.js');const t=app.runtime.tutorial;
    await t.enterPlay();await t.selectComposition('virag-2-jog-study','tutorials');
    if(!t.session)throw new Error('Jog tutorial did not open');await t.enterPlay();
    const module=await t.catalog.load('virag-2-jog-study');return{id:module.definition.id,lessons:module.definition.lessons.length};})()`);
   reports.push(report);console.log(JSON.stringify(report));continue;
  }
  const report=await browser.evaluate(`(async()=>{const{app}=await import('/src/main.js');return(await import('/scripts/validate-song-browser.mjs')).validate(app,${JSON.stringify({id,full:process.argv.includes('--full'),recording:!process.argv.includes('--no-recording')})});})()`);
  reports.push(report);console.log(JSON.stringify(report));
 }
 return reports;
});
console.log(`Passed ${reports.length} compositions in isolated Chrome; temporary recordings removed.`);
