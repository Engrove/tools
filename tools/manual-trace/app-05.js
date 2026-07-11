/**
 * AI-CODING NOTE:
 * Responsibility: Manual Trace shared state and function definitions, chunk 6 of 7.
 * Dependency: Classic scripts share one global lexical environment and must load in numeric order.
 * Safe edits: Preserve identifiers, ordering, schemas, provenance, and browser-local behavior.
 * Do not: Load independently, reorder scripts, or weaken SVG sanitization.
 */
"use strict";
function saveSvg(){
 let w=S.img?.width||1000,h=S.img?.height||700;
 let exported=outObj(false);
 let img=S.img?`<image id="trace_reference_image" data-json-path="$.image" href="${S.img.dataUrl}" x="0" y="0" width="${w}" height="${h}" opacity=".35"/>`:"";
 let meta=`<metadata id="engrove_trace_json_binding">${escapeXml(JSON.stringify({
  schema_version:S.schema_version,
  producer:{name:"Engrove Manual Trace Tool",version:APP_VERSION},
  description:exported.description,
  coordinate_space:"image_px_top_left_origin_y_down",
  image:exported.image,
  trace_frame:S.frame,
  shapes:exported.shapes.map(s=>({id:s.id,type:s.type,name:s.name||"",role:s.role||"",description:s.description,semantic:s.semantic||{},references:s.references||[],svg_binding:s.svg_binding,geometry_summary:s.geometry_summary}))
 },null,2))}</metadata>`;
 let om=S.frame.origin_metadata||{};
 let origin=S.frame.origin?`<g id="trace_origin" data-type="origin" data-json-path="$.trace_frame.origin" data-name="${escapeXml(om.name||"origin")}" data-location-role="${escapeXml(om.location_role||"unspecified")}" data-description="${escapeXml(om.description||"")}" fill="none" stroke="#ff4d6d"><title>${escapeXml((om.name||"origin")+" — "+(om.description||""))}</title><circle cx="${S.frame.origin.x}" cy="${S.frame.origin.y}" r="7"/><path d="M ${S.frame.origin.x-12} ${S.frame.origin.y} L ${S.frame.origin.x+12} ${S.frame.origin.y} M ${S.frame.origin.x} ${S.frame.origin.y-12} L ${S.frame.origin.x} ${S.frame.origin.y+12}"/></g>`:"";
 let sh=S.shapes.map((s,i)=>{
  let b=svgBindingForShape(s,i);
  return`<g id="${escapeXml(s.id)}" data-json-id="${escapeXml(s.id)}" data-json-path="${escapeXml(b.json_path)}" data-shape-index="${i}" data-type="${escapeXml(s.type)}" data-role="${escapeXml(s.role||"")}" data-name="${escapeXml(s.name||"")}" data-description="${escapeXml(s.description||"")}" data-feature-kind="${escapeXml(s.semantic?.feature_kind||"")}" data-reference-count="${(s.references||[]).length}" data-rendered-element="${escapeXml(b.rendered_svg_element)}" fill="${escapeXml(s.type==="zone"?(s.style?.fill||C.zone):"none")}" fill-opacity="${s.type==="zone"?(s.style?.fill_alpha??0.18):0}" stroke="${escapeXml(s.style?.stroke||C[s.type]||C.path)}" stroke-opacity="${s.type==="zone"?(s.style?.stroke_alpha??0.95):1}" stroke-width="${s.style?.width||1.4}" data-zone="${s.type==="zone"?1:0}" data-station-index="${s.station_index??""}"><title>${escapeXml((s.name||s.id)+" — "+(s.description||""))}</title>${ssvg(s)}</g>`
 }).join("\n");
 dl("engrove_manual_trace.svg",`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${meta}${img}${origin}${sh}</svg>`,"image/svg+xml")
}

function del(){if(!S.sel)return;if(S.sel===ORIGIN_SEL){hist();S.frame.origin=null;ensureFrameMeta();S.sel=null;sync();return}hist();S.shapes=S.shapes.filter(s=>s.id!==S.sel);S.sel=null;sync()}

