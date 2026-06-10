import React, { useRef, useState, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useXRHitTest } from '@react-three/xr';
import { Html, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

import { calculateRegistration } from '../utils/registration';

export type RegistrationStep = 'idle' | 'p1' | 'p2' | 'p3' | 'p4' | 'fiducial1' | 'fiducial2' | 'fiducial3';

interface ARControllerProps {
  blockMeshRef: THREE.Object3D | null;
  onPlaceModel: (position: THREE.Vector3) => void;
  registrationStep: RegistrationStep;
  setRegistrationStep: (step: RegistrationStep) => void;
  registrationPoints: THREE.Vector3[];
  setRegistrationPoints: (points: THREE.Vector3[]) => void;
  onRegistrationComplete: (matrix: THREE.Matrix4, dimensions: [number, number, number]) => void;
  digitalPins: THREE.Vector3[];
  onFiducialRegistrationComplete: (physicalPoints: THREE.Vector3[]) => void;
  arMode: 'none' | 'webxr_dom' | 'webxr_basic' | 'html5';
}

export const ARController: React.FC<ARControllerProps> = ({ 
  blockMeshRef, 
  onPlaceModel,
  registrationStep,
  setRegistrationStep,
  registrationPoints,
  setRegistrationPoints,
  onRegistrationComplete,
  digitalPins,
  onFiducialRegistrationComplete,
  arMode
}) => {
  const { camera } = useThree();
  const [physicalHitPoint, setPhysicalHitPoint] = useState<THREE.Vector3 | null>(null);
  const [drillDepth, setDrillDepth] = useState<number | null>(null);
  const [isPlaced, setIsPlaced] = useState(false);
  const hitMeshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (arMode === 'html5' && !physicalHitPoint) {
      setPhysicalHitPoint(new THREE.Vector3(0, 0, -1));
    }
  }, [arMode, physicalHitPoint]);

  // Perform continuous hit-test against the physical environment
  useXRHitTest((results: any[], getWorldMatrix: any) => {
    if (arMode === 'html5') return;
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

  useFrame(() => {
    if (arMode === 'html5' && hitMeshRef.current && camera && (!isPlaced || registrationStep !== 'idle')) {
      // Lock the crosshair to exactly 1 meter in front (depth doesn't matter, origin is the printed marker)
      const targetPos = new THREE.Vector3(0, 0, -1);
      targetPos.applyMatrix4(camera.matrixWorld);
      
      hitMeshRef.current.position.lerp(targetPos, 0.5);
      
      setPhysicalHitPoint(hitMeshRef.current.position.clone());
    }
  });

  if (!physicalHitPoint) return null;

  const handleConfirm = () => {
    const newPoints = [...registrationPoints, physicalHitPoint.clone()];
    setRegistrationPoints(newPoints);
    
    if (registrationStep === 'p1') setRegistrationStep('p2');
    else if (registrationStep === 'p2') setRegistrationStep('p3');
    else if (registrationStep === 'p3') setRegistrationStep('p4');
    else if (registrationStep === 'p4') {
      const { matrix, dimensions } = calculateRegistration(newPoints[0], newPoints[1], newPoints[2], newPoints[3]);
      onRegistrationComplete(matrix, dimensions);
      setRegistrationStep('idle');
    }
    else if (registrationStep === 'fiducial1') setRegistrationStep('fiducial2');
    else if (registrationStep === 'fiducial2') setRegistrationStep('fiducial3');
    else if (registrationStep === 'fiducial3') {
      onFiducialRegistrationComplete(newPoints);
      setRegistrationStep('idle');
    }
  };

  const Button3D = ({ position, text, color, onClick }: any) => (
    <Billboard position={position}>
      <group onClick={onClick} onPointerDown={onClick}>
        <mesh>
          <planeGeometry args={[0.3, 0.08]} />
          <meshBasicMaterial color={color} side={THREE.DoubleSide} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.03} color="white" anchorX="center" anchorY="middle">
          {text}
        </Text>
      </group>
    </Billboard>
  );

  return (
    <mesh ref={hitMeshRef}>
      <sphereGeometry args={[0.02, 16, 16]} />
      <meshStandardMaterial color={isPlaced ? "#ef4444" : "#4ade80"} emissive={isPlaced ? "#ef4444" : "#4ade80"} emissiveIntensity={0.8} />
      
      {(!isPlaced || registrationStep !== 'idle') && (
        (arMode === 'webxr_dom' || arMode === 'html5') ? (
          <Html position={[0, 0.1, 0]} center zIndexRange={[100, 0]}>
            <div className="flex gap-2">
              {registrationStep === 'idle' ? (
                <>
                  <button 
                    className="bg-primary-600 hover:bg-primary-500 text-white font-bold py-2 px-4 rounded-full shadow-lg whitespace-nowrap"
                    onClick={() => {
                      onPlaceModel(physicalHitPoint);
                      setIsPlaced(true);
                    }}
                  >
                    Place Model Here
                  </button>
                  <button 
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-full shadow-lg whitespace-nowrap"
                    onClick={() => {
                      setRegistrationStep('p1');
                      setRegistrationPoints([]);
                      setIsPlaced(true);
                    }}
                  >
                    Map Stone (4-Point)
                  </button>
                  {digitalPins.length === 3 && (
                    <button 
                      className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-full shadow-lg whitespace-nowrap"
                      onClick={() => {
                        setRegistrationStep('fiducial1');
                        setRegistrationPoints([]);
                        setIsPlaced(true);
                      }}
                    >
                      Map Fiducials (3-Pin)
                    </button>
                  )}
                </>
              ) : (
                <button 
                  className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-full shadow-lg whitespace-nowrap border-2 border-white animate-pulse"
                  onClick={handleConfirm}
                >
                  Confirm Point {registrationPoints.length + 1}
                </button>
              )}
            </div>
          </Html>
        ) : (
          <group position={[0, 0.15, 0]}>
            {registrationStep === 'idle' ? (
              <>
                <Button3D 
                  position={[0, 0.1, 0]} 
                  text="Place Model Here" 
                  color="#2563eb"
                  onClick={() => {
                    onPlaceModel(physicalHitPoint);
                    setIsPlaced(true);
                  }}
                />
                <Button3D 
                  position={[0, 0, 0]} 
                  text="Map Stone (4-Point)" 
                  color="#9333ea"
                  onClick={() => {
                    setRegistrationStep('p1');
                    setRegistrationPoints([]);
                    setIsPlaced(true);
                  }}
                />
                {digitalPins.length === 3 && (
                  <Button3D 
                    position={[0, -0.1, 0]} 
                    text="Map Fiducials (3-Pin)" 
                    color="#dc2626"
                    onClick={() => {
                      setRegistrationStep('fiducial1');
                      setRegistrationPoints([]);
                      setIsPlaced(true);
                    }}
                  />
                )}
              </>
            ) : (
              <Button3D 
                position={[0, 0, 0]} 
                text={`Confirm Point ${registrationPoints.length + 1}`} 
                color="#dc2626"
                onClick={handleConfirm}
              />
            )}
          </group>
        )
      )}

      {isPlaced && drillDepth !== null && registrationStep === 'idle' && (
        (arMode === 'webxr_dom' || arMode === 'html5') ? (
          <Html position={[0, 0.05, 0]} center zIndexRange={[100, 0]} className="pointer-events-none">
            <div className="bg-dark-900/90 border border-primary-500/50 text-primary-400 font-mono text-sm px-3 py-2 rounded shadow-lg whitespace-nowrap backdrop-blur-md">
              {drillDepth > 0 ? `Carve: ${drillDepth.toFixed(1)} mm` : `Too deep: ${Math.abs(drillDepth).toFixed(1)} mm`}
            </div>
          </Html>
        ) : (
          <Billboard position={[0, 0.1, 0]}>
            <Text fontSize={0.04} color="#60a5fa" outlineColor="#1e3a8a" outlineWidth={0.005}>
              {drillDepth > 0 ? `Carve: ${drillDepth.toFixed(1)} mm` : `Too deep: ${Math.abs(drillDepth).toFixed(1)} mm`}
            </Text>
          </Billboard>
        )
      )}
    </mesh>
  );
};
