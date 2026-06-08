import open3d as o3d
import numpy as np

input_path = r"D:\desktop-backup\motifs\motifs\thanjavur_meshes\1.stl"
output_path = r"C:\Users\libish m\.gemini\antigravity\scratch\pointing-machine-app\public\models\01_maquette_reduced.stl"

print("Loading mesh...")
mesh = o3d.io.read_triangle_mesh(input_path)

print("Extracting point cloud...")
pcd = o3d.geometry.PointCloud()
pcd.points = mesh.vertices
mesh.compute_vertex_normals()
pcd.normals = mesh.vertex_normals

print("Downsampling point cloud to manageable size...")
bbox = pcd.get_axis_aligned_bounding_box()
extent = bbox.get_extent()
voxel_size = max(extent) / 250.0  # Approx 250 voxels across the longest dimension
pcd_down = pcd.voxel_down_sample(voxel_size)
print(f"Downsampled to {len(pcd_down.points)} points.")

print("Orienting normals...")
pcd_down.orient_normals_consistent_tangent_plane(30)

print("Running Poisson Surface Reconstruction...")
poisson_mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd_down, depth=9)

print("Cleaning up Poisson artifacts...")
densities = np.asarray(densities)
density_threshold = np.quantile(densities, 0.05)
vertices_to_remove = densities < density_threshold
poisson_mesh.remove_vertices_by_mask(vertices_to_remove)

print(f"Poisson mesh generated: {len(poisson_mesh.triangles)} triangles")

target_triangles = 10000
print(f"Decimating to {target_triangles} triangles...")
reduced_mesh = poisson_mesh.simplify_quadric_decimation(target_triangles)
reduced_mesh.compute_vertex_normals()
reduced_mesh.compute_triangle_normals()

print(f"Final mesh: {len(reduced_mesh.vertices)} vertices, {len(reduced_mesh.triangles)} triangles")

print(f"Saving to {output_path}...")
o3d.io.write_triangle_mesh(output_path, reduced_mesh)
print("Done.")
