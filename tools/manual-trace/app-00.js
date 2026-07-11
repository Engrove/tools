/**
 * AI-CODING NOTE:
 * Responsibility: Manual Trace shared state and function definitions, chunk 1 of 7.
 * Dependency: Classic scripts share one global lexical environment and must load in numeric order.
 * Safe edits: Preserve identifiers, ordering, schemas, provenance, and browser-local behavior.
 * Do not: Load independently, reorder scripts, or weaken SVG sanitization.
 */
"use strict";
const $=id=>document.getElementById(id), cv=$("cv"), cx=cv.getContext("2d"), stage=$("stage"), json=$("json");

const C={line:"#2ec4b6",path:"#6b93ff",poly:"#ffd84d",rect:"#ff8b3d",circle:"#a78bfa",mask:"#ff4d6d",zone:"#00a8ff",station:"#5d7cff",measure:"#ff66cc",sel:"#fff",h:"#ffea00",in:"#ff8fab",out:"#7df9ff"};

let S={schema_version:"engrove_manual_trace_v16",img:null,shapes:[],sel:null,tool:"select",cur:null,view:{s:1,x:0,y:0},hist:[],fut:[],drag:null,space:false,grid:true,pts:true,snap:true,measureSnap:true,snapPx:14,snapHit:null,anchor:null,project_meta:{name:"",created_at:null,updated_at:null},frame:{origin:null,origin_metadata:{id:"trace_frame.origin",name:"origin",role:"datum",kind:"origin",location_role:"unspecified",description:"AI/CAD origin. Set location_role to stylus_tip, pivot, cartridge_proxy or another explicit datum.",references:[]},axes:{x:"+image_x",y:"+image_y",z:"+out_of_screen"},station_spacing_px:null,scale:{reference_measure_id:null,unit:"mm",px_per_unit:null,unit_per_px:null,source_length_px:null,source_real_length:null}},svgTrace:{sourceName:null,sourceText:null,candidates:[],activeId:null,show:true,settings:{mode:"filled",output:"poly",sampleStep:2.5,simplifyTol:1.5,minArea:4}}};

const id=p=>(p||"s")+"_"+Math.random().toString(36).slice(2,8)+"_"+Date.now().toString(36).slice(-4);

const clone=o=>JSON.parse(JSON.stringify(o));

const sel=()=>S.shapes.find(x=>x.id===S.sel);

const ORIGIN_SEL="trace_frame.origin";

function pad3(n){return String(n).padStart(3,"0")}

function typeBase(t){return ({path:"bezier_path",poly:"polyline",line:"line",measure:"measure",station:"station",mask:"ignore_mask",rect:"rect",circle:"circle"}[t]||t||"shape")}

function nextName(t){let b=typeBase(t), n=1; for(let s of S.shapes){let m=String(s.name||"").match(new RegExp("^"+b+"_(\\d+)$")); if(m)n=Math.max(n,Number(m[1])+1)} return b+"_"+pad3(n)}

function defaultKind(t){return ({path:"outer_contour",poly:"outer_contour",line:"datum",measure:"measurement",station:"station",mask:"ignore_zone",zone:"semantic_zone",rect:"zone",circle:"zone"}[t]||"unspecified")}

function ensureFrameMeta(){
 S.frame=S.frame||{};
 S.frame.origin_metadata=S.frame.origin_metadata||{id:"trace_frame.origin",name:"origin",role:"datum",kind:"origin",location_role:"unspecified",description:"AI/CAD origin. Set location_role to stylus_tip, pivot, cartridge_proxy or another explicit datum.",references:[]};
 S.frame.origin_metadata.references=S.frame.origin_metadata.references||[];
}

function normalizeStationGeometry(s){
 if(!s||s.type!=="station")return s;
 let ori=s.orientation||"vertical",w=S.img?.width||1000,h=S.img?.height||1000;
 s.orientation=ori;
 if(ori==="horizontal"){
  let y=Number.isFinite(Number(s.y))?Number(s.y):(Number.isFinite(Number(s.y1))?Number(s.y1):Number(s.y2)||0);
  s.y=y;s.y1=y;s.y2=y;
  s.x1=Number.isFinite(Number(s.x1))?Number(s.x1):0;
  s.x2=Number.isFinite(Number(s.x2))?Number(s.x2):w;
 }else{
  let x=Number.isFinite(Number(s.x))?Number(s.x):(Number.isFinite(Number(s.x1))?Number(s.x1):Number(s.x2)||0);
  s.x=x;s.x1=x;s.x2=x;
  s.y1=Number.isFinite(Number(s.y1))?Number(s.y1):0;
  s.y2=Number.isFinite(Number(s.y2))?Number(s.y2):h;
 }
 return s
}

