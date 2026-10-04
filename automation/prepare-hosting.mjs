import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const PUBLIC_FILES = Object.freeze([
  'index.html','privacy.html','manual.html','demo.html',
  'app.js','config.js','manual.js','demo-app.js','styles.css','sw.js',
  'manifest.webmanifest','logo.svg','icon-192.png','icon-512.png',
  'icon-maskable-512.png','apple-touch-icon.png','access-period.mjs',
  'session-cleanup.mjs','student-classes.mjs','attendance-payload.mjs',
  'examples/student-roster-example.csv','examples/teacher-assignments-example.csv',
  'examples/coach-assignments-example.csv','examples/external-instructor-assignments-example.csv'
]);
const allowed = new Set(PUBLIC_FILES);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const fail = code => { throw new Error(code); };
function present(target) {
  try { fs.lstatSync(target); return true; } catch(error) { if(error.code==='ENOENT') return false; throw error; }
}
export function forbiddenPublicName(name) {
  return name.split('/').some(part => part.startsWith('.') ||
    ['automation','node_modules','private-data','local-data','data'].includes(part) ||
    /^(gha-creds-|actual\.env$)/i.test(part) ||
    /(credentials|service-account|private|token)/i.test(part) ||
    /\.(log|pem|p12|key|db|sqlite|har)$/i.test(part));
}
function directory(root) {
  const stat=fs.lstatSync(root);
  if(!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_DIRECTORY');
}
function regularFile(root, relative) {
  let target=root;const parts=relative.split('/');
  for(let i=0;i<parts.length;i++) {
    if(parts[i]==='..' || !parts[i]) fail('UNSAFE_PATH');
    target=path.join(target,parts[i]);const stat=fs.lstatSync(target);
    if(stat.isSymbolicLink() || (i<parts.length-1 ? !stat.isDirectory() : !stat.isFile())) fail('UNSAFE_PUBLIC_PATH');
  }
  return target;
}
function loadManifest(root) {
  directory(root);
  const data=JSON.parse(fs.readFileSync(regularFile(root,'automation/hosting-public-manifest.json'),'utf8'));
  if(data.formatVersion!==1 || !/^[a-f0-9]{40}$/.test(data.sourceSHA) || !Array.isArray(data.publicFiles)) fail('INVALID_PUBLIC_MANIFEST');
  const seen=new Set();
  for(const item of data.publicFiles) {
    if(typeof item.path!=='string' || forbiddenPublicName(item.path) || !allowed.has(item.path) || seen.has(item.path)) fail('UNAPPROVED_PUBLIC_FILE');
    if(!Number.isSafeInteger(item.bytes) || item.bytes<0 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('INVALID_PUBLIC_MANIFEST');
    seen.add(item.path);
  }
  if(seen.size!==PUBLIC_FILES.length) fail('PUBLIC_MANIFEST_INCOMPLETE');
  return data;
}
function validatedBytes(root,item) {
  const bytes=fs.readFileSync(regularFile(root,item.path));
  if(bytes.length!==item.bytes || hash(bytes)!==item.sha256) fail('PUBLIC_ASSET_CHANGED');
  return bytes;
}
function stageFiles(root, prefix='') {
  const files=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
    const relative=prefix+entry.name;
    if(forbiddenPublicName(relative) || entry.isSymbolicLink()) fail('UNAPPROVED_STAGED_FILE');
    if(entry.isDirectory()) {
      if(relative!=='examples') fail('UNAPPROVED_STAGED_DIRECTORY');
      files.push(...stageFiles(path.join(root,entry.name),relative+'/'));
    } else if(entry.isFile() && allowed.has(relative)) files.push(relative);
    else fail('UNAPPROVED_STAGED_FILE');
  }
  return files;
}
function summary(manifest,state) {
  const files=[...manifest.publicFiles].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {state,assetSourceBaseSHA:manifest.sourceSHA,publicFiles:files.length,
    publicSourceFingerprint:hash(JSON.stringify(files)),publicDirectory:'hosting-public'};
}
export function verifyHosting(root) {
  root=path.resolve(root);const manifest=loadManifest(root);const stage=path.join(root,'hosting-public');directory(stage);
  const actual=stageFiles(stage).sort();
  if(JSON.stringify(actual)!==JSON.stringify([...PUBLIC_FILES].sort())) fail('STAGED_FILE_SET_CHANGED');
  for(const file of manifest.publicFiles) validatedBytes(stage,file);
  return summary(manifest,'verified');
}
export function prepareHosting(root) {
  root=path.resolve(root);const manifest=loadManifest(root);const output=path.join(root,'hosting-public');
  if(present(output)) fail('OUTPUT_ALREADY_EXISTS');
  // Read only the fixed public paths. Workspace credentials and unknown files
  // are never enumerated or copied, even if they appear after checkout/auth.
  const files=manifest.publicFiles.map(item=>({item,bytes:validatedBytes(root,item)}));
  const temporary=fs.mkdtempSync(path.join(root,'.hosting-public-build-'));
  try {
    for(const {item,bytes}of files) {
      const target=path.join(temporary,item.path);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
      fs.writeFileSync(target,bytes,{flag:'wx',mode:0o600});
    }
    if(present(output)) fail('OUTPUT_ALREADY_EXISTS');
    fs.renameSync(temporary,output);
    return {...verifyHosting(root),state:'prepared'};
  } finally {
    if(fs.existsSync(temporary)) fs.rmSync(temporary,{recursive:true,force:true});
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=process.argv.includes('--verify') ? verifyHosting(process.cwd()) : prepareHosting(process.cwd());
    console.log(JSON.stringify(result));
  } catch(error) {
    console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'HOSTING_STAGE_FAILED');
    process.exitCode=1;
  }
}
