import { useState, useMemo, Suspense, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { ARCanvas, ARMarker } from '@artcom/react-three-arjs';
import { OrbitControls, ContactShadows, Grid, TransformControls, Html } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { Model } from './components/ModelLoader';
import { TweenMesh } from './components/TweenMesh';
import { ARController, type RegistrationStep } from './components/ARController';
import { calculateTriangleRegistration } from './utils/registration';
import { Settings2, Maximize, BoxSelect, Menu, X, Upload, Move, RotateCw, Scaling, MapPin } from 'lucide-react';
import * as THREE from 'three';

export const storeWithDOM = createXRStore({ domOverlay: true });
export const storeWithoutDOM = createXRStore();

// Dynamic Block Component for the Stock
const DynamicBlock = ({ size, onLoaded }: { size: [number, number, number], onLoaded: (box: THREE.Box3, size: [number, number, number], root: THREE.Object3D) => void }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    if (meshRef.current) {
      if (!(meshRef.current.geometry as any).boundsTree) {
        (meshRef.current.geometry as any).computeBoundsTree();
      }
      meshRef.current.geometry.computeBoundingBox();
      const box = meshRef.current.geometry.boundingBox!;
      if (onLoadedRef.current) onLoadedRef.current(box, size, meshRef.current);
    }
  }, [size]);

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#4ade80" wireframe opacity={0.3} transparent />
    </mesh>
  );
};

