import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ORIGIN='https://firebasehosting.googleapis.com';
const CONSOLE_LABEL='5d49e4';
const WINDOW_START='2026-10-04T10:35:23Z';
const WINDOW_END='2026-10-04T10:35:28Z';
const RELEASE_SEARCH_START='2026-10-04T10:35:08Z';
const RELEASE_SEARCH_END='2026-10-04T10:35:43Z';
const MAX_PAGES=3;
const fail=code=>{throw new Error(code);};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const approvedManifest=new URL('./hosting-public-manifest.json',import.meta.url);
const systemPaths=new Set(['/404.html','/.well-known/assetlinks.json','/.well-known/apple-app-site-association','/apple-app-site-association','/__/firebase/init.js','/__/firebase/init.json']);

export function preflight(){return {site:'namsung-check',channel:'live',consoleLabel:CONSOLE_LABEL,releaseTimeStart:RELEASE_SEARCH_START,releaseTimeEndExclusive:RELEASE_SEARCH_END,expectedFiles:26};}
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
    // A site-wide releases list also includes previews. Pin the live channel.
    const url=new URL('/v1beta1/sites/namsung-check/channels/live/releases',ORIGIN);
    url.searchParams.set('pageSize','100');
    url.searchParams.set('fields','releases(name,type,releaseTime,version(name,status,fileCount)),nextPageToken');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const data=await getMetadata(url,token,fetchImpl);
    if(!Array.isArray(data.releases)||data.releases.length>100||seenNames.size+data.releases.length>300)fail('INVALID_RELEASE_LIST');
    for(const item of data.releases){
      if(typeof item.name!=='string'||!/^sites\/namsung-check\/(channels\/live\/)?releases\/[A-Za-z0-9_-]{6,80}$/.test(item.name)||seenNames.has(item.name))fail('INVALID_OR_DUPLICATE_LIVE_RELEASE_NAME');
      seenNames.add(item.name);const time=Date.parse(item.releaseTime);
      if(!Number.isFinite(time))fail('INVALID_RELEASE_TIME');
      if(time<Date.parse(RELEASE_SEARCH_START)||time>=Date.parse(RELEASE_SEARCH_END))continue;
      if(item.type!=='DEPLOY')continue;
      const version=item.version;
      if(!version||typeof version.name!=='string'||!/^sites\/namsung-check\/versions\/[A-Za-z0-9_-]{6,80}$/.test(version.name))fail('INVALID_RELEASE_VERSION_NAME');
      if(version.status!=='FINALIZED'||String(version.fileCount)!=='26')continue;
      candidates.push({releaseName:item.name,releaseTime:item.releaseTime,versionName:version.name});
    }
    pageToken=data.nextPageToken||'';
    if(!pageToken)break;
    if(typeof pageToken!=='string'||pageToken.length>2048||seenTokens.has(pageToken)||page===MAX_PAGES-1)fail('RELEASE_PAGINATION_BOUNDARY_STOP');
    seenTokens.add(pageToken);
  }
  if(candidates.length!==1)fail(candidates.length?'AMBIGUOUS_LIVE_RELEASE_STOP':'TARGET_LIVE_RELEASE_NOT_FOUND_STOP');
  const candidate=candidates[0];const labelRelations=[];
  for(const [kind,name]of [['version',candidate.versionName],['release',candidate.releaseName]]){
    const id=name.split('/').at(-1);
    if(id.startsWith(CONSOLE_LABEL))labelRelations.push(kind+'-prefix');
    if(id.endsWith(CONSOLE_LABEL))labelRelations.push(kind+'-suffix');
  }
  const time=Date.parse(candidate.releaseTime);
  const withinExactStep=time>=Date.parse(WINDOW_START)&&time<Date.parse(WINDOW_END);
  // When neither ID matches the console label, accept only the unique release
  // within the original exact CI step window. Margin-only matches fail closed.
  if(!labelRelations.length&&!withinExactStep)fail('RELEASE_IDENTITY_EVIDENCE_INSUFFICIENT_STOP');
  const url=new URL('/v1beta1/'+candidate.versionName,ORIGIN);
  url.searchParams.set('fields','name,status,createTime,fileCount');
  const version=await getMetadata(url,token,fetchImpl);
  if(version.name!==candidate.versionName||version.status!=='FINALIZED'||String(version.fileCount)!=='26'||!Number.isFinite(Date.parse(version.createTime)))fail('SELECTED_RELEASE_VERSION_MISMATCH_STOP');
  return {name:version.name,createTime:version.createTime,fileCount:26,releaseName:candidate.releaseName,releaseTime:candidate.releaseTime,consoleLabelRelations:labelRelations,identityEvidence:labelRelations.length?'unique-live-release-time-count-and-label':'unique-live-release-exact-step-time-and-count-console-label-unconfirmed'};
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
  return {consoleLabel:CONSOLE_LABEL,versionResource:resource,versionCreateTime:version.createTime,releaseResource:version.releaseName,releaseTime:version.releaseTime,consoleLabelRelations:version.consoleLabelRelations,identityEvidence:version.identityEvidence,metadataFiles:26,approvedPublicFiles:24,files:rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
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
