/**
 * Final production export gate for Trace Project Package v1.
 * Captures the export action before the legacy listener and only downloads
 * after canonicalization plus merged-schema validation have completed.
 */
"use strict";
(function installValidatedExportGate() {
  const production = globalThis.EngroveTraceProjectPackageProduction;
  const base = globalThis.EngroveTraceProjectPackage;
  const button = document.getElementById("exportTraceProject");
  if (!production || !base || !button) throw new Error("Validated package export runtime failed to load.");

  async function exportValidatedPackage(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    try {
      const model = await globalThis.manualTraceProjectModelFromWorkspace(true);
      const result = await production.buildValidatedZipPackage(model, {
        readmeText: "Engrove Trace Project Package v1\n\nGenerated locally by Engrove Manual Trace.\n"
      });
      base.downloadZip(S.project_meta?.name || "engrove_trace_project", result.zipBytes);
      const status = document.getElementById("packageViewStatus");
      if (status) status.textContent = `${model.traces.length} stored views exported and contract-validated.`;
    } catch (error) {
      console.error(error);
      const details = Array.isArray(error.diagnostics) && error.diagnostics.length
        ? `\n\n${error.diagnostics.join("\n")}`
        : "";
      alert(`Project package export failed: ${error.message}${details}`);
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", exportValidatedPackage, { capture: true });
  globalThis.exportValidatedTraceProjectPackage = exportValidatedPackage;
})();
