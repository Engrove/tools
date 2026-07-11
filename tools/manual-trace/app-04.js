/**
 * AI-CODING NOTE:
 * Responsibility: Manual Trace shared state and function definitions, chunk 5 of 7.
 * Dependency: Classic scripts share one global lexical environment and must load in numeric order.
 * Safe edits: Preserve identifiers, ordering, schemas, provenance, and browser-local behavior.
 * Do not: Load independently, reorder scripts, or weaken SVG sanitization.
 */
"use strict";
function defaultShapeDescription(s,i){
 let role=s.role||"trace";
 if(s.type==="path")return`Manual Bezier/Pen trace object ${i}; editable JSON source for one smooth cubic Bezier contour. SVG renders it as a <path> in the overlay.`;
 if(s.type==="poly")return`Manual polyline trace object ${i}; editable JSON points[] source. SVG renders it as a <polyline> or <polygon>.`;
 if(s.type==="line")return`Manual straight line object ${i}; editable JSON points[0..1] source. SVG renders it as a path with M/L commands.`;
 if(s.type==="measure")return`Measurement line ${i}; may define or use the scale reference. SVG renders it as a line with length metadata.`;
 if(s.type==="station")return`Station line ${i}; defines a ${s.orientation||"vertical"} station tied to trace_frame.origin and spacing. SVG renders it as a line.`;
 if(s.type==="zone")return`Named semantic zone ${i}; closed translucent polygon with at least 3 points. It marks an area for downstream AI context and may overlap other zones. SVG renders it as a permanent transparent polygon overlay.`;
 if(s.type==="mask")return`Ignore/mask polygon ${i}; marks non-target or occlusion regions. SVG renders it as a polyline/polygon.`;
 if(s.type==="rect")return`Rectangle object ${i}; editable JSON x/y/w/h source. SVG renders it as a rect.`;
 if(s.type==="circle")return`Circle object ${i}; editable JSON cx/cy/r source. SVG renders it as a circle.`;
 return`Manual ${role} object ${i}; SVG group id equals JSON shape id.`
}

function svgBindingForShape(s,i){
 return{
  stable_join_key:"shape.id",
  json_path:`$.shapes[${i}]`,
  json_id:s.id,
  svg_group_id:s.id,
  svg_selector:`g#${s.id}`,
  svg_data_json_id:s.id,
  svg_data_json_path:`$.shapes[${i}]`,
  svg_data_type:s.type,
  rendered_svg_element:svgElementKind(s),
  coordinate_space:"image_px_top_left_origin_y_down",
  note:"The SVG group with this id/data-json-id is the visual overlay rendering of this exact JSON shape."
 }
}

