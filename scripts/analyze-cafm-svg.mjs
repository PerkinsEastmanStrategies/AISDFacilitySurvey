import fs from "fs";

const url = process.argv[2] || "https://mgflyiwrzcmxxuxpfotk.supabase.co/storage/v1/object/public/floor-plans/PEREZ%20ES.svg";
const svg = await (await fetch(url)).text();

const cafmIdOpen = svg.indexOf('id="CAFM_ID"');
const cafmSpaceOpen = svg.indexOf('id="CAFM_SPACE"');
console.log("CAFM_ID index:", cafmIdOpen);
console.log("CAFM_SPACE index:", cafmSpaceOpen);

const idTag = svg.slice(cafmIdOpen - 20, cafmIdOpen + 120);
const spaceTag = svg.slice(cafmSpaceOpen - 20, cafmSpaceOpen + 120);
console.log("CAFM_ID tag:", idTag.replace(/\s+/g, " "));
console.log("CAFM_SPACE tag:", spaceTag.replace(/\s+/g, " "));

const idSection = svg.slice(cafmIdOpen, cafmSpaceOpen);
const texts = [...idSection.matchAll(/<text[\s\S]*?<\/text>/g)];
console.log("text elements in CAFM_ID section:", texts.length);

const parentIds = new Map();
for (const match of idSection.matchAll(/<g id="([^"]+)"[\s\S]*?<text/g)) {
  parentIds.set(match[1], (parentIds.get(match[1]) || 0) + 1);
}
console.log("parent group ids before text (sample):", [...parentIds.entries()].slice(0, 20));

const textParents = [];
for (const match of idSection.matchAll(/<g id="([^"]+)"[^>]*>[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>/g)) {
  textParents.push({ parent: match[1], text: match[2].replace(/<[^>]+>/g, "").trim() });
}
console.log("parsed text samples:", textParents.slice(0, 15));

const mtextText = textParents.filter((t) => t.parent.startsWith("TEXT") || t.parent.startsWith("MTEXT"));
console.log("TEXT/MTEXT parent count:", mtextText.length);

const spaceSection = svg.slice(cafmSpaceOpen, cafmSpaceOpen + 50000);
const paths = (spaceSection.match(/<path/g) || []).length;
const rects = (spaceSection.match(/<rect/g) || []).length;
console.log("CAFM_SPACE paths (first 50k chars):", paths, "rects:", rects);
