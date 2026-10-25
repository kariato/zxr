# Image-to-3D options for ZXR

Reviewed 2026-10-24. The local machine reports an Apple M4 Mac mini with 24 GB unified memory. The initial research below checks primary project documentation and service APIs; those provider comparisons are not measured quality rankings. A subsequent local Hunyuan3D + SkinTokens princess experiment is recorded in the [reference and experiment report](../games/zork2/assets/characters/princess/README.md), including actual timings, export measurements and limitations. No accounts were created or paid tasks submitted.

**Local experiment licence finding:** Hunyuan's current custom licence also restricts output use/display outside its defined territory (EU, UK and South Korea excluded). The resulting candidate remains in ignored local output and is not shipped. Use a generator with suitable redistribution terms for a globally available open-source game; an MIT Mac runtime does not remove the model/output restrictions.

## Recommendation

For local experimentation, audition Pixal3D-MLX at 512 resolution and TRELLIS.2-MLX at its conservative preview settings. For a quicker end-to-end character experiment, compare Tripo and Meshy using the same approved reference. Rodin is a third hosted candidate for geometry/material comparisons. These are provisional workflow recommendations, not a measured ranking of visual quality.

Generate assets offline, review and optimize the GLBs, then commit only accepted game assets and provenance. Players should not need a generation model, service account or API key. Keep keys in local authoring scripts, never in the GitHub Pages browser bundle.

## Local candidates

