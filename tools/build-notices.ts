import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist/licenses', { recursive: true });
await copyFile('LICENSE', 'dist/licenses/ZXR-APACHE-2.0.txt');
await copyFile('reference/zork2/LICENSE', 'dist/licenses/ZORK-II-MIT.txt');
await copyFile('reference/zork2/PROVENANCE.md', 'dist/licenses/ZORK-II-PROVENANCE.md');
