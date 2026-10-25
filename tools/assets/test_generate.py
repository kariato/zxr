import tempfile
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
import trimesh
from tools.assets.generate import prepare

class CandidateGeometryTests(unittest.TestCase):
    def reference(self,directory,empty=False):
        pixels=np.zeros((192,128,4),dtype=np.uint8)
        if not empty:pixels[10:182,40:88]=[180,130,90,255]
        path=Path(directory)/'reference.png';Image.fromarray(pixels).save(path);return path

    def test_sword_rests_with_broad_face_up_not_balanced_on_its_edge(self):
        with tempfile.TemporaryDirectory() as directory:
            mesh=trimesh.creation.box(extents=[.16,1,.015]).subdivide()
            result,_=prepare(mesh,self.reference(directory),100,[1,.055,.16],True)
            self.assertAlmostEqual(result.extents[0],1)
            self.assertLess(result.extents[1],.02)
            self.assertAlmostEqual(result.bounds[0,1],0)

    def test_candidate_keeps_metric_height_finite_uvs_and_smooth_normals(self):
        with tempfile.TemporaryDirectory() as directory:
            mesh=trimesh.creation.icosphere(subdivisions=2)
            result,_=prepare(mesh,self.reference(directory),80,[.6,1.55,.4])
            self.assertLessEqual(len(result.faces),80)
            self.assertAlmostEqual(result.extents[1],1.55)
            self.assertTrue(np.isfinite(result.visual.uv).all())
            self.assertTrue(np.isfinite(result.vertex_normals).all())
            self.assertEqual(result.visual.material.baseColorTexture.size,(1024,1024))

    def test_empty_alpha_reference_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError,'alpha foreground'):
                prepare(trimesh.creation.icosphere(subdivisions=1),self.reference(directory,True),100,[1,1,1])

if __name__=='__main__':unittest.main()
