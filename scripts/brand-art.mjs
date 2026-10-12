import { writeFile } from "node:fs/promises";
// Reusable vector brand assets, drawn from the references, never screenshot backgrounds.
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const dots = Array.from({ length: 1100 }, () => {
  const x = 10 + rand() * 100,
    y = 9 + rand() * 126,
    r = 0.25 + rand() * 0.85;
  return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="black" opacity="${(0.15 + rand() * 0.75).toFixed(2)}"/>`;
}).join("");
await writeFile(
  "public/brand.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140"><defs><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter><mask id="texture"><rect width="120" height="140" fill="white"/>${dots}<path d="M15 77L99 39M18 95L107 62M29 114L104 86" stroke="black" opacity=".25" stroke-width="1"/></mask></defs><path d="M59 9C29 8 14 40 13 75c-1 36 17 58 45 59 32 1 49-25 49-58C107 40 90 9 59 9Z" fill="#080a0b" mask="url(#texture)" filter="url(#rough)"/><path d="M25 54c15-8 54-10 70-1-1 5-14 10-32 11-18 2-35-3-38-10Z" fill="#fff" filter="url(#rough)"/><path d="M32 96q27 10 52-3-24 20-52 3" fill="white" opacity=".22"/></svg>`,
);
let strokes = "";
for (let i = 0; i < 44; i++) {
  const rx = 50 + i * 9.8,
    ry = 66 + i * 13.8;
  const x = 445 + Math.sin(i * 0.25) * 10,
    y = 415 + Math.cos(i * 0.19) * 12;
  strokes += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" stroke-width="${i % 3 === 0 ? 4 : 2}" stroke-dasharray="${120 + rand() * 130} ${3 + rand() * 5} ${50 + rand() * 180} ${6 + rand() * 8}" transform="rotate(-24 450 450)"/>`;
}
await writeFile(
  "public/brush.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><defs><filter id="paint"><feTurbulence type="fractalNoise" baseFrequency=".022 .085" numOctaves="3" seed="12" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="13"/></filter></defs><g fill="none" stroke="#090b0c" filter="url(#paint)">${strokes}</g></svg>`,
);
console.log("Textured brand and fingerprint brush generated.");
