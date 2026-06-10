/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary'
import { registerSW } from 'virtual:pwa-register'
import * as THREE from 'three';

// Check for PWA service worker updates every 1 minute
registerSW({
  onRegistered(r: ServiceWorkerRegistration | undefined) {
    r && setInterval(() => { r.update() }, 60 * 1000)
  }
});
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Monkey-patch Three.js geometry to support BVH
// @ts-ignore patching three.js prototype
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
)
