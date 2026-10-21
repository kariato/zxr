# ZXR design review, second pass

Reviewed 2026-10-21 against commit [`eaf3606cbddea31cf48c5c021137120a20849647`](https://github.com/kariato/zxr/commit/eaf3606cbddea31cf48c5c021137120a20849647), “Apply design review fixes to ZXR docs.”

The reviewed files were fetched at that exact commit through the GitHub connector: README, design, build plan, target document, and the new compatibility-semantics draft. The working checkout remains on its previous commit; this review did not pull, switch branches, or overwrite the design documents. References to revised documents below point to immutable GitHub permalinks.

**Assessment**

The revision is a substantial improvement. It fixes the main architectural direction: explicit JSON opcodes, original dispatch order, original clock policy, actor-aware actions, presentation-only callbacks, conservative candidate discovery, and recorded random draws. The source/binary audit is now an explicit prerequisite rather than an assumption. These changes are meaningful and should be retained.

The revision does not yet close the first review. Several changes state the correct intention without specifying the bridge that makes it work. In particular, “fill in the parser globals and run the main loop unchanged” is still incomplete enough that an ordinary TAKE action would not reach its handler under the documented procedure.

Of the first review's 26 numbered findings, this pass classifies **8 as addressed at the design level, 6 as partially addressed, and 12 as still open**. “Addressed” means that the revised specification resolves the original design objection; it does not mean code has been implemented or tests have passed. The compatibility document explicitly remains a draft, so its unresolved details should be turned into concrete phase 2.0 obligations rather than treated as completed work.

**1. [P1] Option injection still does not populate the data the unchanged main loop consumes.**

Location: [compatibility semantics, lines 49–55][compat-input]; [build-plan action application][apply]. Related first finding: 3.

The adapter sets `WINNER`, `PRSA`, `PRSO`, `PRSI`, and optional direction/words, then claims `MAIN-LOOP-1` can continue unchanged. But [MAIN-LOOP-1][main-tables] immediately obtains `ICNT` and `OCNT` from `P-PRSI` and `P-PRSO`. These are match tables, distinct from the scalar globals `PRSI` and `PRSO`. Later it fetches operands from those tables and overwrites the scalar globals before calling PERFORM. With zero direct matches it reads `P-SYNTAX` to decide whether a zero-object action is valid.

For a concrete first action, setting `PRSA=TAKE` and `PRSO=LAMP` while leaving the initial match tables empty produces `OCNT=0`. The scalar LAMP does not become a match. With the initial `P-SYNTAX=0`, the code reads a header byte as syntax bits instead of dispatching TAKE LAMP. With stale match tables, the previous action's objects can be reused instead.

Fix: define a complete parser-result structure and its application. Populate/reset `P-PRSO`, `P-PRSI`, match counts, selected `P-SYNTAX`, and any `P-ITBL` fields MAIN-LOOP-1 reads. Resolve syntax identity before entering the unchanged loop; the current optional `syntax` field needs an unambiguous selection rule. Do not merely add another sentence saying all parser output is reproduced.

Acceptance: the documented adapter alone must execute TAKE LAMP, DROP LAMP, a two-object action, LOOK, SAY, and directional WALK from clean state and after each other. Assert the exact tables and syntax pointer at the PARSER return boundary, not only the eventual room text.

**2. [P1] Actor context does not set or restore HERE and LIT.**

Location: [compatibility semantics, lines 51–55][compat-input]; [build plan, line 108][apply]. Related first findings: 3 and 13.

The actor field is necessary, but setting WINNER is not sufficient. [PARSER][parser-context] resets normal player context, updates HERE after actor commands, and recomputes LIT. [V-TELL][tell-actor] sets HERE to the commanded actor's location when transferring command to that actor. The replacement bypasses both paths without defining equivalent state setup.

After directing the robot to another room, a following actor action could operate with the player's old HERE. Conversely, the next player action could inherit the robot's location or lighting state. The problem is especially subtle in vehicles: the original distinguishes the actor's immediate parent from its containing room.

Fix: specify command entry and exit context for PLAYER, ROBOT, and other actors. Explain the PLAYER-to-ADVENTURER alias used in IDs. Define how HERE, LIT, WINNER, pronoun state, quote state, and vehicle containment are initialized and preserved. These updates belong inside committed action execution; they should not be performed by pure option queries.

Acceptance: command the robot to move, command it again, return to a normal player command, and repeat across different lighting states. Include a player in the bucket or balloon and a robot rescue that changes WINNER during the action. Compare compatibility context at each boundary.

**3. [P1] Syntax metadata is still treated too loosely; implicit-taking semantics remain missing.**

Location: [steps 4.1–4.4][options]; [compatibility semantics input procedure][compat-input]. Related first finding: 13.

Step 4.3 still says that one operand of every two-object action must already be held by the player. This contradicts actor-relative commands and can remove valid actions with implicit acquisition. [The original PARSER][parser-tail] calls MANY-CHECK and TAKE-CHECK before returning; [ITAKE-CHECK][take-check] can actually move an object into inventory and emit “(Taken)” as part of that same command. Setting scalar operands and returning true skips those effects. Adding a separate TAKE choice can add a clock tick and alter timed puzzles.

The candidate generator must also distinguish syntax hints from hard operand restrictions. For example, ATTACK syntax has `FIND ACTORBIT`, but [AQUARIUM-FCN][aquarium] explicitly handles ATTACK AQUARIUM WITH an object. [GWIM][gwim] uses the FIND flag for inference; explicitly naming an object is not equivalent to requiring that flag as an object type. Treating FIND as a universal slot filter would exclude a real puzzle interaction despite the new “nothing is pruned” rule.

Fix: classify syntax metadata precisely: inference hints, scope rules, possession checks, implicit TAKE, multi-object permission, and preposition/syntax selection. Reuse the translated post-resolution semantic checks where appropriate, after creating match tables, or provide documented equivalents. Replace the universal held-player rule with actor- and slot-specific rules. Keep story-level refusals as resolved actions rather than protocol errors.

Acceptance: use an object requiring implicit acquisition without a separate TAKE, exercise a two-object robot action using robot inventory, and ensure ATTACK AQUARIUM WITH SWORD is representable despite FIND ACTORBIT. Verify object moves, text, and elapsed clock ticks.

**4. [P1] Pseudo-object identity and activation are missing from the widened action schema.**

Location: [GameAction][action]; [step 4.1][options]. Related first findings: 3 and 6.

The schema supports actor, verb, two object IDs, direction, words, and optional syntax. It does not identify a particular pseudo feature. Zork II reuses a single [PSEUDO-OBJECT][pseudo-object]. [GLOBAL-CHECK][pseudo-setup] changes its ACTION property and short name for the room's selected PSEUDO entry. The option adapter no longer runs that parser path.

Consequently an EXAMINE action on a pseudo feature can call CRETIN-FCN or an action left over from a previously selected feature. A room-qualified “hole,” “crack,” “riddle,” or “stalagmite” needs an identity beyond the shared object number. [The Tea Room's ALICE-HOLE][alice-hole] is a concrete example and tests `PRSI=PSEUDO-OBJECT` for putting objects through the hole.

Fix: add a stable room-qualified pseudo reference and perform activation during action commit, after validation and before dispatch. Map that reference to the shared compatibility object, appropriate handler, and displayed name. Building the option list must not activate pseudo-objects or mutate properties.

Acceptance: query several pseudo options without changing state, then execute each and verify the correct handler and object name. Visit a different pseudo-bearing room, return, save/restore, and test both direct- and indirect-object uses.

**5. [P1] The memory draft omits runtime string references and global-memory coherence.**

Location: [compatibility semantics, values and memory][compat-memory]. Related first finding: 5.

The draft says every runtime value is a 16-bit word and specifies object, routine, global, property, and vocabulary numbers. It does not define string values. Strings are not confined to PRINTI literals: [LAMP-TABLE and LIGHT-INT][lamp-table] store messages in table words and print a message loaded by GET. [V-READ][read-text] prints a value loaded from a TEXT property. Game code also writes new LDESC string references to properties at runtime.

The TELL macro expands dynamic expressions to [PRINT][tell-macro], which is absent from the phase 2.6/3.3 output inventory. Implementing PRINTI, PRINTD, PRINTN, and CRLF alone cannot print these messages. Full Z-encoded storage is not necessarily required, but a numeric string pool/packed-address mapping and its PRINT behavior are required.

The draft also leaves globals outside its stated “tables, property tables, header” byte array while separately numbering them. This can be implemented, but VALUE/SETG, direct globals, pointers in saved state, and any memory-backed global access need one stated coherence rule. Likewise, property and object-tree operations must agree with raw memory writes if both representations are exposed.

Fix: define runtime string identity, literal interning, PRINT/PRINTB/PRINTC behavior where retained, character encoding, and how string/property/table references survive save/load and comparison. Define authoritative storage and aliasing for globals, properties, and object state. Explicitly bound the 16-bit address space and define relocation if the ZXR image differs from the reference.

Acceptance: table-loaded lamp warnings, readable objects, a changed room/actor LDESC, dynamic string property assignment, SAVE/RESTORE, and pointer/global round trips. The full phase 2.0 specification should include a primitive inventory derived from reachable expanded code.

**6. [P1] Exact snapshot comparison still has no valid normalization or boundary contract.**

Location: [step 0.4][reference]; [step 5.1][conformance]; [target test description][target-tests]. Related first finding: 8.

Recording reference state is the right improvement. Comparing all globals exactly remains invalid when the original parser is replaced: P-LEN, parser tables, word positions, continuation buffers, and other scratch globals naturally differ. The new adapter explicitly clears buffers that the original leaves populated. If table/property addresses are relocated, pointer-valued globals and clock-table words differ numerically even when they denote the same state.

The documents also say snapshots are “after each input,” but one typed command can reach multiple READ sites, contain multiple matches, or cause FINISH. A pending YES? prompt is not a completed top-level turn. The comparison must say exactly where each machine is paused.

Finally, [GET-OBJECT][parser-random] can consume RANDOM while resolving a phrase such as “one ...”. A single undifferentiated log of every reference RANDOM call will then misalign with an engine receiving an already resolved object ID. Parser-only output, prompts, implicit-taking messages, and wrapping also need a policy before promising exact transcript text.

Fix: specify reference checkpoints such as parser-return, completed action, pending decision, and terminal state. Define an explicit semantic state projection that preserves all gameplay-relevant state, canonicalizes references, and excludes only reviewed parser/interpreter artifacts. Separately validate parser-adapter output. Either restrict golden commands to fully explicit canonical commands or annotate parser-only effects and random draws; do not silently skip log entries or ignore arbitrary divergences.

Acceptance: compare an ordinary action, implicit-taking action, actor command, pseudo action, random one-object resolution, quit decision, restore, and terminal interaction. Deliberately corrupt a gameplay flag, clock entry, property string, and reference target; each must still cause a conformance failure after normalization.

**7. [P2] Pending decisions need a decoder and explicit lifecycle operations.**

Location: [API and pending-decision paragraph][pending]; [compatibility semantics, input inside routines][compat-pending]. Related first finding: 4.

The public API accepts only an option ID. A pending response returns an array of choice strings, while a GameAction has `kind: decide` and `choice`. The contract does not say whether choices are labels or option IDs, whether options() returns only decision options while suspended, or how they are scoped to a particular pending decision. “The next execute() with a decide action” describes an input shape that execute() does not accept directly.

The original YES? checks a word in P-LEXV and FINISH loops over that same buffer. A resumed READ needs either synthesized input or a specified boolean/choice decoder. The plan also excludes storage from the engine while leaving SAVE/RESTORE as engine operations without describing the persistence request/result boundary. FINISH must be able to request restore while otherwise pending. Successful restore/restart/quit must abandon the old continuation rather than resume it into the replacement world.

Fix: return decision IDs and stable option IDs, specify which options are legal while pending, and define an internal resumable READ protocol. Define save/load construction or import APIs and a host-effect mechanism for storage operations. State exactly where a save captures the world and how successful restore resets execution. Saving while pending can remain unsupported as explicitly decided.

Acceptance: wrong/stale decision IDs, invalid choices, quit-no, restart-no/yes, FINISH restore success/failure, and ordinary actions attempted while pending. Storage failure must not leave the engine suspended forever or advance the clock twice.

**8. [P2] RANDOM 0 contradicts seeded replay unless entropy is specified.**

Location: [compatibility randomness][compat-rng]; [determinism rule][rules]. Related first findings: 8 and 17.

The new draft says RANDOM n with n <= 0 reseeds “as on the Z-machine.” Those cases are different: negative ranges establish a seed; zero requests unpredictable reseeding. The headless engine excludes the wall clock and promises seed-plus-option determinism. [V-RANDOM][random-verb] can call RANDOM with the negated parsed number, and the updated action union has no numeric operand/P-NUMBER representation either.

Fix: distinguish negative seeding from zero reseeding. Either inject and record an entropy token for zero or define a documented deterministic policy/deliberate unsupported operation. Decide explicitly whether numeric/debug commands are in scope and represent them accordingly. In reference mode log reseeding events and range/result validation, not just positive draws.

Acceptance: RANDOM -n restarts a reproducible stream; RANDOM 0 behaves according to the recorded policy; replay never consults external entropy. Unknown or out-of-range reference results and unused log tails fail clearly. See the [Z-machine RANDOM specification](https://inform-fiction.org/zmachine/standards/z1point1/sect15.html#random).

**9. [P2] Single-object actions still cannot preserve multi-object command timing.**

Location: [GameAction][action]; [one option/one MAIN-LOOP-1 rule][rules]. Related first findings: 3 and 25.

The unchanged loop processes all matches in one command and normally invokes the clock once afterwards. The action schema has only scalar prso/prsi and the plan promises all legal actions remain accessible. Replacing TAKE ALL or TAKE X AND Y with several separate options adds turns. This is different from chained commands, which the compatibility draft explicitly excludes: multiple matches occur within one MAIN-LOOP-1 iteration.

Fix: either support a normalized multi-match/batch action with the original ordering and M-FATAL behavior, or explicitly scope out these commands and record the timing difference. Do not promise complete parser-equivalent action coverage while silently treating all commands as one object at a time.

Acceptance: compare TAKE ALL and a two-item selection, including one failure, the original listing order, and a timed event. Check one command's clock cost rather than only its final inventory.

**10. [P2] Save and replay identity remains insufficiently versioned.**

Location: [phase 5.3–5.4][conformance]; [design save description][saves]. Related first finding: 17.

The memory image and RNG are now included, which fixes part of state completeness. There is still no rules/content hash, compiler/action-schema identity, checkpoint-based replay initialization, compatibility policy, or protection against revision reuse after restore/restart. An old UI request can have a revision number that reappears in a restored world. A replay's option ID can still resolve differently after a logic, syntax, or gate update.

Fix: define a ZXR-specific envelope, canonical semantic hash, migration/rejection policy, and session epoch distinct from saved world revision. Preserve pointer aliases through one memory image. Specify replay from initialization versus replay from a checkpoint. Reuse rougeXR's generic storage utilities rather than its Rogue-specific save codec unchanged.

Acceptance: incompatible build rejection, checkpoint replay, stale input after restore/restart, malformed memory/reference validation, and deterministic continuation after load. These tests should operate through the supported lifecycle API from finding 7.

**11. [P2] Disclosure rules still stop at the object list.**

Location: [observation contract][observe]; [scene director][director]; [scene planning and object rendering][scene-plan]. Related first findings: 14 and 15.

The event contract still advertises raw moved/flagSet events while observation hides internal flags and unseen objects. No derived visual-state or event disclosure filter has been added. An off-screen actor event can reveal information even if the actor is absent from the visible-object list.

The planner still reads all room action text/exits and produces a static shell. A secret entrance or future destroyed feature can therefore be embedded in scenery and become visible before discovery. Typed model rules cannot hide geometry that was baked into the room.

Fix: distinguish internal events from disclosed presentation events, and give visible features derived public appearance. Define scene variants and reveal rules for secrets, destruction, and mutually exclusive descriptions. Apply the same information policy to captions, hints, ambient effects, and narration.

Acceptance: concealed entrances before/after discovery, off-screen wizard activity, darkness, transparent containers, and a destroyed room feature. Reloading must reconstruct only the permitted view.

**12. [P2] Scene lifecycle, relocation, and interaction rollback are still unscheduled.**

Location: [phases 8–10][presentation]. Related first findings: 16, 18, and 19.

Objects still have one pose or starting-room anchor; the planner still plans starting objects only. There is no fallback for dropping arbitrary inventory elsewhere, nested container slots, vehicles, or multiple visual instances of a logical global object. Timelines still lack cancellation on room changes, death, restore, and XR exit. Free movement and grab/place still lack boundary/occlusion/failed-action behavior.

These are presenter problems rather than reasons to delay the reader/compiler. They should nevertheless have explicit steps before full content production: otherwise the first correct text action can leave the 3D view in an impossible position.

Fix: define deterministic destination/container placement, scene generation IDs and cancellation, asynchronous load replacement, physical boundary policy, and a grab state machine that commits through the engine and rebuilds/snaps back on failure.

Acceptance: arbitrary drop, nested put, bucket/balloon travel, leave during animation/loading, restore during a cue, invalid grab/put, and physical boundary crossing. A final world hash alone is insufficient; inspect the resulting view and input state.

**13. [P2] The content pipeline still has no generation isolation or reproducibility contract.**

Location: [phases 6–7][pipeline]. Related first findings: 21 and 22.

The new commit leaves cached API responses as the claimed guarantee of reproducibility and still executes generated Blender Python without a stated execution boundary. Fresh caches and changed model/tool/kit/style inputs can alter builds; resulting-GLB validation happens after a generator has already executed.

Fix: commit approved generation outputs or their immutable artifacts, record tool and dependency identities, and keep deterministic assembly separate from generation. Run generated Python in an isolated worker without personal credentials and with limited filesystem/network/resource access. This can be a simple local container for a hobby project; it does not require a service platform.

Acceptance: build an approved snapshot on a clean checkout without generation credentials; verify dependency invalidation. A bad generator must fail without accessing unrelated files or running indefinitely.

**14. [P2] Build steps and test gates still have several missing dependencies.**

Location: [phase graph][phase-graph], [front end][frontend], [phase 7–8 budgets][pipeline], [release][release]. Related first findings: 20, 23, 24, 25, and 26.

The bytecode contradiction is fixed. However, there is still no assigned deliverable for the logic schema, bundle packager/linker, bundle loader, save-import interface, or save-code transfer. Steps 2.3 and 2.7 require executing V-WALK/clock behavior before phase 3 provides the interpreter; they need an explicit small harness or a later gate. Phase 4 coverage depends on restore behavior whose complete implementation is scheduled in phase 5.

Performance budgets and real-headset selection remain later than most asset production. The risk table still says “test itch.io early in phase 8” without a phase 8 step. The introductory dependency order still conflicts with the graph/prose. The detailed plan still requires all room plans and bodies before its first 3D presenter, despite the intended three-room slice. Full-score gates still do not assert the separate WON-FLAG victory condition. Interpreter containment still specifies only recursion depth, leaving nonrecursive infinite loops and partial mutations undefined.

Fix: make these explicit deliverables with one owning phase. Bring up a small valid logic artifact first, measure one representative scene on real hardware before bulk generation, and place the host/XR/save-transfer spike in a numbered step. Add won-state checks, meaningful edge-case coverage, per-boundary presentation assertions, instruction budgets, and atomic failure behavior. Keep the amendment proportional to a hobby project: a few focused steps and fixtures are enough.

Acceptance: every phase check has its prerequisites earlier in the plan; a minimal end-to-end slice can be built without all rooms; a bad loop or failed action cannot corrupt the last valid state; completing the game checks both the intended score and victory.

**Disposition of the first review**

The IDs below refer to [the first review](/Volumes/NVME/Source/zxr/docs/design-review.md). An item can be addressed in principle while a related newly exposed detail remains open; for example the original dispatch-order defect is fixed, while populating the parser's result tables is a separate adapter defect.

| Original ID | Finding | Status after eaf3606 | Remaining work |
|---|---|---|---|
| 1 | Hotspots/clip callbacks bypass actions | Addressed | New examples restrict state changes to execute; retain this boundary. |
| 2 | Inventory and WAIT timing | Addressed | Policy is corrected; clarify the clockTicks metric noted below. |
| 3 | Action payload too narrow | Partial | Actor/direction/words added; match tables, pseudo identity, numeric and multi-match inputs remain unspecified. |
| 4 | Nested READ/continuations | Partial | Pending status added; decoder, legal pending options, and lifecycle effects remain incomplete. |
| 5 | Memory semantics | Partial | Byte aliasing, offsets and exit lengths added; strings, storage coherence and relocation remain incomplete. |
| 6 | Static pruning loses actions | Addressed | Conservative discovery replaces “real response” pruning; syntax/scope interpretation still needs finding 3. |
| 7 | Mutating query helpers | Addressed | Separate pure TypeScript queries and differential tests are explicitly required. |
| 8 | Random conformance | Partial | Recorded draws/snapshots added; normalization, parser draws, and checkpoints remain unspecified. |
| 9 | Source/binary baseline | Addressed | Audit is explicitly scheduled and ZIP identity evidence checks out; audit execution is still future work. |
| 10 | Wrong dispatch order | Addressed | Actor, room, pre-action, indirect/container/direct/default order is corrected. |
| 11 | JSON member-order semantics | Addressed | Explicit op discriminant and shuffled-key check added. |
| 12 | Gate/cap softlocks | Addressed | Gates only rerank and overflow is reachable; word-picker enjoyment still needs playtesting. |
| 13 | Universal scope/held filters | Open | Held-player restriction remains verbatim; implicit-taking behavior is still missing. |
| 14 | Observation/event disagreement | Open | Raw events and hidden flags still have no public projection. |
| 15 | Hidden geometry leaks | Open | Static shell/state variants still undefined. |
| 16 | Placement after relocation | Open | Destination fallbacks, container slots, vehicles, and shared bodies still undefined. |
| 17 | Save/replay identity | Open | Memory included now; semantic build identity, epochs and checkpoint initialization still absent. |
| 18 | Timeline cancellation | Open | Skip hash test does not address obsolete callbacks or input locks. |
| 19 | Free movement/grab behavior | Open | Bounds, occlusion, invalid placement and rollback still absent. |
| 20 | Bundle/CLI specification | Partial | Bytecode removed; packager/loader/schema deliverables and one CLI still missing. |
| 21 | Cache versus reproducibility | Open | Generation lock inputs/artifacts and clean-build policy still absent. |
| 22 | Generated script isolation | Open | Execution boundary still absent. |
| 23 | Early device budgets | Open | Budgets/device selection remain too late for bulk assets. |
| 24 | Hosted prototype/save transfer | Open | Early test remains a risk-table note rather than a step. |
| 25 | Gate coverage and slice | Partial | Alternate order/death/restore scripts added; victory, branch coverage, per-boundary checks, and early slice remain missing. |
| 26 | Error containment | Open | Depth-only limit; instruction budget and atomic failure still unspecified. |

**Smaller corrections and decisions**

- `clockTicks` is described as “CLOCKER runs” with a maximum of three for WAIT. In [the source][wait-source], WAIT can call CLOCKER three times, then MAIN-LOOP-1 calls it once more; CLOCK-WAIT makes the last invocation return without incrementing MOVES. Count effective ticks or move increments, not all function entries. Test both when an interrupt stops WAIT early and when all three ticks finish.
- The compatibility draft says buffers are reset, but their header/capacity bytes are part of initialization. Preserve the P-LEXV capacity 59 and P-INBUF capacity rather than zero-filling entire buffers without rebuilding their headers. Specify zero/sentinel slots for checking a second answer word.
- The phase 1 gate still uses 441 routines and requires names to match `.FUNCT` output. A scan of the vendored `.zap` files finds 439 distinct `.FUNCT` names. This is not itself proof of a source mismatch: comment handling, compile-time branches, and DEFINE helpers affect counts. Replace raw counts with an audited active-program manifest and explain the differences before making the gate literal.
- The new draft's fake-header open question already has known examples beyond V-VERSION: V-SCRIPT and V-UNSCRIPT read and write word 8. Add them to the header contract instead of leaving the release/serial examples as the only concrete obligations.
- “Every value is a 16-bit word” must distinguish numeric comparison/arithmetic from address use. Do not sign-extend an address >= 0x8000 into a negative JavaScript index. Specify divide/modulo zero and overflow behavior and evaluate compiled source semantics against representative `.zap` routines.
- Broad numbering rules now depend on the bundled `.zap` and binary. That is acceptable for the Zork II bootstrap, but the claim of a reusable source compiler needs a future self-assigned numbering/relocation mode. Mark the reference-assisted mode explicitly rather than requiring every future game to ship assembly and a compiled oracle.
- Option IDs used in GLBs need one canonical encoder, alias resolution, and static structural validation. “Can be produced by the game's options” cannot generally be proven over every reachable state at build time. Runtime availability remains separate from schema/symbol validity. Do not remove blocked-but-attemptable movement simply because traversal will fail; the engine may need to print the original explanation and charge its turn.
- Enumerating every syntax/object pair can create a large quadratic set for two-object actions. “More actions” alone does not define navigation, actor selection, word selection, deduplication, or labeling cost. Use deterministic action families, template labels, and staged operand selection without advancing game time. Validate the resulting ID at commit time; do not run game routines speculatively.
- The word picker is a reasonable explicit adaptation, not evidence that the riddle is now enjoyable in XR. Test choosing an intended word from roughly 690 entries without a keyboard. Preserve labels/synonyms sufficient for selection while keeping dictionary-address identity canonical.
- Animation names still conflict: uppercase IDLE/WALK/DIE in design examples versus lowercase idle/move/death in phase 7. The design's action example still uses `type: perform` while the actual contract uses `kind: act`. Choose one vocabulary/schema and make examples validate against it.
- WAIT-ANIM is still described as letting “a routine” wait, while only cinematic timelines are allowed to wait and model execution must already be resolved. Clarify that this is a presenter-timeline operation, never a game-interpreter suspension on renderer completion.
- Hotspot volumes still need exported dimensions/shape, transform rules, repeat suppression and scene-scoped IDs. Touch is not inherently deliberate when a tracked hand overlaps a volume; require activation/debounce rules and prevent one sustained overlap or two hands from committing repeated turns.
- Persistent animation pose on load, ambiguous glTF node names, stable overlay join points, accessibility during phases 4/8, asset provenance at import, and the rougeXR revision pin remain unresolved from the first review's supplementary notes.
- The text still says the Z-machine has no notion of time, and the roadmap/open questions still contain stale repository-creation requests and unassigned AR/hot-reload/USDZ/second-renderer work. These are documentation cleanup/defer decisions, not reasons to delay a reader prototype.
- The final question now says “the design review settled on” a vocabulary picker. That was Claude's proposed resolution; the first review requested an explicit answer-input decision and playtest. Record it as a proposal or accepted project decision without attributing approval to a reviewer or to Mark unless actually given.

**Recommended next amendment**

Do not restart the design. Retain the fixes in this commit. Add a concrete parser-result adapter specification with small source-derived fixtures; finish runtime string/reference semantics; define the normalized reference-comparison projection; and connect pending decisions to one lifecycle API. Those changes should precede implementing the unchanged main loop.

Then give the still-open presenter and asset findings named steps before their respective phases. The hobby-project context does not require a production platform or exhaustive process: it requires enough explicit behavior that implementation does not silently choose incompatible answers.

**Validation and limits**

All five revised files were read at the specified commit, rather than inferred from its message. Relevant ZIL routines and `.zap` symbols in the vendored source were inspected. The source-folder `zork2.zip` was compared byte-for-byte with `COMPILED/zork2.z3` and matched; the chart's final release/size also matched. These facts strengthen provenance but are not a completed source-to-binary audit. The `.FUNCT` count was measured independently.

There is still no ZXR implementation in this checkout to run. This review did not execute a reference interpreter, complete the planned disassembly audit, or test a headset. Priority labels identify implementation-contract risks, not observed defects in running code. The original plans and reference sources were left unchanged.

[compat-input]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/compat-semantics.md#L49-L55
[apply]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L108-L110
[main-tables]: /Volumes/NVME/Source/zxr/reference/zork2/gmain.zil:42
[parser-context]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:125
[tell-actor]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1433
[options]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L263-L271
[parser-tail]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:365
[take-check]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:1269
[aquarium]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:3103
[gwim]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:904
[action]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L76-L94
[pseudo-object]: /Volumes/NVME/Source/zxr/reference/zork2/gglobals.zil:37
[pseudo-setup]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:1203
[alice-hole]: /Volumes/NVME/Source/zxr/reference/zork2/2dungeon.zil:1518
[compat-memory]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/compat-semantics.md#L9-L45
[lamp-table]: /Volumes/NVME/Source/zxr/reference/zork2/2actions.zil:1934
[read-text]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1187
[tell-macro]: /Volumes/NVME/Source/zxr/reference/zork2/gmacros.zil:43
[reference]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L156-L160
[conformance]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L291-L295
[target-tests]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/target-zork2.md#L39-L45
[parser-random]: /Volumes/NVME/Source/zxr/reference/zork2/gparser.zil:1083
[pending]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L66-L110
[compat-pending]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/compat-semantics.md#L59-L65
[compat-rng]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/compat-semantics.md#L67-L69
[rules]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L54-L62
[random-verb]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:134
[saves]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/design.md#L427-L435
[observe]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L96-L112
[director]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/design.md#L353-L357
[scene-plan]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L313-L318
[presentation]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L363-L418
[pipeline]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L313-L370
[phase-graph]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L7-L48
[frontend]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L205-L214
[release]: https://github.com/kariato/zxr/blob/eaf3606cbddea31cf48c5c021137120a20849647/docs/build-plan.md#L435-L465
[wait-source]: /Volumes/NVME/Source/zxr/reference/zork2/gverbs.zil:1558