function traceDescription(){
 return{
  sv:"Engrove Manual Trace JSON är den redigerbara datamodellen. Matchande SVG är den visuella overlayn/renderingen av exakt samma data ovanpå exakt samma bild. JSON äger koordinaterna; SVG visar dem visuellt. AI ska koppla JSON och SVG via shape.id ↔ SVG <g id> / data-json-id och ska inte försöka gissa kopplingen från bilden.",
  en:"The Engrove Manual Trace JSON is the editable source data model. The matching SVG is the visual overlay/rendering of the exact same data on the exact same image. JSON owns the coordinates; SVG shows them visually. An AI reader must join JSON and SVG by shape.id ↔ SVG <g id> / data-json-id and must not infer the relationship visually.",
  file_pair_contract:{
   purpose:"The JSON and SVG form a paired export. Keep both files together when asking AI to interpret the trace.",
   source_of_truth:"JSON coordinates are authoritative for editable geometry. SVG is the visual overlay/proof and contains metadata that repeats the JSON/SVG binding.",
   primary_join_key:"shape.id",
   json_to_svg:"For each JSON shape at $.shapes[index], find SVG <g id='{shape.id}' data-json-id='{shape.id}' data-json-path='$.shapes[index]'>.",
   svg_to_json:"For each SVG group with data-json-id, find the JSON shape with the same id.",
   image_alignment:"Both files use the same image pixel coordinate frame: top-left origin, x right, y down before trace_frame engineering axes are applied."
  },
  pairing:{
   json_default_filename:"engrove_manual_trace.json",
   svg_default_filename:"engrove_manual_trace.svg",
   stable_join_key:"shape.id",
   svg_group_rule:"Each exported SVG shape is wrapped in <g id='{shape.id}' data-json-id='{shape.id}' data-json-path='$.shapes[index]' data-type='{shape.type}'>...</g>.",
   image_rule:"If image.dataUrl is included in JSON, the same image is embedded in SVG as <image>; otherwise image.name/width/height still define the common image coordinate frame."
  },
  coordinate_contract:{
   coordinate_space:"image_px_top_left_origin_y_down",
   origin:"trace_frame.origin defines the user-selected engineering origin in image pixels; stations are measured relative to this origin when present.",
   axes:S.frame.axes,
   scale:S.frame.scale,
   ai_reading_order:["Read description.pairing and description.shape_type_mapping.","Read image width/height and trace_frame origin/axes/scale.","For every shape, join JSON shape.id to SVG g#id or data-json-id.","Use JSON coordinates as editable/source geometry; use SVG as visual proof/overlay.","Use shape.description, role, name and type to classify contours, stations, masks and measurements."]
  },
  metadata_contract:{object_name:"Every shape has a system-created default name that may be replaced by the operator.",description:"Every selected object can carry a free-text description for AI/CAD interpretation.",references:"references[] stores semantic relations such as parallel_to, perpendicular_to, center_of, tangent_to, aligned_with, offset_from, origin_at and proxy_for.",origin:"trace_frame.origin_metadata describes what the origin physically means, for example stylus_tip, pivot, cartridge_proxy or headshell_datum."},
  auto_trace_contract:{source:"SVG geometry is detected directly from vector objects, not inferred from raster pixels.",candidate_status:"Each detected object is include/ignore and may be traced or updated independently.",correction:"Generated poly/path objects remain editable with Select/Edit, Add Node, Delete Node, Smart Simplify and Reverse."},
  shape_type_mapping:{
   path:"JSON nodes[] with in/out handles -> SVG <path d='M ... C ...'>.",
   poly:"JSON points[] -> SVG <polyline> or <polygon>.",
   line:"JSON points[0..1] -> SVG <path d='M ... L ...'>.",
   measure:"JSON points[0..1] plus length/scale metadata -> SVG <line> with data-length-px/data-real-length.",
   station:"JSON orientation with canonical x/y and synchronized x1/y1/x2/y2 plus station_index -> SVG <line>.",
   rect:"JSON x/y/w/h -> SVG <rect>.",
   circle:"JSON cx/cy/r -> SVG <circle>.",
   mask:"JSON points[] ignore/occlusion mask -> SVG <polyline> or <polygon>."
  },
  claim_boundary:"Manual trace data may express object understanding and geometry intent. It is not CAD/metrology truth unless calibration, scale, station/origin, masks and point placement are verified."
 }
}

function enrichShapeForExport(s,i){
 let c=clone(s);
 normalizeStationGeometry(c);
 c.description=c.description||defaultShapeDescription(c,i);
 c.svg_binding=svgBindingForShape(c,i);
 c.geometry_summary=shapeGeomSummary(c);
 if(c.type==="path")c.sampled_polyline_64=samplePathCount(c,64);
 return c
}

function outObj(inc=false){
 ensureAllMeta();updateMeasurements();repairSvgTraceLinks();
 let at=ensureSvgTrace();
 return{
  schema_version:S.schema_version,
  producer:{name:"Engrove Manual Trace Tool",version:APP_VERSION},
  description:traceDescription(),
  coordinate_space:"image_px_top_left_origin_y_down",
  image:S.img?{name:S.img.name,width:S.img.width,height:S.img.height,source_view_box:S.img.sourceViewBox||undefined,dataUrl:inc?S.img.dataUrl:undefined}:null,
  view:S.view,
  trace_frame:clone(S.frame),
  auto_trace:{source_name:at.sourceName,settings:clone(at.settings),candidate_count:at.candidates.length,candidates:at.candidates.map(c=>({id:c.id,label:c.label,element_id:c.elementId||null,tag:c.tag,status:c.status,traced_shape_id:c.tracedShapeId,closed:c.closed,area_px2:c.area,length_px:c.length,bbox:c.bbox}))},
  selectedId:S.sel,
  shapes:S.shapes.map((s,i)=>enrichShapeForExport(s,i))
 }
}

function sync(j=true){ensureAllMeta();ensureSvgTrace();updateAxisUI();if(j)json.value=JSON.stringify(outObj(false),null,2);$("imgS").textContent=(S.project_meta?.name?`project:${S.project_meta.name} · `:"")+(S.img?`${S.img.name} ${S.img.width}×${S.img.height}px`:"no image")+(S.svgTrace.candidates.length?` · SVG objects:${S.svgTrace.candidates.length}`:"");$("selS").textContent="selection:"+(S.sel||"none")+(S.anchor?` anchor:${S.anchor.x.toFixed(1)},${S.anchor.y.toFixed(1)}`:"")+(S.frame.scale?.px_per_unit?` scale:${S.frame.scale.unit_per_px.toFixed(6)} ${S.frame.scale.unit||"mm"}/px`:" scale:unset");$("toolS").textContent="tool: "+S.tool;list();updateProps();renderAutoTracePanel();draw()}

