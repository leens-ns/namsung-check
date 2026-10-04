import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {PUBLIC_FILES,prepareHosting,verifyHosting,forbiddenPublicName} from './prepare-hosting.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nc-public-synthetic-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const publicFiles=[];
  for(const name of PUBLIC_FILES) {
    const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});
    const bytes=Buffer.from('synthetic public asset: '+name);fs.writeFileSync(target,bytes);
    publicFiles.push({path:name,bytes:bytes.length,sha256:hash(bytes)});
  }
  fs.mkdirSync(path.join(root,'automation'),{recursive:true});
  fs.writeFileSync(path.join(root,'automation/hosting-public-manifest.json'),JSON.stringify({formatVersion:1,sourceSHA:'a'.repeat(40),publicFiles}));
  return root;
}
test('credentials, environment, logs, repo metadata and unlisted CSV never enter public stage',t=>{
  const root=fixture(t);
  const forbidden=['gha-creds-fixture.json','credentials.json','actual.env','.env','.env.production','firebase-debug.log','debug.log','.git/config','.github/workflows/private.yml','automation/runtime-token.json','private-data/student-data.csv','examples/real-student-data.csv'];
  for(const name of forbidden){const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'DO_NOT_DEPLOY_SYNTHETIC');}
  assert.equal(prepareHosting(root).publicFiles,24);assert.equal(verifyHosting(root).state,'verified');
  for(const name of forbidden)assert.equal(fs.existsSync(path.join(root,'hosting-public',name)),false);
});
test('new credential file in stage fails verification without reading its contents',t=>{
  const root=fixture(t);prepareHosting(root);const target=path.join(root,'hosting-public/gha-creds-fixture.json');fs.writeFileSync(target,'SYNTHETIC_PRIVATE');
  const old=fs.readFileSync;let touched=false;
  try{fs.readFileSync=(file,...rest)=>{if(file===target){touched=true;throw Error('PRIVATE_FILE_READ_FORBIDDEN');}return old(file,...rest);};assert.throws(()=>verifyHosting(root),/UNAPPROVED_STAGED_FILE/);}finally{fs.readFileSync=old;}
  assert.equal(touched,false);
});
test('source asset symlink to a credential file is rejected',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'.env'),'SYNTHETIC_PRIVATE');fs.unlinkSync(path.join(root,'index.html'));fs.symlinkSync(path.join(root,'.env'),path.join(root,'index.html'));
  assert.throws(()=>prepareHosting(root),/UNSAFE_PUBLIC_PATH/);assert.equal(fs.existsSync(path.join(root,'hosting-public')),false);
});
test('stage symlink is rejected',t=>{
  const root=fixture(t);prepareHosting(root);fs.unlinkSync(path.join(root,'hosting-public/index.html'));fs.symlinkSync(path.join(root,'index.html'),path.join(root,'hosting-public/index.html'));
  assert.throws(()=>verifyHosting(root),/UNAPPROVED_STAGED_FILE/);
});
test('manifest cannot authorize a credential name or unlisted public path',t=>{
  const root=fixture(t);const p=path.join(root,'automation/hosting-public-manifest.json');const manifest=JSON.parse(fs.readFileSync(p,'utf8'));manifest.publicFiles.push({path:'gha-creds-fixture.json',bytes:0,sha256:'0'.repeat(64)});fs.writeFileSync(p,JSON.stringify(manifest));
  assert.throws(()=>prepareHosting(root),/UNAPPROVED_PUBLIC_FILE/);assert.equal(fs.existsSync(path.join(root,'hosting-public')),false);
});
test('changed frozen asset and modified output fail closed',t=>{
  const root=fixture(t);fs.appendFileSync(path.join(root,'app.js'),'changed');assert.throws(()=>prepareHosting(root),/PUBLIC_ASSET_CHANGED/);assert.equal(fs.existsSync(path.join(root,'hosting-public')),false);
  const other=fixture(t);prepareHosting(other);fs.appendFileSync(path.join(other,'hosting-public/app.js'),'changed');assert.throws(()=>verifyHosting(other),/PUBLIC_ASSET_CHANGED/);
});
test('existing output is preserved and independent builds share the same fingerprint',t=>{
  const root=fixture(t);const result=prepareHosting(root);const other=fixture(t);assert.equal(prepareHosting(other).publicSourceFingerprint,result.publicSourceFingerprint);
  const before=fs.readFileSync(path.join(root,'hosting-public/index.html'));assert.throws(()=>prepareHosting(root),/OUTPUT_ALREADY_EXISTS/);assert.deepEqual(fs.readFileSync(path.join(root,'hosting-public/index.html')),before);
});
test('forbidden name policy covers credential extensions, hidden metadata and logs',()=>{
  for(const name of ['gha-creds-test.json','.env','actual.env','nested/debug.log','.git/config','.github/metadata','secret.pem','service-account.json','nested/token.json'])assert.equal(forbiddenPublicName(name),true);
  for(const name of PUBLIC_FILES)assert.equal(forbiddenPublicName(name),false);
});
test('workflow validates stage before auth and each deploy, retaining existing credential mechanism',()=>{
  const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-firebase-hosting.yml',import.meta.url),'utf8');
  const config=JSON.parse(fs.readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
  assert.equal(config.hosting.public,'hosting-public');assert.ok(workflow.indexOf('node automation/prepare-hosting.mjs\n')<workflow.indexOf('      - id: auth\n'));
  assert.match(workflow,/node automation\/prepare-hosting\.mjs --verify \|\| exit 1/);
  assert.doesNotMatch(workflow,/create_credentials_file: false/);assert.match(workflow,/token_format: access_token/);
  assert.match(workflow,/"firestore:rules"/);assert.doesNotMatch(workflow,/"firestore:rules,firestore:indexes"/);
});

test('dangling output symlink is not replaced',t=>{
  const root=fixture(t);const target=path.join(root,'missing-private-directory');fs.symlinkSync(target,path.join(root,'hosting-public'));
  assert.throws(()=>prepareHosting(root),/OUTPUT_ALREADY_EXISTS/);assert.equal(fs.lstatSync(path.join(root,'hosting-public')).isSymbolicLink(),true);
});
