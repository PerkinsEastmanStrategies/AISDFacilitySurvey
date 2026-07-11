/**
 * Strip Affinity/CAFM floor-plan SVGs down to what the AISD Principal Survey
 * tool needs: room labels (#CAFM_ID), boundaries (#CAFM_SPACE), and optional
 * visual structure layers (walls/doors/windows/floors).
 *
 * Removes furniture/fixtures, unused CAFM layers, DOCTYPE, editor serif:id
 * noise (except TEXT/MTEXT), and redundant per-entity path ids.
 *
 * Usage:
 *   node scripts/strip-cafm-svg.mjs "PILLOW ES.svg"
 *   node scripts/strip-cafm-svg.mjs "PILLOW ES.svg" --out "PILLOW ES.stripped.svg"
 *   node scripts/strip-cafm-svg.mjs --all-local --outdir ./public/floor-plans/stripped
 *   node scripts/strip-cafm-svg.mjs "PILLOW ES.svg" --minimal
 *   node scripts/strip-cafm-svg.mjs "PILLOW ES.svg" --in-place
 *   node scripts/strip-cafm-svg.mjs --url "https://.../PEREZ%20ES.svg" --out PEREZ.es.svg
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const localPlansDir = path.resolve(projectRoot, "public/floor-plans");

/** Layers required for room detection / assignment. */
const REQUIRED_LAYERS = new Set(["CAFM_ID", "CAFM_SPACE"]);

/**
 * Visual layers kept by default so the plan remains readable in the survey UI.
 * Override with --minimal (required only) or --keep=A-WALLS,A-DOOR,...
 */
const DEFAULT_VISUAL_LAYERS = new Set([
  "A-WALLS",
  "A-DOOR",
  "A-WIN",
  "A-FLOR",
  "A-FLOR-STRS",
  "A-FLR-TPTN",
  "A-COLS",
  "CAFM_BLDG_OTLN",
]);

/** Always dropped unless explicitly listed in --keep. */
const DEFAULT_DROP_LAYERS = new Set([
  "A-FURN",
  "A-APPLI",
  "P-FIXT",
  "A-TEXT",
  "CAFM_Gross",
  "CAFM_MeasuredGross",
  "CAFM_Space_Label",
  "CAFM_BLDG_LABL",
  "_0",
]);

/** CAD entity id prefixes that are safe to strip from path/shape elements. */
const STRIPPABLE_ENTITY_ID =
  /^(LINE|LWPOLYLINE|CIRCLE|ARC|HATCH|INSERT|SOLID|POINT|ELLIPSE|SPLINE|POLYLINE|DIMENSION|LEADER|MLINE|WIPEOUT|REGION|3DFACE|TRACE|VIEWPORT|XLINE|RAY|TOLERANCE|ACAD_PROXY)\d*$/i;

function parseArgs(argv) {
  const args = {
    sources: [],
    out: null,
    outdir: null,
    inPlace: false,
    allLocal: false,
    url: null,
    minimal: false,
    keep: null,
    drop: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all-local") args.allLocal = true;
    else if (a === "--in-place") args.inPlace = true;
    else if (a === "--minimal") args.minimal = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--outdir") args.outdir = argv[++i];
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--keep") args.keep = argv[++i];
    else if (a.startsWith("--keep=")) args.keep = a.slice("--keep=".length);
    else if (a === "--drop") args.drop = argv[++i];
    else if (a.startsWith("--drop=")) args.drop = a.slice("--drop=".length);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else args.sources.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`Strip CAFM floor-plan SVGs for the AISD Principal Survey tool.

Usage:
  node scripts/strip-cafm-svg.mjs <file.svg> [--out out.svg]
  node scripts/strip-cafm-svg.mjs --all-local --outdir ./stripped
  node scripts/strip-cafm-svg.mjs --url <url> --out out.svg

Options:
  --minimal          Keep only #CAFM_ID and #CAFM_SPACE (no walls/doors/etc.)
  --keep=A,B,C       Extra layer ids to keep (comma-separated)
  --drop=A,B,C       Extra layer ids to drop (comma-separated)
  --out <path>       Output file (single input only)
  --outdir <dir>     Write stripped files into this directory
  --in-place         Overwrite the source file
  --dry-run          Report sizes / layers without writing
  --all-local        Process every *.svg in public/floor-plans (except default-plan.svg)
  --url <url>        Fetch a remote SVG
`);
}

