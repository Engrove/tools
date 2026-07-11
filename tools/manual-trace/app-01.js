/**
 * AI-CODING NOTE:
 * Responsibility: Manual Trace shared state and function definitions, chunk 2 of 7.
 * Dependency: Classic scripts share one global lexical environment and must load in numeric order.
 * Safe edits: Preserve identifiers, ordering, schemas, provenance, and browser-local behavior.
 * Do not: Load independently, reorder scripts, or weaken SVG sanitization.
 */
"use strict";
function updateStationPositionsFromOrigin(){
 let spacing=S.frame.station_spacing_px, o=S.frame.origin;
 if(!o||!spacing)return;
 for(let s of S.shapes){
  if(s.type!=="station"||!Number.isFinite(s.station_index))continue;
  let ori=s.orientation||stationOrientation();
  let coord=(ori==="horizontal"?o.y:o.x)+s.station_index*spacing;
  s.orientation=ori;
  if(ori==="horizontal"){
   s.y=coord;s.y1=coord;s.y2=coord;s.x1=0;s.x2=S.img?.width||1000
  }else{
   s.x=coord;s.x1=coord;s.x2=coord;s.y1=0;s.y2=S.img?.height||1000
  }
  s.origin_ref=clone(o);s.spacing_px=spacing;
 }
}

function setOrigin(p){hist();ensureFrameMeta();S.frame.origin={x:p.x,y:p.y};S.frame.origin_metadata.id="trace_frame.origin";S.frame.origin_metadata.name=S.frame.origin_metadata.name||"origin";S.frame.origin_metadata.role="datum";S.sel=ORIGIN_SEL;sync()}

function stationName(idx){return idx===0?"station_0_origin":`station_${idx>0?"+":""}${idx}`}

function addStationAt(p,opt={}){
 let o=S.frame.origin||{x:0,y:0}, spacing=S.frame.station_spacing_px||null;
 let ori=opt.orientation||stationOrientation();
 let coord=Number.isFinite(opt.coord)?opt.coord:stationCoordFromPoint(p,ori);
 let idx=Number.isFinite(opt.index)?opt.index:(spacing?Math.round((coord-stationOriginCoord(ori))/spacing):S.shapes.filter(s=>s.type==="station").length);
 let ends=stationLineEnds(coord,ori);
 let st={id:id("station"),type:"station",name:stationName(idx),role:"station",station_index:idx,orientation:ori,origin_ref:S.frame.origin?clone(S.frame.origin):null,spacing_px:spacing,style:{stroke:"#5d7cff",width:.9},...ends};
 if(ori==="horizontal")st.y=coord; else st.x=coord;
 hist();S.shapes.push(st);S.sel=st.id;sync()
}

function drawFrame(){
 cx.save();
 let o=S.frame.origin;
 if(o){
  cx.lineWidth=1.4/S.view.s;cx.strokeStyle="#ff4d6d";cx.fillStyle="#ff4d6d";
  cx.beginPath();cx.arc(o.x,o.y,7/S.view.s,0,Math.PI*2);cx.stroke();
  cx.beginPath();cx.moveTo(o.x-12/S.view.s,o.y);cx.lineTo(o.x+12/S.view.s,o.y);cx.moveTo(o.x,o.y-12/S.view.s);cx.lineTo(o.x,o.y+12/S.view.s);cx.stroke();
  cx.font=`${11/S.view.s}px Segoe UI`;cx.fillText("origin",o.x+10/S.view.s,o.y-8/S.view.s);
  const colors={x:"#6b93ff",y:"#2ec4b6",z:"#ff66cc"};
  for(let k of ["x","y","z"]){
   let v=S.frame.axes[k], vec=axisVec2(v);
   cx.strokeStyle=colors[k];cx.fillStyle=colors[k];cx.lineWidth=1.6/S.view.s;
   if(vec){
    cx.beginPath();cx.moveTo(o.x,o.y);cx.lineTo(o.x+55*vec.x/S.view.s,o.y+55*vec.y/S.view.s);cx.stroke();
    cx.fillText(k.toUpperCase(),o.x+(62*vec.x+3)/S.view.s,o.y+(62*vec.y+3)/S.view.s);
   }else{
    let r=8/S.view.s;
    cx.beginPath();cx.arc(o.x,o.y,r,0,Math.PI*2);cx.stroke();
    if(axisSign(v)>0){cx.beginPath();cx.arc(o.x,o.y,2.4/S.view.s,0,Math.PI*2);cx.fill()}
    else{cx.beginPath();cx.moveTo(o.x-r*.7,o.y-r*.7);cx.lineTo(o.x+r*.7,o.y+r*.7);cx.moveTo(o.x+r*.7,o.y-r*.7);cx.lineTo(o.x-r*.7,o.y+r*.7);cx.stroke()}
    cx.fillText(k.toUpperCase(),o.x+12/S.view.s,o.y+12/S.view.s);
   }
  }
 }
 cx.restore()
}

