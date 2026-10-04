import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ORIGIN='https://firebasehosting.googleapis.com';
const CONSOLE_LABEL='5d49e4';
const RESOURCE_PREFIX='sites/namsung-check/versions/';
const WINDOW_START='2026-10-04T10:35:23Z';
const WINDOW_END='2026-10-04T10:35:28Z';
const MAX_PAGES=3;
const fail=code=>{throw new Error(code);};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const approvedManifest=new URL('./hosting-public-manifest.json',import.meta.url);
const systemPaths=new Set(['/404.html','/.well-known/assetlinks.json','/.well-known/apple-app-site-association','/apple-app-site-association','/__/firebase/init.js','/__/firebase/init.json']);

export function preflight(){return {site:'namsung-check',consolePrefix:CONSOLE_LABEL,createTimeStart:WINDOW_START,createTimeEndExclusive:WINDOW_END,expectedFiles:26};}
function safePath(raw,allowed){
  if(typeof raw!=='string'||raw.length>512)fail('INVALID_FILE_METADATA');
  if(allowed.has(raw)||systemPaths.has(raw))return raw;
  let category='unapproved-name-redacted';
  if(/(^|\/)gha-creds-[^/]+\.json$/i.test(raw))category='generated-credential-name-redacted';
  else if(/credentials|service-account|\.(pem|p12|key)$/i.test(raw))category='credential-or-key-name-redacted';
  else if(/(^|\/)\.env($|\.)|actual\.env/i.test(raw))category='environment-name-redacted';
  else if(/\.log$/i.test(raw))category='log-name-redacted';
  return '<'+category+':sha256='+digest(raw)+'>';
}
async function getMetadata(url,token,fetchImpl){
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});}
  catch{fail('METADATA_REQUEST_FAILED');}
  // Do not read or print permission/error response bodies.
  if(response.status===401||response.status===403)fail('EXISTING_PERMISSION_INSUFFICIENT_STOP');
  if(response.status===404)fail('EXACT_VERSION_NOT_FOUND_STOP');
  if(response.status!==200)fail('METADATA_HTTP_FAILURE_STOP');
  if(Number(response.headers.get('content-length')||0)>65536)fail('METADATA_RESPONSE_TOO_LARGE');
  if(!/application\/json/i.test(response.headers.get('content-type')||''))fail('INVALID_METADATA_RESPONSE_TYPE');
  // Stream with a size ceiling. No file-content endpoint is ever requested.
  let text='';let bytes=0;const reader=response.body.getReader();const decoder=new TextDecoder();
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536)fail('METADATA_RESPONSE_TOO_LARGE');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  catch{await reader.cancel().catch(()=>{});fail('METADATA_RESPONSE_READ_FAILED');}
  try{return JSON.parse(text);}catch{fail('INVALID_METADATA_JSON');}
}

async function resolveVersion(token,fetchImpl){
  const candidates=[];const seenNames=new Set();const seenTokens=new Set();let pageToken='';
  for(let page=0;page<MAX_PAGES;page++){
    const url=new URL('/v1beta1/sites/namsung-check/versions',ORIGIN);
    url.searchParams.set('pageSize','100');
    url.searchParams.set('filter','createTime >= "'+WINDOW_START+'" AND createTime < "'+WINDOW_END+'"');
    url.searchParams.set('fields','versions(name,status,createTime,fileCount),nextPageToken');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const data=await getMetadata(url,token,fetchImpl);
    if(!Array.isArray(data.versions)||data.versions.length>100||seenNames.size+data.versions.length>100)fail('INVALID_VERSION_LIST');
    for(const item of data.versions){
      if(typeof item.name!=='string'||!/^sites\/namsung-check\/versions\/[A-Za-z0-9_-]{6,80}$/.test(item.name)||seenNames.has(item.name))fail('INVALID_OR_DUPLICATE_VERSION_NAME');
      seenNames.add(item.name);const time=Date.parse(item.createTime);
      if(!Number.isFinite(time)||time<Date.parse(WINDOW_START)||time>=Date.parse(WINDOW_END))fail('VERSION_FILTER_MISMATCH_STOP');
      if(item.name.slice(RESOURCE_PREFIX.length).startsWith(CONSOLE_LABEL))candidates.push(item);
    }
    pageToken=data.nextPageToken||'';
    if(!pageToken)break;
    if(typeof pageToken!=='string'||pageToken.length>2048||seenTokens.has(pageToken)||page===MAX_PAGES-1)fail('VERSION_PAGINATION_BOUNDARY_STOP');
    seenTokens.add(pageToken);
  }
  if(candidates.length!==1)fail(candidates.length?'AMBIGUOUS_TARGET_VERSION_STOP':'TARGET_VERSION_NOT_FOUND_STOP');
  const version=candidates[0];
  if(version.status!=='FINALIZED'||String(version.fileCount)!=='26')fail('VERSION_STATUS_OR_FILE_COUNT_MISMATCH');
  return {name:version.name,createTime:version.createTime,fileCount:26};
}

