import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const folder = 'evidence/live-files';
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(`${folder}/digitalx-validacao.txt`, 'DIGITALX - arquivo para validacao real de upload e download.\nSem dados pessoais.\n');
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="black"/><text x="22" y="80" fill="white" font-size="28">DIGITALX</text><text x="22" y="120" fill="white" font-size="15">VALIDACAO DE ARQUIVO REAL</text></svg>')).png().toFile(`${folder}/digitalx-validacao.png`);
const stream = 'BT /F1 18 Tf 50 760 Td (DIGITALX - Validacao real de PDF) Tj ET';
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await fs.writeFile(`${folder}/digitalx-validacao.pdf`, pdf);
for (const file of await fs.readdir(folder)) {
  const bytes = await fs.readFile(`${folder}/${file}`);
  console.log(JSON.stringify({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
}
