# Underground garden

Strong single-scene candidate: one garden from north to south, gazebo within the rosebed, gravel paths and topiary, hedges obscuring cave walls, glowing moss overhead. Gazebo interior uses the same structure.

## Rooms

- [North End of Garden (`GARDEN-NORTH`)](GARDEN-NORTH/README.md)
- [Gazebo (`GAZEBO-ROOM`)](GAZEBO-ROOM/README.md)
- [Formal Garden (`FORMAL-GARDEN`)](FORMAL-GARDEN/README.md)
- [Topiary (`TOPIARY-ROOM`)](TOPIARY-ROOM/README.md)

[All scene groups](../README.md) · [Grouping review](../../../../../docs/scene-grouping-review.md)

## Combined scene image

[Underground Garden concept v1](concept-v1/reference.png) encompasses all four rooms in one continuous cavern garden. It places the northern rosebed and single gazebo beyond the central flowerbeds and winding path, with animal/human topiary in the southern area. The gazebo interior belongs to the same open structure.

The [concept review](concept-v1/README.md) records the three external connections, full generation prompt, source descriptions, input-image hashes and visual checks. The image is a draft authoring reference for the shared scene.

## Generated Blender scene

The [packed Blender scene](mesh-v1/underground-garden-v1.blend) and [overview render](mesh-v1/review-overview.png) use the combined concept as input to the working Tencent mesh model. The scene includes the shared generated mesh, lighting, cameras and four source-room collections with approximate region markers. See the [mesh review and reproduction notes](mesh-v1/README.md) for geometry, texture-projection limits and verification.

## Skybox-equipped export

[Underground Garden v2 GLB](mesh-v2/underground-garden-v2.glb) and the [updated Blender scene](mesh-v2/underground-garden-v2.blend) embed the cave-garden panorama around the generated garden. See the [preview](mesh-v2/review-overview.png) and [export/verification notes](mesh-v2/README.md). The skybox uses an inward-facing unlit sphere for GLB portability; the Blender world also retains the packed panorama.

## In-game integration

All four garden rooms now retain the v2 GLB and its packed sky sphere across source room transitions. A separate native garden panorama supplies the same backdrop during loading/failure. Other proposed skyboxes are not enabled by this integration. `src/prototype/garden-scene.ts` records reviewed arrival points and observation-bound source targets; the model's authoring cameras and region markers never grant actions.

Desktop users can choose **Garden overview** to inspect the whole scene, then **Recenter view** to return to the current room. Raised desktop views help read the rough reconstruction; XR uses normal eye height. The gazebo has an independently authored table carrying only currently observed source props. Source exits and saved-game state remain unchanged. Geometry is still a draft with stretched surfaces; this integration does not finish the inferred model or claim headset collision acceptance.
