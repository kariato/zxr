# Compact shared-texture garden authoring source

`garden-shared-textures-v4.glb` is the compact authoring input used by `tools/assets/garden-compact-runtime.py`. Its editable Blender source is `garden-shared-textures-v4.blend`. The foliage and gravel use shared 256px repeating textures; the gazebo uses its own 256px image. `verification.json` describes this authoring export.

The runtime generator sets grounds to approximately 56 by 37 metres, independently scales the gazebo and six figures, replaces the display plinth with cavern ground, and extrudes the hedge beds one metre above the paths. Figures rest on the raised beds; the central gazebo footprint stays at path height. It exports `games/zork2/assets/scenes/underground-garden/underground-garden-shared-v4.glb` and regenerates room origins, walking surfaces and interaction layout. All runtime images are embedded and the GLB remains below 3,000,000 bytes. The gazebo entrance uses separately sampled interior support; gravel triangles provide outdoor support.

Run from the repository root with Blender Python 5.0.1:

```sh
out/asset-tools/blender-env/bin/python tools/assets/garden-compact-runtime.py
```

The sibling reference image and prompt describe the original overhead layout. `runtime-overview.png` shows the approved raised-hedge version in the game. Earlier generation and reduction experiments remain local; they are not needed to regenerate the runtime from this committed authoring source. The source runtime notices retain the Tencent Hunyuan terms.
