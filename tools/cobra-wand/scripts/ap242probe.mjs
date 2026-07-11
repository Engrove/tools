import initOpenCascade from "opencascade.js/dist/node.js";
const oc = await initOpenCascade();
const box = new oc.BRepPrimAPI_MakeBox_2(5,5,5).Shape();
const pr = () => new oc.Message_ProgressRange_1();
function writeAndReadSchema(label) {
  const w = new oc.STEPControl_Writer_1();
  w.Transfer(box, oc.STEPControl_StepModelType.STEPControl_AsIs, true, pr());
  w.Write(label);
  const t = Buffer.from(oc.FS.readFile(label)).toString("ascii");
  const m = t.match(/FILE_SCHEMA\(\(([^)]*)\)\)/);
  return m ? m[1] : "??";
}
// Ordning C: init controllern via en slaskwriter, SEDAN SetCVal, SEDAN riktig writer.
const dummy = new oc.STEPControl_Writer_1(); dummy.delete?.();
console.log("CVal före set:", oc.Interface_Static.CVal("write.step.schema"));
console.log("SetCVal:", oc.Interface_Static.SetCVal("write.step.schema","AP242DIS"));
console.log("CVal efter set:", oc.Interface_Static.CVal("write.step.schema"));
console.log("Ordning C schema:", writeAndReadSchema("c.step"));
// Kontroll: består värdet efter ytterligare writer-konstruktioner?
console.log("CVal efter writeAndReadSchema:", oc.Interface_Static.CVal("write.step.schema"));
console.log("Ordning C2 (andra skrivningen):", writeAndReadSchema("c2.step"));
