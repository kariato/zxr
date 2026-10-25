"""Load and render every reference GLB in Blender; CPU-only beside GPU jobs."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import time
import traceback
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT/'out/asset-production/reference-verification'
RENDERS = REPORT/'renders'


def bounds(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(graph)
        points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    assert points and all(math.isfinite(value) for point in points for value in point), 'Invalid evaluated bounds'
    lo = Vector(tuple(min(p[axis] for p in points) for axis in range(3)))
    hi = Vector(tuple(max(p[axis] for p in points) for axis in range(3)))
    return lo, hi


def render(row, model, digest):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model))
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    assert meshes and sum(len(obj.data.polygons) for obj in meshes) > 0, 'No renderable mesh'
    scene.frame_set(1)
    lo, hi = bounds(meshes)
    center, span = (lo+hi)/2, max(hi-lo)
    assert span > .00001, 'Degenerate bounds'
    sampled = []
    if bpy.data.actions:
        for frame in [1, 31, 61, 91, 120]:
            scene.frame_set(frame)
            sample_lo, sample_hi = bounds(meshes)
            assert max(sample_hi-sample_lo) < span*8, 'Animation bounds explode'
            sampled.append({'frame': frame, 'bounds': [list(sample_lo), list(sample_hi)]})
        scene.frame_set(1)
    world = bpy.data.worlds.new('Review studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.27, .30, .33, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8
    scene.world = world
    for index, offset in enumerate([(1.5, -2, 2.5), (-1.5, 2, 1.5)]):
        light_data = bpy.data.lights.new('Review fill '+str(index), 'AREA')
        light_data.energy = span*span*(65 if index == 0 else 45)
        light_data.size = span*2
        light = bpy.data.objects.new(light_data.name, light_data)
        scene.collection.objects.link(light)
        light.location = center+Vector(offset)*span
        light.rotation_euler = (center-light.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('Review camera')
    camera = bpy.data.objects.new('Review camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = span*1.4
    camera_data.clip_start = max(.000001, span*.0001)
    camera_data.clip_end = span*100
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 320
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    for name, offset in [('front', (.22, -2.2, .22)), ('back', (.22, 2.2, .22)), ('side', (2.2, .22, .22))]:
        camera.location = center+Vector(offset)*span
        camera.rotation_euler = (center-camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(RENDERS/f'{row["id"]}-{name}.png')
        bpy.ops.render.render(write_still=True)
    return {'id': row['id'], 'identity': row['identity'], 'file': str(model), 'sha256': digest,
            'status': 'passed', 'meshObjects': len(meshes), 'boundsMetres': [list(lo), list(hi)],
            'animationBoundsSamples': sampled, 'views': ['front', 'back', 'side'],
            'review': 'Blender import/render smoke check; artistic and functional acceptance remain separate.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    RENDERS.mkdir(parents=True, exist_ok=True)
    rows = json.loads((REPORT/'manifest.json').read_text())['assets']
    while True:
        waiting, failed = [], []
        for row in rows:
            model = ROOT/row['model']
            if row.get('record') and not (ROOT/row['record']).exists():
                waiting.append(row['id'])
                continue
            if not model.exists():
                waiting.append(row['id'])
                continue
            animated = model.parent/'animated.glb'
            if animated.exists():
                model = animated
            finished = model.parent/'finished.glb'
            if finished.exists():
                model = finished
            digest = hashlib.sha256(model.read_bytes()).hexdigest()
            record = RENDERS/f'{row["id"]}.json'
            if record.exists():
                previous = json.loads(record.read_text())
                if previous.get('sha256') == digest and 'side' in previous.get('views', []):
                    if previous['status'] != 'passed':
                        failed.append(row['id'])
                    continue
            try:
                result = render(row, model, digest)
                print('RENDERED '+row['identity'], flush=True)
            except Exception as error:
                result = {'id': row['id'], 'identity': row['identity'], 'file': str(model), 'sha256': digest,
                          'status': 'failed', 'error': str(error), 'traceback': traceback.format_exc()}
                failed.append(row['id'])
                print('RENDER FAILED '+row['identity']+': '+str(error), flush=True)
            record.write_text(json.dumps(result, indent=2)+'\n')
        summary = {'total': len(rows), 'rendered': len(rows)-len(waiting)-len(failed), 'waiting': waiting, 'failed': failed}
        (RENDERS/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
        print('RENDER STATUS '+json.dumps({key: len(value) if isinstance(value, list) else value for key, value in summary.items()}), flush=True)
        if not waiting or not args.watch:
            if failed:
                raise SystemExit(1)
            break
        time.sleep(20)


if __name__ == '__main__':
    main()
