// CP1 introspektion: dumpar exakta symbolnamn ur opencascade.js (beta.b5ff984)
// Syfte: skriva geometrikärnan mot VERIFIERADE bindningsnamn, inte antagna.
import initOpenCascade from "opencascade.js/dist/node.js";

const t0 = Date.now();
const oc = await initOpenCascade();
console.log(`init_ok ms=${Date.now() - t0}`);

const keys = Object.keys(oc);
console.log(`total_keys=${keys.length}`);

const patterns = [
  "gp_Pnt", "gp_Dir", "gp_Ax2", "gp_Vec", "gp_Trsf", "gp_Ax1",
  "BRepPrimAPI_MakeBox", "BRepPrimAPI_MakeCylinder",
  "BRepBuilderAPI_MakeEdge", "BRepBuilderAPI_MakeWire", "BRepBuilderAPI_MakeFace",
  "BRepBuilderAPI_Transform", "BRepBuilderAPI_MakeSolid", "BRepBuilderAPI_Sewing",
  "GeomAPI_Interpolate", "GeomAPI_PointsToBSpline",
  "TColgp_Array1OfPnt", "TColgp_HArray1OfPnt",
  "BRepOffsetAPI_ThruSections", "BRepOffsetAPI_MakeOffsetShape",
  "BRepAlgoAPI_Cut", "BRepAlgoAPI_Fuse", "BRepAlgoAPI_Common",
  "BRepMesh_IncrementalMesh",
  "BRep_Tool", "TopExp_Explorer", "TopAbs_", "TopoDS",
  "Poly_Triangulation", "Poly_Triangle",
  "StlAPI", "STEPControl", "Interface_Static",
  "BRepCheck_Analyzer", "BRepGProp", "GProp_GProps",
  "TopLoc_Location", "Geom_BSplineCurve", "Handle_Geom",
  "Message_ProgressRange", "Standard_",
];

for (const p of patterns) {
  const hits = keys.filter((k) => k.startsWith(p)).sort();
  if (hits.length) console.log(`${p} :: ${hits.slice(0, 14).join(", ")}${hits.length > 14 ? ` (+${hits.length - 14})` : ""}`);
  else console.log(`${p} :: SAKNAS`);
}

// Metodnamn på nyckelklasser (prototyp-nivå)
function proto(name) {
  const C = oc[name];
  if (!C || !C.prototype) return `SAKNAS`;
  return Object.getOwnPropertyNames(C.prototype).filter((m) => m !== "constructor").sort().join(", ");
}
console.log("--- BRep_Tool statics:", Object.getOwnPropertyNames(oc.BRep_Tool || {}).sort().join(", "));
console.log("--- Poly_Triangulation proto:", proto("Poly_Triangulation"));
console.log("--- BRepOffsetAPI_ThruSections proto:", proto("BRepOffsetAPI_ThruSections_1") || proto("BRepOffsetAPI_ThruSections"));
console.log("--- STEPControl_Writer proto:", proto("STEPControl_Writer_1") || proto("STEPControl_Writer"));
console.log("--- TopExp_Explorer proto:", proto("TopExp_Explorer_2") || proto("TopExp_Explorer_1"));
console.log("--- BRepGProp statics:", Object.getOwnPropertyNames(oc.BRepGProp || {}).sort().join(", "));
