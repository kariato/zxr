# Design and build-plan review

Reviewed 2026-10-21. Scope: `design.md`, all twelve phases in `build-plan.md`, `target-zork2.md`, the README, and the relevant vendored ZIL routines. The adjacent rougeXR checkout was inspected to check the proposed persistence reuse. No design documents or reference sources were changed.

The headless engine and presentation split is a useful foundation, but the documents are not yet a sufficiently consistent specification for implementation. The largest risks are semantic compatibility, option completeness, and the claim that conformance tests can prove correctness with unmatched randomness. Several examples directly contradict the build plan's boundaries.

P1 means resolve before implementing the affected core contract. P2 means a material omission or inconsistency that should be settled before the relevant phase. These are design findings, not claims that unimplemented code already contains the defects.

**1. [P1] Hotspot and animation callbacks can bypass the authoritative action boundary.**

Evidence: [design, hotspot handlers][hotspot] permits arbitrary code and flag changes. The stairs example moves the player directly, bypassing normal movement handling. [Design, clip events][clip] also permits game code on animation markers. In contrast, [phase 9][phase9] requires hotspots to submit options and restricts clip events to presentation. The design additionally introduces `M-ENTER-VIEW` and `M-ANIM-DONE` game hooks.

Queuing a callback between turns prevents mid-routine mutation, but does not make it deterministic: entering a volume or reaching an animation frame still depends on movement, frame timing, and the selected presenter. Direct `MOVE PLAYER` also skips movement rules, room hooks, and potentially timed hazards. A headless replay of option IDs cannot reproduce these mutations.

Fix: make every state-changing interaction submit an engine-owned action with revision checks and normal dispatch. Ambient triggers and animation markers may emit presentation effects only. Replace the stairs example with an offered movement action. If arbitrary asynchronous story events are an intentional language feature, specify their input log and text-mode equivalents separately and include them in saves/replays.

Acceptance: touching stairs, selecting the corresponding option, and headless execution produce identical text, clock ticks, events, and state. Changing frame rate or skipping animation cannot change the model.

**2. [P1] The stated turn rules conflict with the actual source.**

Evidence: [ground rule 4][turn-contract] says one option is one ZIL turn; [step 3.7][core-phase] classifies inventory as a zero-time meta verb. In [the original main loop][original-clock-policy], INVENTORY is absent from the clock exemption list, so it consumes time. LOOK also consumes time. [V-WAIT][wait] defaults to three iterations of `CLOCKER`, may stop early when an interrupt reports an event, and then sets `CLOCK-WAIT` to prevent an additional normal tick.

The proposed inventory mapping gives the player free actions during timed puzzles and lantern burn-down. A blanket one-option/one-tick implementation changes WAIT behavior. Although `turnsAdvanced` exists, the policy behind it is not specified consistently.

Fix: distinguish input actions, world revisions, clock ticks, and move count. Preserve the actual main-loop exemptions and translated WAIT behavior. Any free inventory panel should be documented as a deliberate gameplay difference, rather than called exact translation.

Acceptance: compare move count, lantern life, and interrupt queue after LOOK, INVENTORY, SCORE, SAVE, WAIT, failed actions, and fatal results.

**3. [P1] The action contract cannot carry several inputs the plan requires.**

Evidence: [GameOption.action][action-contract] contains only `verb`, `prso`, and `prsi`, while [step 4.4][options-phase] requires actor commands and spoken answers. [ROBOT-FCN][robot] branches on `WINNER`; [RIDDLE-ROOM-FCN][riddle] reads words from `P-LEXV` using `P-CONT`. [V-WALK][walk] also requires `P-WALK-DIR`, not just a WALK verb and direct object.

Two otherwise identical actions addressed to the player and robot cannot be represented distinctly by the published structure. A label saying “Answer well” does not supply the lexical data the unchanged routine reads. Directional movement can take the wrong branch if its parser context is absent.

Fix: define a normalized action union with actor, direction, object operands, literal/topic/answer data, and any required syntax identity. Define precisely how this becomes compatibility globals and how temporary parser state is reset. Stable option IDs must distinguish these fields.

Acceptance: round-trip robot movement, robot cage rescue, directional walking, correct and incorrect riddle answers, and a following normal player action through the public API and replay format.

**4. [P1] Input requested inside routines needs a continuation or explicit replacement strategy.**

Evidence: the API [execute()][action-contract] returns synchronously. [FINISH, V-QUIT, and V-RESTART][nested-input] call `READ` or `YES?`; [YES?][yes] itself performs another `READ`. The phase plan discusses replacing the top-level parser and flagging `P-LEXV` reads, but does not specify a suspended routine or pending-decision contract.

