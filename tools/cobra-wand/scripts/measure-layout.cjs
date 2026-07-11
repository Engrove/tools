// Empirisk layoutmätning (Puppeteer, headless). Ingen gissning — mäter faktiska
// DOM-metrics mot en riktig renderad sida, samma disciplin som CP1-spiken.
const puppeteer = require("puppeteer");

const URL = process.argv[2] || "http://localhost:4173/";
const OUT_PREFIX = process.argv[3] || "before";
const DSF = Number(process.argv[4] || 1);

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: DSF },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById("hud")?.textContent?.includes("watertight"), {
    timeout: 120_000,
    polling: 500,
  });
  // Låt regen-overlay hinna gå bort och rendering stabiliseras.
  await new Promise((r) => setTimeout(r, 600));

  const dpr = Number(process.argv[4] || 1);
  const metrics = await page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const pl = el("panelLeft");
    const pr = el("panelRight");
    const vw = el("viewportWrap");
    const canvas = document.querySelector("#viewport canvas");
    const stationsTable = document.querySelector("table.stations");
    const zoneRows = Array.from(document.querySelectorAll("#panelLeft .field")).map((f) => ({
      scrollWidth: f.scrollWidth,
      clientWidth: f.clientWidth,
    }));
    // Platta ut DOMRect till primitiver — getters ligger på prototypen och
    // överlever inte JSON-serialiseringen mellan Node och sidkontexten.
    const flat = (r) => (r ? { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null);

    return {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      panelLeft: { clientWidth: pl.clientWidth, scrollWidth: pl.scrollWidth, overflowsX: pl.scrollWidth > pl.clientWidth + 1, rect: flat(pl.getBoundingClientRect()) },
      panelRight: { clientWidth: pr.clientWidth, scrollWidth: pr.scrollWidth, overflowsX: pr.scrollWidth > pr.clientWidth + 1, rect: flat(pr.getBoundingClientRect()) },
      viewportWrapRect: flat(vw.getBoundingClientRect()),
      canvasRect: flat(canvas ? canvas.getBoundingClientRect() : null),
      canvasStyleWidth: canvas ? canvas.style.width : null,
      canvasStyleHeight: canvas ? canvas.style.height : null,
      canvasAttrWidth: canvas ? canvas.width : null,
      canvasAttrHeight: canvas ? canvas.height : null,
      stationsTable: stationsTable
        ? { offsetWidth: stationsTable.offsetWidth, parentClientWidth: stationsTable.parentElement.clientWidth, overflowsParent: stationsTable.offsetWidth > stationsTable.parentElement.clientWidth + 1 }
        : null,
      fieldRowsOverflowing: zoneRows.filter((r) => r.scrollWidth > r.clientWidth + 1).length,
      totalFieldRows: zoneRows.length,
    };
  });

  const canvasRight = metrics.canvasRect?.right ?? null;
  const panelRightLeft = metrics.panelRight.rect?.left ?? null;
  const overlapPx = canvasRight !== null && panelRightLeft !== null ? +(canvasRight - panelRightLeft).toFixed(1) : null;
  const wrapRight = metrics.viewportWrapRect?.right ?? null;
  const canvasOverflowsWrapPx =
    canvasRight !== null && wrapRight !== null ? +(canvasRight - wrapRight).toFixed(1) : null;

  console.log(JSON.stringify({ ...metrics, requestedDPR: dpr, canvasOverflowsWrapPx_px: canvasOverflowsWrapPx, canvasOverlapsPanelRight_px: overlapPx }, null, 2));
  console.log("CONSOLE_ERRORS:", JSON.stringify(errors));

  await page.screenshot({ path: `/home/claude/cobra-wand/${OUT_PREFIX}_full.png` });
  const prHandle = await page.$("#panelRight");
  if (prHandle) await prHandle.screenshot({ path: `/home/claude/cobra-wand/${OUT_PREFIX}_panelRight.png` });
  const plHandle = await page.$("#panelLeft");
  if (plHandle) await plHandle.screenshot({ path: `/home/claude/cobra-wand/${OUT_PREFIX}_panelLeft.png` });

  await browser.close();
})().catch((e) => {
  console.error("MEASURE_FAILED:", e);
  process.exit(1);
});
