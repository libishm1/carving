# Digital Pointing Machine (Web Application)

A modern, web-based implementation of a traditional sculptor's pointing machine. This application bridges the gap between digital 3D models (maquettes) and physical stone/wood carving by simulating stock blocks, drill depths, and carving stages.

## Features

*   **Robust 3D Rendering**: Built with React Three Fiber and Three.js. Supports `.stl`, `.obj`, and `.3dm` files.
*   **Millimeter Accuracy**: Employs `three-mesh-bvh` for highly optimized, exact raycasting on dense geometry.
*   **Dynamic Stock Sizing**: Automatically wraps the maquette in an axis-aligned bounding box with a user-defined margin/kerf, or allows for custom physical block dimensions to verify fit.
*   **Virtual Pointing Device**: Click anywhere on the inner mesh to instantly calculate the perpendicular distance to the outer bounding box. It visually renders the start point, end point, and the drill path.
*   **Carving Stage Simulation**: Slide a clipping plane into the virtual stock block to simulate router roughing passes or chiseling. Select arbitrary mesh faces to define the plunging direction.

## Tech Stack
*   **Framework**: React (Vite) + TypeScript
*   **3D Engine**: Three.js + React Three Fiber (`@react-three/fiber`, `@react-three/drei`)
*   **Optimization**: `three-mesh-bvh` for ultra-fast spatial queries
*   **Styling**: TailwindCSS
*   **PWA**: Built-in Vite PWA plugin for offline installation capabilities.

## Setup & Run

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run Development Server:**
    ```bash
    npm run dev
    ```
3.  **Build for Production:**
    ```bash
    npm run build
    ```

## How It Works (Pointing)
A traditional pointing machine allows a sculptor to transfer physical points from a plaster model into a block of marble. This app simulates the process digitally:
1. The app loads your high-resolution scan (the *maquette*).
2. It calculates an outer *stock block* (the raw material).
3. Clicking on the maquette simulates pushing the pointing needle inward. The software shoots a ray outward along the block's normal to find the exact entry point on the raw material, giving you the precise depth to drill.