function ensureShapeMeta(s,i=0){
 if(!s)return s;
 normalizeStationGeometry(s);
 if(!s.name||["line","measure","bezier_path","polyline","station","ignore_mask","zone","rect","circle","path","poly","mask"].includes(String(s.name)))s.name=nextName(s.type);
 if(!s.role)s.role=s.type==="measure"?"measurement":(s.type==="station"?"station":(s.type==="mask"?"ignore":"trace"));
 if(!s.description)s.description=defaultShapeDescription?s.description||defaultShapeDescription(s,i):"Manual trace object.";
 s.semantic=s.semantic||{};
 s.semantic.standard_name=s.semantic.standard_name||s.name;
 s.semantic.display_name=s.semantic.display_name||s.name;
 s.semantic.feature_kind=s.semantic.feature_kind||defaultKind(s.type);
 s.semantic.ai_hint=s.semantic.ai_hint||"Use JSON coordinates as editable geometry source and SVG as visual overlay binding.";
 s.references=s.references||[];
 ensureZoneStyle(s,i);
 return s
}

function ensureAllMeta(){ensureFrameMeta();S.shapes.forEach((s,i)=>ensureShapeMeta(s,i))}

function selectedObjectLabel(){
 if(S.sel===ORIGIN_SEL)return"trace_frame.origin";
 let s=sel();return s?`${s.name||s.type} (${s.id})`:"No selected object";
}

function targetOptionsHtml(){
 let opts=[`<option value="trace_frame.origin">origin / trace_frame.origin</option>`,`<option value="trace_frame.axes">trace_frame.axes</option>`,`<option value="image">reference image</option>`];
 S.shapes.forEach(s=>opts.push(`<option value="${escapeAttr(s.id)}">${escapeAttr((s.name||s.type)+" / "+s.id)}</option>`));
 return opts.join("");
}

function escapeAttr(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}

function updateProps(){
 ensureAllMeta();
 const isOrigin=S.sel===ORIGIN_SEL, s=isOrigin?null:sel(), meta=isOrigin?S.frame.origin_metadata:s;
 const dis=!(isOrigin||s);
 ["propName","propRole","propKind","propDesc","refType","refTarget","refNote","propApply","refAdd"].forEach(id=>{if($(id))$(id).disabled=dis});
 if($("propSel"))$("propSel").textContent=selectedObjectLabel();
 if($("refTarget"))$("refTarget").innerHTML=targetOptionsHtml();
 if(!meta){
  if($("propName"))$("propName").value="";
  if($("propRole"))$("propRole").value="";
  if($("propKind"))$("propKind").value="";
  if($("propDesc"))$("propDesc").value="";
  if($("propRefs"))$("propRefs").innerHTML="";
  return
 }
 if($("propName"))$("propName").value=meta.name||"";
 if($("propRole"))$("propRole").value=meta.role||"";
 if($("propKind"))$("propKind").value=(meta.kind||meta.semantic?.feature_kind||"");
 if($("propDesc"))$("propDesc").value=meta.description||"";
 let refs=meta.references||[];
 if($("propRefs"))$("propRefs").innerHTML=refs.length?refs.map((r,i)=>`<div class="refItem">${i+1}. ${escapeAttr(r.relation||r.type)} → ${escapeAttr(r.target||"")} ${r.note?("· "+escapeAttr(r.note)):""}</div>`).join(""):"No reference relations";
}

