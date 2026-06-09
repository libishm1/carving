import { useState, useMemo, Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Grid, TransformControls } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { Model } from './components/ModelLoader';
import { TweenMesh } from './components/TweenMesh';
import { ARController } from './components/ARController';
import { Settings2, Maximize, BoxSelect, Menu, X, Upload, Move, RotateCw, Scaling, MousePointer2 } from 'lucide-react';
import * as THREE from 'three';

export const store = createXRStore();

// Dynamic Block Component for the Stock
const DynamicBlock = ({ size, onLoaded }: { size: [number, number, number], onLoaded: (box: THREE.Box3, size: [number, number, number], root: THREE.Object3D) => void }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    if (meshRef.current) {
      if (!(meshRef.current.geometry as any).boundsTree) {
        (meshRef.current.geometry as any).computeBoundsTree();
      }
      meshRef.current.geometry.computeBoundingBox();
      const box = meshRef.current.geometry.boundingBox!;
      onLoaded(box, size, meshRef.current);
    }
  }, [size, onLoaded]);

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

  const [sculptureSize, setSculptureSize] = useState<[number, number, number]>([0, 0, 0]);
  const [maquetteMeshRef, setMaquetteMeshRef] = useState<THREE.Mesh | null>(null);
  const [blockMeshRef, setBlockMeshRef] = useState<THREE.Object3D | null>(null);
  const dynamicBlockRef = useRef<THREE.Object3D | null>(null);
  const [selectedMaquettePoint, setSelectedMaquettePoint] = useState<THREE.Vector3 | null>(null);
  const [selectedBlockPoint, setSelectedBlockPoint] = useState<THREE.Vector3 | null>(null);
  const [drillDepth, setDrillDepth] = useState<number | null>(null);

  // Handle Model Loading
  const handleSculptureLoaded = (_box: THREE.Box3, size: [number, number, number]) => {
    setSculptureSize(size);
  };

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

  // Revert raycaster to standard bounding block when Carving Mode is toggled off
  useEffect(() => {
    if (!isCarvingMode && dynamicBlockRef.current) {
      setBlockMeshRef(dynamicBlockRef.current);
    }
  }, [isCarvingMode]);

  // Calculate scaling and fit
  const { scaleFactors, fitResult, currentSize, effectiveStock } = useMemo(() => {
    let factors: [number, number, number] = [1, 1, 1];
    
    if (mode === 'multiplier') {
      factors = [value, value, value];
    } else if (mode === 'target_longest') {
      const longest = Math.max(...sculptureSize);
      const ratio = longest > 0 ? value / longest : 1;
      factors = [ratio, ratio, ratio];
    } else if (mode === 'target_x') {
      const ratio = sculptureSize[0] > 0 ? value / sculptureSize[0] : 1;
      factors = [ratio, ratio, ratio];
    } else if (mode === 'target_y') {
      const ratio = sculptureSize[1] > 0 ? value / sculptureSize[1] : 1;
      factors = [ratio, ratio, ratio];
    } else if (mode === 'target_z') {
      const ratio = sculptureSize[2] > 0 ? value / sculptureSize[2] : 1;
      factors = [ratio, ratio, ratio];
    } else if (mode === 'fit') {
      const ratioX = customStockSize[0] / (sculptureSize[0] || 1);
      const ratioY = customStockSize[1] / (sculptureSize[1] || 1);
      const ratioZ = customStockSize[2] / (sculptureSize[2] || 1);
      const minRatio = Math.min(ratioX, ratioY, ratioZ);
      factors = [minRatio, minRatio, minRatio];
    }

    const scaledExtents: [number, number, number] = [
      sculptureSize[0] * factors[0],
      sculptureSize[1] * factors[1],
      sculptureSize[2] * factors[2]
    ];

    let stock = customStockSize;
    if (stockMode === 'auto') {
      stock = [
        scaledExtents[0] + margin * 2,
        scaledExtents[1] + margin * 2,
        scaledExtents[2] + margin * 2
      ];
    }

    const clearance = [
      stock[0] - scaledExtents[0],
      stock[1] - scaledExtents[1],
      stock[2] - scaledExtents[2]
    ];
    
    // Add small epsilon for floating point inaccuracies
    const fits = clearance.every(c => c >= margin * 2 - 0.001);

    const baseRatios = [
      stock[0] / (sculptureSize[0] || 1),
      stock[1] / (sculptureSize[1] || 1),
      stock[2] / (sculptureSize[2] || 1)
    ];
    const maxScaleToFit = Math.min(...baseRatios);

    const fit = {
      fits,
      clearance,
      maxScaleToFit
    };

    return { scaleFactors: factors, fitResult: fit, currentSize: scaledExtents, effectiveStock: stock };
  }, [sculptureSize, customStockSize, stockMode, mode, value, margin]);

  // Carving Simulation Max Depth
  const { maxCarvingDepth } = useMemo(() => {
    const hx = effectiveStock[0] / 2;
    const hy = effectiveStock[1] / 2;
    const hz = effectiveStock[2] / 2;
    
    // Find the extremum of the block in the direction of the carving normal
    const maxProj = Math.abs(carvingNormal.x) * hx + Math.abs(carvingNormal.y) * hy + Math.abs(carvingNormal.z) * hz;
    
    return {
      maxCarvingDepth: maxProj * 2
    };
  }, [effectiveStock, carvingNormal]);

  // Unified Snapping Logic
  const updateSnapping = (maquettePt: THREE.Vector3, meshRefToUse: THREE.Object3D | null) => {
    if (!meshRefToUse) return;
    
    if (isCarvingMode) {
      const raycaster = new THREE.Raycaster();
      const dir = carvingNormal.clone().normalize();
      raycaster.set(maquettePt, dir);
      
      const hits = raycaster.intersectObject(meshRefToUse, true);
      
      if (hits.length > 0) {
        setSelectedBlockPoint(hits[0].point);
        setDrillDepth(hits[0].distance);
      }
    } else {
      let closestPointWorld = maquettePt.clone();
      let minDistance = Infinity;
  
      meshRefToUse.traverse((child: any) => {
        if (child instanceof THREE.Mesh && child.geometry.boundsTree) {
          const inverseMatrix = new THREE.Matrix4().copy(child.matrixWorld).invert();
          const localPoint = maquettePt.clone().applyMatrix4(inverseMatrix);
          
          const res = child.geometry.boundsTree.closestPointToPoint(localPoint, {});
          if (res && res.point) {
            const worldPt = res.point.clone().applyMatrix4(child.matrixWorld);
            const dist = worldPt.distanceTo(maquettePt);
            if (dist < minDistance) {
              minDistance = dist;
              closestPointWorld = worldPt;
            }
          }
        }
      });
      
      if (minDistance !== Infinity) {
        setSelectedBlockPoint(closestPointWorld);
        setDrillDepth(minDistance);
      }
    }
  };

  // Recalculate Pointing Raycast when TweenMesh updates
  const recalculatePointing = () => {
    if (selectedMaquettePoint) {
      updateSnapping(selectedMaquettePoint, blockMeshRef);
    }
  };

  // When Carving Mode or BlockMeshRef toggles, auto-refresh the point!
  useEffect(() => {
    if (selectedMaquettePoint) {
      updateSnapping(selectedMaquettePoint, blockMeshRef);
    }
  }, [isCarvingMode, blockMeshRef, carvingNormal]);

  // Handle Maquette Clicks
  const handleMaquetteClick = (maquettePoint: THREE.Vector3, normal?: THREE.Vector3) => {
    if (isSelectingFace && normal) {
      setCarvingNormal(normal);
      setIsSelectingFace(false);
      return;
    }

    setSelectedMaquettePoint(maquettePoint);
    updateSnapping(maquettePoint, blockMeshRef);
  };

  // Touch Gesture Handlers for Pinch/Twist
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

  return (
    <div 
      className="flex h-screen w-full bg-dark-900 text-gray-100 overflow-hidden relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <div className="flex-1 relative w-full h-full">
        {/* Mobile Sidebar Toggle Button */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="md:hidden absolute bottom-4 right-4 z-50 bg-dark-800 p-4 rounded-full shadow-xl border border-dark-600 text-white w-14 h-14 flex items-center justify-center"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Transform Toolbar */}
        <div className="absolute top-4 left-4 z-40 bg-dark-800/90 backdrop-blur-md p-2 rounded-2xl shadow-xl border border-dark-600 flex gap-2">
          <button onClick={() => setTransformMode('none')} className={`p-3 rounded-xl transition-colors ${transformMode === 'none' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'}`} title="Select / Orbit">
            <MousePointer2 className="w-5 h-5" />
          </button>
          <button onClick={() => setTransformMode('translate')} className={`p-3 rounded-xl transition-colors ${transformMode === 'translate' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'}`} title="Move">
            <Move className="w-5 h-5" />
          </button>
          <button onClick={() => setTransformMode('rotate')} className={`p-3 rounded-xl transition-colors ${transformMode === 'rotate' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'}`} title="Rotate">
            <RotateCw className="w-5 h-5" />
          </button>
          <button onClick={() => setTransformMode('scale')} className={`p-3 rounded-xl transition-colors ${transformMode === 'scale' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:bg-dark-700 hover:text-white'}`} title="Scale">
            <Scaling className="w-5 h-5" />
          </button>
        </div>

        {/* Massive Depth HUD */}
        {drillDepth !== null && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-[90%] md:w-auto">
            <div className="bg-dark-900/90 border-2 border-primary-500/50 backdrop-blur-xl px-8 py-4 rounded-3xl shadow-2xl text-center">
              <div className="text-sm md:text-base text-primary-400 font-bold uppercase tracking-widest mb-1">Drill Depth</div>
              <div className="text-5xl md:text-7xl font-mono font-bold text-white tracking-tight">
                {drillDepth.toFixed(2)} <span className="text-2xl md:text-3xl text-gray-400">mm</span>
              </div>
            </div>
          </div>
        )}
        {/* Prominent Carving Slider */}
        {isCarvingMode && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md bg-dark-900/90 border border-dark-600 backdrop-blur-xl p-4 rounded-2xl shadow-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-gray-300">Carving Depth</span>
              <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-2 py-1 rounded">
                {carvingDepth.toFixed(2)} / {maxCarvingDepth.toFixed(2)}
              </span>
            </div>
            <input 
              type="range"
              min="0"
              max={maxCarvingDepth}
              step="0.01"
              value={carvingDepth}
              onChange={(e) => setCarvingDepth(Number(e.target.value))}
              className="w-full h-2 bg-dark-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>
        )}

        <button
          onClick={() => store.enterAR()}
          className="absolute bottom-4 left-4 z-50 bg-primary-600 hover:bg-primary-500 text-white font-bold h-14 px-6 rounded-full shadow-lg flex items-center gap-2 transition-colors"
        >
          <BoxSelect className="w-5 h-5" />
          Enter AR
        </button>
        <Canvas camera={{ position: [2, 2, 2], fov: 45 }} gl={{ localClippingEnabled: true }}>
          <XR store={store}>
            <color attach="background" args={['#121212']} />
            <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} />
          <Environment preset="city" />
          <OrbitControls makeDefault />
          
          <ARController 
            blockMeshRef={blockMeshRef} 
            onPlaceModel={setModelPosition} 
          />

          <Grid infiniteGrid fadeDistance={20} cellColor="#3D3D3D" sectionColor="#4D4D4D" />
          <group 
            position={[modelPosition.x, modelPosition.y + ((effectiveStock[1] * arScale) / 2), modelPosition.z]}
            scale={[arScale, arScale, arScale]}
            rotation={[0, arRotation, 0]}
          >
            <Suspense fallback={null}>
              <DynamicBlock 
                size={effectiveStock} 
                onLoaded={(_box, _size, root) => {
                  dynamicBlockRef.current = root;
                  if (!isCarvingMode) setBlockMeshRef(root);
                }} 
              />
              
              {/* The Real Mesh with TransformControls */}
              {transformMode !== 'none' ? (
                <TransformControls mode={transformMode}>
                  <Model 
                    url={modelUrl} 
                    extension={modelExt}
                    color={isCarvingMode ? "#1e3a8a" : "#e0e0e0"} 
                    scale={scaleFactors}
                    clippingPlanes={[]}
                    polygonOffset={true}
                    polygonOffsetFactor={2}
                    polygonOffsetUnits={2}
                    onLoaded={(_box, _size, root) => {
                      handleSculptureLoaded(_box, _size);
                      if (root instanceof THREE.Mesh) setMaquetteMeshRef(root);
                      else if (root.children.length > 0 && root.children[0] instanceof THREE.Mesh) setMaquetteMeshRef(root.children[0] as THREE.Mesh);
                    }}
                    onPointerClick={handleMaquetteClick}
                  />
                </TransformControls>
              ) : (
                <Model 
                  url={modelUrl} 
                  extension={modelExt}
                  color={isCarvingMode ? "#1e3a8a" : "#e0e0e0"} 
                  scale={scaleFactors}
                  clippingPlanes={[]}
                  polygonOffset={true}
                  polygonOffsetFactor={2}
                  polygonOffsetUnits={2}
                  onLoaded={(_box, _size, root) => {
                    handleSculptureLoaded(_box, _size);
                    if (root instanceof THREE.Mesh) setMaquetteMeshRef(root);
                    else if (root.children.length > 0 && root.children[0] instanceof THREE.Mesh) setMaquetteMeshRef(root.children[0] as THREE.Mesh);
                  }}
                  onPointerClick={handleMaquetteClick}
                />
              )}

              {/* The Tween Simulation Mesh */}
              {isCarvingMode && maquetteMeshRef && (
                <TweenMesh
                  stockSize={effectiveStock}
                  scaleFactors={scaleFactors}
                  carvingNormal={carvingNormal}
                  maquetteMesh={maquetteMeshRef}
                  tweenValue={maxCarvingDepth > 0 ? (carvingDepth / maxCarvingDepth) : 0}
                  onLoaded={(mesh) => {
                    // Update raycaster to snap dynamically to this surface!
                    setBlockMeshRef(mesh);
                  }}
                  onUpdate={() => {
                    // Recalculate the pointing device drill depth in real-time as the slider moves!
                    recalculatePointing();
                  }}
                />
              )}
            </Suspense>
            <ContactShadows resolution={512} scale={10} blur={2} opacity={0.5} far={10} color="#000000" />
          </group>
          {selectedMaquettePoint && (
            <mesh position={selectedMaquettePoint}>
              <sphereGeometry args={[0.02, 16, 16]} />
              <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.8} />
            </mesh>
          )}
          {selectedBlockPoint && (
            <mesh position={selectedBlockPoint}>
              <sphereGeometry args={[0.03, 16, 16]} />
              <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
            </mesh>
          )}
          {selectedMaquettePoint && selectedBlockPoint && (
            <line>
              <bufferGeometry attach="geometry">
                  <bufferAttribute
                    attach="attributes-position"
                    args={[new Float32Array([
                      selectedMaquettePoint.x, selectedMaquettePoint.y, selectedMaquettePoint.z,
                      selectedBlockPoint.x, selectedBlockPoint.y, selectedBlockPoint.z
                    ]), 3]}
                  />
              </bufferGeometry>
              <lineBasicMaterial attach="material" color="#ef4444" linewidth={2} />
            </line>
          )}
          </XR>
        </Canvas>
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
                    {fitResult.clearance.map(c => c.toFixed(2)).join(', ')}
                  </span>
                </div>
              </div>
            </div>
          )}
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
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold flex items-center">
                Carving Simulation
              </label>
              <button 
                onClick={() => setIsCarvingMode(!isCarvingMode)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isCarvingMode ? 'bg-primary-500' : 'bg-dark-600'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isCarvingMode ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {isCarvingMode && (
              <>
                <button 
                  onClick={() => setIsSelectingFace(!isSelectingFace)}
                  className={`w-full p-3 h-12 text-sm font-bold rounded-lg flex items-center justify-center mb-2 transition-colors ${isSelectingFace ? 'bg-primary-500 text-white animate-pulse' : 'bg-dark-700 text-gray-300 hover:bg-dark-600'}`}
                >
                  {isSelectingFace ? 'Select Face on Mesh...' : 'Set Carving Direction'}
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Adjust carving depth using the main slider.
                </p>
              </>
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
