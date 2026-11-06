import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// The original first version of the model: a simple "sandwich" of flat layers.
// Regolith on top, ice in the middle, bedrock at the bottom, with a thin surface crust.
export function createSandwich() {
    const group = new THREE.Group();

    const regolithMaterial = new THREE.MeshStandardMaterial({ color: 0xa94e32, roughness: 1 });
    const iceMaterial = new THREE.MeshStandardMaterial({ color: 0x8bd8ed, roughness: 0.35, metalness: 0.05 });
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x383c43, roughness: 1 });
    const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0xc66b43, roughness: 1 });

    function createBox(width, height, depth, material, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
    }

    // Underground geological layers
    createBox(12, 2, 7, regolithMaterial, 0, 3, 0);
    createBox(12, 2, 7, iceMaterial, 0, 1, 0);
    createBox(12, 2, 7, rockMaterial, 0, -1, 0);

    // Martian surface
    createBox(12, 0.35, 7, surfaceMaterial, 0, 4.15, 0);

    // Surface rocks
    const rng = mulberry32(3);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x75402e, roughness: 1 });
    for (let i = 0; i < 35; i++) {
        const size = 0.12 + rng() * 0.35;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
        rock.position.set((rng() - 0.5) * 10, 4.4 + size * 0.2, (rng() - 0.5) * 5);
        rock.rotation.set(rng(), rng(), rng());
        group.add(rock);
    }

    // Grid floor
    const grid = new THREE.GridHelper(30, 30, 0x555b66, 0x343a45);
    grid.position.y = -2.05;
    group.add(grid);

    return group;
}
