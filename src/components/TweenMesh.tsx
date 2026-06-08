import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

interface TweenMeshProps {
  stockSize: [number, number, number];
  scaleFactors: [number, number, number];
  carvingNormal: THREE.Vector3;
  maquetteMesh: THREE.Mesh | null;
  tweenValue: number;
  onLoaded: (mesh: THREE.Mesh) => void;
}

export const TweenMesh = ({
  stockSize,
  scaleFactors,
  carvingNormal,
  maquetteMesh,
  tweenValue,
  onLoaded
}: TweenMeshProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const { baseGeometry, maxDistances } = useMemo(() => {
    const bvh = (maquetteMesh?.geometry as any)?.boundsTree;
    if (!maquetteMesh || !bvh) return { baseGeometry: null, maxDistances: null };

    const hx = stockSize[0] / 2;
    const hy = stockSize[1] / 2;
    const hz = stockSize[2] / 2;
    
    // To ensure the plane covers the stock block from any angle, we use the diagonal
    const diagonal = Math.sqrt(stockSize[0]**2 + stockSize[1]**2 + stockSize[2]**2);
    
    const maxProj = Math.abs(carvingNormal.x) * hx + Math.abs(carvingNormal.y) * hy + Math.abs(carvingNormal.z) * hz;
    const center = carvingNormal.clone().multiplyScalar(maxProj);
    
    // High resolution grid for accurate heightmap
    const segments = 150; 
    const geo = new THREE.PlaneGeometry(diagonal, diagonal, segments, segments);
    
    // Object3D.lookAt makes the -Z axis face the target.
    // Since PlaneGeometry front face is +Z, we must look at -carvingNormal to make +Z face +carvingNormal!
    // This fixes the X-axis mirror flipping issue.
    const target = center.clone().sub(carvingNormal);
    geo.lookAt(target); 
    geo.translate(center.x, center.y, center.z);
    
    const positions = geo.attributes.position.array as Float32Array;
    const numVertices = positions.length / 3;
    const distances = new Float32Array(numVertices);
    
    const maxDepth = maxProj * 2; 

    // We do exact Local Space Raycasting to bypass R3F matrixWorld render delays
    const ray = new THREE.Ray();
    const invScale = new THREE.Vector3(1/scaleFactors[0], 1/scaleFactors[1], 1/scaleFactors[2]);
    const dir = carvingNormal.clone().multiplyScalar(-1);
    const localDir = dir.clone().multiply(invScale).normalize();
    
    for (let i = 0; i < numVertices; i++) {
      const origin = new THREE.Vector3(positions[i*3], positions[i*3+1], positions[i*3+2]);
      
      // Transform ray to local space of the unscaled maquette geometry
      ray.origin.copy(origin).multiply(invScale);
      ray.direction.copy(localDir);
      
      const hit = bvh.raycastFirst(ray, maquetteMesh.material);
      
      if (hit) {
        // hit.point is in local space! Convert back to scaled space to find true world distance
        const scaledHitPoint = hit.point.clone().multiply(new THREE.Vector3(scaleFactors[0], scaleFactors[1], scaleFactors[2]));
        distances[i] = origin.distanceTo(scaledHitPoint);
      } else {
        distances[i] = maxDepth;
      }
    }
    
    geo.userData.basePositions = new Float32Array(positions);
    
    return { baseGeometry: geo, maxDistances: distances };
  }, [stockSize, carvingNormal, maquetteMesh]);

  useEffect(() => {
    if (meshRef.current && baseGeometry) {
      onLoaded(meshRef.current);
    }
  }, [baseGeometry, onLoaded]);

  useEffect(() => {
    if (!baseGeometry || !maxDistances || !meshRef.current) return;
    
    const positions = baseGeometry.attributes.position.array as Float32Array;
    const basePos = baseGeometry.userData.basePositions as Float32Array;
    const numVertices = positions.length / 3;
    
    for (let i = 0; i < numVertices; i++) {
      const d = maxDistances[i] * tweenValue;
      positions[i*3] = basePos[i*3] - carvingNormal.x * d;
      positions[i*3+1] = basePos[i*3+1] - carvingNormal.y * d;
      positions[i*3+2] = basePos[i*3+2] - carvingNormal.z * d;
    }
    
    baseGeometry.attributes.position.needsUpdate = true;
    baseGeometry.computeVertexNormals();
    
    // Regenerate BVH dynamically so the Raycaster can physically snap to the morphed surface!
    if (baseGeometry.computeBoundsTree) {
        baseGeometry.computeBoundsTree(); 
    }
    
  }, [baseGeometry, maxDistances, tweenValue, carvingNormal]);

  if (!baseGeometry) return null;

  return (
    <mesh ref={meshRef} geometry={baseGeometry}>
      <meshStandardMaterial 
        color="#ffffff" 
        side={THREE.DoubleSide} 
        transparent={true}
        opacity={0.6}
        roughness={0.7}
      />
    </mesh>
  );
};
