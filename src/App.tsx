import { useState, useMemo, Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Grid } from '@react-three/drei';
import { Model } from './components/ModelLoader';
import { Settings2, Maximize, BoxSelect } from 'lucide-react';
import * as THREE from 'three';

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
  
  const [isCarvingMode, setIsCarvingMode] = useState<boolean>(false);
  const [carvingDepth, setCarvingDepth] = useState<number>(0);
  const [carvingNormal, setCarvingNormal] = useState<THREE.Vector3>(new THREE.Vector3(0, 0, 1));
  const [isSelectingFace, setIsSelectingFace] = useState<boolean>(false);

  const [sculptureSize, setSculptureSize] = useState<[number, number, number]>([0, 0, 0]);
  const [blockMeshRef, setBlockMeshRef] = useState<THREE.Object3D | null>(null);
  const [selectedMaquettePoint, setSelectedMaquettePoint] = useState<THREE.Vector3 | null>(null);
  const [selectedBlockPoint, setSelectedBlockPoint] = useState<THREE.Vector3 | null>(null);
  const [drillDepth, setDrillDepth] = useState<number | null>(null);

  // Handle Model Loading
  const handleSculptureLoaded = (_box: THREE.Box3, size: [number, number, number]) => {
    setSculptureSize(size);
  };

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

  // Carving Simulation Clipping Plane
  const { clippingPlanes, maxCarvingDepth } = useMemo(() => {
    const hx = effectiveStock[0] / 2;
    const hy = effectiveStock[1] / 2;
    const hz = effectiveStock[2] / 2;
    
    // Find the extremum of the block in the direction of the carving normal
    const maxProj = Math.abs(carvingNormal.x) * hx + Math.abs(carvingNormal.y) * hy + Math.abs(carvingNormal.z) * hz;
    const constant = maxProj - carvingDepth;
    const planeNormal = carvingNormal.clone().multiplyScalar(-1);
    
    return {
      clippingPlanes: [new THREE.Plane(planeNormal, constant)],
      maxCarvingDepth: maxProj * 2
    };
  }, [effectiveStock, carvingNormal, carvingDepth]);

  // Snapping Logic
  const handleMaquetteClick = (maquettePoint: THREE.Vector3, normal?: THREE.Vector3) => {
    if (isSelectingFace) {
      if (normal) {
        setCarvingNormal(normal);
        setCarvingDepth(0); // Reset slider when direction changes
      }
      setIsSelectingFace(false);
      return;
    }

    if (!blockMeshRef) {
      setSelectedMaquettePoint(maquettePoint);
      setDrillDepth(null);
      return;
    }

    let closestPointWorld = maquettePoint.clone();
    let minDistance = Infinity;

    blockMeshRef.traverse((child: any) => {
      if (child instanceof THREE.Mesh && child.geometry.boundsTree) {
        const inverseMatrix = new THREE.Matrix4().copy(child.matrixWorld).invert();
        const localPoint = maquettePoint.clone().applyMatrix4(inverseMatrix);
        
        const res = child.geometry.boundsTree.closestPointToPoint(localPoint, {});
        if (res && res.point) {
          const worldPt = res.point.clone().applyMatrix4(child.matrixWorld);
          const dist = worldPt.distanceTo(maquettePoint);
          if (dist < minDistance) {
            minDistance = dist;
            closestPointWorld = worldPt;
          }
        }
      }
    });

    setSelectedMaquettePoint(maquettePoint);
    setSelectedBlockPoint(closestPointWorld);
    setDrillDepth(minDistance !== Infinity ? minDistance : null);
  };

  return (
    <div className="flex h-screen bg-dark-900 text-gray-100 overflow-hidden">
      <div className="flex-1 relative">
        <Canvas camera={{ position: [2, 2, 2], fov: 45 }} gl={{ localClippingEnabled: true }}>
          <color attach="background" args={['#121212']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} />
          <Environment preset="city" />
          <OrbitControls makeDefault />
          <Grid infiniteGrid fadeDistance={20} cellColor="#3D3D3D" sectionColor="#4D4D4D" />
          <group position={[0, -1, 0]}>
            <Suspense fallback={null}>
              <DynamicBlock 
                size={effectiveStock} 
                onLoaded={(_box, _size, root) => setBlockMeshRef(root)} 
              />
              
              {/* The Real Mesh (Always visible, unclipped) */}
              <Model 
                url="/models/01_maquette_reduced.stl" 
                color={isCarvingMode ? "#1e3a8a" : "#e0e0e0"} 
                scale={scaleFactors}
                clippingPlanes={[]}
                polygonOffset={true}
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
                onLoaded={handleSculptureLoaded}
                onPointerClick={handleMaquetteClick}
              />

              {/* The Carved Mesh (Clipped shell) */}
              {isCarvingMode && (
                <Model 
                  url="/models/01_maquette_reduced.stl" 
                  color="#e0e0e0" 
                  scale={scaleFactors}
                  clippingPlanes={clippingPlanes}
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
        </Canvas>

        {fitResult && (
          <div className="absolute top-6 right-6 bg-dark-800/80 backdrop-blur-md p-4 rounded-xl border border-dark-600 shadow-2xl max-w-sm">
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
                <span className="text-gray-400">Clearance (sorted):</span>
                <span className={`font-mono ${fitResult.fits ? 'text-green-400' : 'text-red-400'}`}>
                  {fitResult.clearance.map(c => c.toFixed(2)).join(', ')}
                </span>
              </div>
              {!fitResult.fits && (
                <div className="pt-2 mt-2 border-t border-dark-600">
                  <span className="text-xs text-red-400 font-bold">Max scale to fit: {fitResult.maxScaleToFit.toFixed(3)}x</span>
                </div>
              )}
            </div>
            {selectedBlockPoint && selectedMaquettePoint && (
              <div className="mt-4 pt-4 border-t border-dark-600">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-gray-400 uppercase">Marker (Outer Block)</h4>
                  {drillDepth !== null && (
                    <span className="text-xs font-bold px-2 py-1 bg-primary-500/20 text-primary-400 rounded">
                      Depth: {drillDepth.toFixed(2)} mm
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-dark-700 rounded p-2 border border-dark-600">
                    <span className="block text-xs text-red-400 font-bold mb-1">X</span>
                    <span className="font-mono text-sm">{selectedBlockPoint.x.toFixed(2)}</span>
                  </div>
                  <div className="bg-dark-700 rounded p-2 border border-dark-600">
                    <span className="block text-xs text-green-400 font-bold mb-1">Y</span>
                    <span className="font-mono text-sm">{selectedBlockPoint.y.toFixed(2)}</span>
                  </div>
                  <div className="bg-dark-700 rounded p-2 border border-dark-600">
                    <span className="block text-xs text-blue-400 font-bold mb-1">Z</span>
                    <span className="font-mono text-sm">{selectedBlockPoint.z.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="w-80 bg-dark-800 border-l border-dark-600 shadow-2xl z-10 flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
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
                  className={`w-full p-2 text-xs font-bold rounded flex items-center justify-center mb-4 transition-colors ${isSelectingFace ? 'bg-primary-500 text-white animate-pulse' : 'bg-dark-700 text-gray-300 hover:bg-dark-600'}`}
                >
                  {isSelectingFace ? 'Select Face on Mesh...' : 'Set Carving Direction'}
                </button>
                <input 
                  type="range"
                  min="0"
                  max={maxCarvingDepth}
                  step="0.01"
                  value={carvingDepth}
                  onChange={(e) => setCarvingDepth(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-right text-xs font-mono text-gray-300 mt-1">
                  Depth: {carvingDepth.toFixed(2)} / {maxCarvingDepth.toFixed(2)} units
                </div>
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
