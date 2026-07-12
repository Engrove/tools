/**
 * AI-CODING NOTE:
 * Responsibility: Manual Trace event binding and application bootstrap, chunk 7 of 7.
 * Dependency: Classic scripts share one global lexical environment and must load in numeric order.
 * Safe edits: Preserve identifiers, ordering, schemas, provenance, and browser-local behavior.
 * Do not: Load independently, reorder scripts, or weaken SVG sanitization.
 */
"use strict";

function isKeyboardOwnedByUi(event){
 const target=event.target;
 if(!target||typeof target.closest!=="function")return false;
 return !!target.closest("input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='button']")
}

addEventListener("resize",syncLayout);

cv.oncontextmenu=e=>{e.preventDefault();return false};

cv.onmousedown=e=>{
 let sp=scr(e),raw=toImg(sp);
 if(e.button===2){e.preventDefault();S.drag={mode:"zoom",sp,anchorSp:sp,anchorImg:raw,startS:S.view.s,view:{...S.view}};S.snapHit=null;return}
 if(e.button===1||S.space||S.tool==="pan"){e.preventDefault();S.drag={mode:"pan",sp,view:{...S.view}};S.snapHit=null;return}
 if(e.button!==0)return;
 e.preventDefault();
 if(["tracepick","nodeadd","nodedelete"].includes(S.tool)){clickToolAt(raw,e);return}

 // Trackpad rule: drag origin, nodes or handles edits them; drag empty canvas pans.
 // If a two-point object is active, left drag/click sets its second point instead of panning.
 if(originHit(raw)){hist();S.sel=ORIGIN_SEL;S.drag={mode:"origin",start:raw,orig:clone(S.frame.origin)};S.snapHit=null;sync(false);draw();return}
 let twoPointActive=S.cur&&["measure","line","rect","circle"].includes(S.cur.type);
 if(twoPointActive){S.drag={mode:"place2",sp,raw,tool:S.tool,moved:false};previewCurrentAt(raw,e);return}
 let hn=hitNode(raw,true);
 if(hn){
  if(S.tool==="select"){
   if(!hn.current){S.sel=hn.shape.id;hist()}
   else S.sel=null;
   S.drag={mode:"edit",hit:hn,start:raw,orig:clone(hn.shape)};
   S.snapHit=null;sync(false);draw();return
  }
  // Active drawing-tool rule:
  // click existing point/node/handle = continue/start from that exact snapped point;
  // drag existing point/node/handle = edit it. This preserves trackpad use.
  S.drag={mode:"nodeClickOrEdit",hit:hn,start:raw,sp,orig:clone(hn.shape),moved:false,histDone:false};
  S.snapHit=null;sync(false);draw();return
 }

 if(S.tool==="select"){
  let h=hit(raw);
  if(h){S.sel=h.shape.id;hist();S.drag={mode:"edit",hit:h,start:raw,orig:clone(h.shape)}}
  else{S.sel=null;S.drag={mode:"pending",sp,raw,view:{...S.view},moved:false}}
  sync(false);draw();return
 }
 S.drag={mode:"pending",sp,raw,view:{...S.view},moved:false};
 S.snapHit=null;
};

