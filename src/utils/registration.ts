import * as THREE from 'three';

export interface RegistrationResult {
  matrix: THREE.Matrix4;
  dimensions: [number, number, number]; // width, height, depth
}

/**
 * Calculates a transformation matrix and dimensions from 4 tapped spatial points.
 * 
 * @param p1 Bottom-Left-Front (Origin)
 * @param p2 Bottom-Right-Front (Defines Width and +X axis)
 * @param p3 Top-Left-Front (Defines Height and +Y axis)
 * @param p4 Bottom-Left-Back (Defines Depth and -Z axis)
 */
export function calculateRegistration(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  p4: THREE.Vector3
): RegistrationResult {
  // 1. Calculate physical dimensions
  const width = p1.distanceTo(p2);
  const height = p1.distanceTo(p3);
  
  // 2. Construct orthogonal basis vectors
  // X axis goes from P1 to P2
  const xAxis = new THREE.Vector3().subVectors(p2, p1).normalize();
  
  // Preliminary Y axis goes from P1 to P3
  const tempYAxis = new THREE.Vector3().subVectors(p3, p1).normalize();
  
  // Z axis is orthogonal to X and preliminary Y (using right-hand rule)
  // X cross Y = Z. Wait, if X is right and Y is up, X cross Y points OUT (towards viewer, +Z).
  const zAxis = new THREE.Vector3().crossVectors(xAxis, tempYAxis).normalize();
  
  // Recalculate true Y axis to ensure perfect orthogonality
  // Z cross X = Y
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  // 3. Calculate exact depth by projecting P4 onto the negative Z axis
  const p1ToP4 = new THREE.Vector3().subVectors(p4, p1);
  const depth = Math.abs(p1ToP4.dot(zAxis));

  // 4. Construct Transformation Matrix
  // This matrix transforms a local point to the physical world space.
  // The local origin (0,0,0) will be exactly at P1 (Bottom-Left-Front).
  const matrix = new THREE.Matrix4();
  matrix.makeBasis(xAxis, yAxis, zAxis);
  matrix.setPosition(p1);

  return {
    matrix,
    dimensions: [width, height, depth]
  };
}
