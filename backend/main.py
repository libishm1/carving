import os
import tempfile
import open3d as o3d
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Pointing Machine Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def cleanup(path: str):
    if os.path.exists(path):
        os.remove(path)

@app.post("/api/offset")
async def generate_offset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    offset: float = Form(...)
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".stl") as tmp_in:
        tmp_in.write(await file.read())
        tmp_in_path = tmp_in.name
        
    out_path = tmp_in_path.replace(".stl", "_offset.stl")
    
    try:
        # Load mesh
        mesh = o3d.io.read_triangle_mesh(tmp_in_path)
        mesh.compute_vertex_normals()
        
        # Inflate mesh using vertex normals
        vertices = np.asarray(mesh.vertices)
        normals = np.asarray(mesh.vertex_normals)
        
        # Apply offset (pushing outward)
        vertices += normals * offset
        mesh.vertices = o3d.utility.Vector3dVector(vertices)
        
        # Apply mild Taubin smoothing to prevent spiky intersections from inflation
        mesh = mesh.filter_smooth_taubin(number_of_iterations=5)
        
        # Save output
        o3d.io.write_triangle_mesh(out_path, mesh)
        
        background_tasks.add_task(cleanup, out_path)
        background_tasks.add_task(cleanup, tmp_in_path)
        
        return FileResponse(out_path, media_type="application/octet-stream", filename=f"offset_{offset}.stl")
    
    except Exception as e:
        cleanup(tmp_in_path)
        if os.path.exists(out_path):
            cleanup(out_path)
        raise e
