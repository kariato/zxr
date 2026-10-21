import { describe, expect, it } from 'vitest';
import { checkBoundaries, checkSource } from '../tools/check-boundaries.ts';

describe('headless boundaries', () => {
  it('accepts the project', async () => expect(await checkBoundaries()).toEqual([]));
  it.each([
    'import "three";',
    'export * from "../presentation/text/index.ts";',
    'import "node:fs";',
    'import("./safe.ts");',
    'const clock = Date.now();',
    'globalThis["fetch"]("https://example.com");',
    'const random = Math.random();',
    'type Scene = import("three").Scene;',
    'const random = Math["random"]();',
  ])('rejects a deliberate violation: %s', source => {
    expect(checkSource('/project/src/engine/bad.ts', source, '/project').length).toBeGreaterThan(0);
  });
  it('allows a headless dependency', () => {
    expect(checkSource('/project/src/engine/model.ts', 'import type { Value } from "../zil/value.ts";', '/project')).toEqual([]);
  });
});