function grid(){if(!S.grid)return;let r=stage.getBoundingClientRect(),st=64*S.view.s;if(st<8)return;cx.save();cx.strokeStyle="rgba(183,255,0,.08)";cx.lineWidth=1;for(let x=S.view.x%st;x<r.width;x+=st){cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,r.height);cx.stroke()}for(let y=S.view.y%st;y<r.height;y+=st){cx.beginPath();cx.moveTo(0,y);cx.lineTo(r.width,y);cx.stroke()}cx.restore()}

function svgTraceDefaults(){return{sourceName:null,sourceText:null,candidates:[],activeId:null,show:true,settings:{mode:"filled",output:"poly",sampleStep:2.5,simplifyTol:1.5,minArea:4}}}

function ensureSvgTrace(){
 S.svgTrace=S.svgTrace||svgTraceDefaults();
 S.svgTrace.candidates=Array.isArray(S.svgTrace.candidates)?S.svgTrace.candidates:[];
 S.svgTrace.settings={mode:"filled",output:"poly",sampleStep:2.5,simplifyTol:1.5,minArea:4,...(S.svgTrace.settings||{})};
 if(S.svgTrace.show===undefined)S.svgTrace.show=true;
 return S.svgTrace
}

function importAutoTraceSummary(at){
 let st=svgTraceDefaults();if(!at||typeof at!=="object")return st;
 st.sourceName=at.source_name||at.sourceName||null;
 st.settings={...st.settings,...(at.settings||{})};
 st.candidates=(Array.isArray(at.candidates)?at.candidates:[]).map(c=>({
  id:c.id||id("svgobj"),sourceIndex:c.source_index??null,elementId:c.element_id||null,
  label:c.label||c.element_id||"svg_object",tag:c.tag||"path",
  status:c.status==="ignore"?"ignore":"include",tracedShapeId:c.traced_shape_id||c.tracedShapeId||null,
  closed:!!c.closed,area:Number(c.area_px2??c.area)||0,length:Number(c.length_px??c.length)||0,
  bbox:c.bbox||{x:0,y:0,w:0,h:0},fill:c.fill||"none",stroke:c.stroke||"none",
  points:Array.isArray(c.points)?c.points:[],unavailable:!Array.isArray(c.points)||c.points.length<2
 }));
 st.activeId=st.candidates[0]?.id||null;return st
}

function repairSvgTraceLinks(){
 let st=ensureSvgTrace(),ids=new Set(S.shapes.map(s=>s.id));
 st.candidates.forEach(c=>{
  if(c.tracedShapeId&&ids.has(c.tracedShapeId))return;
  let matches=S.shapes.filter(s=>
   s.source_svg?.candidate_id===c.id||
   (c.elementId&&s.source_svg?.element_id===c.elementId)||
   (c.label&&(s.name===c.label||String(s.name||"").startsWith(c.label+"_")||s.semantic?.standard_name===c.label))
  );
  c.tracedShapeId=matches.length===1?matches[0].id:null
 });
}

function applyAutoTraceSummary(at){
 let imported=importAutoTraceSummary(at),current=ensureSvgTrace();
 if(current.sourceText&&current.sourceName===imported.sourceName){
  imported.sourceText=current.sourceText;
  imported.candidates=imported.candidates.map(c=>{
   let live=current.candidates.find(x=>x.id===c.id);
   return live?{...live,status:c.status,tracedShapeId:c.tracedShapeId||live.tracedShapeId,unavailable:false}:c
  })
 }
 S.svgTrace=imported;repairSvgTraceLinks()
}