function resolveKeepSet(args) {
  const keep = new Set(REQUIRED_LAYERS);
  if (!args.minimal) {
    for (const id of DEFAULT_VISUAL_LAYERS) keep.add(id);
  }
  if (args.keep) {
    for (const id of args.keep.split(",").map((s) => s.trim()).filter(Boolean)) {
      keep.add(id);
    }
  }
  if (args.drop) {
    for (const id of args.drop.split(",").map((s) => s.trim()).filter(Boolean)) {
      keep.delete(id);
    }
  }
  // Required layers cannot be dropped.
  for (const id of REQUIRED_LAYERS) keep.add(id);
  return keep;
}

async function loadSvg(source) {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${source}`);
    return await res.text();
  }
  const filePath = path.isAbsolute(source)
    ? source
    : path.join(localPlansDir, source);
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Find top-level <g id="...">...</g> blocks inside the root <svg>.
 * Uses a nesting counter so nested groups inside a layer stay intact.
 */
function extractTopLevelGroups(svgInner) {
  const groups = [];
  const re = /<g\b[^>]*>/gi;
  let match;
  while ((match = re.exec(svgInner)) !== null) {
    const openTag = match[0];
    const start = match.index;
    const idMatch = openTag.match(/\bid="([^"]+)"/i);
    if (!idMatch) continue;

    // Only treat as a top-level layer if we are at depth 0 relative to svgInner
    // content that hasn't already been claimed. Walk with a depth counter from
    // this open tag.
    let depth = 1;
    let i = start + openTag.length;
    const openRe = /<g\b[^>]*>|<\/g>/gi;
    openRe.lastIndex = i;
    let m;
    let end = -1;
    while ((m = openRe.exec(svgInner)) !== null) {
      if (m[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          end = m.index + m[0].length;
          break;
        }
      } else {
        depth++;
      }
    }
    if (end < 0) continue;

    // Skip nested groups: only accept groups whose start is not inside a
    // previously recorded top-level group.
    const nested = groups.some((g) => start > g.start && start < g.end);
    if (nested) continue;

    groups.push({
      id: idMatch[1],
      start,
      end,
      content: svgInner.slice(start, end),
    });
    re.lastIndex = end;
  }
  return groups;
}

function splitSvg(svg) {
  const svgOpenMatch = svg.match(/<svg\b[^>]*>/i);
  if (!svgOpenMatch) throw new Error("No <svg> root element found");
  const openTag = svgOpenMatch[0];
  const openIndex = svgOpenMatch.index;
  const closeIndex = svg.lastIndexOf("</svg>");
  if (closeIndex < 0) throw new Error("No </svg> closing tag found");

  const prefix = svg.slice(0, openIndex);
  const inner = svg.slice(openIndex + openTag.length, closeIndex);
  const suffix = svg.slice(closeIndex + "</svg>".length);
  return { prefix, openTag, inner, suffix };
}

function cleanOpenTag(openTag, keepSerifNs) {
  let tag = openTag;
  // Drop unused xlink namespace when no xlink: attrs remain in the file
  // (caller may re-check); always drop DOCTYPE via prefix cleaning.
  if (!keepSerifNs) {
    tag = tag.replace(/\s+xmlns:serif="[^"]*"/i, "");
  }
  tag = tag.replace(/\s+xmlns:xlink="[^"]*"/i, "");
  tag = tag.replace(/\s+xml:space="preserve"/i, "");
  tag = tag.replace(/\s+version="1\.1"/i, "");
  return tag;
}

/**
 * Strip editor noise inside a kept layer while preserving transforms,
 * geometry, styles, TEXT/MTEXT identity, and text content.
 */
function cleanLayerContent(content, layerId) {
  let out = content;

  // Remove serif:id except TEXT / MTEXT (needed by spaces-data.ts fallback).
  out = out.replace(/\s+serif:id="([^"]*)"/gi, (_, val) => {
    if (val === "TEXT" || val === "MTEXT") return ` serif:id="${val}"`;
    return "";
  });

  // Drop redundant CAD entity ids on shapes (not used for hit-testing).
  // Keep ids on <g> (TEXT16, MTEXT3, layer roots) and any non-entity ids.
  out = out.replace(
    /\s+id="([^"]+)"/gi,
    (full, id) => {
      if (id === layerId) return full;
      if (id.startsWith("TEXT") || id.startsWith("MTEXT")) return full;
      if (STRIPPABLE_ENTITY_ID.test(id)) return "";
      return full;
    }
  );

  // Collapse runs of spaces inside tags introduced by attribute removal.
  out = out.replace(/<([a-zA-Z][\w:-]*)(\s[^>]*?)\s*(\/?)>/g, (_, name, attrs, self) => {
    const cleaned = attrs.replace(/\s{2,}/g, " ").trimEnd();
    return `<${name}${cleaned ? " " + cleaned.trimStart() : ""}${self ? " /" : ""}>`;
  });

  return out;
}

function stripSvg(svg, keepLayers) {
  const { prefix, openTag, inner, suffix } = splitSvg(svg);
  const groups = extractTopLevelGroups(inner);

  const kept = [];
  const dropped = [];
  let orphanTextGroups = 0;

  for (const g of groups) {
    if (keepLayers.has(g.id)) {
      kept.push(g);
      continue;
    }
    // Affinity sometimes parks building labels as top-level TEXT* groups.
    if (/^(TEXT|MTEXT)\d*$/i.test(g.id)) {
      orphanTextGroups++;
      continue;
    }
    dropped.push(g.id);
  }
  if (orphanTextGroups > 0) {
    dropped.push(`${orphanTextGroups} orphan TEXT/MTEXT group(s)`);
  }

  // Rebuild inner: keep non-group preamble (rare) + kept groups in original order.
  let cursor = 0;
  const parts = [];
  for (const g of groups) {
    if (g.start > cursor) {
      // Preserve tiny whitespace / comments between groups only if preceding a kept group.
      // Skip orphan content that sat before dropped layers.
    }
    if (keepLayers.has(g.id)) {
      parts.push(cleanLayerContent(g.content, g.id));
    }
    cursor = g.end;
  }

  const needsSerif = parts.some(
    (p) => p.includes('serif:id="TEXT"') || p.includes('serif:id="MTEXT"')
  );
  const newOpen = cleanOpenTag(openTag, needsSerif);
  const newInner = "\n" + parts.join("\n") + "\n";
  const newPrefix = prefix
    .replace(/<!DOCTYPE[^>]*>\s*/gi, "")
    .replace(/<!--[\s\S]*?-->\s*/g, "");

  // If xlink still used inside content, restore namespace.
  let finalOpen = newOpen;
  if (/xlink:/i.test(newInner) && !/xmlns:xlink=/i.test(finalOpen)) {
    finalOpen = finalOpen.replace(
      /<svg\b/i,
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
    );
  }

  const result = `${newPrefix.trim() ? newPrefix.trim() + "\n" : ""}${finalOpen}${newInner}</svg>${suffix}`;

  return {
    svg: result,
    keptIds: kept.map((g) => g.id),
    droppedIds: dropped,
    missingRequired: [...REQUIRED_LAYERS].filter(
      (id) => !groups.some((g) => g.id === id)
    ),
  };
}

function auditQuick(svgContent) {
  const hasCafmId = svgContent.includes('id="CAFM_ID"');
  const hasCafmSpace = svgContent.includes('id="CAFM_SPACE"');
  const textCount = (svgContent.match(/<text[\s>]/g) || []).length;
  const textGroups = (svgContent.match(/<g[^>]*\bid="TEXT/g) || []).length;
  const mtextGroups = (svgContent.match(/<g[^>]*\bid="MTEXT/g) || []).length;
  const serifText =
    (svgContent.match(/serif:id="TEXT"/g) || []).length +
    (svgContent.match(/serif:id="MTEXT"/g) || []).length;
  let shapeCount = 0;
  if (hasCafmSpace) {
    const after = svgContent.split('id="CAFM_SPACE"')[1] || "";
    shapeCount = (after.match(/<(path|rect|polygon|polyline)\b/g) || []).length;
  }
  return {
    hasCafmId,
    hasCafmSpace,
    textCount,
    labelGroupCount: textGroups + mtextGroups,
    serifText,
    shapeCount,
    ok:
      hasCafmId &&
      hasCafmSpace &&
      textCount > 0 &&
      textGroups + mtextGroups > 0 &&
      shapeCount > 0,
  };
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function resolveOutputPath(args, sourceLabel) {
  if (args.inPlace && !args.url) {
    return path.isAbsolute(sourceLabel)
      ? sourceLabel
      : path.join(localPlansDir, sourceLabel);
  }
  if (args.out) return path.resolve(args.out);
  if (args.outdir) {
    const base = path.basename(sourceLabel).replace(/\.svg$/i, "") + ".svg";
    return path.join(path.resolve(args.outdir), base);
  }
  // Default: sibling *.stripped.svg next to source (or in local plans dir)
  const baseName = path.basename(sourceLabel).replace(/\.svg$/i, "");
  const dir = path.isAbsolute(sourceLabel)
    ? path.dirname(sourceLabel)
    : localPlansDir;
  return path.join(dir, `${baseName}.stripped.svg`);
}

async function processOne(source, label, args, keepLayers) {
  const original = await loadSvg(source);
  const before = Buffer.byteLength(original, "utf8");
  const stripped = stripSvg(original, keepLayers);
  const after = Buffer.byteLength(stripped.svg, "utf8");
  const audit = auditQuick(stripped.svg);
  const ratio = before > 0 ? ((1 - after / before) * 100).toFixed(1) : "0";

  console.log(`\n${label}`);
  console.log(`  ${formatKb(before)} → ${formatKb(after)}  (−${ratio}%)`);
  console.log(`  kept:    ${stripped.keptIds.join(", ") || "(none)"}`);
  console.log(`  dropped: ${stripped.droppedIds.join(", ") || "(none)"}`);
  if (stripped.missingRequired.length) {
    console.log(`  MISSING: ${stripped.missingRequired.join(", ")}`);
  }
  console.log(
    `  audit:   ${audit.ok ? "OK" : "WARN"} — ${audit.labelGroupCount} label groups, ${audit.textCount} text, ${audit.shapeCount} space shapes` +
      (audit.serifText ? `, ${audit.serifText} serif TEXT/MTEXT` : "")
  );

  if (args.dryRun) return { ok: audit.ok && stripped.missingRequired.length === 0 };

  const outPath = resolveOutputPath(args, label);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, stripped.svg, "utf8");
  console.log(`  wrote:   ${outPath}`);
  return { ok: audit.ok && stripped.missingRequired.length === 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (args.sources.length === 0 && !args.allLocal && !args.url)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const keepLayers = resolveKeepSet(args);
  console.log(
    `Keep layers: ${[...keepLayers].sort().join(", ")}${args.minimal ? " (minimal)" : ""}`
  );

  const items = [];
  if (args.allLocal) {
    const names = fs
      .readdirSync(localPlansDir)
      .filter(
        (name) =>
          name.toLowerCase().endsWith(".svg") &&
          name !== "default-plan.svg" &&
          !name.endsWith(".stripped.svg")
      );
    for (const name of names) {
      items.push({ label: name, source: path.join(localPlansDir, name) });
    }
  } else if (args.url) {
    const label = path.basename(decodeURIComponent(args.url.split("?")[0]));
    items.push({ label, source: args.url });
  } else {
    for (const src of args.sources) {
      items.push({ label: src, source: src });
    }
  }

  if (items.length === 0) {
    console.error("No SVG files to process.");
    process.exit(1);
  }
  if (args.out && items.length > 1) {
    console.error("--out can only be used with a single input; use --outdir.");
    process.exit(1);
  }

  let failed = 0;
  for (const item of items) {
    const result = await processOne(item.source, item.label, args, keepLayers);
    if (!result.ok) failed++;
  }

  if (failed > 0) {
    console.error(`\n${failed} file(s) failed CAFM audit after strip.`);
    process.exit(1);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
