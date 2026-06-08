import { useMemo, useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';

export interface ModelProps {
  url: string;
  color?: string;
  wireframe?: boolean;
  opacity?: number;
  transparent?: boolean;
  onLoaded?: (box: THREE.Box3, size: [number, number, number], root: THREE.Object3D) => void;
  onPointerClick?: (point: THREE.Vector3, normal?: THREE.Vector3) => void;
  scale?: [number, number, number];
  position?: [number, number, number];
  clippingPlanes?: THREE.Plane[];
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}

function processObject(
  object: THREE.Object3D | THREE.BufferGeometry, 
  props: ModelProps
) {
  const { boundingBox, size, finalObject } = useMemo(() => {
    const box = new THREE.Box3();
    let root: THREE.Object3D;
    
    if (object instanceof THREE.BufferGeometry) {
      // Center the geometry natively
      object.center();
      root = new THREE.Mesh(object);
    } else {
      // Clone to avoid parent conflicts when rendering multiple times
      const cloned = object.clone();
      box.setFromObject(cloned);
      const center = new THREE.Vector3();
      box.getCenter(center);
      cloned.position.set(-center.x, -center.y, -center.z);
      
      root = new THREE.Group();
      root.add(cloned);
    }

    box.setFromObject(root);
    const sz = new THREE.Vector3();
    box.getSize(sz);

    return { 
      boundingBox: box, 
      size: [sz.x, sz.y, sz.z] as [number, number, number],
      finalObject: root
    };
  }, [object]);

  useEffect(() => {
    if (props.onLoaded && boundingBox && size && finalObject) {
      props.onLoaded(boundingBox, size, finalObject);
    }
  }, [boundingBox, size, finalObject, props.onLoaded]);

  // Apply material override and compute BVH
  useMemo(() => {
    finalObject.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        if (!child.geometry.boundsTree) {
          child.geometry.computeBoundsTree();
        }
        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(props.color || '#ffffff'),
          wireframe: props.wireframe,
          opacity: props.opacity ?? 1,
          transparent: props.transparent,
          side: THREE.DoubleSide,
          clippingPlanes: props.clippingPlanes || [],
          clipIntersection: false,
          polygonOffset: props.polygonOffset || false,
          polygonOffsetFactor: props.polygonOffsetFactor ?? 0,
          polygonOffsetUnits: props.polygonOffsetUnits ?? 0
        });
      }
    });
  }, [finalObject, props.color, props.wireframe, props.opacity, props.transparent, props.clippingPlanes, props.polygonOffset, props.polygonOffsetFactor, props.polygonOffsetUnits]);

  return (
    <primitive 
      object={finalObject} 
      scale={props.scale} 
      position={props.position} 
      onClick={props.onPointerClick ? (e: any) => {
        e.stopPropagation();
        let normal = undefined;
        if (e.face) {
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
          normal = e.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
        props.onPointerClick!(e.point, normal);
      } : undefined}
    />
  );
}

function Model3DM(props: ModelProps) {
  const object = useLoader(Rhino3dmLoader, props.url, (loader) => {
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/');
  });
  return processObject(object, props);
}

function ModelOBJ(props: ModelProps) {
  const object = useLoader(OBJLoader, props.url);
  return processObject(object, props);
}

function ModelSTL(props: ModelProps) {
  const geometry = useLoader(STLLoader, props.url);
  return processObject(geometry, props);
}

export function Model(props: ModelProps) {
  const ext = props.url.split('.').pop()?.toLowerCase();
  
  if (ext === 'obj') return <ModelOBJ {...props} />;
  if (ext === 'stl') return <ModelSTL {...props} />;
  if (ext === '3dm') return <Model3DM {...props} />;
  
  return null;
}