function readFileText(f){return new Promise((ok,no)=>{let r=new FileReader();r.onload=()=>ok(String(r.result||""));r.onerror=()=>no(r.error||new Error("Could not read file."));r.readAsText(f)})}

function readFileDataUrl(f){return new Promise((ok,no)=>{let r=new FileReader();r.onload=()=>ok(String(r.result||""));r.onerror=()=>no(r.error||new Error("Could not read file."));r.readAsDataURL(f)})}

function svgCoordinateFrame(txt){
 let doc=new DOMParser().parseFromString(String(txt||""),"image/svg+xml"),root=doc.documentElement;
 if(doc.querySelector("parsererror")||!root||root.localName!=="svg")return null;
 let vb=String(root.getAttribute("viewBox")||"").trim().split(/[\s,]+/).map(Number);
 if(vb.length===4&&vb.every(Number.isFinite)&&vb[2]>0&&vb[3]>0)return{width:vb[2],height:vb[3],viewBox:vb};
 let width=svgNumber(root.getAttribute("width"),NaN),height=svgNumber(root.getAttribute("height"),NaN);
 return Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0?{width,height,viewBox:[0,0,width,height]}:null
}

function safeSvgText(txt){
 let doc=new DOMParser().parseFromString(String(txt||""),"image/svg+xml");
 if(doc.querySelector("parsererror"))throw new Error("Invalid SVG XML.");
 doc.querySelectorAll("script,foreignObject,iframe,object,embed,image,use,style,link").forEach(n=>n.remove());
 const safeUrlValue=value=>{
  let text=String(value||"");
  if(/(?:javascript|vbscript)\s*:/i.test(text)||/@import/i.test(text))return false;
  for(const match of text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi))if(!String(match[2]||"").trim().startsWith("#"))return false;
  return true
 };
 doc.querySelectorAll("*").forEach(el=>{
  [...el.attributes].forEach(a=>{
   let n=a.name.toLowerCase(),v=String(a.value||"").trim();
   if(n.startsWith("on")||n==="href"||n.endsWith(":href")||!safeUrlValue(v))el.removeAttribute(a.name)
  })
 });
 let root=doc.documentElement;
 if(!root||root.localName!=="svg")throw new Error("File does not contain an SVG root.");
 return new XMLSerializer().serializeToString(root)
}

function svgNumber(v,fallback=0){let n=parseFloat(String(v??"").replace(",", "."));return Number.isFinite(n)?n:fallback}

function areaOfPoints(ps){let a=0;if(!ps||ps.length<3)return 0;for(let i=0,j=ps.length-1;i<ps.length;j=i++)a+=(ps[j].x*ps[i].y-ps[i].x*ps[j].y);return a/2}

function bboxOfPoints(ps){if(!ps?.length)return{x:0,y:0,w:0,h:0};let xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);return{x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y}}

function sqSegDist(p,a,b){let x=a.x,y=a.y,dx=b.x-x,dy=b.y-y;if(dx||dy){let t=((p.x-x)*dx+(p.y-y)*dy)/(dx*dx+dy*dy);if(t>1){x=b.x;y=b.y}else if(t>0){x+=dx*t;y+=dy*t}}dx=p.x-x;dy=p.y-y;return dx*dx+dy*dy}

function rdpOpen(points,tol){
 if(!points||points.length<=2||tol<=0)return(points||[]).map(clone);
 let sq=tol*tol,keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
 let stack=[[0,points.length-1]];
 while(stack.length){let [a,b]=stack.pop(),max=sq,idx=-1;for(let i=a+1;i<b;i++){let q=sqSegDist(points[i],points[a],points[b]);if(q>max){idx=i;max=q}}if(idx>0){keep[idx]=1;stack.push([a,idx],[idx,b])}}
 return points.filter((_,i)=>keep[i]).map(clone)
}

function simplifyPoints(points,tol,closed=false){
 let ps=(points||[]).map(clone);if(ps.length<3||tol<=0)return ps;
 if(!closed)return rdpOpen(ps,tol);
 let c={x:ps.reduce((a,p)=>a+p.x,0)/ps.length,y:ps.reduce((a,p)=>a+p.y,0)/ps.length};
 let start=0,far=-1;for(let i=0;i<ps.length;i++){let q=d(ps[i],c);if(q>far){far=q;start=i}}
 ps=ps.slice(start).concat(ps.slice(0,start));ps.push(clone(ps[0]));
 let out=rdpOpen(ps,tol);if(out.length>1&&d(out[0],out.at(-1))<.0001)out.pop();
 return out.length>=3?out:(points||[]).map(clone)
}

