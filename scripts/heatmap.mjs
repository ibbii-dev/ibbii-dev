// Generates dark, themed contribution heatmaps from a user's public GitHub contribution calendar.
// Usage: node scripts/heatmap.mjs <username> <outDir>
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [user = "ibbii-dev", outDir = "dist"] = process.argv.slice(2);

const THEMES = {
  itachi: {
    bg: "#000000", border: "#2a0a0e", empty: "#160a0c",
    levels: ["#4a0a10", "#8a0d18", "#c1121f", "#ff2a3a"],
    accent: "#e0182a", text: "#dddddd", muted: "#7a6a6a",
    title: "MISSION CALENDAR",
  },
  tech: {
    bg: "#000000", border: "#0b2a14", empty: "#08140b",
    levels: ["#0b3d1a", "#0f6d2c", "#12a83c", "#00ff41"],
    accent: "#00ff41", text: "#c9ffd5", muted: "#4d8a5a",
    title: "$ git log --calendar",
  },
};

const res = await fetch(`https://github.com/users/${user}/contributions`, {
  headers: { "User-Agent": "profile-heatmap" },
});
if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
const html = await res.text();

// day cells: id, date, level
const days = [];
for (const m of html.matchAll(/<td[^>]*?data-date="([\d-]+)"[^>]*?>/g)) {
  const tag = m[0];
  const id = /id="([^"]+)"/.exec(tag)?.[1];
  const level = Number(/data-level="(\d)"/.exec(tag)?.[1] ?? 0);
  days.push({ id, date: m[1], level, count: 0 });
}
// counts come from the tooltips: "N contributions on ..." / "No contributions on ..."
const counts = new Map();
for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
  const n = /^(\d+) contribution/.exec(m[2].trim());
  counts.set(m[1], n ? Number(n[1]) : 0);
}
for (const d of days) d.count = counts.get(d.id) ?? 0;
days.sort((a, b) => a.date.localeCompare(b.date));
if (!days.length) throw new Error("No contribution data found");

const total = days.reduce((s, d) => s + d.count, 0);
const start = new Date(days[0].date + "T00:00:00Z");
start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // back to Sunday
const DAY = 86400000;

const CELL = 16, GAP = 4, STEP = CELL + GAP;
const TOP = 92;
const weeks = Math.floor((new Date(days.at(-1).date + "T00:00:00Z") - start) / DAY / 7) + 1;
const W = Math.max(1200, 56 + weeks * STEP + 32);
const H = TOP + 7 * STEP + 56;
const LEFT = Math.max(56, Math.round((W - (weeks * STEP - GAP)) / 2));
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function render(t) {
  const cells = [];
  const months = [];
  let lastMonth = -1;
  for (const d of days) {
    const dt = new Date(d.date + "T00:00:00Z");
    const col = Math.floor((dt - start) / DAY / 7);
    const row = dt.getUTCDay();
    const x = LEFT + col * STEP, y = TOP + row * STEP;
    const fill = d.level ? t.levels[d.level - 1] : t.empty;
    const glow = d.level === 4 ? ' filter="url(#glow)"' : "";
    const delay = (col * 0.018).toFixed(3);
    cells.push(`<rect class="c" style="animation-delay:${delay}s" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="4" fill="${fill}"${glow}><title>${d.count} on ${d.date}</title></rect>`);
    if (row === 0 && dt.getUTCDate() <= 7 && dt.getUTCMonth() !== lastMonth) {
      lastMonth = dt.getUTCMonth();
      months.push(`<text x="${x}" y="${TOP - 12}" class="m">${MONTHS[lastMonth]}</text>`);
    }
  }
  const legendX = W - 32 - 5 * (CELL + 4) - 80;
  const legend = [t.empty, ...t.levels]
    .map((c, i) => `<rect x="${legendX + 42 + i * (CELL + 4)}" y="${H - 38}" width="${CELL}" height="${CELL}" rx="4" fill="${c}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    text { font-family: 'Segoe UI', Inter, system-ui, -apple-system, Arial, sans-serif; }
    .t { font-size: 20px; font-weight: 800; letter-spacing: 3px; fill: ${t.accent}; }
    .s { font-size: 14px; fill: ${t.text}; }
    .s b { font-weight: 800; fill: ${t.accent}; }
    .m, .d, .l { font-size: 12px; fill: ${t.muted}; }
    .c { opacity: 0; animation: in .5s ease-out forwards; }
    @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  </style>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="${t.bg}" stroke="${t.border}"/>
  <text x="${LEFT}" y="44" class="t">${t.title}</text>
  <text x="${W - 32}" y="44" class="s" text-anchor="end"><tspan font-weight="800" fill="${t.accent}">${total}</tspan> contributions in the last year</text>
  ${months.join("\n  ")}
  <text x="${LEFT - 12}" y="${TOP + 1 * STEP + 12}" class="d" text-anchor="end">Mon</text>
  <text x="${LEFT - 12}" y="${TOP + 3 * STEP + 12}" class="d" text-anchor="end">Wed</text>
  <text x="${LEFT - 12}" y="${TOP + 5 * STEP + 12}" class="d" text-anchor="end">Fri</text>
  ${cells.join("\n  ")}
  <text x="${legendX + 34}" y="${H - 25}" class="l" text-anchor="end">Less</text>
  ${legend}
  <text x="${legendX + 46 + 5 * (CELL + 4)}" y="${H - 25}" class="l">More</text>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  writeFileSync(join(outDir, `heatmap-${name}.svg`), render(theme));
}
console.log(`Wrote ${Object.keys(THEMES).length} heatmaps for ${user}: ${days.length} days, ${total} contributions`);