cv.onmousemove=e=>{
 let sp=scr(e),raw=toImg(sp),p=snapPoint(raw,{off:e.altKey,includeCurrent:false});
 $("curS").textContent=`x:${p.x.toFixed(1)} y:${p.y.toFixed(1)}`;
 if(S.drag){
  if(S.drag.mode==="origin"){
   moveOriginTo(raw,S.drag.orig,S.drag.start);
   S.snapHit=null;sync(false);draw();return
  }
  if(S.drag.mode==="place2"){
   S.drag.moved=true;
   previewCurrentAt(raw,e);return
  }
  if(S.drag.mode==="nodeClickOrEdit"){
   let md=Math.hypot(sp.x-S.drag.sp.x,sp.y-S.drag.sp.y);
   if(md>3){
    if(!S.drag.hit.current&&!S.drag.histDone){hist();S.drag.histDone=true}
    S.drag.moved=true;
    S.drag.mode="edit";
    edit(S.drag.hit,raw,S.drag.start,S.drag.orig);
    S.snapHit=null;sync(false);draw();return
   }
   draw();return
  }
  if(S.drag.mode==="pending"){
   let md=Math.hypot(sp.x-S.drag.sp.x,sp.y-S.drag.sp.y);
   if(md>3){
    S.drag.mode="pan";
    S.drag.moved=true;
    S.view.x=S.drag.view.x+sp.x-S.drag.sp.x;
    S.view.y=S.drag.view.y+sp.y-S.drag.sp.y;
    S.snapHit=null;draw();return
   }
   draw();return
  }
  if(S.drag.mode==="zoom"){
   let dy=S.drag.sp.y-sp.y,dx=sp.x-S.drag.sp.x;
   let f=Math.exp(dy*.010+dx*.003);
   S.view.s=Math.max(.01,Math.min(64,S.drag.startS*f));
   S.view.x=S.drag.anchorSp.x-S.drag.anchorImg.x*S.view.s;
   S.view.y=S.drag.anchorSp.y-S.drag.anchorImg.y*S.view.s;
   draw();return
  }
  if(S.drag.mode==="pan"){
   S.view.x=S.drag.view.x+sp.x-S.drag.sp.x;
   S.view.y=S.drag.view.y+sp.y-S.drag.sp.y;
   S.snapHit=null;draw();return
  }
  if(S.drag.mode==="edit"){
   edit(S.drag.hit,raw,S.drag.start,S.drag.orig);
   S.snapHit=null;sync(false);draw();return
  }
 }
 if(previewCurrentAt(raw,e))return;
 draw();
};

window.addEventListener("mouseup",e=>{
 if(S.drag&&S.drag.mode==="place2"){
  clickToolAt(toImg(scr(e)),e);
  S.drag=null;S.snapHit=null;draw();return
 }
 if(S.drag&&S.drag.mode==="nodeClickOrEdit"){
  if(!S.drag.moved){
   // No drag: treat this as a deliberate click to start/continue from an existing point.
   clickToolAt(S.drag.start,e);
  }
  S.drag=null;S.snapHit=null;draw();return
 }
 if(S.drag&&S.drag.mode==="pending"&&!S.drag.moved){
  clickToolAt(S.drag.raw,e);
 }
 S.drag=null;S.snapHit=null;draw()
});

cv.ondblclick=()=>{if(["poly","mask","zone","pen"].includes(S.tool))finish(false)};

cv.onwheel=e=>{e.preventDefault();let sp=scr(e),b=toImg(sp),f=Math.exp(-e.deltaY*.0012);S.view.s=Math.max(.01,Math.min(64,S.view.s*f));S.view.x=sp.x-b.x*S.view.s;S.view.y=sp.y-b.y*S.view.s;draw()};

$("propApply").onclick=applyProps;

$("propOrigin").onclick=editOriginMeta;

$("refAdd").onclick=addReference;

$("open").onclick=()=>$("imgFile").click();

$("imgFile").onchange=e=>loadImg(e.target.files[0]);

$("openSvgTrace").onclick=()=>$("svgTraceFile").click();

$("svgTraceFile").onchange=e=>loadSvgTraceFile(e.target.files[0]);

$("svgChoose").onclick=()=>$("svgTraceFile").click();

$("svgTraceIncluded").onclick=traceIncludedSvg;

$("svgTraceActive").onclick=traceActiveSvg;

$("svgIncludeAll").onclick=()=>{ensureSvgTrace().candidates.forEach(c=>c.status="include");renderAutoTracePanel();draw()};

$("svgIgnoreAll").onclick=()=>{ensureSvgTrace().candidates.forEach(c=>c.status="ignore");renderAutoTracePanel();draw()};

$("svgClearCandidates").onclick=clearSvgCandidates;

$("svgFocusActive").onclick=focusActiveSvg;

$("svgRedetect").onclick=()=>{let st=ensureSvgTrace();if(st.sourceText)detectSvgCandidates(st.sourceText,st.sourceName);else $("svgTraceFile").click()};

$("svgShowCandidates").onchange=e=>{ensureSvgTrace().show=e.target.checked;draw()};

["svgDetectMode","svgOutputType","svgSampleStep","svgSimplifyTol","svgMinArea"].forEach(k=>$(k).onchange=()=>{readSvgSettings(true);renderAutoTracePanel()});

$("openProject").onclick=()=>$("projectFile").click();

$("projectFile").onchange=e=>loadProject(e.target.files[0]);

$("saveProject").onclick=saveProject;