Replacing only PARSER leaves these routines unable to request the player's next choice. A blocking `READ` cannot run in a synchronous headless action call in the browser. Blanket failure or auto-answering changes behavior.

Fix: inventory every reachable input operation. Either lower it to an engine-owned pending decision and resumable execution state, or explicitly replace the finite set of lifecycle routines with reviewed equivalents. Specify the clock boundary, revision behavior, and save policy while a decision is pending.

Acceptance: decline quit/restart, accept restart, reach FINISH, restore, and save/reload a pending decision if supported. No prompt should hang or accidentally advance time twice.

**5. [P1] Typed tables alone do not define enough compatibility semantics.**

Evidence: [steps 2.3, 2.6, and 2.7][frontend] propose structured exits/properties and word/byte arrays with stable IDs. [V-WALK][walk] identifies exit kinds by property byte length and reads mixed byte/word fields through `GETPT`. [INT][clock-table] compares pointers produced by `REST`, and stores routine references in table words. [V-VERSION][version] reads absolute header memory through `GET 0` and `GETB 0`.

Stable array IDs do not by themselves define pointer offsets, aliasing, byte/word overlap, object/routine/global numeric identities, property defaults and lengths, or header reads. The source also uses `VALUE` to dereference a global index embedded in a conditional exit. Independently translating exits into convenient JSON risks making their public structure disagree with what unchanged routines see.

Fix: write a compatibility semantics document before the front end. Define scalar values, ZIL truth and zero, signed 16-bit arithmetic, evaluation order, references, pointer arithmetic, big-endian byte/word access, property layouts, and numeric symbol identities. A virtual memory layer or carefully specified tagged equivalent can implement these without running Z-machine bytecode. Keep convenient JSON views derived from one authoritative representation.

Acceptance: aliasing tests for `PUT`/`GETB`, offset pointer equality, all exit encodings, missing-property defaults, global indirection, routine pointers, and header-dependent output. The clock queue is necessary but insufficient as the only table test.

**6. [P1] Static option discovery is not complete enough to replace the parser.**

Evidence: [design, option generation][option-design] pairs syntax and objects with “real responses”; [step 4.1][options-phase] looks for verbs in each object's action routine and defaults implied by flags. However, [PERFORM][dispatch] dispatches through the actor, room, pre-action, indirect object, containing object, direct object, and default verb. [CERBERUS-FCN][cerberus] handles PUT/PUT-ON COLLAR as the indirect object's routine, and [BUCKET-CONT][bucket] supplies container-specific rules.

An object's own verb tests cannot capture all actions handled elsewhere. Macro expansion in phase 1 also removes surface `VERB?` forms unless semantic metadata survives. In general, determining whether arbitrary routines give a “real response” is not a reliable static pruning rule. Calling routines speculatively can mutate state or consume RNG.

Fix: generate conservative candidates from syntax and all dispatch paths; retain pre-expansion semantic metadata or analyze normalized predicates. Use reviewed declarations for exceptional families. Prune only when safety is established, not when analysis fails to discover a special case.

Acceptance: cover every dispatch layer, indirect-object puzzle actions, room-only actions, zero-object verbs, pseudo-objects, and dynamically assigned ACTION properties. Record unsupported cases as failures, not silent omissions.

**7. [P1] Reused parser helpers violate the promised pure query boundary unless isolated.**

Evidence: [options()][action-contract] is explicitly pure, while [steps 2.8 and 4.2][options-phase] propose reusing parser helpers. [LIT?][lit-helper] changes `P-GWIMBIT`, `HERE`, `P-TABLE`, `P-SLOCBITS`, and scratch table contents; it does not restore every value. It calls `DO-SL`, so classifying that routine as replaced without retaining dependencies also breaks the helper.

Opening an options menu or recomputing visibility could therefore change compatibility state. Query order could affect subsequent actions or save hashes. `ACCESSIBLE?` is explicitly a touchability check, not a complete visibility test.

Fix: inventory transitive dependencies and side effects of every retained helper. Implement pure perception queries, or run compatibility helpers against isolated scratch state that cannot change the saved model, RNG, or action revision. Distinguish visibility, knowledge, and reachability.

Acceptance: call `options()` and `observe()` repeatedly in different orders; state and RNG hashes must remain unchanged. Test visible but unreachable contents and actor-relative scope.

**8. [P1] The proposed random conformance comparison cannot establish equivalence.**

Evidence: [phase 0 randomness note][random-note] explicitly says the original RNG will not match ZXR. [step 5.1][conformance] then compares location, inventory, score, and flags for random steps.

