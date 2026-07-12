/**
 * AI-CODING NOTE:
 * Responsibility: Top-bar menu coordination, unsaved-work detection, destructive-action protection, transient geometry-state protection, and CAD-style continuation/snap policy, chunk 8 of 8.
 * Dependency: Loads after all core Manual Trace state, persistence, and event-binding scripts.
 * Safe edits: Preserve native <details> behavior, browser-native beforeunload semantics, normal object-level editing, visible geometry continuation state, and explicit object-snap control.
 */
"use strict";

if(S.continueLastPoint===undefined)S.continueLastPoint=false;

function installCadSnapControls(){
 const snapControl=$("snap");
 const snapLabel=snapControl?.closest("label");
 if(snapControl){
  snapControl.title="Snap creation points to existing geometry points. Hold Alt to bypass.";
  if(snapLabel){
   snapLabel.title=snapControl.title;
   const textNode=[...snapLabel.childNodes].find(node=>node.nodeType===3);
   if(textNode)textNode.textContent=" Object snap"
  }
 }
 let control=$("continueLast");
 if(control)return control;
 const snapRow=snapControl?.closest(".rowline");
 if(!snapRow?.parentNode)return null;
 const row=document.createElement("div");
 row.className="rowline";
 const label=document.createElement("label");
 label.title="When enabled, a completed object's final point becomes the start of the next geometry object.";
 control=document.createElement("input");
 control.id="continueLast";
 control.type="checkbox";
 const hint=document.createElement("span");
 hint.className="small";
 hint.textContent="Alt bypasses snap";
 label.append(control,document.createTextNode(" Continue from last point"));
 row.append(label,hint);
 snapRow.after(row);
 return control
}

const continueLastControl=installCadSnapControls();

function syncContinuationControl(){
 if(continueLastControl)continueLastControl.checked=!!S.continueLastPoint
}

document.querySelectorAll("#bar details.menu").forEach(menu=>{
 menu.addEventListener("toggle",()=>{
  if(!menu.open)return;
  document.querySelectorAll("#bar details.menu[open]").forEach(other=>{
   if(other!==menu)other.open=false
  })
 })
});

const workspaceProtectionEditors=["propName","propRole","propKind","propDesc","refNote","json"]
 .map(id=>$(id))
 .filter(Boolean);
const workspaceProtectionEditorBaselines=new Map();
let workspaceProtectionBaseline=null;
let workspaceProtectionPendingClean=false;
let workspaceProtectionGuardDepth=0;

function captureWorkspaceEditorBaselines(){
 workspaceProtectionEditors.forEach(control=>workspaceProtectionEditorBaselines.set(control,control.value))
}

function workspaceEditorHasDraftChanges(){
 return workspaceProtectionEditors.some(control=>control.value!==(workspaceProtectionEditorBaselines.get(control)??""))
}

function workspaceProtectionState(){
 const trace=S.svgTrace||{};
 return{
  imageDataUrl:S.img?.dataUrl||null,
  imageMeta:JSON.stringify(S.img?{
   name:S.img.name||"",
   width:Number(S.img.width)||0,
   height:Number(S.img.height)||0,
   sourceViewBox:S.img.sourceViewBox||null
  }:null),
  svgSourceText:trace.sourceText||null,
  workspace:JSON.stringify({
   schema_version:S.schema_version,
   project:{
    name:S.project_meta?.name||"",
    created_at:S.project_meta?.created_at||null
   },
   shapes:S.shapes||[],
   current_object:S.cur||null,
   anchor:S.anchor||null,
   trace_frame:S.frame||null,
   settings:{continueLastPoint:!!S.continueLastPoint},
   svg_trace:{
    sourceName:trace.sourceName||null,
    candidates:Array.isArray(trace.candidates)?trace.candidates:[],
    settings:trace.settings||null
   }
  })
 }
}

function workspaceProtectionStatesEqual(a,b){
 return !!a&&!!b&&
  a.imageDataUrl===b.imageDataUrl&&
  a.imageMeta===b.imageMeta&&
  a.svgSourceText===b.svgSourceText&&
  a.workspace===b.workspace
}

function workspaceHasMeaningfulContent(){
 const trace=S.svgTrace||{};
 return !!(
  S.img||
  S.cur||
  S.anchor||
  S.frame?.origin||
  (S.shapes&&S.shapes.length)||
  trace.sourceText||
  (trace.candidates&&trace.candidates.length)||
  workspaceEditorHasDraftChanges()
 )
}

function workspaceHasUnsavedChanges(){
 return workspaceEditorHasDraftChanges()||
  !workspaceProtectionStatesEqual(workspaceProtectionState(),workspaceProtectionBaseline)
}

function markWorkspaceProtectionClean(captureEditors=true){
 workspaceProtectionBaseline=workspaceProtectionState();
 if(captureEditors)captureWorkspaceEditorBaselines()
}