function applyProps(){
 ensureAllMeta();
 const isOrigin=S.sel===ORIGIN_SEL, s=isOrigin?null:sel(), meta=isOrigin?S.frame.origin_metadata:s;
 if(!meta)return;
 hist();
 meta.name=($("propName")?.value||meta.name||"").trim()||meta.name;
 meta.role=($("propRole")?.value||meta.role||"").trim()||meta.role;
 meta.description=($("propDesc")?.value||"").trim();
 let k=($("propKind")?.value||"").trim();
 if(isOrigin){meta.kind=k||"origin";meta.location_role=meta.location_role==="unspecified"&&k?k:meta.location_role||"unspecified"}
 else{meta.semantic=meta.semantic||{};meta.semantic.feature_kind=k||meta.semantic.feature_kind||defaultKind(meta.type);meta.semantic.display_name=meta.name;meta.semantic.standard_name=meta.semantic.standard_name||meta.name}
 sync();
}

function editOriginMeta(){
 ensureFrameMeta();
 let m=S.frame.origin_metadata;
 let loc=prompt("Origin location role, e.g. stylus_tip, pivot, cartridge_proxy, headshell_datum",m.location_role||"unspecified");
 if(loc!==null){hist();m.location_role=loc.trim()||"unspecified";m.kind="origin";S.sel=ORIGIN_SEL;sync()}
}

function addReference(){
 ensureAllMeta();
 const isOrigin=S.sel===ORIGIN_SEL, s=isOrigin?null:sel(), meta=isOrigin?S.frame.origin_metadata:s;
 if(!meta)return;
 hist();
 meta.references=meta.references||[];
 meta.references.push({relation:$("refType")?.value||"related_to",target:$("refTarget")?.value||"",note:($("refNote")?.value||"").trim(),created_at:new Date().toISOString(),source:"manual_trace_property_panel"});
 if($("refNote"))$("refNote").value="";
 sync();
}

function hist(){S.hist.push(JSON.stringify({shapes:S.shapes,sel:S.sel,anchor:S.anchor||null,frame:S.frame})); if(S.hist.length>80)S.hist.shift(); S.fut=[]}

function undo(){
 if(undoActivePoint())return;
 if(!S.hist.length)return;
 S.fut.push(JSON.stringify({shapes:S.shapes,sel:S.sel,anchor:S.anchor||null,frame:S.frame}));
 let o=JSON.parse(S.hist.pop());S.shapes=o.shapes;S.sel=o.sel;S.anchor=o.anchor||null;S.frame=o.frame||S.frame;sync()
}

function redo(){if(!S.fut.length)return;S.hist.push(JSON.stringify({shapes:S.shapes,sel:S.sel,anchor:S.anchor||null,frame:S.frame}));let o=JSON.parse(S.fut.pop());S.shapes=o.shapes;S.sel=o.sel;S.anchor=o.anchor||null;S.frame=o.frame||S.frame;sync()}

function size(){let r=stage.getBoundingClientRect(),d=devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;cv.style.width=r.width+"px";cv.style.height=r.height+"px";cx.setTransform(d,0,0,d,0,0);draw()}

function scr(e){let r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}

function toImg(p){return {x:(p.x-S.view.x)/S.view.s,y:(p.y-S.view.y)/S.view.s}}

function toScr(p){return {x:p.x*S.view.s+S.view.x,y:p.y*S.view.s+S.view.y}}

function pointCount(s){
 if(!s)return 0;
 if(s.type==="path")return s.nodes.length;
 if(s.type==="poly"||s.type==="mask"||s.type==="line")return s.points.length;
 if(s.type==="rect"||s.type==="circle")return 2;
 return 0
}

function lastPoint(s){
 if(!s)return null;
 if(s.type==="path"&&s.nodes.length)return {x:s.nodes[s.nodes.length-1].x,y:s.nodes[s.nodes.length-1].y};
 if((s.type==="poly"||s.type==="mask"||s.type==="line")&&s.points.length)return clone(s.points[s.points.length-1]);
 if(s.type==="rect")return {x:s.x+s.w,y:s.y+s.h};
 if(s.type==="circle")return {x:s.cx+s.r,y:s.cy};
 return null
}

function hasEnough(s){
 if(!s)return false;
 if(s.type==="path")return s.nodes.length>=2;
 if(s.type==="zone")return s.points.length>=3;
 if(s.type==="poly"||s.type==="mask")return s.points.length>=2;
 if(s.type==="line"||s.type==="measure")return s.points.length>=2&&d(s.points[0],s.points[1])>.5;
 if(s.type==="rect")return Math.abs(s.w)>.5&&Math.abs(s.h)>.5;
 if(s.type==="circle")return s.r>.5;
 return false
}

