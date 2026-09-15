/**
 * Renders docs/USER-GUIDE.md into a TypeScript module the app imports.
 *
 * One source of truth: the guide people read inside the app is the same file
 * that lives in the repo, so the two cannot drift. Generated at build time
 * rather than read from disk at runtime, because a serverless bundle does not
 * reliably carry files that nothing imported.
 */
import { marked } from "marked";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SOURCE = "docs/USER-GUIDE.md";
const OUT = "src/generated/guide.ts";

const md = readFileSync(SOURCE, "utf8");

// The page supplies its own masthead and jump nav, so strip everything the
// markdown carries for a standalone reader: the H1, the tagline, the status
// line, the contents list, and the horizontal rules between sections (the h2
// rule in CSS already draws the net).
const body = md
  .replace(/^# .*\n/, "")
  .replace(/^\*\*Book\. Check in\. Queue\. Play\.\*\*\n/m, "")
  .replace(/^\*\*Live at[\s\S]*?\*\*hello@aiops\.ae\*\*\n/m, "")
  .replace(/## Contents[\s\S]*?(?=\n---\n)/, "")
  .replace(/^---\s*$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const sections = [];

marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const inline = this.parser.parseInline(tokens);
      const plain = inline.replace(/<[^>]+>/g, "");
      const id = slug(plain);
      if (depth === 2) sections.push({ id, title: plain.replace(/^\d+\.\s*/, "") });
      return `<h${depth} id="${id}">${inline}</h${depth}>\n`;
    },
  },
});

let html = marked.parse(body);

// A wide table scrolls inside its own box rather than pushing the page sideways.
html = html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, "</table></div>");

mkdirSync("src/generated", { recursive: true });
writeFileSync(
  OUT,
  `// GENERATED FROM ${SOURCE} by scripts/build-guide.mjs. Do not edit by hand.\n` +
    `export const GUIDE_HTML = ${JSON.stringify(html)};\n` +
    `export type GuideSection = { id: string; title: string };\n` +
    `export const GUIDE_SECTIONS: GuideSection[] = ${JSON.stringify(sections)};\n`,
);

console.log(`guide: ${sections.length} sections, ${(html.length / 1024).toFixed(1)} kB`);