function list(){let el=$("list");el.innerHTML="";ensureAllMeta();if(S.frame.origin){let d=document.createElement("div");d.className="item"+(S.sel===ORIGIN_SEL?" on":"");d.textContent=(S.frame.origin_metadata?.name||"origin")+"  trace_frame.origin";d.onclick=()=>{S.sel=ORIGIN_SEL;sync()};el.appendChild(d)}S.shapes.forEach(s=>{let d=document.createElement("div");d.className="item"+(s.id===S.sel?" on":"");d.textContent=s.type==="measure"?`${s.name||s.type} ${s.id}  ${(s.real_length?Number(s.real_length).toFixed(3)+" "+(s.unit||""):"no-scale")}`:`${s.name||s.type}  ${s.id}`;d.onclick=()=>{S.sel=s.id;sync()};el.appendChild(d)})}

function apply(){
 try{
  let o=JSON.parse(json.value);hist();
  S.shapes=Array.isArray(o.shapes)?o.shapes:[];
  S.frame=o.trace_frame||o.frame||S.frame;
  S.sel=o.selectedId||null;
  if(o.auto_trace)applyAutoTraceSummary(o.auto_trace);
  ensureAllMeta();repairSvgTraceLinks();
  if(o.image?.dataUrl)loadData(o.image.dataUrl,o.image.name||"json-image",null,true,o.image);
  else sync()
 }catch(e){alert("JSON parse error: "+e.message)}
}

const APP_VERSION="18", PROJECT_SCHEMA="engrove_trace_project_v2";

function safeFileBase(s){
 return String(s||"engrove_trace_project").replace(/\.[^.]+$/ ,"").normalize("NFKD").replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)||"engrove_trace_project"
}

function isProjectPackage(o){
 return !!(o&&typeof o==="object"&&(o.package_type==="engrove_trace_project"||o.schema_version===PROJECT_SCHEMA))
}

function projectPayload(){
 ensureAllMeta();updateMeasurements();repairSvgTraceLinks();
 const now=new Date().toISOString();
 S.project_meta=S.project_meta||{name:"",created_at:null,updated_at:null};
 S.project_meta.created_at=S.project_meta.created_at||now;
 S.project_meta.updated_at=now;
 return{
  package_type:"engrove_trace_project",
  schema_version:PROJECT_SCHEMA,
  source_app:{name:"Engrove Manual Trace Tool",version:APP_VERSION,geometry_schema:S.schema_version},
  project:clone(S.project_meta),
  saved_at:now,
  image:S.img?{name:S.img.name,width:S.img.width,height:S.img.height,source_view_box:S.img.sourceViewBox||undefined,dataUrl:S.img.dataUrl}:null,
  workspace:{
   shapes:clone(S.shapes),
   current_object:S.cur?clone(S.cur):null,
   selected_id:S.sel,
   tool:S.tool,
   anchor:S.anchor?clone(S.anchor):null,
   view:clone(S.view),
   trace_frame:clone(S.frame),
   settings:{grid:!!S.grid,points:!!S.pts,snap:!!S.snap,measure_snap:!!S.measureSnap,snap_px:S.snapPx},
   svg_trace:clone(ensureSvgTrace()),
   history:clone(S.hist),
   future:clone(S.fut)
  }
 }
}