function confirmWorkspaceReplacement(action){
 if(!workspaceHasMeaningfulContent())return true;
 const message=workspaceHasUnsavedChanges()
  ?`The current project contains unsaved changes. ${action} will discard or replace them.\n\nSave the project first unless this is intentional. Continue?`
  :`${action} will replace or clear the current project/workspace.\n\nContinue?`;
 return window.confirm(message)
}

function runProtectedReplacement(action,fn,thisArg,args){
 if(workspaceProtectionGuardDepth===0&&!confirmWorkspaceReplacement(action))return false;
 workspaceProtectionGuardDepth++;
 try{return fn.apply(thisArg,args)}finally{workspaceProtectionGuardDepth--}
}

const syncWithoutWorkspaceProtection=sync;
sync=function(...args){
 const result=syncWithoutWorkspaceProtection.apply(this,args);
 syncContinuationControl();
 if(workspaceProtectionPendingClean){
  workspaceProtectionPendingClean=false;
  markWorkspaceProtectionClean(true)
 }else captureWorkspaceEditorBaselines();
 return result
};

const projectPayloadWithoutContinuationPolicy=projectPayload;
projectPayload=function(...args){
 const payload=projectPayloadWithoutContinuationPolicy.apply(this,args);
 payload.workspace=payload.workspace||{};
 payload.workspace.settings={
  ...(payload.workspace.settings||{}),
  continue_last_point:!!S.continueLastPoint
 };
 return payload
};

const applyProjectPackageWithoutWorkspaceProtection=applyProjectPackage;
applyProjectPackage=function(project,...rest){
 const savedSetting=project?.workspace?.settings?.continue_last_point;
 S.continueLastPoint=savedSetting===undefined?false:!!savedSetting;
 syncContinuationControl();
 let normalizedProject=project;
 if(!S.continueLastPoint&&project?.workspace?.anchor&&!project.workspace.current_object){
  normalizedProject=clone(project);
  normalizedProject.workspace.anchor=null
 }
 workspaceProtectionPendingClean=true;
 try{return applyProjectPackageWithoutWorkspaceProtection.call(this,normalizedProject,...rest)}
 catch(error){workspaceProtectionPendingClean=false;throw error}
};

const applyTraceObjectWithoutWorkspaceProtection=applyTraceObject;
applyTraceObject=function(traceObject,...rest){
 if(!isProjectPackage(traceObject)){
  S.continueLastPoint=false;
  syncContinuationControl()
 }
 workspaceProtectionPendingClean=true;
 try{return applyTraceObjectWithoutWorkspaceProtection.call(this,traceObject,...rest)}
 catch(error){workspaceProtectionPendingClean=false;throw error}
};

const loadImgWithoutWorkspaceProtection=loadImg;
loadImg=function(...args){
 return runProtectedReplacement("Loading another image",loadImgWithoutWorkspaceProtection,this,args)
};

const loadSvgTraceFileWithoutWorkspaceProtection=loadSvgTraceFile;
loadSvgTraceFile=function(...args){
 return runProtectedReplacement("Loading another SVG",loadSvgTraceFileWithoutWorkspaceProtection,this,args)
};

const loadProjectWithoutWorkspaceProtection=loadProject;
loadProject=function(...args){
 return runProtectedReplacement("Opening another project",loadProjectWithoutWorkspaceProtection,this,args)
};

const loadJWithoutWorkspaceProtection=loadJ;
loadJ=function(...args){
 return runProtectedReplacement("Loading JSON",loadJWithoutWorkspaceProtection,this,args)
};

const saveProjectWithoutWorkspaceProtection=saveProject;
saveProject=function(...args){
 const previousUpdatedAt=S.project_meta?.updated_at||null;
 const hadEditorDraft=workspaceEditorHasDraftChanges();
 const result=saveProjectWithoutWorkspaceProtection.apply(this,args);
 if((S.project_meta?.updated_at||null)!==previousUpdatedAt){
  markWorkspaceProtectionClean(!hadEditorDraft)
 }
 return result
};

clearTrace=function(){
 if(!confirmWorkspaceReplacement("Starting a new trace"))return false;
 hist();
 S.shapes=[];S.cur=null;S.sel=null;S.anchor=null;
 S.frame={origin:null,origin_metadata:{id:"trace_frame.origin",name:"origin",role:"datum",kind:"origin",location_role:"unspecified",description:"AI/CAD origin. Set location_role to stylus_tip, pivot, cartridge_proxy or another explicit datum.",references:[]},axes:S.frame.axes||{x:"+image_x",y:"+image_y",z:"+out_of_screen"},station_spacing_px:null,scale:{reference_measure_id:null,unit:"mm",px_per_unit:null,unit_per_px:null,source_length_px:null,source_real_length:null}};
 sync();
 return true
};

const commitCurrentWithoutContinuationPolicy=commitCurrentKeepAnchor;
commitCurrentKeepAnchor=function(...args){
 const options=args[0]||{};
 const keepAnchor=!!S.continueLastPoint&&!options.closed;
 const result=commitCurrentWithoutContinuationPolicy.apply(this,args);
 if(!keepAnchor&&!S.cur&&S.anchor){
  setAnchor(null);
  S.snapHit=null;
  sync(false)
 }
 return result
};

