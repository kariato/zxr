# ZXR design review, third pass

Reviewed 2026-10-21 after pulling `origin/main` with `git pull --ff-only origin main`. The checkout advanced from `263a243` to **`44ffd4728efb4efbe5bdc48a33f8eaef24238878`**, including `7cc57ff`, “Apply second design review fixes to ZXR docs.” The two previous local review documents were preserved. This report is the only new change made during this review.

Scope: README, design, build plan, target document, compatibility draft, the changes since `eaf3606`, and relevant original ZIL routines. This review concentrates on whether the revised contracts fit together, rather than repeating issues that now have a reasonable implementation requirement.

**Assessment**

The latest revision resolves much more of the design. Match tables, runtime strings, one coherent memory image, implicit taking, pseudo-feature activation, decision IDs, semantic conformance checkpoints, save epochs, generated-script isolation, scene variants, load cancellation, and an early device spike are now explicit requirements. Those improvements should be retained. The specification is sufficient to begin foundations and the reader; it does not require another broad redesign before phase 0.

The main unresolved risks are now in save/restore execution state, actor continuation, host operations, and replay completeness. These should be closed before the affected engine and persistence steps. This report contains **3 P1 findings and 7 P2 findings**, plus smaller corrections. P1 means an incompatible implementation follows directly from the current contract or contradicts its central promise; P2 means a material contract gap or phase dependency to resolve before its consumer. Neither label claims that unimplemented runtime code already has a defect.

**1. [P1] SAVE suspends inside translated execution, but the save format omits that execution state.**

Locations: [host operations][host], [save envelope][envelope], [public save API][api]. Related round-two findings: 7 and 10.

The new design correctly gives the interpreter an explicit call stack. SAVE is an interpreter operation that suspends and returns a host request containing save data. At that point the original [V-SAVE][original-save] is waiting for SAVE's result, inside PERFORM and the main loop. The save envelope contains memory, RNG, gates, epoch and revision, but no saved frames, locals, instruction/form position, or explicit resume target. Successful restore discards the *current* suspended routine without saying what execution replaces it.

Loading those bytes cannot by itself resume V-SAVE, finish the appropriate room hook, and return to the next normal input boundary. Re-entering GO would reset game state; jumping straight to an input boundary can skip work that was pending at the saved point. The memory image cannot reconstruct caller locals and interpreter frames.

