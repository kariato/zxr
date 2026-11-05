Eleven atomic ravine components

Standard GLBs: embedded PNG textures, ordinary Blender/glTF compatibility.
browser/: smaller Meshopt + KTX2 variants. Loader needs MeshoptDecoder and KTX2Loader/Basis support.
ravine-atomic-kit.blend: editable staged kit, not a complete assembled ravine.
Units: metres. GLB Y up; front +Z. Local bottom-centre pivots.
Floor references are staged upright for inspection; rotate -90 degrees around X for an upward-facing floor in glTF coordinates.

Generated with local Tencent Hunyuan3D-2 turbo. Raw inference is retained in the project raw/ directory.
Blender panels resample the Tencent front relief into shallow straight-backed modules.
Cave/arch alpha silhouettes become actual open geometry. Textures project the source references.
Residual-height normal maps retain smaller relief detail. Boulder retains a decimated Tencent volume with a baked reference projection.
Hidden faces use neutral stone; these are not learned unseen textures or guaranteed seamless tiles.
See verification.json for input hashes, mesh checks and dimensions (Blender X/Y/Z).