| Option | Documented capability | Fit for this Mac |
|---|---|---|
| [Pixal3D-MLX](https://github.com/lyonsno/pixal3d-mlx) | Native MLX image-to-textured PBR GLB, with pixel-aligned conditioning | Promising initial audition at 512. Maintainer reports about 12 GB peak GPU use and about 10 minutes on an M4 Max, and says this mode fits 16 GB. Those are not timings or a memory guarantee for this base M4. The 1024 mode is documented as requiring 64 GB; exclude it from our initial test. |
| [TRELLIS.2-MLX](https://github.com/lyonsno/trellis2mlx) | Native MLX shape/material inference, simplification, UVs, PBR textures and GLB export | A documented textured-shoe run completed on a 16 GB M2 Pro. Complex high-resolution runs can exceed this mini's RAM; begin with a single isolated prop, 512/no-cascade, eight steps and small textures. |
| [Hunyuan3D-Swift / MLX](https://github.com/ZimengXiong/Hunyuan3D-Swift), [Modelr](https://github.com/ZimengXiong/Modelr) | Local shape and paint, with a native Mac app | Interesting shape-generation alternative. The runtime README reports roughly 5.6–7.3 GB for shape but much larger paint/chained workloads, including 25–39 GB examples. Do not equate fast, low-memory shape-only generation with a complete textured asset that fits 24 GB. |
| [AssetFurnace](https://github.com/Bingeljell/image-to-3dlab) | Wrapper around local generators, Blender finishing and character rig/animation tooling | Promising consolidated workflow, but current documentation recommends 32 GB and full Xcode plus Blender. Some README features are explicitly part of a draft 0.4.0 description. Check the actual installed release before relying on advertised end-to-end behavior. |

The Pixal3D port documents substantial model downloads, including roughly 24 GB for its own weights, and gated DINOv3 access. Both reviewed MLX routes require dependency/model-license checks. They are community Mac implementations, distinct from upstream CUDA installation instructions. [Pixal3D port setup](https://github.com/lyonsno/pixal3d-mlx), [TRELLIS port setup](https://github.com/lyonsno/trellis2mlx).

TRELLIS.2 upstream states MIT for model/code; Pixal3D's project is MIT with separately licensed components. Port MIT licensing does not relicense every dependency. Hunyuan weights retain their Tencent license. [TRELLIS.2](https://github.com/microsoft/TRELLIS.2), [Pixal3D](https://github.com/TencentARC/Pixal3D), [Hunyuan license](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE).

## Hosted API candidates

### Tripo

Current v3 developer documentation provides image/multiview generation, model processing, rigging, animation retargeting and GLB delivery. Its rigging documentation supports humanoids and several creature categories; the September 2026 rig version is recommended for humanoids. A dragon with wings still needs an actual rig-compatibility and deformation test.

Published H-series pricing is 30 credits for image-to-3D with standard textures, 25 for auto-rigging and 10 per retargeted animation; a credit is $0.01. Thus one generated textured model, one rig and one retargeted animation total **$0.65 in base task charges**. This excludes retries, reference images, premium options, retopology and conversions. Credit counts across vendors are not comparable dollar amounts. Use exact version IDs and review current billing before submitting jobs.

Sources: [v3 quick start](https://developers.tripo3d.ai/en/docs/quick-start), [rigging](https://developers.tripo3d.com/en/models/rig), [current pricing](https://developers.tripo3d.ai/en/pricing).

### Meshy

A packaged image-to-3D option with GLB, PBR, multi-image input, remeshing, humanoid rigging and animation. Its API supports A-pose generation; that is useful for a princess who must later sit, stand and walk. Meshy's rigging endpoint targets clear humanoid/bipedal anatomy and is not its solution for a dragon.

Published meshy-7.1 API charges are 30 credits for a 2K/4K-textured image-to-3D task, 5 for rigging and 3 per animation action. These are **Meshy credits**, not dollars or Tripo credits. Additional operations and a paid API plan affect the total. Keep web-app subscription credits and API billing distinct. Free web-generated assets have CC BY 4.0 terms, while its ownership guidance distinguishes paid assets; record the actual generation plan and attribution obligations.

Sources: [image generation](https://docs.meshy.ai/en/api/image-to-3d), [rigging constraints](https://docs.meshy.ai/en/api/rigging), [API pricing](https://docs.meshy.ai/en/api/pricing), [API access and credits](https://help.meshy.ai/en/articles/16815622-how-many-credits-does-each-meshy-api-task-cost), [ownership guidance](https://help.meshy.ai/en/articles/10137554-what-is-the-ownership-of-the-generated-models).

### Hyper3D Rodin Gen-2.5

Supports up to five reference images, several geometry tiers, PBR materials and GLB output. Worth an audition for static props and detailed character appearance, without assuming its geometry is automatically animation-ready. The API advertises generation from 0.5 credit, with tier/texture/HighPack surcharges. Do not reuse another provider's credit conversion or assume web-plan economics equal API costs. Persist results locally rather than depending on temporary provider URLs.

Sources: [Gen-2.5 API](https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5), [API options and pricing](https://hyper3d.ai/features/api).

## Princess production experiment

1. Generate and approve a standalone, full-body princess reference in a neutral A-pose, with clear face and hands. Exclude the rock, room, text, props and dramatic lighting. Use consistent front/back references where supported.
2. Generate textured models from the same reference, first locally and then with one hosted candidate if desired. Inspect the actual GLB from the front, back, sides and close up; do not judge only the provider's thumbnail.
3. Compare face fidelity, fingers, hair volume, clothing separation and inferred back surfaces. A single image does not uniquely specify hidden geometry. Image projection may look good from one angle while failing in VR.
4. Rig the neutral character, then pose her seated on a separate rock. A seated source image risks fused limbs, dress and seat. Verify sitting, standing and walking deformation before replacing the current source-bound actor model.
5. Mark clarified that body animation is sufficient for the current VR target. Keep the face static; do not commission facial expression rigs, morph targets or lip-sync. Use body/head gestures with the prerecorded speech.
6. Set per-asset mobile budgets before export. Initial working targets, not device acceptance limits: 5–10k triangles per character, up to 15k for a reviewed featured character, and a 1K texture atlas (2K only when necessary), with lower-detail versions as needed. Bake fine detail into textures; check material/draw-call counts, texture memory and file size on phone/XR hardware. A generator's 500k-face example is not a suitable default runtime budget.
7. Keep the engine authoritative: source visibility, actor identity and offered actions bind to the accepted model. Model generation must not invent puzzle objects or change progression.

For rooms, keep the approved panorama plus selective real foreground geometry approach. Image-to-3D is best auditioned first on isolated props and characters; a converted room illustration does not establish a navigable, dimensionally correct room with distinct interactive objects.

Scope update, 2026-10-24: prefer a simple body skeleton, one or two materials and reusable seated-idle/stand/walk/talk clips. A readable static face and modest GPU cost take priority over cinematic facial systems. These working targets do not replace real-headset acceptance. See the character scope in [the design](design.md).
