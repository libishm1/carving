import open3d as o3d
import os

input_path = r"D:\desktop-backup\motifs\motifs\thanjavur_meshes\1.stl"
output_path = r"C:\Users\libish m\.gemini\antigravity\scratch\pointing-machine-app\public\models\01_maquette_reduced.stl"

print(f"Loading {input_path}...")
mesh = o3d.io.read_triangle_mesh(input_path)
mesh.compute_vertex_normals()

print(f"Original mesh: {len(mesh.vertices)} vertices, {len(mesh.triangles)} triangles")

# Euler's formula for closed meshes: V - E + F = 2 => roughly F = 2V. 
# For 5000 vertices, we need ~10000 triangles.
target_triangles = 10000

print(f"Decimating mesh to target {target_triangles} triangles...")
reduced_mesh = mesh.simplify_quadric_decimation(target_triangles)

print(f"Reduced mesh: {len(reduced_mesh.vertices)} vertices, {len(reduced_mesh.triangles)} triangles")

print(f"Saving to {output_path}...")
o3d.io.write_triangle_mesh(output_path, reduced_mesh)
print("Done.")
