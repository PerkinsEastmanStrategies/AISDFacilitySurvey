/**
 * Remove CAFM labels whose bounding boxes touch/overlap another label.
 * Uses Playwright so getBBox respects Affinity transforms.
 *
 * Usage:
 *   node scripts/remove-touching-labels.mjs --in path/to/plan.svg --out cleaned.svg
 *   node scripts/remove-touching-labels.mjs --in plan.svg --upload "GRAHAM ES L1.svg"
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    in: null,
    out: null,
    upload: null,
    pad: 50, // CAD units after matrix(300) — ~touching threshold in plan space
    scale: 3.75, // match desktop label enlargement in the survey UI
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in") args.in = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--upload") args.upload = argv[++i];
    else if (a === "--pad") args.pad = Number(argv[++i]);
    else if (a === "--scale") args.scale = Number(argv[++i]);
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function removeTouchingLabels(svgText, { pad, scale }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const result = await page.evaluate(
    ({ svgText, pad, scale }) => {
      const host = document.createElement("div");
      host.style.cssText =
        "position:fixed;left:0;top:0;width:1600px;height:1200px;background:#fff;";
      document.body.replaceChildren(host);

      const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (!svg) return { error: "no svg root" };

      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      host.appendChild(document.importNode(svg, true));
      const mounted = host.querySelector("svg");
      if (!mounted) return { error: "mount failed" };

      const cafm = mounted.querySelector("#CAFM_ID");
      if (!cafm) return { error: "missing #CAFM_ID" };

      // Each Affinity label is typically: g#TEXT… > g[matrix] > text
      // Prefer the outermost TEXT/MTEXT group; fall back to any g with text.
      let labels = Array.from(
        cafm.querySelectorAll(':scope > g[id^="TEXT"], :scope > g[id^="MTEXT"]')
      );
      if (labels.length === 0) {
        labels = Array.from(cafm.querySelectorAll("g")).filter(
          (g) => g.querySelector(":scope > text, :scope > g > text")
        );
      }
      // Deduplicate nested: keep only top-most label groups under CAFM_ID.
      labels = labels.filter((g) => {
        let p = g.parentElement;
        while (p && p !== cafm) {
          if (labels.includes(p)) return false;
          p = p.parentElement;
        }
        return true;
      });

      const boxes = [];
      for (let i = 0; i < labels.length; i++) {
        const el = labels[i];
        try {
          // getBBox() ignores this group's matrix. Transform local corners by
          // the Affinity matrix (optionally pre-scaled to match survey UI).
          const b = el.getBBox();
          if (!(b.width > 0 && b.height > 0)) continue;

          const transform = el.getAttribute("transform") || "";
          const match = transform.match(/matrix\s*\(\s*([^)]+)\)/i);
          let a = 1,
            bb = 0,
            c = 0,
            d = 1,
            e = 0,
            f = 0;
          if (match) {
            const parts = match[1]
              .trim()
              .split(/[\s,]+/)
              .map(Number);
            if (parts.length >= 6 && parts.every(Number.isFinite)) {
              [a, bb, c, d, e, f] = parts;
              a *= scale;
              bb *= scale;
              c *= scale;
              d *= scale;
            }
          }

          const corners = [
            [b.x, b.y],
            [b.x + b.width, b.y],
            [b.x, b.y + b.height],
            [b.x + b.width, b.y + b.height],
          ].map(([x, y]) => [a * x + c * y + e, bb * x + d * y + f]);

          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
          for (const [x, y] of corners) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }

          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          boxes.push({
            index: i,
            id: el.getAttribute("id") || `label-${i}`,
            text,
            x: minX - pad,
            y: minY - pad,
            w: maxX - minX + pad * 2,
            h: maxY - minY + pad * 2,
          });
        } catch {
          // skip
        }
      }

      const touches = (a, b) =>
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;

      const remove = new Set();
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (touches(boxes[i], boxes[j])) {
            remove.add(boxes[i].index);
            remove.add(boxes[j].index);
          }
        }
      }

      const removedSamples = [];
      for (const idx of remove) {
        const el = labels[idx];
        if (removedSamples.length < 12) {
          removedSamples.push({
            id: el.getAttribute("id"),
            text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
          });
        }
        el.remove();
      }

      // Serialize without the temporary label scale (we mutated transform for measure).
      // Remount from original and delete by id instead for clean output.
      return {
        total: labels.length,
        measured: boxes.length,
        removeCount: remove.size,
        removeIds: Array.from(remove).map((idx) => labels[idx].getAttribute("id")),
        removedSamples,
      };
    },
    { svgText, pad, scale }
  );

  await browser.close();
  if (result.error) throw new Error(result.error);

  // Apply removals on the original SVG text by id (preserve source transforms).
  // Fallback: if no ids, re-run DOM removal on a fresh parse without scale.
  let cleaned = svgText;
  const ids = (result.removeIds || []).filter(Boolean);
  if (ids.length > 0) {
    const browser2 = await chromium.launch({ headless: true });
    const page2 = await browser2.newPage();
    cleaned = await page2.evaluate(
      ({ svgText, ids }) => {
        const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        const svg = doc.querySelector("svg");
        const idSet = new Set(ids);
        for (const id of idSet) {
          const el = svg.querySelector(`[id="${CSS.escape(id)}"]`);
          if (el) el.remove();
        }
        return new XMLSerializer().serializeToString(doc);
      },
      { svgText, ids }
    );
    await browser2.close();
  }

  return { ...result, cleaned };
}

async function uploadToSupabase(filename, svgContent) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_FLOOR_PLANS_BUCKET || "floor-plans";
  if (!url || !key) throw new Error("Missing Supabase credentials in .env.local");

  const supabase = createClient(url, key);
  const { error } = await supabase.storage.from(bucket).upload(filename, svgContent, {
    contentType: "image/svg+xml",
    upsert: true,
  });
  if (error) throw error;
}

const args = parseArgs(process.argv.slice(2));
if (!args.in) {
  console.error("Usage: node scripts/remove-touching-labels.mjs --in plan.svg [--out cleaned.svg] [--upload name.svg]");
  process.exit(1);
}

const inputPath = path.resolve(args.in);
const svgText = fs.readFileSync(inputPath, "utf8");
console.log(`Reading ${inputPath} (${svgText.length} chars)`);

const result = await removeTouchingLabels(svgText, {
  pad: args.pad,
  scale: args.scale,
});

console.log(
  `labels=${result.total} measured=${result.measured} removing=${result.removeCount}`
);
console.log("samples:", result.removedSamples);

if (args.dryRun) {
  console.log("Dry run — no write/upload");
  process.exit(0);
}

const outPath = args.out
  ? path.resolve(args.out)
  : inputPath.replace(/\.svg$/i, ".cleaned.svg");
fs.writeFileSync(outPath, result.cleaned, "utf8");
console.log(`Wrote ${outPath} (${result.cleaned.length} chars)`);

if (args.upload) {
  await uploadToSupabase(args.upload, result.cleaned);
  console.log(`Uploaded to floor-plans/${args.upload}`);
}
