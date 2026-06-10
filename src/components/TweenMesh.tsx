import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';

interface TweenMeshProps {
  stockSize: [number, number, number];
  scaleFactors: [number, number, number];
  carvingNormal: THREE.Vector3;
  maquetteMesh: THREE.Mesh | null;
  tweenValue: number;
  onLoaded: (mesh: THREE.Mesh) => void;
  onUpdate?: () => void;
}

export const TweenMesh = ({
  stockSize,
  scaleFactors,
  carvingNormal,
  maquetteMesh,
  tweenValue,
  onLoaded,
  onUpdate
}: TweenMeshProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [geometryData, setGeometryData] = useState<{baseGeometry: THREE.PlaneGeometry, maxDistances: Float32Array} | null>(null);

  useEffect(() => {
    if (!maquetteMesh || !meshRef.current) return;
    const bvh = (maquetteMesh.geometry as any)?.boundsTree;
    if (!bvh) return;

    // Ensure matrices are updated
    meshRef.current.updateMatrixWorld(true);
    maquetteMesh.updateMatrixWorld(true);

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
    const target = center.clone().sub(carvingNormal);
    geo.lookAt(target); 
    geo.translate(center.x, center.y, center.z);
    
    const positions = geo.attributes.position.array as Float32Array;
    const numVertices = positions.length / 3;
    const distances = new Float32Array(numVertices);
    
    const maxDepth = maxProj * 2; 

    // Calculate transformation matrices
    const tweenToWorld = meshRef.current.matrixWorld;
    const worldToMaquette = maquetteMesh.matrixWorld.clone().invert();
    const tweenToMaquette = worldToMaquette.multiply(tweenToWorld);
    const tweenToMaquetteInv = tweenToMaquette.clone().invert();

    const ray = new THREE.Ray();
    const localNormal = carvingNormal.clone().transformDirection(tweenToMaquette).normalize();

    for (let i = 0; i < numVertices; i++) {
      const origin = new THREE.Vector3(positions[i*3], positions[i*3+1], positions[i*3+2]);
      
      // Transform ray to local space of the maquette geometry
      ray.origin.copy(origin).applyMatrix4(tweenToMaquette);
      ray.direction.copy(localNormal).negate();
      
      const hit = bvh.raycastFirst(ray, maquetteMesh.material);
      
      if (hit) {
        // Convert hit point back to TweenMesh local space to get the true distance
        const hitInTweenSpace = hit.point.clone().applyMatrix4(tweenToMaquetteInv);
        distances[i] = origin.distanceTo(hitInTweenSpace);
      } else {
        distances[i] = maxDepth;
      }
    }
    
    geo.userData.basePositions = new Float32Array(positions);
    
    setGeometryData({ baseGeometry: geo, maxDistances: distances });
  }, [stockSize, carvingNormal, maquetteMesh, scaleFactors]);

  useEffect(() => {
    if (meshRef.current && geometryData?.baseGeometry) {
      onLoaded(meshRef.current);
    }
  }, [geometryData, onLoaded]);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!geometryData || !meshRef.current) return;
    const { baseGeometry, maxDistances } = geometryData;
    
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
    baseGeometry.computeBoundingBox();
    baseGeometry.computeBoundingSphere();
    
    // Regenerate BVH dynamically so the Raycaster can physically snap to the morphed surface!
    if ((baseGeometry as any).computeBoundsTree) {
        (baseGeometry as any).computeBoundsTree(); 
    }
    
    if (onUpdateRef.current) onUpdateRef.current();
    
  }, [geometryData, tweenValue, carvingNormal]);

  return (
    <mesh ref={meshRef} geometry={geometryData?.baseGeometry || undefined}>
      {geometryData?.baseGeometry && (
        <meshStandardMaterial 
          color="#ffffff" 
          side={THREE.DoubleSide} 
          transparent={true}
          opacity={0.6}
          roughness={0.7}
        />
      )}
    </mesh>
  );
};
