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

/**
 * Constructs a coordinate system basis matrix from 3 points forming a triangle.
 */
export function calculateTriangleBasis(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): THREE.Matrix4 {
  const xAxis = new THREE.Vector3().subVectors(p2, p1).normalize();
  const tempYAxis = new THREE.Vector3().subVectors(p3, p1).normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, tempYAxis).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

  const matrix = new THREE.Matrix4();
  matrix.makeBasis(xAxis, yAxis, zAxis);
  matrix.setPosition(p1);
  return matrix;
}

/**
 * Calculates a transformation matrix that aligns a digital 3-point triangle
 * with a physical 3-point triangle in the real world.
 */
export function calculateTriangleRegistration(
  digitalPoints: THREE.Vector3[],
  physicalPoints: THREE.Vector3[]
): THREE.Matrix4 {
  if (digitalPoints.length !== 3 || physicalPoints.length !== 3) {
    throw new Error("Exactly 3 points required for Triangle Registration");
  }

  const mDigital = calculateTriangleBasis(digitalPoints[0], digitalPoints[1], digitalPoints[2]);
  const mPhysical = calculateTriangleBasis(physicalPoints[0], physicalPoints[1], physicalPoints[2]);

  // M_final = M_physical * inverse(M_digital)
  const mDigitalInv = mDigital.clone().invert();
  const mFinal = mPhysical.clone().multiply(mDigitalInv);

  return mFinal;
}