function smoothSelected(){
 let s=sel();if(!s)return;hist();
 if(s.type==="path"){
  s.nodes.forEach(n=>{n.auto=true;n.mode="smooth"});autoSmoothPath(s,s.closed)
 }else if(s.type==="poly"){
  let ns=s.points.map(p=>({x:p.x,y:p.y,in:{x:p.x,y:p.y},out:{x:p.x,y:p.y},auto:true,mode:"smooth"}));
  let repl={...clone(s),id:s.id,type:"path",name:(s.name||"poly").endsWith("_smooth_path")?(s.name||"poly"):(s.name||"poly")+"_smooth_path",closed:!!s.closed,nodes:ns};
  delete repl.points;
  repl.style={...(s.style||{}),stroke:C.path,width:s.style?.width||1.4};
  repl.semantic={...(s.semantic||{}),display_name:repl.name,feature_kind:s.semantic?.feature_kind||"outer_contour"};
  repl.description=s.description||`Smoothed Bezier trace converted from ${s.name||s.id}.`;
  autoSmoothPath(repl,repl.closed);ensureShapeMeta(repl,S.shapes.findIndex(x=>x.id===s.id));
  let ix=S.shapes.findIndex(x=>x.id===s.id);S.shapes[ix]=repl;S.sel=repl.id
 }else return;
 repairSvgTraceLinks();sync()
}

function stations(){
 if(!S.img)return;
 let o=S.frame.origin||{x:S.img.width/2,y:S.img.height/2};
 if(!S.frame.origin){S.frame.origin=clone(o)}
 let spacing=parseFloat(prompt("Station spacing in image pixels", S.frame.station_spacing_px||Math.round(S.img.width/10)));
 if(!Number.isFinite(spacing)||spacing<=0)return;
 let count=parseInt(prompt("Number of stations each side of origin", 10),10);
 if(!Number.isFinite(count)||count<0)return;
 hist();
 S.frame.station_spacing_px=spacing;
 let ori=stationOrientation();
 if(confirm("Remove existing station objects before creating new grid?"))S.shapes=S.shapes.filter(s=>s.type!=="station"&&s.role!=="station_grid");
 for(let i=-count;i<=count;i++){
  let coord=stationOriginCoord(ori)+i*spacing;
  let ends=stationLineEnds(coord,ori);
  S.shapes.push({id:id("station"),type:"station",name:stationName(i),role:"station",station_index:i,orientation:ori,origin_ref:clone(o),spacing_px:spacing,style:{stroke:i===0?"#ff4d6d":"#5d7cff",width:i===0?1.3:.9},...ends,...(ori==="horizontal"?{y:coord}:{x:coord})})
 }
 sync()
}

function clearTrace(){
 if(!confirm("Clear all trace objects, points, stations, measurements, origin and scale? Image is kept."))return;
 hist();
 S.shapes=[];S.cur=null;S.sel=null;S.anchor=null;
 S.frame={origin:null,origin_metadata:{id:"trace_frame.origin",name:"origin",role:"datum",kind:"origin",location_role:"unspecified",description:"AI/CAD origin. Set location_role to stylus_tip, pivot, cartridge_proxy or another explicit datum.",references:[]},axes:S.frame.axes||{x:"+image_x",y:"+image_y",z:"+out_of_screen"},station_spacing_px:null,scale:{reference_measure_id:null,unit:"mm",px_per_unit:null,unit_per_px:null,source_length_px:null,source_real_length:null}};
 sync()
}

function syncLayout(){
 const bar=$("bar"), side=$("side"), main=$("main"), btn=$("sideToggle");
 if(bar)document.documentElement.style.setProperty("--bar-h",bar.getBoundingClientRect().height+"px");
 if(main&&side)main.classList.toggle("side-collapsed",side.classList.contains("collapsed"));
 if(btn&&side)btn.classList.toggle("on",!side.classList.contains("collapsed"));
 setTimeout(size,0)
}

function toggleSide(){
 const side=$("side");
 if(!side)return;
 side.classList.toggle("collapsed");
 syncLayout()
}

function setInspectorTab(tab){
 document.querySelectorAll("[data-inspector-tab]").forEach(b=>b.classList.toggle("on",b.dataset.inspectorTab===tab));
 document.querySelectorAll(".inspector-panel").forEach(p=>p.classList.toggle("active",p.id==="panel"+tab.charAt(0).toUpperCase()+tab.slice(1)));
 const side=$("side");
 if(side&&side.classList.contains("collapsed")){side.classList.remove("collapsed");syncLayout()}
}

const PANEL_LAYOUT_KEY="engrove_trace_v17_layout";

