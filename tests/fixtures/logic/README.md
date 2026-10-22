# Core routine expectations

`core-routines.json` is hand-authored, not generator output. It expresses four
small active Zork II routines in the step 2.5 IR, omitting only source/origin
metadata. Source and assembly are under `reference/zork2/`:

- NULL-F (`gglobals`): two optional zero defaults, routine false return.
- MAIN-LOOP (`gmain`): AUX TRASH, repeating assignment of MAIN-LOOP-1's result.
- SCORE-UPD (`gverbs`): two additions/stores, the selected Zork II NULL-F branch,
  then true fallthrough.
- DO-WALK (`gverbs`): P-WALK-DIR assignment, then an ordinary PERFORM call.

Names, numeric namespaces and bodies were written from those declarations and
fixed symbol numbers. These are structural lowering tests; they do not execute
an interpreter. MAIN-LOOP and DO-WALK call routines with deferred constructs.