function zonePalette(i){
 const pal=["#00a8ff","#ff9f1c","#a78bfa","#2ec4b6","#ff4d6d","#6b93ff","#ffd84d","#e76f51","#4cc9f0","#c77dff"];
 return pal[Math.abs(i||0)%pal.length]
}

function ensureZoneStyle(s,i=0){
 if(!s||s.type!=="zone")return s;
 s.closed=true;
 s.role=s.role||"zone";
 s.style=s.style||{};
 if(!s.style.stroke)s.style.stroke=zonePalette(i);
 if(!s.style.fill)s.style.fill=s.style.stroke;
 if(s.style.fill_alpha===undefined)s.style.fill_alpha=0.18;
 if(s.style.stroke_alpha===undefined)s.style.stroke_alpha=0.95;
 if(!s.style.width)s.style.width=1.4;
 return s
}

function setAnchor(p){S.anchor=p?{x:p.x,y:p.y}:null}

function commitCurrentKeepAnchor(opts={}){
 if(!S.cur)return false;
 let lp=lastPoint(S.cur);
 if(S.cur.type==="path")autoSmoothPath(S.cur,S.cur.closed);
 if(S.cur.type==="zone")S.cur.closed=true;
 if(hasEnough(S.cur)){
  hist();
  let s=clean(S.cur);
  if(s.type==="measure")finalizeMeasure(s);
  ensureShapeMeta(s,S.shapes.length);
  S.shapes.push(s);
  S.sel=s.id;
  setAnchor(opts.closed?null:(lp||lastPoint(s)));
  S.cur=null;
  sync();
  return true
 }
 setAnchor(lp);
 S.cur=null;
 sync();
 return false
}

function undoActivePoint(){
 if(!S.cur)return false;
 if(S.cur.type==="path"){
  if(S.cur.nodes.length){S.cur.nodes.pop(); if(S.cur.nodes.length>=2)autoSmoothPath(S.cur,S.cur.closed)}
  if(!S.cur.nodes.length)S.cur=null; else setAnchor(lastPoint(S.cur));
  sync();return true
 }
 if(S.cur.type==="poly"||S.cur.type==="mask"){
  if(S.cur.points.length)S.cur.points.pop();
  if(!S.cur.points.length)S.cur=null; else setAnchor(lastPoint(S.cur));
  sync();return true
 }
 if(S.cur.type==="line"||S.cur.type==="measure"||S.cur.type==="rect"||S.cur.type==="circle"){
  setAnchor(lastPoint(S.cur));
  S.cur=null;
  sync();return true
 }
 return false
}

function startWithAnchor(p, maker){
 let a=S.anchor?clone(S.anchor):null;
 S.anchor=null;
 return maker(a||p,p,!!a)
}

