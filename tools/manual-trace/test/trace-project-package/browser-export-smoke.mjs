/** AI-CODING NOTE: Chromium smoke for multi-view storage, validated download, ZIP readability, and manifest integrity. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root=resolve(new URL('../../../../',import.meta.url).pathname);
const temporary=await mkdtemp(join(tmpdir(),'manual-trace-browser-smoke-'));
const downloads=join(temporary,'downloads');
const profile=join(temporary,'profile');
const chrome=process.env.CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(path=>{try{return requireStat(path)}catch{return false}});
function requireStat(path){return Boolean(process.getBuiltinModule('fs').statSync(path).isFile())}
assert.ok(chrome,'Chromium/Chrome executable not found; set CHROME_PATH.');

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=createServer(async(request,response)=>{try{const requested=decodeURIComponent(new URL(request.url,'http://localhost').pathname);const candidate=normalize(join(root,requested));if(!candidate.startsWith(root+sep)){response.writeHead(403).end();return}const data=await readFile(candidate);response.writeHead(200,{'content-type':mime[extname(candidate)]||'application/octet-stream','cache-control':'no-store'});response.end(data)}catch(error){response.writeHead(error.code==='ENOENT'?404:500).end(String(error.message))}});
await new Promise(resolveReady=>server.listen(0,'127.0.0.1',resolveReady));
const port=server.address().port;
const debugPort=9333+Math.floor(Math.random()*300);
const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk});

async function pollJson(url,options){const deadline=Date.now()+20000;while(Date.now()<deadline){try{const response=await fetch(url,options);if(response.ok)return response.json()}catch{}await new Promise(resolveWait=>setTimeout(resolveWait,100))}throw new Error(`Timed out waiting for ${url}\n${stderr}`)}
function socket(url){const ws=new WebSocket(url);let id=0;const pending=new Map();ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve:ok,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(new Error(message.error.message)):ok(message.result)}};const ready=new Promise((ok,reject)=>{ws.onopen=ok;ws.onerror=reject});return{ready,call:async(method,params={})=>{await ready;const requestId=++id;return new Promise((ok,reject)=>{pending.set(requestId,{resolve:ok,reject});ws.send(JSON.stringify({id:requestId,method,params}))})},close:()=>ws.close()}}

function unzipStore(bytes){const entries=new Map();let offset=0;while(offset+4<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),compressed=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);assert.equal(flags&0x0008,0,'data descriptors are not supported by deterministic ZIP');assert.equal(method,0,'package entries must use STORE');const nameStart=offset+30;const dataStart=nameStart+nameLength+extraLength;const name=bytes.subarray(nameStart,nameStart+nameLength).toString('utf8');entries.set(name,bytes.subarray(dataStart,dataStart+compressed));offset=dataStart+compressed}return entries}

try{
 const version=await pollJson(`http://127.0.0.1:${debugPort}/json/version`);
 const browser=socket(version.webSocketDebuggerUrl);await browser.call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
 const target=await pollJson(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${port}/tools/manual-trace/test/trace-project-package/browser-export-smoke.html`,{method:'PUT'});
 const page=socket(target.webSocketDebuggerUrl);await page.call('Runtime.enable');
 const deadline=Date.now()+30000;let state;
 while(Date.now()<deadline){state=await page.call('Runtime.evaluate',{expression:'({done:Boolean(window.__smokeDone),error:window.__smokeError||null,status:document.getElementById("packageViewStatus")?.textContent||""})',returnByValue:true});const value=state.result.value;if(value.error)throw new Error(value.error);if(value.done)break;await new Promise(resolveWait=>setTimeout(resolveWait,100))}
 assert.equal(state?.result?.value?.done,true,`browser export did not finish: ${JSON.stringify(state?.result?.value)}`);
 let files=[];const fileDeadline=Date.now()+10000;while(Date.now()<fileDeadline){try{files=(await readdir(downloads)).filter(name=>!name.endsWith('.crdownload'));if(files.length)break}catch{}await new Promise(resolveWait=>setTimeout(resolveWait,100))}
 assert.equal(files.length,1,`expected one completed download, got ${files.join(', ')}`);
 assert.match(files[0],/\.engrove-trace-project$/);
 const downloaded=join(downloads,files[0]);assert.ok((await stat(downloaded)).size>0);
 const entries=unzipStore(await readFile(downloaded));
 assert.ok(entries.has('manifest.json'));assert.ok(entries.has('project.json'));
 const manifest=JSON.parse(entries.get('manifest.json').toString('utf8'));
 const project=JSON.parse(entries.get('project.json').toString('utf8'));
 assert.equal(project.traceFiles.length,2);assert.deepEqual(project.traceFiles.map(item=>item.path),['traces/trace-side-000000000000400080000000.json','traces/trace-top-000000000000400080000000.json']);
 for(const file of manifest.files){assert.ok(entries.has(file.path),`manifest entry missing from ZIP: ${file.path}`);const payload=entries.get(file.path);assert.equal(payload.byteLength,file.sizeBytes,`size mismatch: ${file.path}`);assert.equal(createHash('sha256').update(payload).digest('hex'),file.sha256,`hash mismatch: ${file.path}`)}
 assert.deepEqual([...entries.keys()],['manifest.json',...manifest.files.map(file=>file.path)]);
 console.log(`Chromium smoke PASS: ${files[0]} with ${project.traceFiles.length} views and ${manifest.files.length} inventoried files.`);
 page.close();browser.close();
} finally {
 child.kill('SIGTERM');server.close();await rm(temporary,{recursive:true,force:true});
}
