import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
await mkdir("public", { recursive: true });
const logo = await readFile("public/brand.svg", "utf8");
for (const [name, size, pad] of [
  ["pwa-192.png", 192, 42],
  ["pwa-512.png", 512, 112],
  ["pwa-maskable.png", 512, 130],
  ["apple-touch-icon.png", 180, 39],
]) {
  const mark = await sharp(Buffer.from(logo))
    .resize(size - pad * 2, size - pad * 2, { fit: "contain" })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: mark }])
    .png()
    .toFile(`public/${name}`);
}
console.log("PWA icons generated: 192, 512, maskable, Apple Touch.");