function pointInPoly(p,ps){let inside=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){let a=ps[i],b=ps[j],cross=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-12)+a.x);if(cross)inside=!inside}return inside}

function polyDistance(p,ps,closed=false){let m=Infinity;for(let i=1;i<ps.length;i++)m=Math.min(m,Math.sqrt(sqSegDist(p,ps[i-1],ps[i])));if(closed&&ps.length>2)m=Math.min(m,Math.sqrt(sqSegDist(p,ps.at(-1),ps[0])));return m}

function svgVisiblePaint(el){
 let cs=getComputedStyle(el),op=svgNumber(cs.opacity,1)*svgNumber(cs.fillOpacity,1),sop=svgNumber(cs.opacity,1)*svgNumber(cs.strokeOpacity,1);
 let fill=cs.fill||el.getAttribute("fill")||"black",stroke=cs.stroke||el.getAttribute("stroke")||"none";
 return{fill,stroke,filled:fill!=="none"&&fill!=="transparent"&&op>.001,stroked:stroke!=="none"&&stroke!=="transparent"&&sop>.001,opacity:svgNumber(cs.opacity,1)}
}

function svgShapeClosed(el,pts){
 let tag=el.localName,dv=el.getAttribute("d")||"";
 return ["polygon","rect","circle","ellipse"].includes(tag)||(/[zZ]\s*$/.test(dv))||(pts.length>2&&d(pts[0],pts.at(-1))<.75)
}

function sampleSvgGeometry(el,step){
 let pts=[],len=0;
 try{len=el.getTotalLength()}catch(_){}
 if(Number.isFinite(len)&&len>0&&typeof el.getPointAtLength==="function"){
  let n=Math.max(2,Math.min(12000,Math.ceil(len/Math.max(.25,step))));
  let m=el.getCTM();
  for(let i=0;i<=n;i++){let p=el.getPointAtLength(len*i/n),q=m?new DOMPoint(p.x,p.y).matrixTransform(m):p;pts.push({x:q.x,y:q.y})}
 }else if(el.points?.numberOfItems){
  let m=el.getCTM();for(let i=0;i<el.points.numberOfItems;i++){let p=el.points.getItem(i),q=m?new DOMPoint(p.x,p.y).matrixTransform(m):p;pts.push({x:q.x,y:q.y})}
 }
 return{points:pts,length:len}
}

async function detectSvgCandidates(svgText,name){
 let st=ensureSvgTrace(),clean=safeSvgText(svgText),host=document.createElement("div");
 host.setAttribute("aria-hidden","true");host.style.cssText="position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none";
 host.innerHTML=clean;document.body.appendChild(host);
 let root=host.querySelector("svg"),w=S.img?.width||svgNumber(root.getAttribute("width"),1000),h=S.img?.height||svgNumber(root.getAttribute("height"),700);
 root.setAttribute("width",w);root.setAttribute("height",h);root.style.overflow="visible";
 await new Promise(r=>requestAnimationFrame(r));
 let cfg=readSvgSettings(false),els=[...root.querySelectorAll("path,polygon,polyline,rect,circle,ellipse,line")],cands=[];
 els.forEach((el,i)=>{
  let paint=svgVisiblePaint(el);if(paint.opacity<=.001)return;
  if(cfg.mode==="filled"&&!paint.filled)return;if(cfg.mode==="stroked"&&!paint.stroked)return;if(cfg.mode==="all"&&!paint.filled&&!paint.stroked)return;
  let sm=sampleSvgGeometry(el,cfg.sampleStep),pts=sm.points;if(pts.length<2)return;
  let closed=svgShapeClosed(el,pts);if(closed&&d(pts[0],pts.at(-1))<.75)pts.pop();
  let area=Math.abs(areaOfPoints(pts));if(closed&&area<cfg.minArea)return;
  let label=el.getAttribute("id")||el.getAttribute("aria-label")||`${el.localName}_${String(i+1).padStart(3,"0")}`;
  cands.push({id:id("svgobj"),sourceIndex:i,elementId:el.getAttribute("id")||null,label,tag:el.localName,points:pts,closed,area,length:sm.length,bbox:bboxOfPoints(pts),fill:paint.fill,stroke:paint.stroke,status:"include",tracedShapeId:null})
 });
 host.remove();
 cands.sort((a,b)=>(b.area||b.length)-(a.area||a.length));
 st.sourceName=name||st.sourceName||"source.svg";st.sourceText=String(svgText||"");st.candidates=cands;st.activeId=cands[0]?.id||null;st.settings=cfg;
 renderAutoTracePanel();sync();
 return cands
}

