import { describe,it,expect } from 'vitest';
import { existsSync,readFileSync } from 'node:fs';
import { capabilityManifest } from '../src/engine/index.ts';
import { updateCapabilitiesReadme } from '../tools/capabilities.ts';

describe('reviewed capability inventory',()=>{
  it('keeps unsupported and pending claims explicit and returns owned data',()=>{
    const manifest=capabilityManifest();expect(new Set(manifest.entries.map(e=>e.id)).size).toBe(manifest.entries.length);
    const entries=Object.fromEntries(manifest.entries.map(e=>[e.id,e]));
    expect(entries.streams!.status).toBe('unsupported');expect(entries.fuzz!.status).toBe('unverified');
    expect(entries.scenes!.status).toBe('planned');expect(entries.audio!.status).toBe('planned');
    expect(entries['source-differences']!.detail).toContain('SRC-013');expect(entries['source-differences']!.detail).toContain('SRC-014');
    for(const entry of manifest.entries)expect(existsSync(new URL('../'+entry.evidence.split('#')[0],import.meta.url))).toBe(true);
    manifest.entries[0]!.status='planned';manifest.entries.pop();expect(capabilityManifest().entries[0]!.status).toBe('supported');expect(capabilityManifest().entries).toHaveLength(12);
  });
  it('publishes the identical inventory in README and refuses missing markers',()=>{
    const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');expect(updateCapabilitiesReadme(readme)).toBe(readme);
    expect(()=>updateCapabilitiesReadme('no inventory')).toThrow('exactly one');
    expect(()=>updateCapabilitiesReadme(readme+'<!-- capabilities:start -->')).toThrow('exactly one');
  });
});
