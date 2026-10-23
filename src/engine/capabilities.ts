/** Reviewed implementation inventory, not a runtime probe or gameplay policy.
 * Keep claims scoped to the pinned Zork II target and their recorded evidence. */
export type CapabilityStatus='supported'|'adapted'|'unsupported'|'planned'|'unverified';
export interface Capability {id:string;name:string;status:CapabilityStatus;detail:string;evidence:string}
const entries:readonly Capability[]=[
  {id:'compiler',name:'ZIL compilation',status:'supported',detail:'Pinned Zork II source compiles into a validated JSON bundle. General MDL macros and source-only numbering for arbitrary games are outside the supported target.',evidence:'docs/phase-2.md'},
  {id:'engine',name:'Headless game execution',status:'supported',detail:'Translated routines, 16-bit arithmetic, allocation-checked memory, object tree, clock, nested input and owned seeded RNG. The 400-point solve and 75 golden scripts pass; this is bounded evidence, not proof of every possible playthrough.',evidence:'docs/phase-5.md'},
  {id:'options',name:'Option-based text play',status:'supported',detail:'Browser and terminal players offer staged objects, actors, multiple objects, ALL and dictionary words. Finish completes a valid shorter sentence; Cancel clears an uncommitted sentence without a turn.',evidence:'docs/phase-4.md'},
  {id:'storage',name:'Saves and replay',status:'supported',detail:'IndexedDB autosave and named checkpoints, portable save files, source SAVE/RESTORE continuations and hash-checked replay. Browser storage is origin/profile-local and may fail; file import/export remains available.',evidence:'docs/phase-5.md'},
  {id:'input',name:'Original typed input',status:'adapted',detail:'Structured choices replace scanning and noun resolution. AGAIN/OOPS, orphan clarification, arbitrary typed commands and numeric/debug input are excluded from player menus. Quoted speech uses selected dictionary words.',evidence:'games/zork2/ledger.md'},
  {id:'streams',name:'DIRIN / DIROUT streams',status:'unsupported',detail:'Debug stream verbs are not offered. Reached stream operations raise explicit runtime errors; no silent no-op or success stub is provided.',evidence:'docs/compat-semantics.md'},
  {id:'verify',name:'VERIFY and randomness',status:'adapted',detail:'VERIFY checks the validated semantic bundle rather than a Z-machine disk checksum (HOST-001). Native xorshift32-v1 differs from reference MT19937; conformance uses the original random tape (RNG-001).',evidence:'games/zork2/ledger.md'},
  {id:'source-differences',name:'Source and binary differences',status:'adapted',detail:'SRC-013 preserves the empty V-PLAY source string instead of the binary’s stray prefix, with one exact full-text exception. SRC-014 corrects the CLIMB synonym overread. Other guarded normalizations and host/input differences are enumerated in the rules ledger; state and RNG conformance remain strict.',evidence:'games/zork2/ledger.md'},
  {id:'fuzz',name:'Full fuzz acceptance',status:'unverified',detail:'Deterministic fuzzing, state/purity checks, shuffled-key checks and sharded CI are implemented. Local smoke runs pass; the required 10,000-game hosted campaign has not been verified.',evidence:'docs/phase-5.md#deterministic-fuzzing-55-acceptance-still-open'},
  {id:'hosting',name:'Hosted deployment acceptance',status:'unverified',detail:'Local production build and browser checks pass. Hosted CI/Pages acceptance remains open; no hosted deployment or headset compatibility is certified.',evidence:'docs/phase-0.md'},
  {id:'scenes',name:'Scene planning, assets and 3D/XR',status:'planned',detail:'LLM scene plans, Blender/GLB generation, desktop 3D and WebXR presentation are future phases. The current playable presenter is text.',evidence:'docs/build-plan.md'},
  {id:'audio',name:'Actor audio',status:'planned',detail:'Pre-baked non-movement action text and locally generated Python TTS audio are intended. Runtime speech recognition is outside the design; audio generation and playback are not implemented.',evidence:'docs/design.md'},
];
/** Return an owned inventory; reading or editing it cannot alter a game session. */
export function capabilityManifest():{format:'zxr-capabilities-v1';target:string;entries:Capability[]} {
  return {format:'zxr-capabilities-v1',target:'Pinned Zork II release 63 / serial 860811',entries:entries.map(entry=>({...entry}))};
}