async function loadSvgTraceFile(f){
 if(!f)return;
 try{
  let txt=await readFileText(f),clean=safeSvgText(txt),data="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(clean),frame=svgCoordinateFrame(clean);
  await new Promise((ok,no)=>{let im=new Image();im.onload=()=>{
   let width=frame?.width||im.naturalWidth,height=frame?.height||im.naturalHeight;
   S.img={name:f.name,width,height,dataUrl:data,_im:im,sourceViewBox:frame?.viewBox||null};
   fit();ok()
  };im.onerror=()=>no(new Error("Could not render SVG image."));im.src=data});
  await detectSvgCandidates(clean,f.name);
 }catch(e){alert("SVG auto trace error: "+e.message)}
}

function readSvgSettings(fromUi=true){
 let st=ensureSvgTrace(),num=(id,fallback)=>{let n=Number($(id)?.value);return Number.isFinite(n)?n:fallback};
 let cfg={mode:fromUi?($("svgDetectMode")?.value||st.settings.mode):st.settings.mode,output:fromUi?($("svgOutputType")?.value||st.settings.output):st.settings.output,sampleStep:Math.max(.25,num("svgSampleStep",st.settings.sampleStep)),simplifyTol:Math.max(0,num("svgSimplifyTol",st.settings.simplifyTol)),minArea:Math.max(0,num("svgMinArea",st.settings.minArea))};
 st.settings=cfg;st.show=$("svgShowCandidates")?$("svgShowCandidates").checked:st.show;return cfg
}

function activeSvgCandidate(){let st=ensureSvgTrace();return st.candidates.find(c=>c.id===st.activeId)||null}

function svgCandidateAt(p){
 let cs=ensureSvgTrace().candidates.filter(c=>c.status!=="ignore"),inside=cs.filter(c=>c.closed&&pointInPoly(p,c.points));
 if(inside.length)return inside.sort((a,b)=>a.area-b.area)[0];
 let best=null,bd=Infinity;cs.forEach(c=>{let q=polyDistance(p,c.points,c.closed);if(q<bd){bd=q;best=c}});
 return bd<14/S.view.s?best:null
}

function setSvgCandidateStatus(c,status){if(!c)return;c.status=status;ensureSvgTrace().activeId=c.id;renderAutoTracePanel();draw()}

function drawSvgCandidates(){
 let st=ensureSvgTrace();if(!st.show||!st.candidates.length)return;
 cx.save();st.candidates.forEach(c=>{
  if(!c.points?.length)return;let active=c.id===st.activeId,ignored=c.status==="ignore";
  cx.beginPath();cx.moveTo(c.points[0].x,c.points[0].y);c.points.slice(1).forEach(p=>cx.lineTo(p.x,p.y));if(c.closed)cx.closePath();
  cx.save();cx.globalAlpha=ignored?.10:(active?.22:.10);cx.fillStyle=ignored?"#ff4d6d":(active?"#ffea00":"#2ec4b6");if(c.closed)cx.fill();cx.restore();
  cx.lineWidth=(active?2.2:1.1)/S.view.s;cx.strokeStyle=ignored?"#ff4d6d":(active?"#ffea00":"#2ec4b6");cx.setLineDash(ignored?[6/S.view.s,5/S.view.s]:[]);cx.stroke();
  if(active){cx.fillStyle="#ffea00";cx.font=`${11/S.view.s}px Segoe UI`;cx.fillText(c.label,c.bbox.x+4/S.view.s,c.bbox.y-5/S.view.s)}
 });cx.setLineDash([]);cx.restore()
}
