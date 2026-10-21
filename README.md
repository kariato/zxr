# ZXR

ZXR is a language and engine for interactive fiction in 3D and XR. It takes a game written in ZIL, the language Infocom used for Zork, and cross-compiles it into ZXR so that each room becomes a 3D place you can walk around, and typed commands become options you pick.

Games are written entirely in JSON, logic included, and run on a headless TypeScript engine. The same build runs in a WebXR headset, on a tablet and in a desktop browser. Scenes are GLB files (binary glTF), characters are GLBs with baked Blender animation clips, and tagged nodes in a scene act as hotspots that submit the same options a player can pick.

The first target is **Zork II**, whose source Microsoft released under the MIT license in 2025. The goal is a full Zork II playable in XR and published on itch.io.

> Status: design. There is no engine code yet. The documents below describe what will be built and in what order.

## Documents

| Document | What it covers |
|---|---|
| [Design](docs/design.md) | The language, the cross-compiler, scenes and hotspots, the runtime, options instead of a parser, platforms |
| [Build plan](docs/build-plan.md) | Twelve phases (0 to 11) with small steps, completion checks and gates |
| [Target: Zork II](docs/target-zork2.md) | What is being ported, the hard spots, how it is tested, the itch.io release |
| [Compatibility semantics](docs/compat-semantics.md) | Draft: what translated ZIL code sees (values, memory image, properties, numbering, how options become parser globals) |

## How it works

1. **ZIL front end (no LLM).** Reads the `.zil` source and translates rooms, objects, syntax and routines into ZXR JSON one to one. The result already plays as a text game and is checked against the original with transcript tests.
2. **LLM scene planner.** Reads each room's descriptions and objects and writes a scene plan, asset briefs and option labels. These are JSON too, reviewed and editable by a person, and cached.
3. **Asset builder.** Turns briefs into GLB files with Blender Python generators.
4. **Engine and presenters.** The headless engine owns the world. It runs ZIL's own main loop, with each picked option standing in for the parser, so timing follows the original. Presenters draw it as text, as 3D on desktop and tablet, or in WebXR.

The LLM never writes game logic. The rules are translated exactly and proven before any 3D work begins.

## Related work

ZXR follows the architecture of [rougeXR](https://github.com/kariato/rougeXR), which wraps Rogue in the same kind of browser engine for desktop, touch and WebXR: a headless engine contract, observations for the renderer, seeded replay, and a Blender-to-GLB asset pipeline.

## Repository layout

```
docs/               design doc, build plan, target game, compatibility semantics
reference/zork2/    Zork II source (MIT, Microsoft), unchanged; see PROVENANCE.md
```

The layout the code will grow into is in the [build plan](docs/build-plan.md#repository-layout).

## License

ZXR is licensed under the Apache License 2.0; see [LICENSE](LICENSE). The Zork II source in `reference/zork2/` keeps its own MIT license. Zork is a trademark of its owner and is not covered by either license.
