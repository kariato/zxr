# Flower-free low-hedge garden mesh

Direct local Tencent Hunyuan shape inference from the selected `../reference.png`, generated 2026-10-27 at octree resolution 512. 656,367 vertices, 1,312,704 triangles, 23,629,644 bytes. `garden-low-hedges-v1.glb` is unchanged pipeline output; the Blender file adds only separate review cameras and lights. No decimation, geometry cleanup or projected texture is applied.

Front, 90-degree side and rear untextured renders were inspected. The low bed outlines and some foreground sculpture silhouettes are recognizable, but most fine detail is lost. The gazebo is flattened rather than an open post-and-roof structure; several statues are missing, distorted or fused, and perimeter surfaces are inferred. Higher octree resolution increases triangle count without recovering the missing scene structure. This is a rough reconstruction draft, not a faithful or traversable version of the concept.

Generation provenance, reference hash, counts and source GLB hash are in `generation.json`. `blender-verification.json` confirms imported geometry/UVs and the source GLB remain unchanged. Native inference units; no runtime changes. The sibling Tencent license and notice apply.