function App() {
  const [mode, setMode] = useState<'multiplier' | 'target_longest' | 'target_x' | 'target_y' | 'target_z' | 'fit'>('multiplier');
  const [value, setValue] = useState<number>(1);
  const [margin, setMargin] = useState<number>(0.05);

  const [stockMode, setStockMode] = useState<'custom' | 'auto'>('auto');
  const [customStockSize, setCustomStockSize] = useState<[number, number, number]>([1.2, 1.0, 2.2]);
  
  const [isCarvingMode, setIsCarvingMode] = useState<boolean>(true);
  const [carvingDepth, setCarvingDepth] = useState<number>(0);
  const [carvingNormal, setCarvingNormal] = useState<THREE.Vector3>(new THREE.Vector3(0, 0, 1));
  const [isSelectingFace, setIsSelectingFace] = useState<boolean>(false);
  const [modelPosition, setModelPosition] = useState<THREE.Vector3>(new THREE.Vector3(0, -1, 0));
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale' | 'none'>('none');
  const [modelUrl, setModelUrl] = useState<string>(`${import.meta.env.BASE_URL}models/01_maquette_reduced.stl`);
  const [modelExt, setModelExt] = useState<string>('stl');

  // Multi-touch AR Gestures
  const [arScale, setArScale] = useState<number>(1);
  const [arRotation, setArRotation] = useState<number>(0);
  const touchState = useRef({ distance: 0, angle: 0, initialScale: 1, initialRotation: 0 });

  // AR Registration Workflow
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>('idle');
  const [registrationPoints, setRegistrationPoints] = useState<THREE.Vector3[]>([]);
  const [registrationMatrix, setRegistrationMatrix] = useState<THREE.Matrix4 | null>(null);

  // Custom Fiducial Pinning Workflow
  const [isPinningMode, setIsPinningMode] = useState<boolean>(false);
  const [digitalPins, setDigitalPins] = useState<THREE.Vector3[]>([]);

  const [maquetteMeshRef, setMaquetteMeshRef] = useState<THREE.Mesh | null>(null);
  const [blockMeshRef, setBlockMeshRef] = useState<THREE.Object3D | null>(null);
  const dynamicBlockRef = useRef<THREE.Object3D | null>(null);
  const mainGroupRef = useRef<THREE.Group>(null);
  const transformGroupRef = useRef<THREE.Group>(null);
  const [selectedMaquetteLocalPoint, setSelectedMaquetteLocalPoint] = useState<THREE.Vector3 | null>(null);
  const [selectedBlockLocalPoint, setSelectedBlockLocalPoint] = useState<THREE.Vector3 | null>(null);
  const [drillDepth, setDrillDepth] = useState<number | null>(null);
  const [arMode, setArMode] = useState<'none' | 'webxr_dom' | 'webxr_basic' | 'html5'>('none');
    
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext) setModelExt(ext);
      
      const newUrl = URL.createObjectURL(file);
      if (modelUrl.startsWith('blob:')) {
        URL.revokeObjectURL(modelUrl);
      }
      setModelUrl(newUrl);
      // Reset carving depth when loading a new model
      setCarvingDepth(0);
    }
  };

  useEffect(() => {
    if (!isCarvingMode && dynamicBlockRef.current) {
      setBlockMeshRef(dynamicBlockRef.current);
    }
  }, [isCarvingMode]);

  const [baseSize, setBaseSize] = useState<[number, number, number]>([0, 0, 0]);
  const [baseCenter, setBaseCenter] = useState<[number, number, number]>([0, 0, 0]);

  const { scaleFactors, fitResult, currentSize } = useMemo(() => {
    let factor = 1;
    
    if (mode === 'multiplier') {
      factor = value;
    } else if (mode === 'target_longest') {
      const longest = Math.max(...baseSize);
      if (longest > 0) factor = value / longest;
    } else if (mode === 'target_x') {
      if (baseSize[0] > 0) factor = value / baseSize[0];
    } else if (mode === 'target_y') {
      if (baseSize[1] > 0) factor = value / baseSize[1];
    } else if (mode === 'target_z') {
      if (baseSize[2] > 0) factor = value / baseSize[2];
    } else if (mode === 'fit') {
      const ratioX = customStockSize[0] / (baseSize[0] || 1);
      const ratioY = customStockSize[1] / (baseSize[1] || 1);
      const ratioZ = customStockSize[2] / (baseSize[2] || 1);
      factor = Math.min(ratioX, ratioY, ratioZ);
    }

    if (!isFinite(factor) || factor <= 0) factor = 1;

    const factors: [number, number, number] = [factor, factor, factor];

    const scaledExtents: [number, number, number] = [
      baseSize[0] * factor,
      baseSize[1] * factor,
      baseSize[2] * factor
    ];

    return { scaleFactors: factors, fitResult: null as { fits: boolean, clearance: number[] } | null, currentSize: scaledExtents };
  }, [baseSize, customStockSize, mode, value]);

  const sculptureSize = currentSize;
  const sculptureCenter: [number, number, number] = [
    baseCenter[0] * scaleFactors[0],
    baseCenter[1] * scaleFactors[0],
    baseCenter[2] * scaleFactors[0]
  ];

  const effectiveStock: [number, number, number] = useMemo(() => {
    if (stockMode === 'custom') {
      return customStockSize;
    } else {
      return [
        sculptureSize[0] + (margin * 2),
        sculptureSize[1] + (margin * 2),
        sculptureSize[2] + (margin * 2)
      ];
    }
  }, [stockMode, sculptureSize, margin, customStockSize]);

  const handleSculptureLoaded = useCallback((box: THREE.Box3, size: number[]) => {
    setBaseSize([size[0], size[1], size[2]]);
    const center = new THREE.Vector3();
    box.getCenter(center);
    setBaseCenter([center.x, center.y, center.z]);
  }, []);

  const { maxCarvingDepth } = useMemo(() => {
    const hx = effectiveStock[0] / 2;
    const hy = effectiveStock[1] / 2;
    const hz = effectiveStock[2] / 2;
    const maxProj = Math.abs(carvingNormal.x) * hx + Math.abs(carvingNormal.y) * hy + Math.abs(carvingNormal.z) * hz;
    return { maxCarvingDepth: maxProj * 2 };
  }, [effectiveStock, carvingNormal]);

  const updateSnapping = useCallback((localMaquettePoint: THREE.Vector3, blockMesh: THREE.Object3D | null) => {
    if (!blockMesh || !transformGroupRef.current) return;
    
    const worldPoint = localMaquettePoint.clone();
    transformGroupRef.current.localToWorld(worldPoint);
    
    const worldNormal = carvingNormal.clone().transformDirection(transformGroupRef.current.matrixWorld).normalize();
    const raycaster = new THREE.Raycaster();

    if (isCarvingMode) {
      const dir = worldNormal.clone();
      const origin = worldPoint.clone().add(worldNormal.clone().multiplyScalar(-0.01));
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObject(blockMesh, true);
      if (hits.length > 0) {
        const localHit = hits[0].point.clone();
        transformGroupRef.current.worldToLocal(localHit);
        setSelectedBlockLocalPoint(localHit);
        setDrillDepth(hits[0].distance - 0.01);
      }
    } else {
      let closestPointWorld = worldPoint.clone();
      let minDistance = Infinity;
      blockMesh.traverse((child: any) => {
        if (child instanceof THREE.Mesh && child.geometry.boundsTree) {
          const inverseMatrix = new THREE.Matrix4().copy(child.matrixWorld).invert();
          const localHitPt = worldPoint.clone().applyMatrix4(inverseMatrix);
          const res = child.geometry.boundsTree.closestPointToPoint(localHitPt, {});
          if (res && res.point) {
            const worldPt = res.point.clone().applyMatrix4(child.matrixWorld);
            const dist = worldPt.distanceTo(worldPoint);
            if (dist < minDistance) {
              minDistance = dist;
              closestPointWorld = worldPt;
            }
          }
        }
      });
      if (minDistance !== Infinity) {
        const localHit = closestPointWorld.clone();
        transformGroupRef.current.worldToLocal(localHit);
        setSelectedBlockLocalPoint(localHit);
        setDrillDepth(minDistance);
      }
    }
  }, [carvingNormal, isCarvingMode]);

  const recalculatePointing = useCallback(() => {
    if (selectedMaquetteLocalPoint) {
      updateSnapping(selectedMaquetteLocalPoint, blockMeshRef);
    }
  }, [selectedMaquetteLocalPoint, blockMeshRef, updateSnapping]);

  useEffect(() => {
    recalculatePointing();
  }, [recalculatePointing, scaleFactors[0]]);

  const handleMaquetteClick = (point: THREE.Vector3, worldNormal?: THREE.Vector3) => {
    if (isPinningMode && mainGroupRef.current) {
      const localPoint = point.clone();
      mainGroupRef.current.worldToLocal(localPoint);
      setDigitalPins(prev => {
        if (prev.length >= 3) return [localPoint]; 
        return [...prev, localPoint];
      });
      return;
    }

    if (!transformGroupRef.current) return;
    
    if (isCarvingMode) {
      if (!worldNormal) return;

      const invMatrix = transformGroupRef.current.matrixWorld.clone().invert();
      const localNormal = worldNormal.clone().transformDirection(invMatrix).normalize();

      if (isSelectingFace) {
        setCarvingNormal(localNormal);
        setIsSelectingFace(false);
        return;
      }
    }

    const localClick = point.clone();
    transformGroupRef.current.worldToLocal(localClick);
    setSelectedMaquetteLocalPoint(localClick);
    updateSnapping(localClick, blockMeshRef);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.current.distance = Math.hypot(dx, dy);
      touchState.current.angle = Math.atan2(dy, dx);
      touchState.current.initialScale = arScale;
      touchState.current.initialRotation = arRotation;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      
      if (touchState.current.distance > 0) {
        const scaleFactor = dist / touchState.current.distance;
        setArScale(Math.max(0.1, touchState.current.initialScale * scaleFactor));
      }

      const angleDelta = angle - touchState.current.angle;
      setArRotation(touchState.current.initialRotation + angleDelta);
    }
  };

  
  const handleEnterAR = async () => {
    try {
      if (!navigator.xr) {
        // Fallback directly to HTML5
        setArMode('html5');
        return;
      }
      
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!supported) {
        console.warn("AR (immersive-ar) is not supported, falling back to HTML5 Magic Window.");
        setArMode('html5');
        return;
      }
      
      try {
        setArMode('webxr_dom');
        await storeWithDOM.enterAR();
      } catch (domError) {
        console.warn("DOM Overlay session failed, falling back to 3D Billboards", domError);
        try {
          setArMode('webxr_basic');
          await storeWithoutDOM.enterAR();
        } catch (basicError) {
          console.warn("WebXR basic session failed, falling back to HTML5", basicError);
          setArMode('html5');
        }
      }
    } catch (error: any) {
      alert("Failed to enter AR: " + (error.message || error));
    }
  };

  const handleExitAR = () => { setArMode('none'); };

  return (
    <div 
      className="flex h-[100dvh] w-full bg-dark-900 text-gray-100 overflow-hidden relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div className="flex-1 relative w-full h-full">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="md:hidden absolute bottom-4 right-4 z-50 bg-dark-800 p-4 rounded-full shadow-xl border border-dark-600 text-white w-14 h-14 flex items-center justify-center"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {!isCarvingMode && (
          <div className={`absolute bottom-24 md:top-20 left-4 z-40 bg-dark-900/90 border border-dark-600 rounded-xl shadow-2xl p-2 flex flex-col gap-2 transition-opacity ${isSidebarOpen ? 'opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto' : 'opacity-100'}`}>
            <button title="Translate" onClick={() => setTransformMode(m => m === 'translate' ? 'none' : 'translate')} className={`p-3 rounded-lg transition-colors ${transformMode === 'translate' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-dark-800 hover:text-white'}`}>
              <Move className="w-5 h-5" />
            </button>
            <button title="Rotate" onClick={() => setTransformMode(m => m === 'rotate' ? 'none' : 'rotate')} className={`p-3 rounded-lg transition-colors ${transformMode === 'rotate' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-dark-800 hover:text-white'}`}>
              <RotateCw className="w-5 h-5" />
            </button>
            <button title="Scale" onClick={() => setTransformMode(m => m === 'scale' ? 'none' : 'scale')} className={`p-3 rounded-lg transition-colors ${transformMode === 'scale' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-dark-800 hover:text-white'}`}>
              <Scaling className="w-5 h-5" />
            </button>
          </div>
        )}

        {isPinningMode && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-[95%] md:w-auto transition-all animate-bounce">
            <div className="bg-primary-900/95 border-2 border-primary-500 backdrop-blur-xl px-6 py-4 rounded-3xl shadow-2xl text-center relative">
              {digitalPins.length < 3 ? (
                <>
                  <div className="text-primary-300 font-bold text-sm uppercase tracking-widest mb-1">
                    Step {digitalPins.length + 1} of 3
                  </div>
                  <div className="text-white font-bold text-lg">
                    {digitalPins.length === 0 && "Tap anywhere on the 3D model to place the first reference pin."}
                    {digitalPins.length === 1 && "Tap a second spot. Try to pick a visually distinct feature."}
                    {digitalPins.length === 2 && "Tap a third spot to complete the triangle. Keep them spread apart!"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-green-400 font-bold text-sm uppercase tracking-widest mb-1">
                    Success!
                  </div>
                  <div className="text-white font-bold text-lg mb-3">
                    3 Pins Placed. You are ready to map the physical stone.
                  </div>
                  <button 
                    onClick={() => setIsPinningMode(false)}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-full w-full transition-colors"
                  >
                    Got it
                  </button>
                </>
              )}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-primary-900 border-b-2 border-r-2 border-primary-500 transform rotate-45"></div>
            </div>
          </div>
        )}

        {drillDepth !== null && registrationStep === 'idle' && (
          <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-[90%] md:w-auto">
            <div className="bg-dark-900/90 border-2 border-primary-500/50 backdrop-blur-xl px-4 py-2 md:px-8 md:py-4 rounded-2xl md:rounded-3xl shadow-2xl text-center">
              <div className="text-xs md:text-base text-primary-400 font-bold uppercase tracking-widest mb-1">Drill Depth</div>
              <div className="text-4xl md:text-7xl font-mono font-bold text-white tracking-tight">
                {drillDepth.toFixed(2)} <span className="text-xl md:text-3xl text-gray-400">mm</span>
              </div>
            </div>
          </div>
        )}

        {registrationStep !== 'idle' && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-[90%] md:w-auto">
            <div className="bg-purple-900/90 border-2 border-purple-500 backdrop-blur-xl px-8 py-4 rounded-3xl shadow-2xl text-center">
              <div className="text-white font-bold text-lg animate-pulse whitespace-nowrap">
                {registrationStep === 'p1' && "Tap Bottom-Left-Front Corner (Origin)"}
                {registrationStep === 'p2' && "Tap Bottom-Right-Front Corner (Width)"}
                {registrationStep === 'p3' && "Tap Top-Left-Front Corner (Height)"}
                {registrationStep === 'p4' && "Tap Bottom-Left-Back Corner (Depth)"}
                {registrationStep === 'fiducial1' && "Tap Physical Sticker 1"}
                {registrationStep === 'fiducial2' && "Tap Physical Sticker 2"}
                {registrationStep === 'fiducial3' && "Tap Physical Sticker 3"}
              </div>
            </div>
          </div>
        )}

        
        
        {arMode !== 'none' && (
          <button
            onClick={handleExitAR}
            className="absolute top-4 right-4 z-50 bg-red-600 hover:bg-red-500 text-white font-bold h-12 px-4 rounded-full shadow-lg"
          >
            Exit AR
          </button>
        )}

        <button
          onClick={handleEnterAR}
          className="absolute bottom-4 left-4 z-50 bg-primary-600 hover:bg-primary-500 text-white font-bold h-14 px-6 rounded-full shadow-lg flex items-center gap-2 transition-colors"
        >
          <BoxSelect className="w-5 h-5" />
          Enter AR
        </button>
        {arMode === 'html5' ? (
          <ARCanvas 
            camera={{ position: [0, 0, 0] }}
            onCameraStreamReady={() => console.log("AR.js stream ready")}
            onCameraStreamError={() => alert("Failed to access camera for AR.js")}
          >
            <ambientLight intensity={0.4} />
            <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#444444" />
            <directionalLight position={[10, 10, 10]} intensity={1.5} castShadow />
            <directionalLight position={[-10, 5, -10]} intensity={0.5} />
            <ARMarker 
              type={"pattern"} 
              patternUrl={"data/hiro.patt"}
              onMarkerFound={() => console.log("Marker Found")}
            >
              <ARController 
                blockMeshRef={blockMeshRef} 
                onPlaceModel={setModelPosition} 
                registrationStep={registrationStep}
                setRegistrationStep={setRegistrationStep}
                registrationPoints={registrationPoints}
                setRegistrationPoints={setRegistrationPoints}
                onRegistrationComplete={(matrix, dimensions) => {
                  setRegistrationMatrix(matrix);
                  setStockMode('custom');
                  setCustomStockSize(dimensions);
                  setArScale(1);
                  setArRotation(0);
                }}
                digitalPins={digitalPins}
                onFiducialRegistrationComplete={(physicalPoints) => {
                  try {
                    const matrix = calculateTriangleRegistration(digitalPins, physicalPoints);
                    setRegistrationMatrix(matrix);
                    setArScale(1);
                    setArRotation(0);
                    setIsPinningMode(false);
                  } catch (e) {
                    console.error(e);
                    alert("Failed to calculate triangle alignment. Please ensure your 3 points are not in a straight line.");
                  }
                }}
                arMode={arMode}
              />

          <Grid infiniteGrid fadeDistance={20} cellColor="#3D3D3D" sectionColor="#4D4D4D" />
          <group 
            ref={mainGroupRef}
            matrix={registrationMatrix || undefined}
            matrixAutoUpdate={!registrationMatrix}
            position={registrationMatrix ? undefined : [modelPosition.x, modelPosition.y + ((effectiveStock[1] * arScale) / 2), modelPosition.z]}
            scale={registrationMatrix ? undefined : [arScale, arScale, arScale]}
            rotation={registrationMatrix ? undefined : [0, arRotation, 0]}
          >
            <group position={registrationMatrix ? [effectiveStock[0]/2, effectiveStock[1]/2, -effectiveStock[2]/2] : [0,0,0]}>
              <Suspense fallback={<Html><div className="text-white">Loading...</div></Html>}>
                
                <group ref={transformGroupRef}>
                  <Model
                    url={modelUrl}
                    extension={modelExt}
                    color={isCarvingMode ? "#1e3a8a" : "#e0e0e0"}
                    scale={scaleFactors}
                    onPointerClick={handleMaquetteClick}
                    onLoaded={(box, size, root) => {
                      handleSculptureLoaded(box, size);
                      if (root instanceof THREE.Mesh) setMaquetteMeshRef(root);
                      else if (root.children.length > 0 && root.children[0] instanceof THREE.Mesh) setMaquetteMeshRef(root.children[0] as THREE.Mesh);
                    }}
                  />

                  {!isCarvingMode && effectiveStock[0] > 0 && (
                    <group position={sculptureCenter}>
                      <DynamicBlock 
                        size={effectiveStock} 
                        onLoaded={(_box, _size, root) => {
                          dynamicBlockRef.current = root;
                          if (!isCarvingMode) setBlockMeshRef(root);
                        }} 
                      />
                    </group>
                  )}

                  {isCarvingMode && maquetteMeshRef && effectiveStock[0] > 0 && (
                    <group position={sculptureCenter}>
                      <TweenMesh
                        stockSize={effectiveStock}
                        scaleFactors={scaleFactors}
                        carvingNormal={carvingNormal}
                        maquetteMesh={maquetteMeshRef}
                        tweenValue={maxCarvingDepth > 0 ? (carvingDepth / maxCarvingDepth) : 0}
                        onLoaded={(mesh) => {
                          setBlockMeshRef(mesh);
                        }}
                        onUpdate={() => {
                          recalculatePointing();
                        }}
                      />
                    </group>
                  )}

                  {selectedMaquetteLocalPoint && (
                    <mesh position={selectedMaquetteLocalPoint}>
                      <sphereGeometry args={[0.02 / scaleFactors[0], 16, 16]} />
                      <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.8} />
                    </mesh>
                  )}
                  {selectedBlockLocalPoint && (
                    <mesh position={selectedBlockLocalPoint}>
                      <sphereGeometry args={[0.03 / scaleFactors[0], 16, 16]} />
                      <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
                    </mesh>
                  )}
                  {selectedMaquetteLocalPoint && selectedBlockLocalPoint && (
                    <line>
                      <bufferGeometry attach="geometry">
                          <bufferAttribute
                            attach="attributes-position"
                            args={[new Float32Array([
                              selectedMaquetteLocalPoint.x, selectedMaquetteLocalPoint.y, selectedMaquetteLocalPoint.z,
                              selectedBlockLocalPoint.x, selectedBlockLocalPoint.y, selectedBlockLocalPoint.z
                            ]), 3]}
                          />
                      </bufferGeometry>
                      <lineBasicMaterial attach="material" color="#ef4444" linewidth={2} />
                    </line>
                  )}
                </group>

                {transformMode !== 'none' && transformGroupRef.current && !isCarvingMode && (
                  <TransformControls 
                    object={transformGroupRef.current} 
                    mode={transformMode} 
                  />
                )}
              </Suspense>
            </group>
            
            <ContactShadows resolution={512} scale={10} blur={2} opacity={0.5} far={10} color="#000000" />
            
            {digitalPins.map((pin, i) => (
              <mesh key={i} position={pin}>
                <sphereGeometry args={[0.015, 16, 16]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
                <Html position={[0, 0.02, 0]} center className="pointer-events-none">
                  <div className="bg-red-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg">
                    {i + 1}
                  </div>
                </Html>
              </mesh>
            ))}
          </group>
          
            </ARMarker>
          </ARCanvas>
        ) : (
          <Canvas 
            camera={{ position: [2, 2, 2], fov: 45 }} 
            gl={{ localClippingEnabled: true, alpha: true }}
          >
            <XR store={arMode === 'webxr_dom' ? storeWithDOM : storeWithoutDOM}>
              <ambientLight intensity={0.4} />
            <hemisphereLight intensity={0.6} color="#ffffff" groundColor="#444444" />
            <directionalLight position={[10, 10, 10]} intensity={1.5} castShadow />
            <directionalLight position={[-10, 5, -10]} intensity={0.5} />
            
            <OrbitControls makeDefault />
          
          <ARController 
            blockMeshRef={blockMeshRef} 
            onPlaceModel={setModelPosition} 
            registrationStep={registrationStep}
            setRegistrationStep={setRegistrationStep}
            registrationPoints={registrationPoints}
            setRegistrationPoints={setRegistrationPoints}
            onRegistrationComplete={(matrix, dimensions) => {
              setRegistrationMatrix(matrix);
              setStockMode('custom');
              setCustomStockSize(dimensions);
              setArScale(1);
              setArRotation(0);
            }}
            digitalPins={digitalPins}
            onFiducialRegistrationComplete={(physicalPoints) => {
              try {
                const matrix = calculateTriangleRegistration(digitalPins, physicalPoints);
                setRegistrationMatrix(matrix);
                setArScale(1);
                setArRotation(0);
                setIsPinningMode(false);
              } catch (e) {
                console.error(e);
                alert("Failed to calculate triangle alignment. Please ensure your 3 points are not in a straight line.");
              }
            }}
            arMode={arMode}
            
          />

          <Grid infiniteGrid fadeDistance={20} cellColor="#3D3D3D" sectionColor="#4D4D4D" />
          <group 
            ref={mainGroupRef}
            matrix={registrationMatrix || undefined}
            matrixAutoUpdate={!registrationMatrix}
            position={registrationMatrix ? undefined : [modelPosition.x, modelPosition.y + ((effectiveStock[1] * arScale) / 2), modelPosition.z]}
            scale={registrationMatrix ? undefined : [arScale, arScale, arScale]}
            rotation={registrationMatrix ? undefined : [0, arRotation, 0]}
          >
            <group position={registrationMatrix ? [effectiveStock[0]/2, effectiveStock[1]/2, -effectiveStock[2]/2] : [0,0,0]}>
              <Suspense fallback={<Html><div className="text-white">Loading...</div></Html>}>
                
                <group ref={transformGroupRef}>
                  <Model
                    url={modelUrl}
                    extension={modelExt}
                    color={isCarvingMode ? "#1e3a8a" : "#e0e0e0"}
                    scale={scaleFactors}
                    onPointerClick={handleMaquetteClick}
                    onLoaded={(box, size, root) => {
                      handleSculptureLoaded(box, size);
                      if (root instanceof THREE.Mesh) setMaquetteMeshRef(root);
                      else if (root.children.length > 0 && root.children[0] instanceof THREE.Mesh) setMaquetteMeshRef(root.children[0] as THREE.Mesh);
                    }}
                  />

                  {!isCarvingMode && effectiveStock[0] > 0 && (
                    <group position={sculptureCenter}>
                      <DynamicBlock 
                        size={effectiveStock} 
                        onLoaded={(_box, _size, root) => {
                          dynamicBlockRef.current = root;
                          if (!isCarvingMode) setBlockMeshRef(root);
                        }} 
                      />
                    </group>
                  )}

                  {isCarvingMode && maquetteMeshRef && effectiveStock[0] > 0 && (
                    <group position={sculptureCenter}>
                      <TweenMesh
                        stockSize={effectiveStock}
                        scaleFactors={scaleFactors}
                        carvingNormal={carvingNormal}
                        maquetteMesh={maquetteMeshRef}
                        tweenValue={maxCarvingDepth > 0 ? (carvingDepth / maxCarvingDepth) : 0}
                        onLoaded={(mesh) => {
                          setBlockMeshRef(mesh);
                        }}
                        onUpdate={() => {
                          recalculatePointing();
                        }}
                      />
                    </group>
                  )}

                  {selectedMaquetteLocalPoint && (
                    <mesh position={selectedMaquetteLocalPoint}>
                      <sphereGeometry args={[0.02 / scaleFactors[0], 16, 16]} />
                      <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.8} />
                    </mesh>
                  )}
                  {selectedBlockLocalPoint && (
                    <mesh position={selectedBlockLocalPoint}>
                      <sphereGeometry args={[0.03 / scaleFactors[0], 16, 16]} />
                      <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
                    </mesh>
                  )}
                  {selectedMaquetteLocalPoint && selectedBlockLocalPoint && (
                    <line>
                      <bufferGeometry attach="geometry">
                          <bufferAttribute
                            attach="attributes-position"
                            args={[new Float32Array([
                              selectedMaquetteLocalPoint.x, selectedMaquetteLocalPoint.y, selectedMaquetteLocalPoint.z,
                              selectedBlockLocalPoint.x, selectedBlockLocalPoint.y, selectedBlockLocalPoint.z
                            ]), 3]}
                          />
                      </bufferGeometry>
                      <lineBasicMaterial attach="material" color="#ef4444" linewidth={2} />
                    </line>
                  )}
                </group>

                {transformMode !== 'none' && transformGroupRef.current && !isCarvingMode && (
                  <TransformControls 
                    object={transformGroupRef.current} 
                    mode={transformMode} 
                  />
                )}
              </Suspense>
            </group>
            
            <ContactShadows resolution={512} scale={10} blur={2} opacity={0.5} far={10} color="#000000" />
            
            {digitalPins.map((pin, i) => (
              <mesh key={i} position={pin}>
                <sphereGeometry args={[0.015, 16, 16]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
                <Html position={[0, 0.02, 0]} center className="pointer-events-none">
                  <div className="bg-red-600 text-white font-bold text-xs px-2 py-1 rounded-full shadow-lg">
                    {i + 1}
                  </div>
                </Html>
              </mesh>
            ))}
          </group>
          
            </XR>
          </Canvas>
        )}
      </div>

      {/* Sidebar Overlay/Drawer */}
      <div className={`absolute md:relative right-0 top-0 h-full w-80 max-w-[85vw] bg-dark-800 border-l border-dark-600 shadow-2xl z-40 flex flex-col transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* Upload Section */}
          <div className="mb-6 pb-6 border-b border-dark-600">
            <label className="flex items-center justify-center w-full p-4 border-2 border-dashed border-dark-600 rounded-xl cursor-pointer hover:border-primary-500 hover:bg-dark-700/50 transition-colors group">
              <input type="file" accept=".stl,.obj,.3dm" className="hidden" onChange={handleFileUpload} />
              <div className="flex flex-col items-center">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-primary-400 mb-2" />
                <span className="text-sm font-bold text-gray-300">Upload 3D Model</span>
                <span className="text-xs text-gray-500 mt-1">.stl, .obj, .3dm</span>
              </div>
            </label>
          </div>

          {/* Fit Report moved into Sidebar */}
          {fitResult && (
            <div className="mb-6 pb-6 border-b border-dark-600">
              <h3 className="text-lg font-bold flex items-center mb-2">
                <BoxSelect className="w-5 h-5 mr-2 text-primary-500" />
                Fit Report
              </h3>
              <div className={`text-xl font-bold mb-3 ${fitResult.fits ? 'text-green-400' : 'text-red-400'}`}>
                {fitResult.fits ? '✓ FITS IN BLOCK' : '✗ DOES NOT FIT'}
              </div>
              <div className="space-y-3 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Target Size:</span>
                  <span className="font-mono text-gray-200">
                    {currentSize[0].toFixed(2)} x {currentSize[1].toFixed(2)} x {currentSize[2].toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Block Size:</span>
                  <span className="font-mono text-gray-200">
                    {effectiveStock[0].toFixed(2)} x {effectiveStock[1].toFixed(2)} x {effectiveStock[2].toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Clearance:</span>
                  <span className={`font-mono ${fitResult.fits ? 'text-green-400' : 'text-red-400'}`}>
                    {fitResult.clearance.map((c: number) => c.toFixed(2)).join(', ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 pb-6 border-b border-dark-600 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">AR Registration Workflow</span>
            </div>
            <div className="bg-dark-900 p-4 rounded-xl border border-dark-600">
              <div className="text-sm text-gray-400 mb-3 leading-relaxed">
                To use the 3-Point AR Registration, you must first define 3 digital datums on the 3D model.
              </div>
              <button 
                onClick={() => { 
                  setIsPinningMode(!isPinningMode); 
                  setTransformMode('none'); 
                  if (!isPinningMode) setIsSidebarOpen(false); // Auto-close sidebar to show the model
                }}
                className={`w-full py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${isPinningMode ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-dark-700 text-gray-300 hover:bg-dark-600 hover:text-white'}`}
              >
                <MapPin className="w-5 h-5" />
                {isPinningMode ? `Placing Pins (${digitalPins.length}/3)` : 'Place 3 Digital Pins'}
              </button>
              {digitalPins.length > 0 && (
                <button 
                  onClick={() => setDigitalPins([])}
                  className="w-full mt-2 py-2 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear Pins
                </button>
              )}
            </div>
          </div>

          <div className="mb-6 pb-6 border-b border-dark-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Stock Block</span>
            </div>
            <select 
              className="w-full bg-dark-700 border border-dark-600 rounded p-2 text-sm text-gray-200 focus:outline-none focus:border-primary-500 mb-4"
              value={stockMode}
              onChange={(e) => setStockMode(e.target.value as 'custom' | 'auto')}
            >
              <option value="custom">Custom Dimensions</option>
              <option value="auto">Auto (Bounding Box)</option>
            </select>
            {stockMode === 'custom' && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">X</label>
                  <input type="number" step="0.1" className="w-full bg-dark-700 border border-dark-600 rounded p-2 text-sm text-gray-200" value={customStockSize[0]} onChange={e => setCustomStockSize([parseFloat(e.target.value) || 0, customStockSize[1], customStockSize[2]])} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Y</label>
                  <input type="number" step="0.1" className="w-full bg-dark-700 border border-dark-600 rounded p-2 text-sm text-gray-200" value={customStockSize[1]} onChange={e => setCustomStockSize([customStockSize[0], parseFloat(e.target.value) || 0, customStockSize[2]])} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Z</label>
                  <input type="number" step="0.1" className="w-full bg-dark-700 border border-dark-600 rounded p-2 text-sm text-gray-200" value={customStockSize[2]} onChange={e => setCustomStockSize([customStockSize[0], customStockSize[1], parseFloat(e.target.value) || 0])} />
                </div>
              </div>
            )}
          </div>
          <div className="mb-6 pb-6 border-b border-dark-600 space-y-4">
            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold flex items-center">
              <Settings2 className="w-4 h-4 mr-1" /> Enlarge Mode
            </label>
            <select 
              className="w-full bg-dark-700 border border-dark-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary-500 outline-none"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="multiplier">Multiplier Factor</option>
              <option value="target_longest">Target Longest Axis</option>
              <option value="target_x">Target X (Width)</option>
              <option value="target_y">Target Y (Height)</option>
              <option value="target_z">Target Z (Depth)</option>
              <option value="fit">Fit to Custom Block</option>
            </select>
          </div>

          <div className="mb-6 pb-6 border-b border-dark-600 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Carving Simulation</label>
              <button 
                onClick={() => {
                  const nextMode = !isCarvingMode;
                  setIsCarvingMode(nextMode);
                  if (nextMode) setTransformMode('none');
                }}
                className={`w-10 h-5 rounded-full transition-colors relative ${isCarvingMode ? 'bg-primary-600' : 'bg-dark-600'}`}
              >
                <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-transform ${isCarvingMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            {isCarvingMode && (
              <div className="mt-4 space-y-4">
                <button 
                  onClick={() => setIsSelectingFace(!isSelectingFace)}
                  className={`w-full py-2 px-4 rounded text-sm font-bold transition-colors ${isSelectingFace ? 'bg-primary-600 text-white animate-pulse' : 'bg-dark-700 text-gray-300 hover:bg-dark-600'}`}
                >
                  {isSelectingFace ? 'Click on 3D Model...' : 'Set Carving Direction'}
                </button>
                
                <div className="bg-dark-900 p-4 rounded-xl border border-dark-600 shadow-inner mt-2">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-white font-bold text-sm">Carving Depth</span>
                    <span className="bg-dark-700 text-primary-400 font-mono text-xs px-2 py-1 rounded">
                      {carvingDepth.toFixed(2)} / {maxCarvingDepth.toFixed(2)}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max={maxCarvingDepth} 
                    step="0.01" 
                    value={carvingDepth}
                    onChange={(e) => setCarvingDepth(parseFloat(e.target.value))}
                    className="w-full h-3 bg-dark-700 rounded-lg cursor-pointer"
                    style={{ accentColor: '#3b82f6' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 w-full space-y-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold flex items-center">
              <Maximize className="w-4 h-4 mr-1" /> Target Value
            </label>
            <input 
              type="number" 
              step="0.1"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary-500 outline-none"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>

          <div className="flex-1 w-full space-y-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold flex items-center">
              Margin / Kerf (units)
            </label>
            <input 
              type="number" 
              step="0.01"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary-500 outline-none"
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