Those values are often the random outcomes. Different spells can move the player or take inventory, and combat can kill an actor. Once states diverge, later commands and even apparently non-random output may cease to be comparable. Fixed seeds only make each implementation repeat itself; they do not align different RNG algorithms. A text transcript also does not expose all flags or queue entries for state comparison.

Fix: pin a reference interpreter and instrument it to capture random-call bounds/results and relevant machine state at input boundaries. Replay a compatible random stream in ZXR, checking call alignment and symbol mapping. Alternatively, use controlled fixtures and independent invariants, while explicitly reducing the claim from exact conformance. Define the source of every reference state assertion.

Acceptance: run a wizard spell, a random actor outcome, and a death/recovery sequence with aligned draws; compare subsequent actions, not only the immediate message. Intentional source/binary differences need explicit handling rather than unlimited exclusions.

**9. [P1] Source-to-binary correspondence is assumed rather than established.**

Evidence: [the ground-truth rule][turn-contract] makes the binary authoritative, while the project promises an exact source translation. [The vendored README][upstream-warning] warns that its source snapshot may differ from production, potentially by years. This review read the bundled story header: version 3, release 63, serial `860811`, checksum `4492`; SHA-256 `3ae7d5558943e9721f3e4b273c8a7faec1a03a604e1ae4ee1cde472c21cb24ac`.

The warning is not proof that this particular binary differs; it means the required correspondence has not been demonstrated. Otherwise a faithful translation could fail tests and be modified away from the actual source to match another release.

Fix: add a phase 0 baseline audit: pin binary and source hashes, interpreter version/settings, build-time symbol environment, and known version differences. Choose whether the deliverable follows the vendored source or release 63 when they disagree. Classify source-version differences separately from port bugs.

Acceptance: initial objects/properties, representative routines, startup output, puzzle behavior, and scoring have a documented correspondence before exact-match gates are treated as authoritative.

**10. [P1] Dispatch order in step 3.4 is wrong and omits important handlers.**

Evidence: [step 3.4][core-phase] describes running the pre-action before room `M-BEG`. [PERFORM][dispatch] runs the actor first, then room `M-BEG`, then pre-action, then indirect object, container `CONTFCN`, direct object, and default verb. It restores `PRSA`/`PRSO`/`PRSI` around nested dispatch. The phase description collapses several of these paths into “object and verb handlers.”

A pre-action may implicitly take an object or reject an action before the room or actor has a chance to override it. Skipping the container handler changes bucket reachability rules; losing actor dispatch breaks robot behavior. Incorrect nested context restoration can corrupt the rest of the outer action.

Fix: specify the exact dispatch order and short-circuit return semantics directly from the selected compiler branch. Separate the main-loop responsibilities from PERFORM. Include `M-FATAL` behavior and whether `M-END` and the clock run in each case.

Acceptance: a trace fixture with handlers at every dispatch layer, plus nested PERFORM, verifies exact invocation order, termination, and restored globals.

**11. [P1] Instruction identity cannot depend on JSON member order.**

