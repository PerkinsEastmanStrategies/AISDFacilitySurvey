const urls = [
  "https://mgflyiwrzcmxxuxpfotk.supabase.co/storage/v1/object/public/floor-plans/BARTON%20HILLS%20ES.svg",
  "https://mgflyiwrzcmxxuxpfotk.supabase.co/storage/v1/object/public/floor-plans/BARTON%20HILLS%20ES%20L1.svg",
  "https://mgflyiwrzcmxxuxpfotk.supabase.co/storage/v1/object/public/floor-plans/BARTON%20HILLS%20ES%20L2.svg",
];

const GENERIC = /^(?:\d{3}[A-Z]{0,6}|\d{2}[A-Z]{2,6})$/;

function extractLabels(svg) {
  const labels = [];
  for (const m of svg.matchAll(/<text[^>]*>[\s\S]*?<\/text>/g)) {
    const content = m[0]
      .replace(/<[^>]+>/g, "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (content) labels.push(content);
  }
  return labels;
}

function countBoundaryPaths(svg) {
  let boundary = 0;
  let closed = 0;
  for (const m of svg.matchAll(/<path[^>]*style="([^"]*)"[^>]*d="([^"]*)"/g)) {
    const s = m[1].toLowerCase();
    const d = m[2].trim();
    if (!s.includes("stroke") || s.includes("font-size")) continue;
    const fillMatch = s.match(/fill:([^;]+)/);
    if (fillMatch) {
      const fill = fillMatch[1].trim();
      if (fill !== "none" && fill !== "#ffffff" && fill !== "white") continue;
    }
    boundary++;
    if (/[zZ]\s*$/.test(d)) closed++;
  }
  return { boundary, closed };
}

for (const url of urls) {
  const svg = await (await fetch(url)).text();
  const labels = extractLabels(svg);
  const roomLabels = labels.filter((t) => GENERIC.test(t) && t.length <= 12);
  const { boundary, closed } = countBoundaryPaths(svg);

  console.log("\n===", url.split("/").pop(), "===");
  console.log("CAFM_ID:", svg.includes('id="CAFM_ID"'));
  console.log("text labels:", labels.length, "room-like:", roomLabels.length);
  console.log("sample rooms:", [...new Set(roomLabels)].slice(0, 15).join(", "));
  console.log("boundary paths:", boundary, "closed (z):", closed);
}