const PANEL_DEFAULTS={rail:94,inspector:390};

function panelLayoutLimits(){
 const vw=Math.max(720,window.innerWidth||1200);
 const rootStyle=getComputedStyle(document.documentElement);
 const rail=parseFloat(rootStyle.getPropertyValue("--rail"))||PANEL_DEFAULTS.rail;
 const inspector=parseFloat(rootStyle.getPropertyValue("--inspector"))||PANEL_DEFAULTS.inspector;
 const minimumCanvas=Math.min(720,Math.max(480,vw*.42));
 return{
  railMin:84,
  railMax:Math.max(110,Math.min(190,vw-inspector-minimumCanvas-20)),
  inspectorMin:330,
  inspectorMax:Math.max(360,Math.min(640,vw-rail-minimumCanvas-20))
 }
}

function clampPanelValue(value,min,max){return Math.max(min,Math.min(max,value))}

function readPanelWidth(name){
 return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--"+name))||
  PANEL_DEFAULTS[name]
}

function savePanelLayout(){
 try{
  localStorage.setItem(PANEL_LAYOUT_KEY,JSON.stringify({
   rail:Math.round(readPanelWidth("rail")),
   inspector:Math.round(readPanelWidth("inspector"))
  }))
 }catch(_){}
}

function updatePanelSeparatorAria(){
 const lim=panelLayoutLimits();
 const left=$("leftResizer"),right=$("rightResizer");
 if(left){
  left.setAttribute("aria-valuemin",String(Math.round(lim.railMin)));
  left.setAttribute("aria-valuemax",String(Math.round(lim.railMax)));
  left.setAttribute("aria-valuenow",String(Math.round(readPanelWidth("rail"))))
 }
 if(right){
  right.setAttribute("aria-valuemin",String(Math.round(lim.inspectorMin)));
  right.setAttribute("aria-valuemax",String(Math.round(lim.inspectorMax)));
  right.setAttribute("aria-valuenow",String(Math.round(readPanelWidth("inspector"))))
 }
}

function applyPanelWidth(name,value,persist=true){
 const lim=panelLayoutLimits();
 const bounds=name==="rail"?[lim.railMin,lim.railMax]:[lim.inspectorMin,lim.inspectorMax];
 const next=clampPanelValue(value,bounds[0],bounds[1]);
 document.documentElement.style.setProperty("--"+name,next+"px");
 updatePanelSeparatorAria();
 if(persist)savePanelLayout();
 size()
}

function restorePanelLayout(){
 let saved=null;
 try{saved=JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY)||"null")}catch(_){}
 if(saved&&Number.isFinite(saved.rail))applyPanelWidth("rail",saved.rail,false);
 if(saved&&Number.isFinite(saved.inspector))applyPanelWidth("inspector",saved.inspector,false);
 updatePanelSeparatorAria()
}

function installPanelResizer(id,name,direction){
 const handle=$(id);
 if(!handle)return;
 let startX=0,startWidth=0,active=false;
 const finish=()=>{
  if(!active)return;
  active=false;
  handle.classList.remove("dragging");
  document.body.classList.remove("panel-resizing");
  savePanelLayout();
  size()
 };
 handle.addEventListener("pointerdown",e=>{
  if(e.button!==0)return;
  active=true;
  startX=e.clientX;
  startWidth=readPanelWidth(name);
  handle.classList.add("dragging");
  document.body.classList.add("panel-resizing");
  handle.setPointerCapture?.(e.pointerId);
  e.preventDefault()
 });
 handle.addEventListener("pointermove",e=>{
  if(!active)return;
  const delta=(e.clientX-startX)*direction;
  applyPanelWidth(name,startWidth+delta,false);
  e.preventDefault()
 });
 handle.addEventListener("pointerup",finish);
 handle.addEventListener("pointercancel",finish);
 handle.addEventListener("dblclick",()=>{
  applyPanelWidth(name,PANEL_DEFAULTS[name],true)
 });
 handle.addEventListener("keydown",e=>{
  const step=e.shiftKey?24:8;
  let delta=0;
  if(e.key==="ArrowLeft")delta=-step*direction;
  if(e.key==="ArrowRight")delta=step*direction;
  if(!delta)return;
  applyPanelWidth(name,readPanelWidth(name)+delta,true);
  e.preventDefault()
 })
}