This matters to the promise to translate routines unchanged. In version 3, a successful RESTORE transfers control back to the saved execution point; it does not return normally to the calling RESTORE routine. See the [Z-machine RESTORE specification](https://inform-fiction.org/zmachine/standards/z1point1/sect15.html#restore).

Fix: choose one of two explicit formats. A primitive SAVE captures a versioned interpreter continuation as well as world state, and restore reinstates it with the defined SAVE result. Alternatively, define ZXR saves only at a canonical completed input boundary, adapt the SAVE operation to produce that checkpoint, and record/test the deliberate control-flow difference. External autosaves can remain boundary snapshots, but the two kinds must not be silently conflated. Keep the rule that successful restore abandons the current RESTORE/FINISH continuation.

Acceptance: SAVE from a normal command, change the world, restore both from an ordinary RESTORE command and from FINISH, then take another action. Compare the exact post-restore text, room hooks, moves, clock queue, RNG and next input boundary. Include a room whose M-END has an observable effect, and verify that it neither disappears nor runs twice. Save import/export and replay initialization must identify which resume policy they use.

**2. [P1] The described parser prologue resets the actor on the very continuation that must preserve it.**

Locations: [compatibility prologue, lines 68–71][prologue], [actor commands, line 97][actors]. Related round-two finding: 2.

The first prologue bullet restores the player when WINNER is another actor and no quoted command is continuing. Its “otherwise” bullet then says it sets WINNER to PLAYER and clears QUOTE-FLAG. For the second pass of a robot command, WINNER is ROBOT and a quoted command *is* continuing, so that otherwise branch would reset the command to the player.

The actor section instead says that the second pass takes a continuation branch with no context reset. That is what [the original PARSER][original-prologue] does: after the conditional restoration, it separately selects RESERVE-PTR, P-CONT, or fresh input. Only the fresh-input arm performs the unconditional PLAYER reset. The current two-bullet rewrite loses that distinction.

Fix: specify the three parser-entry modes explicitly: fresh player input, internally continued actor command, and any supported reserve path. Preserve actor, HERE, quote state and the intended token buffer on the continuation path. Reset to the player for the next fresh option. Honor the first TELL pass's actual result and continuation cancellation, rather than assuming every requested actor command always proceeds to its second pass.

Acceptance: start with WINNER=ROBOT, nonzero P-CONT and QUOTE-FLAG=true. The second parser pass must preserve the robot. Follow with a fresh player action, which must restore the player context. Add two successive robot commands, a cancelled/refused TELL, the cage rescue that changes WINNER, and a player in a vehicle. Use reference checkpoints to determine when HERE/LIT reset; do not invent an earlier reset merely to satisfy the prose.

**3. [P1] Replays do not include inputs introduced by the new host protocol.**

Locations: [host completion][host], [replay format][replay], [determinism claim][determinism]. Related round-two findings: 7 and 10.

The replay format is still build hash, initial seed/save, and chosen option IDs. Execution now also depends on completeHost results. The same RESTORE option can load checkpoint A, checkpoint B, fail, or be cancelled; none of those outcomes appears in its option ID. SAVE can also succeed or fail. Starting from one named save does not encode later restores.

Two runs can therefore use the same seed and identical option IDs and produce different text and state. A full replay cannot be independent of whatever files happen to be in the host's current save store. Decision options record the choice to restore, but not the checkpoint that the host actually supplied.

Fix: give the replay a typed input/event log that includes accepted game options and correlated host completions: operation result, checkpoint/content identity and required payload, and cancellation/failure. Embed saves or reference them by immutable content hash with a defined resolution policy. Replay should use a deterministic host adapter rather than open storage dialogs. Update “same seed and option IDs” to cover the full accepted input log, or explicitly exclude storage verbs from replayable input and state the narrower guarantee.

Acceptance: replay a sequence containing successful save, failed save, successful restore, cancelled restore, restart and FINISH restore. Replay must reproduce the same boundaries and semantic hashes with an empty external save store. Changing one recorded restore target must produce a clear divergence rather than silently load a different file.

**4. [P2] The host API needs operation identity and a defined waiting-state transition table.**

Locations: [completeHost and importSave][api], [host operation semantics][host]. Related round-two finding: 7.

HostRequest and HostResult are referenced without definitions. Game options carry expected epoch/revision and pending decisions have IDs, but the published completeHost signature has no visible correlation field. The prose says requests carry epoch and revision, but does not define how a completion proves that it belongs to the active request. Only READ waiting states restrict options explicitly. importSave has no stated rule for being called while a host operation is pending.

Example: a restore picker is open, the host imports another save or restarts, and then the old picker completes. A duplicate save completion can likewise arrive after another host operation has begun. Such results must not resume whatever frame is currently suspended. A host error also needs a path back out of the waiting state.

Fix: define HostRequest/HostResult as discriminated unions with a unique operation ID, expected session epoch, operation kind and success/failure/cancel payload. Require exactly one valid completion for the active operation; reject duplicates and stale/mismatched completions without changing state. Define the normal-input, READ-pending, host-pending, terminal and error states, including legal calls to options, execute, completeHost, importSave and exportSave. Invalid save data must be validated before replacement; it should leave the active world and continuation intact.

Acceptance: duplicate completion, completion from a prior epoch, wrong operation kind, completeHost without a request, ordinary option during a host wait, failed/cancelled storage, and import while a picker is open. These are small state-machine tests, not a requirement for a large host framework.

**5. [P2] The build-hash input list omits part of the semantic build.**

Locations: [save envelope, line 122][envelope], [bundle step 2.10][bundle], [gate changes][gate]. Related round-two finding: 10.

The specified hash covers compiled logic, vocabulary, syntax tables, string pool, option-ID encoder version and compiler version. It does not explicitly cover the initial world/memory bytes, property defaults, initial locations/flags, gate definitions, or the execution-semantics/adapter version. World and logic are separate generated files in the repository layout, so “compiled logic” cannot safely be assumed to include all of these.

Changing an initial property or a gate definition could therefore keep the stated build hash unchanged. Updating the engine's compatibility semantics without changing compiler version creates the same problem. Such builds would accept each other's saves despite the strict “only the build that made it” rule.

Fix: define one canonical semantic manifest and hash all authoritative inputs: validated world/memory initialization, logic, symbol/reference layout, property defaults, vocabulary, syntax/action tables, strings, gate rules, and VM/adapter/option-encoder compatibility versions. Presentation assets can be excluded if the policy intentionally permits visual-only updates. If presentation overlays are included in compiled routines, decide whether they belong in the semantic hash or a separate presentation hash.

Acceptance: independently modify initial flags/location, a property default, a gate rule and an engine ABI version; each must invalidate a save as intended. A purely visual GLB update should behave according to an explicit policy, not incidental serialization.

**6. [P2] The semantic projection does not explicitly compare non-clock mutable tables.**

Location: [conformance projection, lines 141–146][projection]. Related round-two finding: 6.

The projection now includes objects, attributes, properties, globals and clock-table entries, and canonicalizes references. That is the right direction. It does not say that the contents of every gameplay table are compared when a global/property points to it. Treating a global table pointer as a canonical table name only compares its identity, not its contents.

This is observable even in Zork II: [PICK-ONE][pick-one] shuffles table words and updates a counter in HELLOS, YUKS and other response tables. Two engines can have identical table identities, object state, score and random-log position but different future behavior because those words differ. Excluding parser scratch tables is reasonable; omitting all non-clock table contents is not equivalent.

Fix: include every mutable gameplay memory range in the projection, with a typed/reference-aware canonical representation for relocated pointers and interned strings. State how interior pointers such as the advancing LAMP-TABLE are represented: base symbol plus byte offset, not merely the table name. Track mixed-layout tables explicitly so an ordinary integer that happens to equal an object/string ID is not normalized as a reference accidentally.

Acceptance: corrupt a HELLOS/PICK-ONE counter, swap two message references, change an interior-table pointer offset and alter a non-clock game-table word. Every mutation must fail at the current checkpoint, without waiting for a later message to reveal the difference. Retain the existing flag/property/location mutation checks.

**7. [P2] Memory copy-on-write is insufficient to define rollback across all new execution boundaries.**

Location: [errors and limits, line 133][errors]; [action result/API][api]. Related round-two finding: 14.

The required outcome—whole-action rollback—is now correct. The only transaction mechanism described is a copy-on-write memory view, while authoritative state also includes RNG, knowledge gates, execution frames, pending IDs and revision/action sequencing. Text and presentation events are returned during pending/host results, before the overall logical command necessarily completes. Resuming through completeHost is not covered by a rule phrased only as “each execute runs as a transaction.”

A command can draw a random number and then fail. Rolling back memory alone leaves a different random stream. A command can print a prompt, suspend, resume and later fail: already displayed text cannot literally be unprinted. A successful external save write likewise cannot be undone just by rolling the interpreter's memory back.

Fix: extend the transaction snapshot to all authoritative non-memory state and define transaction/commit boundaries for execute, READ suspension, host suspension and completeHost. Define per-segment text/events and whether failures roll back to the latest exposed boundary or the original command boundary. Preserve the step budget across resumes where necessary; do not allow repeated suspensions to evade it. External effects need an explicit commit policy, rather than an impossible promise to reverse arbitrary host work.

Acceptance: RANDOM then error, gate update then error, output then suspension then error, error after a successful save completion, and completeHost that exceeds its budget. Verify memory, RNG, gates, frames, legal next input and semantic hash. Clarify separately whether diagnostic actionSequence counters advance on rejection/error.

**8. [P2] Multi-object support still permits several matches only in the direct slot.**

Locations: [GameAction operands][operands], [adapter match tables][resolution]. Related round-two finding: 9.

prso now supports arrays/ALL, which fixes TAKE ALL and similar direct-object batches. prsi remains a single Operand. Zork II also has [GIVE recipient OBJECT (MANY HELD HAVE)][give-syntax], which compiles to SGIVE. [PRE-SGIVE][sgive] swaps the operands through PERFORM, and [MAIN-LOOP-1][many-main] explicitly supports several indirect matches.

The new schema cannot represent that syntax with more than one item. Performing several individual gives would consume additional turns. This is not required to prove that one walkthrough is solvable, but it contradicts the stated exhaustive action-family interface and source-equivalent command timing.

Fix: permit a normalized match collection in either operand slot, with MANY checks and the original restriction on simultaneous multiple collections; or normalize SGIVE to a documented equivalent GIVE-with-direct-list action while preserving original source checkpoint comparison. Give ALL a tagged representation if needed so it cannot be confused with an ordinary string operand.

Acceptance: GIVE ROBOT LAMP AND SWORD versus GIVE LAMP AND SWORD TO ROBOT, plus one refused item and a timed interrupt. Compare match ordering, per-item dispatch, clock cost and stopping on M-FATAL.

**9. [P2] Desktop collision is now specified, but physical XR boundary and occlusion behavior are still missing.**

Locations: [desktop movement][desktop-bounds], [XR interaction and comfort][xr]. Related round-two finding: 12.

The new desktop walkable-area constraint and grab snapback are useful fixes. They do not constrain the real headset's tracked movement. A user can lean or walk their physical head through a rendered wall or closed container. Controller rays and touches also have no stated occlusion rule. World-model scope alone does not determine whether a hand can select something through a wall.

Fix: specify a simple presenter policy for out-of-bounds head poses—such as fading the world and offering recentering—without forcing the user's camera back. Define whether interaction rays stop at opaque blockers and how interactions behave while the head is outside the safe scene region. Keep all required actions accessible through a nonspatial menu. This can be decided during the real-device slice rather than blocking compiler work.

Acceptance: lean through a closed door/container, point through an opaque wall, move outside the room's allowed region, and play seated. No hidden contents should be disclosed or remote action committed merely because tracked hardware crossed geometry.

**10. [P2] The early-slice exception is not carried through the phase gates.**

Locations: [phase graph][graph], [phase 6 gate][plans-gate], [device spike 7.0][spike], [phase 7 gate][assets-gate]. Related round-two finding: 14.

The introduction now allows a three-room slice and device spike before full conformance, and phase 7 lets phase 8 start on that slice before all assets are done. But phase 6's gate still requires all 86 rooms planned/reviewed before the sequential phase 7 work. The phase graph still serializes 6 to 7 and 9 to 10, while prose says 9 and 10 can run alongside each other. The caption still says there is no 3D work before rules are proven, contradicting the new device spike.

Step 7.0 also owns a real hosted/XR/save-transfer trial before phases 8/10 build the actual presenter/XR adapter. That is feasible with a small spike harness or reused rougeXR components, but the deliverable needs to say so; otherwise it appears to depend on future steps. Similarly, the single packager step must distinguish a minimal text .zxb from the later asset manifest/linker and streaming output that phases 7/11 require.

Fix: add explicit slice gates (for example 6S and 7S), name the small host/XR harness used by 7.0, and label which full-map steps require the full gates. Update the graph to reflect those actual dependencies. Keep text-only artifact assembly separate from the later validated asset bundle/streaming manifest, with an owner for each.

Acceptance: trace a valid step order from an empty checkout to the three-room device trial without completing 86 plans or implementing all of phases 8–10. Every completion check must have its dependencies available earlier or explicitly owned by the spike.

**Disposition of the second review's 14 findings**

“Addressed” below means that the latest documents supply an adequate design requirement for the original objection. It does not mean its implementation or acceptance tests exist. “Partial” means the main direction is corrected but a concrete contradiction or related contract gap remains. None of the fourteen is simply unchanged.

| Round-two ID | Finding | Current status | Third-pass result |
|---|---|---|---|
| 1 | Missing match tables/syntax pointer | Addressed | P-PRSO/P-PRSI, counts, P-SYNTAX and P-ITBL are now explicitly populated; remaining field inventory is a named 2.0 obligation. |
| 2 | HERE/LIT actor context | Partial | Two-pass actor design added, but the prologue contradicts the required continuation path; finding 2. |
| 3 | Syntax hints and implicit take | Addressed | FIND is distinguished from filtering; original MANY/TAKE checks and actor-relative operands are retained. |
| 4 | Pseudo identity/activation | Addressed | Room/word identity and commit-time activation are specified. |
| 5 | Runtime strings/memory coherence | Addressed | String pool and dynamic print operations added; globals/object/property accessors share memory. |
| 6 | Conformance checkpoints/projection | Partial | Checkpoints, exclusions, parser draws and mutation checks added; mutable-table/reference coverage still needs finding 6. |
| 7 | Pending/lifecycle operations | Partial | Suspended READ and host API added; saved continuation, host correlation and full state transitions still need findings 1 and 4. |
| 8 | RANDOM 0/numeric inputs | Addressed | Explicit deterministic zero policy and debug/numeric exclusions are documented. |
| 9 | Multi-object command timing | Partial | Direct matches supported; SGIVE/multiple indirect matches still need finding 8. |
| 10 | Save/replay identity | Partial | Build hash, epochs and checkpoint initialization added; continuation, host replay inputs and hash scope still need findings 1, 3 and 5. |
| 11 | Disclosure beyond object list | Addressed | Disclosed events, derived appearance, scene variants and concealment tests are required. XR boundary behavior remains finding 9. |
| 12 | Scene lifecycle/relocation/rollback | Partial | Deterministic slots, vehicles, load generations, cancellation and grab rollback added; physical XR boundary policy remains finding 9. |
| 13 | Isolation and reproducible generation | Addressed | Restricted container, committed plans/generators/GLBs and tool provenance are now specified. |
| 14 | Phase dependencies/error containment | Partial | Schema, loader, victory, budgets, hosted spike, instruction limit and transactions added; cross-boundary rollback and slice graph still need findings 7 and 10. |

**Smaller corrections and implementation notes**

- **Separate semantic hashes from protocol envelopes.** Loading deliberately starts a new epoch, yet phase 5.3 expects an identical state hash after load. Define a semantic state hash excluding epoch and transport revision, and a separate complete-envelope hash if useful. Replay/decision IDs should follow a clear policy when an epoch changes.
- **Restart/restore header bits.** The memory image now reproduces transcript/fixed-font state, but restart/restore say they replace the whole world. Z-machine restart/restore preserve the active transcription and fixed-font bits. Either preserve those bits or record the intended ZXR policy; include a SCRIPT/restart/restore fixture. See the [restart specification](https://inform-fiction.org/zmachine/standards/z1point1/sect15.html#restart).
- **Syntax identity includes a lexical table.** The adapter says a syntax ID is an index within a verb's table, while GameAction's verb also supplies PRSA. In the source P-ITBL's P-VERB is an ACT? value and PRSA is a V? value; P-VERBN points to the verb-word information. Make the lexical verb-table identity and action-number mapping explicit in the phase 2.0 field inventory. A word address is not an ACT? number.
- **Numbering wording.** The compatibility section says words are “numbered by dictionary order,” while PRINTB and W? comparisons consume dictionary addresses. Say whether the public ID is a dictionary entry ID and W? is its relocated byte address, and define that mapping once. Similarly, string-pool numbers are handles rather than memory byte addresses even though the values section groups strings with addresses.
- **Eligibility versus staging.** options() returns GameOption[] but staged operands can construct final IDs only at commit. Specify whether it lists templates, complete choices, or both, and how execute validates a constructed ID without first enumerating every pair. Preserve selection revision so a menu built from an old state is rejected rather than silently rebound.
- **Blocked exits.** The design's hotspot example still says a closed trap door makes WALK unavailable. Phase 4.1 and the movement table now intentionally offer blocked movement so the original refusal and turn cost occur. Align that example. Separately ensure exit markers/labels do not reveal a concealed passage; unknown directions can use a generic direction menu without adding secret geometry.
- **Disclosure transitions.** Use both pre- and post-action perception when deriving events: a visible actor disappearing must have an appropriate public event even though it is no longer in post-action scope. This is an acceptance-test detail for the newly defined filter, not an objection to that filter's architecture.
- **Scope in darkness.** Retain tests for operating a carried lamp in darkness and for visible-but-unreachable contents. The general design still says “visible and reachable, light permitting,” while the detailed plan distinguishes those questions; each action family must use the relevant rule rather than their universal intersection.
- **Planner inputs versus proofs.** “Objects that can be brought there” and finding all concealed/changeable features may require conservative analysis and reviewed annotations, not exact reachability inference. Do not add a whole-game solver as an implicit prerequisite to the hobby project's scene planner.
- **Schema sequencing.** Step 2.10 now owns schemas, but earlier steps require schema-valid vocabulary/logic. Create the initial schema at the start of phase 2 and let 2.10 own packaging/final validation, or state explicitly that the schema evolves during those steps.
- **Asset invalidation.** Step 7.7 still lists plan/brief/generator changes only. Include kit and Blender/exporter changes in its dependency identity, consistent with the new provenance and committed-artifact policy. Cache memory tests should specify a bounded warmed-cache plateau rather than literal zero growth during first visits.
- **Immersive comfort.** The vehicle camera requirement should distinguish room-transition fades/reanchoring from continuous forced camera movement, and should reconcile physical head pose across XR exit, restore and scene changes. Resolve this in the slice's comfort tests.
- **Step 3.3 inventory.** It still lists only PRINTI/PRINTD/PRINTN/CRLF although 2.6 now correctly includes dynamic PRINT, PRINTB and PRINTC. Align the output-buffer deliverable to avoid treating those primitives as translation-only.
- **Blueprint versus user decision.** The word-picker proposal is now correctly labeled as unaccepted and requiring playtesting. Preserve that distinction. Testing whether a player can select a supplied word in a minute tests navigation, not whether the riddle remains satisfying; use separate novice puzzle playtesting.
- **Small cleanup.** Ground rules are numbered 8, 10, 9; one animation-library sentence still uses uppercase WALK; the design and plan still mix zxrc build, zxr build, zxr compile and zxr run --text. Assign a single documented CLI surface. These are low-priority edits, not engine blockers.

**Recommended next work**

Begin phase 0 and reader work against the current architectural direction. Before engine lifecycle work, choose save continuation versus canonical boundary saves, correct the actor prologue, and extend replay input to include host results. Define the small host state machine, semantic manifest and rollback snapshots alongside those implementations. The remaining P2 items can be closed before their respective consumers, with the listed tests.

The review should now lead into implementation and evidence. It should not turn into an expectation that every renderer detail must be fully designed before a reference runner or reader can be built.

**Validation and limits**

The pull completed as a fast-forward, with no tracked local edits overwritten. The current commit and changes from the previously reviewed commit were inspected. Relevant PARSER, MAIN-LOOP-1, V-SAVE/V-RESTORE, V-TELL, MANY-CHECK, SGIVE and PICK-ONE source paths were checked. Z-machine save/restore/restart behavior was checked against the specification linked above.

There is no engine implementation, package manifest or runnable ZXR suite yet, so no runtime tests are claimed. The source-based examples describe consequences of the written contracts; the phase 0 reference instrumentation will supply executable evidence. No original design/reference files were edited during this review.

[host]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:111
[envelope]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:122
[api]: /Volumes/NVME/Source/zxr/docs/build-plan.md:68
[original-save]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:71
[prologue]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:68
[actors]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:97
[original-prologue]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:125
[replay]: /Volumes/NVME/Source/zxr/docs/build-plan.md:309
[determinism]: /Volumes/NVME/Source/zxr/docs/build-plan.md:58
[bundle]: /Volumes/NVME/Source/zxr/docs/build-plan.md:226
[gate]: /Volumes/NVME/Source/zxr/docs/build-plan.md:282
[projection]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:139
[pick-one]: /Volumes/NVME/Source/zxr/reference/zork2/gmacros.zil:130
[errors]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:133
[operands]: /Volumes/NVME/Source/zxr/docs/build-plan.md:83
[resolution]: /Volumes/NVME/Source/zxr/docs/compat-semantics.md:81
[give-syntax]: /Volumes/NVME/Source/zxr/reference/zork2/gsyntax.zil:235
[sgive]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1250
[many-main]: /Volumes/NVME/Source/zxr/reference/zork2/gmain.zil:65
[desktop-bounds]: /Volumes/NVME/Source/zxr/docs/build-plan.md:385
[xr]: /Volumes/NVME/Source/zxr/docs/build-plan.md:430
[graph]: /Volumes/NVME/Source/zxr/docs/build-plan.md:29
[plans-gate]: /Volumes/NVME/Source/zxr/docs/build-plan.md:344
[spike]: /Volumes/NVME/Source/zxr/docs/build-plan.md:354
[assets-gate]: /Volumes/NVME/Source/zxr/docs/build-plan.md:372