$("load").onclick=()=>$("jsonFile").click();

$("jsonFile").onchange=e=>loadJ(e.target.files[0]);

$("save").onclick=save;

$("svg").onclick=saveSvg;

$("sideToggle").onclick=toggleSide;

$("clear").onclick=clearTrace;

$("apply").onclick=apply;

$("copy").onclick=async()=>navigator.clipboard.writeText(json.value);

$("finish").onclick=()=>finish(false);

$("close").onclick=()=>finish(true);

$("smooth").onclick=smoothSelected;

$("smartSimplify").onclick=smartSimplifySelected;

$("reverseShape").onclick=reverseSelectedShape;

$("del").onclick=del;

$("undo").onclick=undo;

$("redo").onclick=redo;

$("fit").onclick=fit;

$("one").onclick=one;

$("stations").onclick=stations;

["xdir","ydir","zdir"].forEach(k=>$(k).onchange=e=>{S.frame.axes[k[0]]=e.target.value;enforceAxes(k[0]);sync()});

$("grid").onchange=e=>{S.grid=e.target.checked;draw()};

$("pts").onchange=e=>{S.pts=e.target.checked;draw()};

$("snap").onchange=e=>{S.snap=e.target.checked;S.snapHit=null;draw()};

$("msnap").onchange=e=>{S.measureSnap=e.target.checked;S.snapHit=null;draw()};

document.querySelectorAll("#tools button").forEach(b=>b.onclick=()=>setTool(b.dataset.t));

window.addEventListener("keydown",e=>{
 if(e.defaultPrevented||e.isComposing||isKeyboardOwnedByUi(e))return;
 if(e.code==="Space"){S.space=true;e.preventDefault()}
 if(e.key==="Escape"){S.cur=null;S.drag=null;draw()}
 if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();del()}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo()}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo()}
});

window.addEventListener("keyup",e=>{if(e.code==="Space")S.space=false});

window.addEventListener("paste",e=>{if(isKeyboardOwnedByUi(e))return;if(!e.clipboardData)return;for(let it of e.clipboardData.items)if(it.type.startsWith("image/")){loadImg(it.getAsFile());e.preventDefault();break}});

["dragenter","dragover"].forEach(ev=>stage.addEventListener(ev,e=>{e.preventDefault();$("drop").style.display="flex"}));

["dragleave","drop"].forEach(ev=>stage.addEventListener(ev,e=>{e.preventDefault();if(ev==="dragleave")$("drop").style.display="none"}));

stage.addEventListener("drop",e=>{
 $("drop").style.display="none";
 let f=e.dataTransfer.files[0];if(!f)return;
 let n=f.name.toLowerCase();
 if(n.endsWith(".svg")||f.type==="image/svg+xml")loadSvgTraceFile(f);
 else if(f.type.startsWith("image/"))loadImg(f);
 else if(n.endsWith(".engrove-trace")||n.endsWith(".engrove-project"))loadProject(f);
 else if(n.endsWith(".json"))loadJ(f)
});

document.querySelectorAll("[data-inspector-tab]").forEach(b=>b.addEventListener("click",()=>setInspectorTab(b.dataset.inspectorTab)));

document.querySelectorAll('[data-action="save-project-menu"]').forEach(b=>b.addEventListener("click",()=>$("saveProject").click()));

document.querySelectorAll('[data-action="undo-menu"]').forEach(b=>b.addEventListener("click",()=>$("undo").click()));

document.querySelectorAll('[data-action="redo-menu"]').forEach(b=>b.addEventListener("click",()=>$("redo").click()));

document.querySelectorAll('[data-action="fit-menu"]').forEach(b=>b.addEventListener("click",()=>$("fit").click()));

$("openSvgTrace").addEventListener("click",()=>setInspectorTab("trace"));

$("svgChoose").addEventListener("click",()=>setInspectorTab("trace"));

$("list").addEventListener("click",()=>setInspectorTab("properties"));

setInspectorTab("trace");

installPanelResizer("leftResizer","rail",1);

installPanelResizer("rightResizer","inspector",-1);

restorePanelLayout();

window.addEventListener("resize",()=>{
 applyPanelWidth("rail",readPanelWidth("rail"),false);
 applyPanelWidth("inspector",readPanelWidth("inspector"),false);
 updatePanelSeparatorAria()
});

syncLayout();

sync();
