# Carousel hub

One central circular hall and its small western crawl chamber. Its eight identical passage mouths can reuse geometry. Do not make physical direction alone determine an exit: carousel movement is deliberately disorienting and source-controlled. Other regions attach through passages.

## Rooms

[Concept and source movement constraints](scene-concept.md) · [Concept image](concept-v1.png) · [Exact built-in ImageGen prompt](concept-v1.prompt.txt)

## Generated authoring drafts

- `mesh-v1/`: direct untouched Tencent shape, Blender scene and front/back geometry renders.
- `mesh-v1-color/`: packed reference, editable UV projection and colored Blender/GLB copy.
- `mesh-v2-reduced/`: curvature-weighted reduction with an adjustable Decimate modifier.

Reproduce with `tools/assets/carousel-hub-scene-generate.py` in the local shape environment, followed by `carousel-hub-scene-blender.py`, `carousel-hub-scene-color.py` and `carousel-hub-scene-decimate.py` in the installed bpy environment. Generation and verification JSON record settings, counts, hashes and source preservation. Native inference units; no runtime integration.

- [Carousel Room (`CAROUSEL-ROOM`)](CAROUSEL-ROOM/README.md)
- [Room 8 (`ROOM-8`)](ROOM-8/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)
