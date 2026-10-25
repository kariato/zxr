# Barrow blending pass

The second local experiment joins the generated entrance to the surrounding cave with a textured earth floor, low rock banks and small partially buried fragments. The floor continues through the passage and fades into the unchanged skybox at an irregular perimeter. The tunnel uses a continuous rough stone surface with metre-scaled baked textures; its enlarged end cap removes the bright skybox leak around the old cap.

- Render: `out/prototype/barrow-blended-render.png`
- Blender source: `out/asset-production/barrow-natural-v2/barrow-natural-v2.blend`
- Game model: `out/asset-production/barrow-natural-v2/barrow-natural-v2.glb`
- Assembly and clearance report: `out/asset-production/barrow-natural-v2/assembly.json`
- Preview: `/tests-e2e/fixtures/barrow-natural.html`
- Rebuild: `tools/assets/barrow-blend.py`, using the installed Blender Python runtime.

The v1 assembly remains available. The optional scene loader hides its rectangular fallback floor once the generated assembly loads, so it does not show beneath the new feathered floor.

Validation: all nine entrance/passage clearance samples passed; GLB geometry, indices and embedded textures passed the asset audit; the exported floor retains RGBA vertex colors and alpha blending; TypeScript and headless boundary checks passed. The running preview loaded the v2 model successfully and was visually checked. The original skybox hash remains unchanged.

The optimized export is 6.31 MB and renders 40,751 triangles. Small fragments reuse one simplified mesh; the larger generated stone forms remain intact.

This is a local visual experiment. Generated rock backs retain approximate reference projection, and sampled clearance checks do not replace a headset playtest. The Blender still uses preview lighting, so its illumination differs from the browser rendering.
