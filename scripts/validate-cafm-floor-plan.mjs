/**
 * Batch-check CAFM floor plan SVGs for label/polygon layer structure.
 *
 * Usage:
 *   node scripts/validate-cafm-floor-plan.mjs "PILLOW ES.svg"
 *   node scripts/validate-cafm-floor-plan.mjs --all-local
 *   node scripts/validate-cafm-floor-plan.mjs --url "https://.../PEREZ%20ES.svg"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const localPlansDir = path.resolve(projectRoot, "public/floor-plans");

function auditSvgContent(svgContent, label) {
  const hasCafmId = svgContent.includes('id="CAFM_ID"');
  const hasCafmSpace = svgContent.includes('id="CAFM_SPACE"');
  const rawTextCount = (svgContent.match(/<text[\s>]/g) || []).length;
  const textGroups = (svgContent.match(/<g id="TEXT/g) || []).length;
  const mtextGroups = (svgContent.match(/<g id="MTEXT/g) || []).length;
  const nestedWrapperCount = (
    svgContent.match(
      /<g id="TEXT[^"]*"[\s\S]*?<g transform="[^"]*">[\s\S]*?<text/g
    ) || []
  ).length;
  const shapeCount = hasCafmSpace
    ? (
        svgContent
          .split('id="CAFM_SPACE"')[1]
          ?.match(/<(path|rect|polygon|polyline)\b/g) || []
      ).length
    : 0;

  const warnings = [];
  if (!hasCafmSpace) warnings.push("Missing CAFM_SPACE layer");
  if (!hasCafmId) warnings.push("Missing CAFM_ID layer");
  if (hasCafmId && rawTextCount === 0) warnings.push("CAFM_ID has no <text> labels");
  if (textGroups + mtextGroups === 0 && hasCafmId) {
    warnings.push("No TEXT/MTEXT label groups found");
  }

  return {
    label,
    ok:
      warnings.length === 0 &&
      rawTextCount > 0 &&
      textGroups + mtextGroups > 0 &&
      shapeCount > 0,
    rawTextCount,
    labelGroupCount: textGroups + mtextGroups,
    shapeCount,
    nestedWrapperCount,
    warnings,
  };
}

async function loadSvg(source) {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return await (await fetch(source)).text();
  }
  const filePath = path.isAbsolute(source)
    ? source
    : path.join(localPlansDir, source);
  return fs.readFileSync(filePath, "utf8");
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage:");
  console.log('  node scripts/validate-cafm-floor-plan.mjs "PILLOW ES.svg"');
  console.log("  node scripts/validate-cafm-floor-plan.mjs --all-local");
  console.log('  node scripts/validate-cafm-floor-plan.mjs --url "https://..."');
  process.exit(1);
}

let items = [];
if (args[0] === "--all-local") {
  items = fs
    .readdirSync(localPlansDir)
    .filter(
      (name) => name.toLowerCase().endsWith(".svg") && name !== "default-plan.svg"
    )
    .map((name) => ({ label: name, source: path.join(localPlansDir, name) }));
} else if (args[0] === "--url") {
  items = [{ label: args[1], source: args[1] }];
} else {
  items = [{ label: args[0], source: args[0] }];
}

let failed = 0;
for (const item of items) {
  const svg = await loadSvg(item.source);
  const audit = auditSvgContent(svg, item.label);
  const status = audit.ok ? "OK" : "WARN";
  console.log(
    `${status}  ${audit.label} — ${audit.labelGroupCount} label groups, ${audit.rawTextCount} text nodes, ${audit.shapeCount} shapes` +
      (audit.nestedWrapperCount > 0
        ? `, ${audit.nestedWrapperCount} nested wrappers`
        : "")
  );
  if (audit.warnings.length) {
    console.log(`      ${audit.warnings.join("; ")}`);
  }
  if (!audit.ok) failed++;
}

if (failed > 0) process.exit(1);