function applyProjectPackage(o,fileName="project.engrove-trace"){
 if(!isProjectPackage(o))throw new Error("Not an Engrove project package.");
 let w=o.workspace||{}, settings=w.settings||{}, savedView=clone(w.view||{s:1,x:0,y:0});
 S.schema_version=o.source_app?.geometry_schema||S.schema_version;
 S.project_meta=clone(o.project||{name:safeFileBase(fileName),created_at:o.saved_at||null,updated_at:o.saved_at||null});
 S.shapes=Array.isArray(w.shapes)?clone(w.shapes):[];
 S.cur=w.current_object&&typeof w.current_object==="object"?clone(w.current_object):null;
 S.sel=w.selected_id??null;
 S.tool=typeof w.tool==="string"?w.tool:"select";
 S.anchor=w.anchor?clone(w.anchor):null;
 S.view=savedView;
 S.frame=clone(w.trace_frame||w.frame||S.frame);
 S.grid=settings.grid!==undefined?!!settings.grid:true;
 S.pts=settings.points!==undefined?!!settings.points:true;
 S.snap=settings.snap!==undefined?!!settings.snap:true;
 S.measureSnap=settings.measure_snap!==undefined?!!settings.measure_snap:true;
 S.snapPx=Number.isFinite(settings.snap_px)?settings.snap_px:14;
 S.svgTrace=w.svg_trace?clone(w.svg_trace):svgTraceDefaults();
 S.hist=Array.isArray(w.history)?clone(w.history):[];
 S.fut=Array.isArray(w.future)?clone(w.future):[];
 S.drag=null;S.space=false;S.snapHit=null;
 ensureAllMeta();repairSvgTraceLinks();
 $("grid").checked=S.grid;$("pts").checked=S.pts;$("snap").checked=S.snap;$("msnap").checked=S.measureSnap;
 document.querySelectorAll("#tools button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.tool));
 const finishRestore=()=>{S.view=savedView;syncLayout();sync()};
 if(o.image?.dataUrl)loadData(o.image.dataUrl,o.image.name||fileName,finishRestore,false,o.image);
 else{S.img=null;finishRestore()}
}

function applyTraceObject(o,fileName="trace.json"){
 if(isProjectPackage(o)){applyProjectPackage(o,fileName);return}
 hist();
 S.project_meta={name:safeFileBase(fileName),created_at:null,updated_at:null};
 S.shapes=Array.isArray(o.shapes)?clone(o.shapes):[];
 S.cur=null;
 S.frame=clone(o.trace_frame||o.frame||S.frame);
 S.sel=o.selectedId||null;
 S.anchor=null;
 S.svgTrace=importAutoTraceSummary(o.auto_trace);
 ensureAllMeta();repairSvgTraceLinks();
 if(o.image?.dataUrl)loadData(o.image.dataUrl,o.image.name||fileName,null,true,o.image);
 else sync()
}

function loadJ(f){
 if(!f)return;
 let r=new FileReader();
 r.onload=e=>{try{applyTraceObject(JSON.parse(e.target.result),f.name)}catch(err){alert("Open error: "+err.message)}};
 r.readAsText(f)
}

function loadProject(f){
 if(!f)return;
 let r=new FileReader();
 r.onload=e=>{try{let o=JSON.parse(e.target.result);applyProjectPackage(o,f.name)}catch(err){alert("Project open error: "+err.message)}};
 r.readAsText(f)
}

function dl(name,txt,type){let b=new Blob([txt],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}

function saveProject(){
 let suggested=S.project_meta?.name||safeFileBase(S.img?.name||"engrove_trace_project");
 let name=prompt("Project name",suggested);
 if(name===null)return;
 name=name.trim()||suggested;
 S.project_meta=S.project_meta||{};
 S.project_meta.name=name;
 let pkg=projectPayload();
 dl(safeFileBase(name)+".engrove-trace",JSON.stringify(pkg,null,2),"application/json")
}

function save(){dl("engrove_manual_trace.json",JSON.stringify(outObj($("incImg").checked),null,2),"application/json")}

function escapeXml(s){return String(s).replace(/[<>&"']/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;"}[c]))}

function ssvg(s){if(s.type==="station"){let ori=s.orientation||"vertical";return ori==="horizontal"?`<line x1="${s.x1??0}" y1="${s.y??s.y1??0}" x2="${s.x2??(S.img?.width||1000)}" y2="${s.y??s.y1??0}"/>`:`<line x1="${s.x}" y1="${s.y1??0}" x2="${s.x}" y2="${s.y2??(S.img?.height||1000)}"/>`};if(s.type==="line")return`<path d="M ${s.points[0].x} ${s.points[0].y} L ${s.points[1].x} ${s.points[1].y}"/>`;if(s.type==="measure")return`<line x1="${s.points[0].x}" y1="${s.points[0].y}" x2="${s.points[1].x}" y2="${s.points[1].y}" data-length-px="${s.length_px||measureLen(s)}" data-real-length="${s.real_length||""}" data-unit="${s.unit||""}" data-scale-reference="${s.is_scale_reference?1:0}"/>`;if(s.type==="rect")return`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/>`;if(s.type==="circle")return`<circle cx="${s.cx}" cy="${s.cy}" r="${Math.abs(s.r)}"/>`;if(s.type==="poly"||s.type==="mask"||s.type==="zone"){let tag=(s.closed||s.type==="zone")?"polygon":"polyline";return`<${tag} points="${s.points.map(p=>p.x+","+p.y).join(" ")}"/>`}if(s.type==="path"){let d=`M ${s.nodes[0].x} ${s.nodes[0].y}`;for(let i=1;i<s.nodes.length;i++){let a=s.nodes[i-1],b=s.nodes[i],c1=a.out||a,c2=b.in||b;d+=` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`}if(s.closed){let a=s.nodes.at(-1),b=s.nodes[0],c1=a.out||a,c2=b.in||b;d+=` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y} Z`}return`<path d="${d}"/>`}return""}
