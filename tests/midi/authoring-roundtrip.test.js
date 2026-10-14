import test from 'node:test';
import {mkdtemp,cp,mkdir,symlink,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
test('retained authoring tools regenerate exact musical settings without duplicate JSON',async()=>{
const root=await mkdtemp(join(tmpdir(),'honk-authoring-')),repo=process.cwd();
try{
 await cp('src',join(root,'src'),{recursive:true});await mkdir(join(root,'scripts'));await cp('scripts/midi',join(root,'scripts/midi'),{recursive:true});await cp('package.json',join(root,'package.json'));await symlink(resolve('node_modules'),join(root,'node_modules'));
 for(const [script,song] of [['arrange-tu-kisi-rail-si','tu-kisi-rail-si'],['arrange-nazariya-honk-bends','nazariya-honk-bends'],['arrange-rishte-naate-human','rishte-naate']]){
  execFileSync(process.execPath,[join(root,'scripts/midi',script+'.mjs')],{cwd:root,stdio:'pipe'});
  const path=`src/compositions/${song}/composition.json`,before=JSON.parse(await readFile(join(repo,path))),after=JSON.parse(await readFile(join(root,path)));
  for(const key of ['score','lessons','compatibility','requirements','title'])assert.deepEqual(after[key],before[key],`${song}: ${key}`);
  assert.deepEqual(after.arrangement,before.arrangement,`${song}: arrangement`);
  assert.deepEqual(after.authoredSource,before.authoredSource);
  assert.ok(!(await readdir(join(root,'src/compositions',song))).some(f=>/^[a-f0-9]{64}\.(?:composition|normalized)\.json$/.test(f)));
  console.log(script+': exact musical/settings round-trip; no duplicate JSON outputs');
 }
}finally{await rm(root,{recursive:true,force:true});}

});