function setTool(t){
 if(S.cur)commitCurrentKeepAnchor();
 S.tool=t;
 $("toolS").textContent="tool: "+t+(S.anchor?`  anchor:${S.anchor.x.toFixed(1)},${S.anchor.y.toFixed(1)}`:"");
 document.querySelectorAll("#tools button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
 draw()
}

function loadImg(f){if(!f)return;if(f.type==="image/svg+xml"||/\.svg$/i.test(f.name||"")){loadSvgTraceFile(f);return}S.svgTrace=svgTraceDefaults();let r=new FileReader();r.onload=e=>loadData(e.target.result,f.name);r.readAsDataURL(f)}

function sanitizedImageDataUrl(data){
 let value=String(data||"");
 if(!/^data:image\/svg\+xml(?:[;,])/i.test(value))return value;
 let comma=value.indexOf(",");if(comma<0)throw new Error("Invalid embedded SVG data URL.");
 let meta=value.slice(0,comma),payload=value.slice(comma+1),text=/;base64/i.test(meta)?atob(payload):decodeURIComponent(payload);
 return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(safeSvgText(text))
}

function loadData(data,name,done=null,fitView=true,imageMeta=null){
 try{data=sanitizedImageDataUrl(data)}catch(error){alert("Could not load embedded SVG image: "+error.message);return}
 let im=new Image();
 im.onload=()=>{
  let width=Number(imageMeta?.width),height=Number(imageMeta?.height);
  if(!(Number.isFinite(width)&&width>0))width=im.naturalWidth;
  if(!(Number.isFinite(height)&&height>0))height=im.naturalHeight;
  S.img={name,width,height,dataUrl:data,_im:im,sourceViewBox:Array.isArray(imageMeta?.source_view_box)?clone(imageMeta.source_view_box):null};
  if(fitView)fit();
  if(done)done(im);
  sync()
 };
 im.onerror=()=>alert("Could not load embedded project image.");
 im.src=data
}

function fit(){if(!S.img)return;let r=stage.getBoundingClientRect(),s=Math.min(r.width/S.img.width,r.height/S.img.height)*.92;S.view.s=s;S.view.x=(r.width-S.img.width*s)/2;S.view.y=(r.height-S.img.height*s)/2;draw()}

function one(){S.view={s:1,x:40,y:40};draw()}

const AXIS_OPTIONS=[
 ["+image_x","→ image right"],["-image_x","← image left"],
 ["+image_y","↓ image down"],["-image_y","↑ image up"],
 ["+out_of_screen","⊙ screen out"],["-into_screen","⊗ screen in"]
];

function axisBase(v){v=String(v||"");if(v.includes("image_x"))return"image_x";if(v.includes("image_y"))return"image_y";return"screen_z"}

function axisSign(v){return String(v||"").startsWith("-")?-1:1}

function axisVec2(v){let b=axisBase(v),sg=axisSign(v);if(b==="image_x")return{x:sg,y:0};if(b==="image_y")return{x:0,y:sg};return null}

function axisLabel(k,v){let lab=AXIS_OPTIONS.find(o=>o[0]===v)?.[1]||v;return k.toUpperCase()+" "+lab}

function populateAxisSelects(){
 ["xdir","ydir","zdir"].forEach(id=>{
  let el=$(id); if(!el||el.dataset.ready)return;
  el.innerHTML=AXIS_OPTIONS.map(o=>`<option value="${o[0]}">${id[0].toUpperCase()} ${o[1]}</option>`).join("");
  el.dataset.ready="1";
 })
}

function enforceAxes(changed){
 S.frame.axes=S.frame.axes||{x:"+image_x",y:"+image_y",z:"+out_of_screen"};
 const keys=["x","y","z"];
 const defaults={image_x:"+image_x",image_y:"+image_y",screen_z:"+out_of_screen"};
 let used={};
 for(let k of keys){
  let b=axisBase(S.frame.axes[k]);
  if(used[b]&&k!==changed){
   let free=["image_x","image_y","screen_z"].find(bb=>!Object.values(used).includes(bb)&&bb!==axisBase(S.frame.axes[changed]));
   S.frame.axes[k]=defaults[free||"screen_z"];
   b=axisBase(S.frame.axes[k]);
  }
  used[k]=b;
 }
 if(changed){
  let cb=axisBase(S.frame.axes[changed]);
  for(let k of keys){
   if(k!==changed&&axisBase(S.frame.axes[k])===cb){
    let usedBases=keys.filter(q=>q!==k).map(q=>axisBase(S.frame.axes[q]));
    let free=["image_x","image_y","screen_z"].find(bb=>!usedBases.includes(bb));
    S.frame.axes[k]=defaults[free||"screen_z"];
   }
  }
 }
}

function updateAxisUI(){
 populateAxisSelects(); enforceAxes();
 if($("xdir"))$("xdir").value=S.frame.axes.x||"+image_x";
 if($("ydir"))$("ydir").value=S.frame.axes.y||"+image_y";
 if($("zdir"))$("zdir").value=S.frame.axes.z||"+out_of_screen";
}

function stationOrientation(){
 let v=axisVec2(S.frame.axes.x);
 if(v&&Math.abs(v.y)>Math.abs(v.x))return"horizontal";
 return"vertical";
}

function stationCoordFromPoint(p,ori=stationOrientation()){return ori==="horizontal"?p.y:p.x}

function stationOriginCoord(ori=stationOrientation()){let o=S.frame.origin||{x:0,y:0};return ori==="horizontal"?o.y:o.x}

function stationLineEnds(coord,ori=stationOrientation()){
 let w=S.img?.width||1000,h=S.img?.height||1000;
 return ori==="horizontal"?{x1:0,y1:coord,x2:w,y2:coord}:{x1:coord,y1:0,x2:coord,y2:h}
}