export async function diagnose({env,fetchImpl=fetch,manifest}){
  const token=env.GOOGLE_ACCESS_TOKEN;
  if(typeof token!=='string'||!token||/[\r\n]/.test(token))fail('EXISTING_ACTION_TOKEN_REQUIRED');
  if(manifest.sourceSHA!=='efd746ad47c37d2418e0b86b91dadffdfc410055'||!Array.isArray(manifest.publicFiles)||manifest.publicFiles.length!==24)fail('APPROVED_PUBLIC_MANIFEST_REQUIRED');
  const allowed=new Set(manifest.publicFiles.map(item=>'/'+item.path));
  if(allowed.size!==24)fail('APPROVED_PUBLIC_MANIFEST_REQUIRED');
  const version=await resolveVersion(token,fetchImpl);const resource=version.name;
  const rows=[];const seenPaths=new Set();const seenTokens=new Set();let pageToken='';
  for(let page=0;page<MAX_PAGES;page++){
    const url=new URL('/v1beta1/'+resource+'/files',ORIGIN);
    url.searchParams.set('status','ACTIVE');url.searchParams.set('pageSize','100');
    url.searchParams.set('fields','files(path,hash,status),nextPageToken');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const data=await getMetadata(url,token,fetchImpl);
    if(!Array.isArray(data.files)||data.files.length>26||rows.length+data.files.length>26)fail('INVALID_FILE_METADATA_COUNT');
    for(const item of data.files){
      if(typeof item.path!=='string'||seenPaths.has(item.path)||typeof item.hash!=='string'||!/^[a-fA-F0-9]{64}$/.test(item.hash)||item.status!=='ACTIVE')fail('INVALID_OR_DUPLICATE_FILE_METADATA');
      seenPaths.add(item.path);rows.push({path:safePath(item.path,allowed),hash:item.hash.toLowerCase(),status:item.status});
    }
    pageToken=data.nextPageToken||'';
    if(!pageToken)break;
    if(typeof pageToken!=='string'||pageToken.length>2048||seenTokens.has(pageToken)||page===MAX_PAGES-1)fail('PAGINATION_BOUNDARY_STOP');
    seenTokens.add(pageToken);
  }
  if(rows.length!==26||[...allowed].some(name=>!seenPaths.has(name)))fail('VERSION_METADATA_INCOMPLETE_OR_PUBLIC_FILES_MISSING');
  // Only fully validated metadata is returned for printing. Unknown filenames
  // are masked to avoid accidentally disclosing credential identifiers or PII.
  return {consoleLabel:CONSOLE_LABEL,versionResource:resource,versionCreateTime:version.createTime,metadataFiles:26,approvedPublicFiles:24,files:rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.includes('--preflight'))console.log(JSON.stringify(preflight()));
    else{
      const manifest=JSON.parse(fs.readFileSync(approvedManifest,'utf8'));
      console.log(JSON.stringify(await diagnose({env:process.env,manifest})));
    }
  }catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'METADATA_DIAGNOSTIC_FAILED');process.exitCode=1;}
}