Evidence: [the command syntax definition][json-command] says the first key names the command. [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259#section-4) defines JSON objects as unordered collections.

A formatter, editor, serializer, or canonical hashing pass can reorder keys without changing the JSON value. `{ "to": "PLAYER", "move": "LAMP" }` would then change meaning or fail despite containing the same data. JSON Schema cannot make member position part of portable JSON semantics.

Fix: use an explicit discriminant such as `{ "op": "move", "object": "LAMP", "to": "PLAYER" }`, or identify exactly one permitted opcode key regardless of order. Define expression and instruction schemas separately.

Acceptance: recursively reorder object members and verify that compiled semantics and state hashes remain unchanged. Reject objects with multiple opcode keys.

**12. [P2] Knowledge gates and hard option caps can create new softlocks.**

Evidence: [steps 4.5 and 4.6][options-phase] introduce clue-dependent gates and a hard cap of six to eight options; [phase 6.6][planner] can introduce further approved gate proposals after the text engine is declared complete. [The riddle][riddle] presents a question, not an explicit disclosure of the answer “well.”

Showing WELL after the player sees the riddle gives away its solution; requiring another disclosure may leave no valid unlocking event. A hard ranking cutoff can permanently hide a required action. Testing one walkthrough does not catch other valid action orders, recovery after death, or a gate whose clue was seen before the flag was introduced. Human approval of a gate does not remove its effect on reachability.

Fix: define knowledge-state ownership and rollback/death/restart semantics. Keep every legal action reachable via pagination, “more actions,” or a structured action composer. Decide explicitly how riddle answers are expressed and what puzzle adaptation is intended. Treat gate changes as rule changes requiring the phase 5 suite and reachability tests.

Acceptance: exercise alternative puzzle orders, restored saves, death recovery, and objects with more than eight candidates. Require a novice playtest to assess spoilers separately from technical solvability.

**13. [P2] Universal “visible, reachable, lit” and held-object filters remove valid interactions.**

Evidence: [steps 4.2 and 4.3][options-phase] require visible/reachable/lit objects and, for every two-object action, a held candidate. [ACCESSIBLE?][lit-helper] means touchability. The source syntax has different per-slot rules, implicit TAKE behavior, global objects, and actions such as examining or attacking that do not share one scope predicate.

An object can be visible through a transparent container but not touchable; an inventory item may remain usable in darkness. Requiring an already held operand also replaces implicit taking with an extra action and potentially an extra clock tick. Actor commands need the actor's scope and inventory rather than always the player's.

Fix: implement scope by action, syntax slot, actor, container state, and knowledge. Preserve implicit acquisition behavior and its timing. Keep failed in-world actions distinct from protocol rejection: a random robot refusal can be a legitimate resolved game action.

Acceptance: transparent and closed containers, darkness with held objects, implicit take, local/global objects, and robot inventory. Compare both text and time consumed.

**14. [P2] The observation and event contracts disagree about hidden state.**

Evidence: [the observation contract][observation] forbids hidden flags and entities; [the scene director][director] listens for object movement and `flagSet`, while BIND examples read raw flags. `PresentationEvent` and `PlayerObservation` are not actually defined beyond broad prose.

Off-screen wizard movement or a hidden object's flag change must not become a visual or audio spoiler. Conversely, refusing to disclose every internal flag leaves the renderer without a defined source for door pose, lighting, and character state. Filtering only the current object list does not filter the transition events.

Fix: separate internal model events from disclosed presentation events. Have the engine derive public visual state for visible entities and scene features. Define discovery, disappearance, darkness, and audible off-screen events deliberately. The presenter should reconstruct the scene from observation without raw model access.

Acceptance: hidden-object and off-screen actor mutations emit no unauthorized effects; loading a save reconstructs the same permitted appearance without replaying undisclosed events.

**15. [P2] Static room GLBs can reveal hidden story state even with a filtered observation.**

Evidence: [phase 6.3][planner] sends room exits and action-routine text to the planner; [phase 7.2][assets] bakes room scenes; [phase 8.2][desktop] asserts that only observed objects reach the renderer.

That assertion cannot protect a secret doorway, concealed opening, future wreckage, or puzzle answer that has already been baked into the environment mesh. Collecting all TELL text also mixes mutually exclusive states and spoilers. Filtering options or turning off object models does not hide geometry or readable scenery embedded in the room shell.

Fix: separate permanent scenery from state-dependent features and discoverable geometry. Plans need explicit variants, reveal bindings, and text visibility rules. Review planner context by story state instead of treating every description as simultaneously true.

Acceptance: inspect pre-discovery scenes, darkness, alternate room states, and post-destruction variants visually. Test captions, labels, and narration for the same disclosure rules.

**16. [P2] Object placement is defined only for initial locations.**

Evidence: [the object pose model][object-pose] gives an object one room-relative pose; [phase 6.3][planner] plans anchors for objects that start in each room; [phase 8.2][desktop] expects arbitrary moved objects and container contents to appear correctly.

The source moves objects into many destinations, redistributes inventory after death, transports the bucket and balloon with occupants, and reuses local-global objects across rooms. A carried lamp dropped in a room without its named anchor has no defined position. An object placed in a container needs a container-relative slot, not its original room pose. A single logical door may need several visual representations.

Fix: define room fallback placements, deterministic container/surface slots, multiple visual instances for global/shared objects, actor attachments, and vehicle-relative transforms. Keep presentation position outside puzzle logic unless intentionally authoritative.

Acceptance: drop arbitrary inventory in several rooms, nest containers, put the collar on Cerberus, redistribute inventory after death, and travel inside bucket/balloon. Rebuild the same placement after save/load.

**17. [P2] Save/replay identity and completeness need stronger specifications.**

Evidence: [phase 5.3 and 5.4][conformance] version saves and store seed plus option IDs for replays. [The design save list][save-design] omits RNG state, while the plan includes it. Neither gives a complete content-identity policy or describes the lifetime of option IDs, parser scratch pointers, pending decisions, or presentation overlays.

An unchanged option ID can acquire new meaning after a compiler, gate, or logic update. Revision restored from an old save can also collide with a stale in-flight UI request. Pointer-backed tables must preserve shared storage and offsets through JSON, rather than deserialize into independent copies. Seed alone is insufficient for a replay that starts from a noninitial checkpoint.

Fix: include format version, semantic rules/build hash, action-schema version, canonical initial checkpoint or initialization specification, complete RNG state, and all authoritative compatibility state. Define stable IDs structurally and specify incompatible-build rejection/migration. Use a session epoch or equivalent stale-request protection across restore/restart. Separate semantic hashes from presenter and UI counters.

Acceptance: save mid-puzzle, restore aliases and queue state, reject incompatible content, replay from a checkpoint, and reject an action captured before restore. Compare every input boundary, not just the final state.

**18. [P2] Timelines need cancellation and stale-cue semantics.**

Evidence: [the two clocks][clocks] allow animations to outlive a turn; [timelines][timelines] may remain ambient while input continues; [phase 9.3][phase9] checks only that skipping does not change the state hash.

A player can leave a room, kill an actor, restore a save, or start another action while old movement, speech, and clip events are pending. Those callbacks can move a nonexistent presentation entity, narrate an obsolete state, retain disposed assets, or re-enable input at the wrong time. The world hash can remain correct while the experience is visibly wrong.

Fix: assign cues to scene generations/action sequences, cancel them on replacement/reset, define cinematic input-lock behavior, and rebuild persistent appearance from observation. Specify audio and captions on skip. Do not serialize renderer callback closures into story state.

Acceptance: skip, leave the room, restore, restart, and exit XR during a cutscene and during loading. Old callbacks must be inert and control must return once.

**19. [P2] Free room movement lacks collision, occlusion, and interaction rules.**

Evidence: [phase 8.6][desktop] allows WASD inside a room without game time; [phase 10.3][xr] maps grabs/releases to actions. Neither specifies collision, physical boundaries, ray occlusion, grab failure behavior, or recentering.

A player could walk through a closed door or point through a wall to an option that is logically in scope but physically hidden. Real headset translation cannot simply be prevented by camera collision. Releasing an item outside a valid target has no described drop behavior; if TAKE or PUT fails, the rendered object still needs to return to the authoritative location.

Fix: define movement bounds, blockers, line-of-sight policy, headset boundary fading/recentering, and a grab state machine. Physical gestures submit the current option and await resolution; placement snaps back or updates from observation. Offer an accessible nonspatial route for every required action.

Acceptance: reach through a closed container, point through walls, physically cross a boundary, fail a grab, release outside a container, and receive a stale-action rejection.

**20. [P2] The build artifact and CLI are not specified consistently or scheduled completely.**

Evidence: [runtime architecture][director] calls `.zxb` a bytecode bundle, but the same section says JSON is interpreted directly and [the later decision][no-bytecode] rejects custom bytecode. Commands alternate between `zxrc build`, `zxr build`, `zxr run --text`, and `zxr play`. [The CLI/layout and front-end phases][layout] do not assign a clear step for the packager, GLB-reference linker, or runtime bundle loader, even though later gates depend on them.

Fix: choose one CLI and bundle format. Schedule logic schema creation, schema versioning, package manifest, symbol/link validation, asset variant selection, and loader implementation before their first consumers. Specify whether the bundle is one archive or a manifest plus independently streamed assets; loading all packed GLBs at startup conflicts with room streaming.

Acceptance: build a text-only artifact with no GLBs, then a minimal scene artifact; load both using the same documented entry point. Missing references, duplicate IDs, unsupported versions, and wrong-case paths fail with useful diagnostics.

**21. [P2] Caching is being mistaken for reproducibility.**

Evidence: [the compiler description][cache-design] says caching guarantees that the same ZIL gives the same game on every build. [Phase 6.4][planner] keys responses on context, prompt version, and model ID; [phase 7.7][assets] rebuilds when plans/briefs/generators change.

A fresh cache, changed style bible, kit library, generation settings, Blender/exporter version, or external model service can change outputs. A model ID can also refer to a moving backend. Human edits and locked fields must participate in dependency tracking. Otherwise unchanged source can silently yield different assets or labels, or changed inputs can incorrectly reuse stale outputs.

Fix: commit approved plans/briefs/labels and authoritative generated artifacts or content hashes. Define a build lock manifest with all relevant inputs and tool versions. Separate nondeterministic generation from deterministic assembly. Include dependencies such as the style bible, kit parts, exporter, and locked overrides in invalidation.

Acceptance: build on a clean checkout without generation credentials; reproduce the approved semantic artifact and loadable assets. Changing each dependency invalidates only its dependents.

**22. [P2] Executing generated Blender scripts needs an isolation boundary.**

Evidence: [phase 7.3][assets] runs LLM-written Python and feeds failures back for retries. The plan provides validation of resulting assets but no execution restrictions.

The script runs before its GLB can be validated and can read files, write outside its output folder, invoke processes, access credentials, or exhaust resources. This is a concrete consequence of the selected code-generation pipeline, including accidental mistakes in otherwise benign generated scripts.

Fix: run generation in an isolated worker/container with limited mounts, no personal credentials, network disabled unless explicitly needed, and CPU/memory/time/output quotas. Store and review scripts before execution. Keep planner API credentials outside the worker. Validate outputs before promotion to the asset library.

Acceptance: a deliberately bad generator cannot access a test secret, write outside its workspace, make a network call, or run indefinitely. Failure produces a reviewable log rather than a partial approved asset.

**23. [P2] Asset/device budgets arrive after most asset production.**

Evidence: [phase 7][assets] completes all rooms and characters before [phase 8.8][desktop] measures budgets. The “agreed size budget” and per-device triangle/texture budgets are referenced without an earlier decision. [The reference headset][open-items] remains unselected until phase 10.

Building hundreds of assets first creates substantial rework if scene composition misses GPU memory or stereo frame-time targets. A tablet-only lighter variant is not enough to characterize a standalone headset workload. “No memory growth after ten rooms” also needs a cache policy: a bounded warming cache can grow legitimately before reaching its limit.

Fix: select reference device classes, numeric budgets, loading targets, and cache limits before broad production. Build a representative heavy pilot scene and test actual tablet and headset hardware early. Include draw calls, material counts, decoded texture memory, skinning, lights/shadows, and stereo frame time, not only triangles and compressed GLB size.

Acceptance: the pilot meets recorded budgets on real devices. Repeated room traversal reaches a bounded memory plateau, and stale asynchronous loads are cancelled without redisplaying an old room.

**24. [P2] Hosting and save transfer need an early executable prototype.**

Evidence: [phase 11.2][release] defers the itch.io immersive-frame test until release; the [risk table][hosting-risk] says to test early in phase 8, but no phase 8 step does so. The fallback mentions an exported save code without scheduling its import/export UI or validation.

The [WebXR specification](https://www.w3.org/TR/webxr/#permissions-policy) defines permissions-policy integration and immersive session requirements; an old forum thread cannot establish the behavior of today's actual host. Desktop/tablet storage in an itch.io frame and a GitHub Pages tab must not be assumed to share persistence. A save code is explicit transfer, not automatic synchronization across devices.

Fix: add an early hosted spike with one room: desktop/tablet loading, enter/exit XR, persistence after reload, and explicit export/import between the two origins. Define storage-failure fallback and the save envelope used for transfer. Track device/browser support as tested capability rather than a broad guarantee.

Acceptance: record host URL, browser, headset, build, embed settings, XR result, and save transfer. Validate packaging against the current [itch.io HTML5 requirements](https://itch.io/docs/creators/html5): at most 1,000 extracted files, 500 MB total extracted content, and 200 MB per extracted file unless an exception is arranged.

**25. [P2] The phase gates overstate what their tests establish.**

Evidence: [phase 4.9][options-phase] verifies one maximum-score walkthrough; [phase 5.5][conformance] samples random options; [phase 8 and 9 gates][desktop] compare final hashes. [The roadmap][roadmap] promises a three-room slice, whereas the detailed plan completes every room's plan and assets before the first renderer phase. [V-SCORE][score] explicitly distinguishes 400 points from having finished (`WON-FLAG`).

A successful walkthrough does not show that alternate solutions, failed actions, optional puzzle states, death recovery, and every interrupt work. A final hash misses transient UI divergence. Random testing does not reliably reach deep puzzles. A maximum score is not the same condition as victory. Requiring all reference scripts, assets, and reviews up front also delays feedback on the hardest assumptions.

Fix: define a coverage matrix over verbs, dispatch branches, interrupt transitions, puzzle variants, death/recovery, and terminal states. Pin fuzz seeds, preserve minimal failure replays, and split a small PR suite from a larger scheduled suite if runtime demands it. Check victory as well as score. Introduce the three-room vertical slice before full asset production and verify actual UI selection in browser tests rather than replaying actions behind the renderer.

Acceptance: per-boundary hashes/observations plus explicit won-state assertions, targeted edge-case scripts, representative real-device tests, and an early playable slice. Label finite evidence as conformance coverage rather than mathematical proof.

**26. [P2] Runtime error containment is weaker than the planned interpreter needs.**

Evidence: [step 3.2][core-phase] specifies a recursion/depth limit, and [phase 5.5][conformance] expects the engine never to throw under option fuzzing. The language includes REPEAT/AGAIN and indirect calls; the contract says nothing about instruction budgets or partial failure.

A nonrecursive infinite loop defeats a depth limit and can freeze the browser. An invalid memory operation or interpreter defect after some mutations can leave half-applied state, consumed RNG draws, or partially emitted events. Reporting an error alone does not restore consistency.

Fix: define per-action instruction/resource budgets and atomic resolution semantics. On internal failure, preserve the last valid input boundary and provide a structured diagnostic with source span and reproducible input. Distinguish expected story refusals, stale requests, unsupported constructs, and interpreter failures.

Acceptance: bounded nonrecursive loop, invalid reference, oversized allocation, and exception after a flag/RNG mutation all fail predictably without corrupting the last valid state. Bound legitimate long actions using measured fixtures rather than arbitrary limits.

**Additional reconciliation and phase-planning notes**

- The design says the parser is retained and accepts text/voice; phases 2 and 4 replace it and promise players never type. Define whether a parser exists for tests, for author diagnostics, or for players. Specify command-to-normalized-action fixtures so golden transcript commands can be replayed without quietly reintroducing a second parser.
- The top-level plan says phases 6–10 begin only after phase 5, but its graph and prose allow phases 6–7 after phase 2. The graph serializes 9 then 10, while prose says they can run alongside each other. Resolve the dependency graph and identify which gate is authoritative.
- Step 2.7 asks translated clock routines to pass a queue test before phase 3 implements the interpreter. A tiny evaluator harness or an explicit later runtime check is needed.
- “Every name used resolves or appears in the report” and “every gap is named” are suitable intermediate gates, but release gates must reject reachable unsupported constructs. A ledger entry should have an owner, impact, and approval; it must not be an unlimited escape hatch from correctness.
- Select and record compile-time symbols such as `PREDGEN` and `ZILCH`. They choose different implementations in the vendored source. Counts should come from the loaded, comment-aware, conditionally selected program rather than only textual form counts.
- The JSON surface examples omit many expression forms, parameters, return behavior, locals, and typed literals that phase 2 needs. Publish the logic schema and semantics in the early compiler phase. Scene-plan schemas in phase 6 do not supply that prerequisite.
- Asset clip names conflict: design examples use `IDLE`, `WALK`, and `DIE`; the rougeXR contract and phase 7 use `idle`, `move`, and `death`. Define one case-sensitive vocabulary or an explicit mapping before generators and validators are written.
- A hotspot Empty needs an explicit exported shape and dimensions. A node name and `zxr_hotspot=true` alone do not specify a volume. Define units, local/world transforms, scale handling, trigger hysteresis, repeat/debounce policy, and what default trigger `zxr_action` implies.
- Scene manifests need unique/scoped node identities, not an assumption that arbitrary glTF display names are globally unique. Validate ambiguous names and preserve hotspot/anchor IDs across optimization and device variants.
- Binding an OPEN animation on load needs a persistent pose rule: playing the opening transition from frame zero can briefly show a closed door. Define rest poses, transition versus persistent clips, loops, and unavailable-clip fallback.
- Presentation overlays “name a routine and a point in it” without stable join-point IDs. Line offsets and instruction indices shift after macro/compiler changes. Use source-derived semantic identifiers and fail closed on missing or ambiguous overlay targets.
- Reusing rougeXR's storage adapter is plausible; reusing its save format unchanged is not. The adjacent checkout's `save.ts` declares `rougexr-save`, a specific save version/upstream revision, validates Rogue's `WorldState`, and constructs a Rogue `GameSession`. Extract generic storage/envelope utilities and supply a ZXR-specific codec and validator.
- Pin the rougeXR revision, identify exactly which components are copied/extracted, and validate their dependencies. “Same versions as rougeXR” is not a reproducible dependency specification when that project changes independently.
- Credits and asset provenance should be tracked when each external kit, rig, clip, sound, and model is selected, rather than reconstructed at release. This is an asset inventory requirement; this review did not conduct a legal audit.
- Accessibility should enter the phase 4 text shell and phase 8 UI acceptance criteria: semantic controls, focus order, scalable text, keyboard access, captions, and alternatives to spatial-only interactions. A final phase 11 audit is too late to define the interaction model.
- Phase 0 can establish a representative baseline first and expand reference coverage alongside semantic milestones. Requiring a full-score walkthrough, every death, and every timed event before any engine code is a large unestimated dependency.
- Language-server support, hot reload, AR, USDZ import, and a second renderer appear in the design without corresponding detailed steps. Mark them explicitly deferred if they are outside the first release. Hot reload of logic also needs a state compatibility policy; replacing code while retaining old table/global layouts is not automatically safe.
- The Z-machine does support timed input in later versions; the claim that it has “no notion of time” is too broad. The architectural decision can instead be justified by the project's JSON runtime and presentation needs. See the [Z-machine READ specification](https://inform-fiction.org/zmachine/standards/z1point1/sect15.html#read).
- The open checklist still asks to create a repository even though this checkout exists, and settled decisions remain unchecked. Remove stale questions and separate decisions from actual unresolved items.

**Suggested amendment order**

1. Establish the source/binary baseline and instrumented reference strategy.
2. Specify scalar/reference/memory semantics, normalized actions, input boundaries, dispatch, and clock policy.
3. Define pure observation/options and conservative option completeness, including the intended puzzle adaptations.
4. Freeze versioned logic/save/replay schemas and one bundle/CLI contract.
5. Add a small end-to-end text slice, then one representative hosted 3D/XR scene on real hardware.
6. Expand conformance and content production against the measured contracts and budgets.

**Review limits**

This was a document and source review. There is no ZXR engine or automated suite in the checkout to execute, and no reference interpreter run or headset session was performed. The binary identity was read directly from its header; source/binary behavioral parity remains unverified. External references above were checked against the JSON, Z-machine, WebXR, and itch.io documentation during this review. No current Blender exporter behavior or legal interpretation is asserted as verified.

[hotspot]: /Volumes/NVME/Source/zxr/docs/design.md:263
[clip]: /Volumes/NVME/Source/zxr/docs/design.md:289
[phase9]: /Volumes/NVME/Source/zxr/docs/build-plan.md:362
[turn-contract]: /Volumes/NVME/Source/zxr/docs/build-plan.md:54
[core-phase]: /Volumes/NVME/Source/zxr/docs/build-plan.md:210
[original-clock-policy]: /Volumes/NVME/Source/zxr/reference/zork2/gmain.zil:169
[wait]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1558
[action-contract]: /Volumes/NVME/Source/zxr/docs/build-plan.md:63
[options-phase]: /Volumes/NVME/Source/zxr/docs/build-plan.md:236
[robot]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:1237
[riddle]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:2007
[walk]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1565
[nested-input]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:33
[yes]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1916
[frontend]: /Volumes/NVME/Source/zxr/docs/build-plan.md:182
[clock-table]: /Volumes/NVME/Source/zxr/reference/zork2/gclock.zil:26
[version]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:98
[option-design]: /Volumes/NVME/Source/zxr/docs/design.md:375
[dispatch]: /Volumes/NVME/Source/zxr/reference/zork2/gmain.zil:182
[cerberus]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:2321
[bucket]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:4037
[lit-helper]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:1358
[random-note]: /Volumes/NVME/Source/zxr/docs/build-plan.md:150
[conformance]: /Volumes/NVME/Source/zxr/docs/build-plan.md:264
[upstream-warning]: /Volumes/NVME/Source/zxr/reference/zork2/README.md:17
[json-command]: /Volumes/NVME/Source/zxr/docs/design.md:147
[planner]: /Volumes/NVME/Source/zxr/docs/build-plan.md:286
[observation]: /Volumes/NVME/Source/zxr/docs/build-plan.md:91
[director]: /Volumes/NVME/Source/zxr/docs/design.md:367
[assets]: /Volumes/NVME/Source/zxr/docs/build-plan.md:312
[desktop]: /Volumes/NVME/Source/zxr/docs/build-plan.md:336
[object-pose]: /Volumes/NVME/Source/zxr/docs/design.md:105
[save-design]: /Volumes/NVME/Source/zxr/docs/design.md:442
[clocks]: /Volumes/NVME/Source/zxr/docs/design.md:344
[timelines]: /Volumes/NVME/Source/zxr/docs/design.md:163
[xr]: /Volumes/NVME/Source/zxr/docs/build-plan.md:386
[no-bytecode]: /Volumes/NVME/Source/zxr/docs/design.md:434
[layout]: /Volumes/NVME/Source/zxr/docs/build-plan.md:93
[cache-design]: /Volumes/NVME/Source/zxr/docs/design.md:45
[open-items]: /Volumes/NVME/Source/zxr/docs/build-plan.md:439
[release]: /Volumes/NVME/Source/zxr/docs/build-plan.md:408
[hosting-risk]: /Volumes/NVME/Source/zxr/docs/build-plan.md:436
[roadmap]: /Volumes/NVME/Source/zxr/docs/design.md:466
[score]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:3936
