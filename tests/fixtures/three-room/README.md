# Three-room bundle fixture

`logic.json` is a hand-written, two-routine operations IR example. GO prints string 1; V-LOOK prints string 2. The explicit spans refer to `game.zil`. `buildThreeRoom()` uses this JSON as its logic input, checks it against the documented source, lowers the three rooms/four exits and LOOK syntax, links memory and maps the source. Tests validate both raw logic and the final bundle with the headless validator and independent AJV 2020. No original-game text or walkthrough data is used; these fixture files are Apache-2.0.
