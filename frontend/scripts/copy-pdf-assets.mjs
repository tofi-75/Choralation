/** Ship PDF fonts/decoders on our own origin; never contact a document CDN. */
import { cpSync, mkdirSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  const target = new URL(`../public/assets/pdfjs/${directory}/`, import.meta.url);
  mkdirSync(target, { recursive: true });
  cpSync(
    fileURLToPath(new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url)),
    fileURLToPath(target),
    { recursive: true },
  );
}
