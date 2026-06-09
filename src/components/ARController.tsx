import React, { useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useXRHitTest } from '@react-three/xr';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface ARControllerProps {
  blockMeshRef: THREE.Object3D | null;
  onPlaceModel: (position: THREE.Vector3) => void;
}

export const ARController: React.FC<ARControllerProps> = ({ blockMeshRef, onPlaceModel }) => {
  const { camera } = useThree();
  const [physicalHitPoint, setPhysicalHitPoint] = useState<THREE.Vector3 | null>(null);
  const [drillDepth, setDrillDepth] = useState<number | null>(null);
  const [isPlaced, setIsPlaced] = useState(false);
  const hitMeshRef = useRef<THREE.Mesh>(null);

  // Perform continuous hit-test against the physical environment
  useXRHitTest((results: any[], getWorldMatrix: any) => {
    if (results.length === 0) return;
    const hitMatrix = getWorldMatrix(results[0]);
    const physicalPoint = new THREE.Vector3().setFromMatrixPosition(hitMatrix);
    setPhysicalHitPoint(physicalPoint);

    if (hitMeshRef.current) {
      hitMeshRef.current.position.copy(physicalPoint);
    }

    if (!isPlaced) return;

    if (!blockMeshRef) {
      setDrillDepth(null);
      return;
    }

    // Now fire a raycast from the camera towards the physical hit point to hit the digital model
    const raycaster = new THREE.Raycaster();
    const cameraPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    
    // Direction from camera to physical point
    const dir = physicalPoint.clone().sub(cameraPos).normalize();
    raycaster.set(cameraPos, dir);

    const hits = raycaster.intersectObject(blockMeshRef, true);

    if (hits.length > 0) {
      const digitalDist = hits[0].distance;
      const physicalDist = cameraPos.distanceTo(physicalPoint);

      // The drill depth is the difference between the physical surface and the digital surface
      // If digital is further away, we need to carve into the physical surface.
      // Convert to mm (assuming units are meters in WebXR)
      const depth = (digitalDist - physicalDist) * 1000;
      setDrillDepth(depth);
    } else {
      setDrillDepth(null);
    }
  }, "viewer");

  if (!physicalHitPoint) return null;

  return (
    <mesh ref={hitMeshRef}>
      <sphereGeometry args={[0.02, 16, 16]} />
      <meshStandardMaterial color={isPlaced ? "#ef4444" : "#4ade80"} emissive={isPlaced ? "#ef4444" : "#4ade80"} emissiveIntensity={0.8} />
      
      {!isPlaced && (
        <Html position={[0, 0.1, 0]} center zIndexRange={[100, 0]}>
          <button 
            className="bg-primary-600 hover:bg-primary-500 text-white font-bold py-2 px-4 rounded-full shadow-lg whitespace-nowrap"
            onClick={() => {
              onPlaceModel(physicalHitPoint);
              setIsPlaced(true);
            }}
          >
            Place Model Here
          </button>
        </Html>
      )}

      {isPlaced && drillDepth !== null && (
        <Html position={[0, 0.05, 0]} center zIndexRange={[100, 0]} className="pointer-events-none">
          <div className="bg-dark-900/90 border border-primary-500/50 text-primary-400 font-mono text-sm px-3 py-2 rounded shadow-lg whitespace-nowrap backdrop-blur-md">
            {drillDepth > 0 ? `Carve: ${drillDepth.toFixed(1)} mm` : `Too deep: ${Math.abs(drillDepth).toFixed(1)} mm`}
          </div>
        </Html>
      )}
    </mesh>
  );
};
