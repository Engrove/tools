/**
 * AI-CODING NOTE:
 * Responsibility: Top-bar menu coordination, unsaved-work detection, and destructive-action protection, chunk 8 of 8.
 * Dependency: Loads after all core Manual Trace state, persistence, and event-binding scripts.
 * Safe edits: Preserve native <details> behavior, browser-native beforeunload semantics, and normal object-level editing.
 */
"use strict";

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
 if(workspaceProtectionPendingClean){
  workspaceProtectionPendingClean=false;
  markWorkspaceProtectionClean(true)
 }else captureWorkspaceEditorBaselines();
 return result
};

const applyProjectPackageWithoutWorkspaceProtection=applyProjectPackage;
applyProjectPackage=function(...args){
 workspaceProtectionPendingClean=true;
 try{return applyProjectPackageWithoutWorkspaceProtection.apply(this,args)}
 catch(error){workspaceProtectionPendingClean=false;throw error}
};

const applyTraceObjectWithoutWorkspaceProtection=applyTraceObject;
applyTraceObject=function(...args){
 workspaceProtectionPendingClean=true;
 try{return applyTraceObjectWithoutWorkspaceProtection.apply(this,args)}
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

["imgFile","svgTraceFile","projectFile","jsonFile"].forEach(id=>{
 const input=$(id);
 if(input)input.addEventListener("click",()=>{input.value=""})
});

$("saveProject").onclick=saveProject;
$("clear").onclick=clearTrace;

window.addEventListener("beforeunload",event=>{
 if(!workspaceHasUnsavedChanges())return;
 event.preventDefault();
 event.returnValue=""
});

markWorkspaceProtectionClean(true);
