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

describe('test-only diagnostic boundaries',()=>{
  it.each([
    'import { createDebugSession } from "./engine/testing.ts";',
    'export * from "./engine/testing.ts";',
    'import("./engine/testing.ts");',
    'type Debug = import("./engine/testing.ts").ExecutionTrace;',
    'import { createDebugSession } from "./engine/testing.js";',
    'export * from "./engine/testing";',
    'import { SESSION_DEBUG } from "./engine/diagnostics.ts";',
  ])('rejects production access to debug capabilities: %s',source=>{
    expect(checkSource('/project/src/player.ts',source,'/project').length).toBeGreaterThan(0);
  });
  it('blocks re-exports from the public engine entry point',()=>{
    expect(checkSource('/project/src/engine/index.ts','export * from "./testing.ts";','/project').length).toBeGreaterThan(0);
    expect(checkSource('/project/src/engine/index.ts','export * from "./diagnostics.ts";','/project').length).toBeGreaterThan(0);
  });
  it('allows internal engine instrumentation and explicit test imports',()=>{
    expect(checkSource('/project/src/engine/session.ts','import { DIAGNOSTICS } from "./diagnostics.ts";','/project')).toEqual([]);
    expect(checkSource('/project/tests/debug.test.ts','import { createDebugSession } from "../src/engine/testing.ts";','/project')).toEqual([]);
    expect(checkSource('/project/src/presentation/player.ts','const now=Date.now(); import "three";','/project')).toEqual([]);
  });
});