function clearStaleGeometryAnchor(force=false){
 if(S.cur||!S.anchor||(!force&&S.continueLastPoint))return false;
 setAnchor(null);
 S.snapHit=null;
 sync(false);
 return true
}

const undoActivePointWithoutAnchorProtection=undoActivePoint;
undoActivePoint=function(...args){
 if(S.cur?.type==="zone"){
  if(S.cur.points.length)S.cur.points.pop();
  if(!S.cur.points.length){S.cur=null;setAnchor(null)}
  else setAnchor(lastPoint(S.cur));
  S.snapHit=null;
  sync();
  return true
 }
 const result=undoActivePointWithoutAnchorProtection.apply(this,args);
 if(result&&!S.cur)clearStaleGeometryAnchor(true);
 return result
};

const undoWithoutAnchorProtection=undo;
undo=function(...args){
 const result=undoWithoutAnchorProtection.apply(this,args);
 clearStaleGeometryAnchor(true);
 return result
};

const redoWithoutAnchorProtection=redo;
redo=function(...args){
 const result=redoWithoutAnchorProtection.apply(this,args);
 clearStaleGeometryAnchor();
 return result
};

function drawingToolUsesObjectSnap(){
 return ["origin","station","measure","line","pen","poly","zone","rect","circle","mask"].includes(S.tool)
}

function objectSnapPointFromHit(hit){
 if(!hit?.point||hit.kind==="in"||hit.kind==="out")return null;
 return hit.point
}

cv.addEventListener("mousedown",event=>{
 if(event.button!==0||S.space||S.tool==="pan"||!drawingToolUsesObjectSnap())return;
 const screenPoint=scr(event),raw=toImg(screenPoint);
 if(!originHit(raw))return;
 event.preventDefault();
 event.stopImmediatePropagation();
 S.drag={
  mode:"originClickOrEdit",
  sp:screenPoint,
  start:raw,
  target:clone(S.frame.origin),
  orig:clone(S.frame.origin),
  moved:false,
  histDone:false
 };
 S.snapHit=S.snap&&!event.altKey?{...clone(S.frame.origin),dist:d(raw,S.frame.origin)}:null;
 draw()
},true);

cv.addEventListener("mousemove",event=>{
 const drag=S.drag;
 if(!drag||drag.mode!=="originClickOrEdit")return;
 const screenPoint=scr(event),distance=Math.hypot(screenPoint.x-drag.sp.x,screenPoint.y-drag.sp.y);
 if(distance<=3)return;
 if(!drag.histDone){hist();S.sel=ORIGIN_SEL;drag.histDone=true}
 drag.moved=true;
 moveOriginTo(toImg(screenPoint),drag.orig,drag.start);
 S.snapHit=null;
 sync(false);
 draw();
 event.preventDefault();
 event.stopImmediatePropagation()
},true);

window.addEventListener("mouseup",event=>{
 const drag=S.drag;
 if(!drag||drag.mode!=="originClickOrEdit")return;
 if(!drag.moved){
  const startPoint=S.snap&&!event.altKey?drag.target:drag.start;
  clickToolAt(startPoint,event)
 }
 S.drag=null;
 S.snapHit=null;
 draw();
 event.preventDefault();
 event.stopImmediatePropagation()
},true);

window.addEventListener("mouseup",event=>{
 const drag=S.drag;
 if(!drag||drag.mode!=="nodeClickOrEdit"||drag.moved||!drawingToolUsesObjectSnap())return;
 const exactPoint=objectSnapPointFromHit(drag.hit);
 if(!exactPoint)return;
 const startPoint=S.snap&&!event.altKey?clone(exactPoint):drag.start;
 clickToolAt(startPoint,event);
 S.drag=null;
 S.snapHit=null;
 draw();
 event.preventDefault();
 event.stopImmediatePropagation()
},true);

["imgFile","svgTraceFile","projectFile","jsonFile"].forEach(id=>{
 const input=$(id);
 if(input)input.addEventListener("click",()=>{input.value=""})
});

$("saveProject").onclick=saveProject;
$("clear").onclick=clearTrace;
$("undo").onclick=undo;
$("redo").onclick=redo;

if(continueLastControl){
 continueLastControl.onchange=event=>{
  S.continueLastPoint=event.target.checked;
  if(!S.continueLastPoint&&!S.cur)setAnchor(null);
  S.snapHit=null;
  sync(false)
 }
}

window.addEventListener("keydown",event=>{
 if(event.defaultPrevented||event.isComposing||isKeyboardOwnedByUi(event))return;
 if(event.key!=="Escape")return;
 setAnchor(null);
 S.snapHit=null;
 sync(false)
});

window.addEventListener("beforeunload",event=>{
 if(!workspaceHasUnsavedChanges())return;
 event.preventDefault();
 event.returnValue=""
});

syncContinuationControl();
markWorkspaceProtectionClean(true);
