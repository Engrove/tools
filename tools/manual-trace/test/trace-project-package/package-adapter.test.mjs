/** AI-CODING NOTE: Behavioral regressions for stable identities and locale-independent Manual Trace adapter ordering. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import '../../trace-project-package.js';

const source=await readFile(new URL('../../app-08.js',import.meta.url),'utf8');
const shape=(id,name)=>({id,type:'poly',name,role:'trace',description:`${name} contour`,closed:true,points:[{x:0,y:0},{x:100,y:0},{x:100,y:20},{x:0,y:20}],semantic:{feature_kind:'outer_contour'},references:[]});
const station=(id,name,x)=>({id,type:'station',name,description:`${name} station`,station_index:1,orientation:'vertical',x,references:[]});

function context(){
  const elements=new Map([
    ['packageViewType',{value:'side',addEventListener(){}}],
    ['packageViewStatus',{textContent:''}],
    ['storePackageView',{addEventListener(){}}],
    ['exportTraceProject',{disabled:false,addEventListener(){}}]
  ]);
  const S={
    schema_version:'engrove_manual_trace_v16',
    project_meta:{name:'Multi view'},
    img:{name:'side.png',width:400,height:200,dataUrl:'data:image/png;base64,iVBORw0KGgo='},
    shapes:[shape('side-outline','Side')],
    frame:{origin:{x:10,y:20},origin_metadata:{description:'Origin.'},axes:{x:'+image_x',y:'+out_of_screen',z:'-image_y'},scale:{unit_per_px:.5,source_length_px:200,source_real_length:100,reference_measure_id:'measure-reference'}},
    svgTrace:{}
  };
  const c={S,$:id=>elements.get(id)||null,clone:v=>JSON.parse(JSON.stringify(v)),ensureAllMeta(){},outObj:()=>({schema_version:S.schema_version,description:{en:'Synthetic trace.'},image:S.img,trace_frame:S.frame,shapes:S.shapes}),safeFileBase:v=>String(v||'project').replace(/[^A-Za-z0-9._-]+/g,'_'),PROJECT_SCHEMA:'engrove_trace_project_v2',EngroveTraceProjectPackage:globalThis.EngroveTraceProjectPackage,crypto:{randomUUID:(()=>{let n=0;return()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`})()},alert:m=>{throw new Error(m)},console,setTimeout(){},elements};
  c.globalThis=c;
  return c;
}

function install(c){
  vm.runInNewContext('String.prototype.localeCompare=function(){throw new Error("localeCompare is forbidden in deterministic adapter ordering")}',c);
  vm.runInNewContext(source,c,{filename:'app-08.js'});
}

function configureView(c,view){
  c.elements.get('packageViewType').value=view;
  c.S.img={...c.S.img,name:`${view}.png`};
  c.S.frame.axes=view==='top'?{x:'+image_x',y:'+image_y',z:'+out_of_screen'}:view==='front'?{x:'+out_of_screen',y:'+image_x',z:'-image_y'}:{x:'+image_x',y:'+out_of_screen',z:'-image_y'};
}

test('side and top snapshots retain one stable project and object',async()=>{
  const c=context();
  install(c);
  const side=await c.captureCurrentPackageView(),pid=c.S.project_meta.package_project_id,oid=c.S.project_meta.package_object_id;
  configureView(c,'top');
  c.S.shapes=[shape('top-outline','Top')];
  const top=await c.captureCurrentPackageView(),m=await c.manualTraceProjectModelFromWorkspace(false);
  assert.equal(c.S.project_meta.package_project_id,pid);
  assert.equal(c.S.project_meta.package_object_id,oid);
  assert.notEqual(side.trace.traceId,top.trace.traceId);
  assert.deepEqual([...m.traces.map(x=>x.view.viewType)],['side','top']);
  assert.ok(m.traces.every(x=>x.objectId===oid));
  assert.ok(m.traces.every(x=>/^[a-f0-9]{64}$/.test(x.provenance.sourceDigest)));
  assert.equal(m.projectId,pid);
  assert.equal(m.objectId,oid);
  assert.equal(m.assets.length,4);
});

test('semantic names, station ties, and stored views use explicit code-unit order',async()=>{
  assert.doesNotMatch(source,/\.localeCompare\s*\(/);
  const c=context();
  install(c);
  c.S.shapes=[
    shape('outline-z','zeta'),
    shape('outline-A','Alpha'),
    station('station_a','station_a',30),
    station('station-A','station-A',20),
    station('station.a','station.a',40)
  ];
  configureView(c,'top');
  const top=await c.captureCurrentPackageView();
  assert.deepEqual([...top.trace.provenance.semanticNames],['Alpha','station-A','station.a','station_a','zeta']);
  assert.deepEqual([...top.trace.geometry.stations.map(item=>item.stationId)],['station-A','station.a','station_a']);
  configureView(c,'side');
  await c.captureCurrentPackageView();
  configureView(c,'front');
  await c.captureCurrentPackageView();
  const model=await c.manualTraceProjectModelFromWorkspace(false);
  assert.deepEqual([...model.traces.map(item=>item.view.viewType)],['front','side','top']);
});
