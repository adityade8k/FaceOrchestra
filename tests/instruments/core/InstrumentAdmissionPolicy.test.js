import test from 'node:test';
import assert from 'node:assert/strict';
import {InstrumentRegistry} from '../../../src/instruments/core/InstrumentRegistry.js';
import {InstrumentFactory} from '../../../src/instruments/core/InstrumentFactory.js';
import {SINGLE_METRONOME_MESSAGE} from '../../../src/instruments/core/InstrumentAdmissionPolicy.js';
import {SceneRestorer} from '../../../src/persistence/SceneRestorer.js';
import {ScenePersistence} from '../../../src/persistence/ScenePersistence.js';

function harness() {
  const registry=new InstrumentRegistry(), messages=[];
  registry.admission.onRejected=m=>messages.push(m);
  let allocations=0;
  const factory=new InstrumentFactory({registry});
  for(const kind of ['metronome','looper'])factory.register(kind,({id=`${kind}-${allocations}`,onCreate})=>{
    allocations++;onCreate?.();const handlers=new Set();
    return {id,kind,root:{visible:true},addDisposeHandler(fn){handlers.add(fn);},dispose(){this.disposed=true;for(const fn of handlers)fn();}};
  });
  return {registry,factory,messages,allocations:()=>allocations};
}
test('concurrent and reentrant creation admits one clock before allocating rejected geometry',async()=>{
  const h=harness();
  const results=await Promise.all(Array.from({length:8},()=>Promise.resolve().then(()=>h.factory.create({kind:'metronome'}))));
  assert.equal(results.filter(Boolean).length,1);assert.equal(h.allocations(),1);
  assert.equal(h.registry.size,1);assert.ok(h.messages.every(m=>m===SINGLE_METRONOME_MESSAGE));
  h.registry.clear();let nested;
  const admitted=h.factory.create({kind:'metronome',onCreate(){nested=h.factory.create({kind:'metronome'});}});
  assert.ok(admitted);assert.equal(nested,null);assert.equal(h.allocations(),2);
});
test('unregistered and registered previews reserve a slot, place once, cancel and respawn',()=>{
  const h=harness();const preview=h.factory.create({kind:'metronome',register:false});preview.pendingPlacement=true;
  assert.equal(h.factory.create({kind:'metronome'}),null);
  assert.equal(h.registry.add(preview),preview);preview.pendingPlacement=false;
  assert.equal(h.registry.getByKind('metronome').length,1);
  h.registry.remove(preview);assert.ok(h.factory.create({kind:'metronome'}));
  h.registry.clear();const unplaced=h.factory.create({kind:'metronome',register:false});unplaced.dispose();
  assert.ok(h.factory.create({kind:'metronome'}));
  for(let i=0;i<5;i++)assert.ok(h.factory.create({kind:'looper'}));
  assert.equal(h.registry.getByKind('looper').length,5);
});
test('direct registry admission rejects and disposes a second clock',()=>{
  const h=harness();h.factory.create({kind:'metronome'});let disposed=0;
  assert.equal(h.registry.add({id:'bypass',kind:'metronome',root:{},dispose(){disposed++;}}),null);
  assert.equal(disposed,1);assert.equal(h.registry.size,1);
});
test('legacy restore preserves the original, reports affected clocks and connections, blocks overwrite',async()=>{
  const h=harness();const scene={instruments:[{id:'first',kind:'metronome',bpm:80},{id:'second',kind:'metronome',bpm:140}],relationships:{metronomeConnections:[{metronomeId:'second',targetId:'missing'}]}};
  const before=JSON.stringify(scene);let writes=0;
  const restorer=new SceneRestorer({registry:h.registry,createInstrument:s=>h.factory.create(s),metronomeConnectionManager:{restore(){return [];}}});
  const persistence=new ScenePersistence({restorer,store:{load:()=>scene,save(){writes++;return true;}},serializer:{serialize:()=>({})}});
  const report=await persistence.restore();
  assert.deepEqual(report.instruments.map(h=>h.id),['first']);assert.equal(report.skipped[0].id,'second');
  assert.equal(report.skippedConnections.length,1);assert.equal(JSON.stringify(report.originalScene),before);
  assert.equal(JSON.stringify(scene),before);assert.equal(persistence.save(),false);assert.equal(writes,0);
  h.registry.clear();assert.ok(h.factory.create({kind:'metronome'}),'inactive recovery snapshots have no reservation');
});
