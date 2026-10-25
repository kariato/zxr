import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist/licenses', { recursive: true });
await copyFile('LICENSE', 'dist/licenses/ZXR-APACHE-2.0.txt');
await copyFile('reference/zork2/LICENSE', 'dist/licenses/ZORK-II-MIT.txt');
await copyFile('reference/zork2/PROVENANCE.md', 'dist/licenses/ZORK-II-PROVENANCE.md');
await copyFile('src/persistence/ROUGEXR-LICENSE.txt', 'dist/licenses/ROUGEXR-BSD-2-CLAUSE.txt');
await copyFile('src/prototype/assets/HUNYUAN-NOTICE.txt', 'dist/licenses/HUNYUAN-3D-NOTICE.txt');
await copyFile('src/prototype/assets/movable-props.json', 'dist/licenses/movable-props.json');
await copyFile('src/prototype/assets/narrow-tunnel-room-v1.json', 'dist/licenses/narrow-tunnel-room-v1.json');
await copyFile('src/prototype/assets/TENCENT-HUNYUAN-3D-2.0-LICENSE.txt', 'dist/licenses/TENCENT-HUNYUAN-3D-2.0-LICENSE.txt');
