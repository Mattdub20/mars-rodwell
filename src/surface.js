import * as THREE from 'three';
import { surfaceHeight } from './world.js';
import { WELL } from './rig.js';

// Surface plumbing: pipe from the wellhead outlet to a storage tank.
export const TANK = { x: 7.2, z: 1.4, r: 0.95, h: 2.1 };

const UP = new THREE.Vector3(0, 1, 0);

// Animated stripes that run along the water inside the pipes
const stripeTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#1d78c4');
    grad.addColorStop(0.5, '#9be8ff');
    grad.addColorStop(1, '#1d78c4');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
})();

const mats = {
    pipe: new THREE.MeshStandardMaterial({
        color: 0xb8bec6, roughness: 0.3, metalness: 0.8, transparent: true, opacity: 0.38,
        side: THREE.DoubleSide, depthWrite: false
    }),
    water: new THREE.MeshStandardMaterial({
        map: stripeTex, emissive: 0x1a6fb0, emissiveIntensity: 0.6, roughness: 0.3
    }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.4, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.5, metalness: 0.7 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({
        color: 0xaee0f0, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.2,
        side: THREE.DoubleSide, depthWrite: false
    }),
    tankWater: new THREE.MeshStandardMaterial({
        color: 0x2e92d8, roughness: 0.1, emissive: 0x0c3f66, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.85
    }),
    valve: new THREE.MeshStandardMaterial({ color: 0xd9561c, roughness: 0.55, metalness: 0.5 })
};

function strut(a, b, r, mat, seg = 8) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
}

function cyl(r, h, mat, x, yBottom, z, seg = 24) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, yBottom + h / 2, z);
    return m;
}

// One straight pipe: see-through steel shell with moving water inside
export function pipeSegment(a, b, r) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14, 1, true), mats.pipe));
    const geo = new THREE.CylinderGeometry(r * 0.72, r * 0.72, len, 12, 1, false);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 1.6); // same stripe size on every segment
    g.add(new THREE.Mesh(geo, mats.water));
    g.position.copy(a).addScaledVector(d, 0.5);
    g.quaternion.setFromUnitVectors(UP, d.normalize());
    return g;
}

// Shared water-flow controls (used by the surface pipes and the riser in the well)
export const flow = {
    speed: 0.7,
    tick(dt) { stripeTex.offset.y -= dt * this.speed; },
    setVisible(v) { mats.water.visible = v; }
};

export function createSurfacePlumbing() {
    const group = new THREE.Group();
    const add = (m) => { group.add(m); return m; };
    const R = 0.075;

    // ---- Storage tank on a concrete pad ----
    let padTop = -Infinity;
    for (let dx = -1.5; dx <= 1.5; dx += 0.25)
        for (let dz = -1.5; dz <= 1.5; dz += 0.25)
            padTop = Math.max(padTop, surfaceHeight(TANK.x + dx, TANK.z + dz));
    padTop += 0.1;

    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 3.2), mats.concrete);
    pad.position.set(TANK.x, padTop - 0.35, TANK.z);
    add(pad);

    const base = padTop + 0.1;
    add(cyl(TANK.r + 0.05, 0.12, mats.steel, TANK.x, padTop, TANK.z));
    add(new THREE.Mesh(
        new THREE.CylinderGeometry(TANK.r, TANK.r, TANK.h, 36, 1, true), mats.glass
    )).position.set(TANK.x, base + TANK.h / 2, TANK.z);
    [0.02, 0.5, 1.0].forEach(f => { // reinforcing bands
        const band = add(new THREE.Mesh(new THREE.TorusGeometry(TANK.r + 0.01, 0.028, 6, 36), mats.steel));
        band.rotation.x = Math.PI / 2;
        band.position.set(TANK.x, base + 0.08 + f * (TANK.h - 0.16), TANK.z);
    });
    add(cyl(TANK.r + 0.06, 0.1, mats.steel, TANK.x, base + TANK.h, TANK.z));            // roof
    add(cyl(0.12, 0.2, mats.dark, TANK.x, base + TANK.h + 0.1, TANK.z, 12));            // vent

    const waterMaxH = TANK.h - 0.15;
    const water = add(cyl(TANK.r - 0.05, 1, mats.tankWater, TANK.x, 0, TANK.z, 36));
    water.geometry.translate(0, 0.5, 0); // pivot at the bottom so scale.y raises the surface
    water.position.set(TANK.x, base + 0.04, TANK.z);

    // ladder up the back
    [-0.12, 0.12].forEach(dx => add(strut(
        new THREE.Vector3(TANK.x + dx, base, TANK.z - TANK.r - 0.1),
        new THREE.Vector3(TANK.x + dx, base + TANK.h + 0.1, TANK.z - TANK.r - 0.1), 0.02, mats.steel, 6)));
    for (let y = base + 0.2; y < base + TANK.h; y += 0.22)
        add(strut(new THREE.Vector3(TANK.x - 0.12, y, TANK.z - TANK.r - 0.1),
            new THREE.Vector3(TANK.x + 0.12, y, TANK.z - TANK.r - 0.1), 0.012, mats.steel, 5));

    // level gauge on the right-hand side
    const gx = TANK.x + TANK.r + 0.16;
    add(cyl(0.05, TANK.h - 0.3, mats.glass, gx, base + 0.1, TANK.z, 10));
    const gaugeFill = add(cyl(0.032, 1, mats.tankWater, gx, 0, TANK.z, 10));
    gaugeFill.geometry.translate(0, 0.5, 0);
    gaugeFill.position.set(gx, base + 0.1, TANK.z);
    [0.1, TANK.h - 0.2].forEach(y => add(strut(
        new THREE.Vector3(gx, base + y, TANK.z), new THREE.Vector3(TANK.x + TANK.r - 0.02, base + y, TANK.z), 0.018, mats.steel, 6)));

    // ---- Pipe route: wellhead outlet -> down to the ground -> along the ground -> tank inlet ----
    const gy = surfaceHeight(WELL.x, WELL.z);
    const outletY = gy + 0.45 + 0.22;
    const lane = WELL.z + 1.3; // matches the outlet stub in well.js
    const route = [new THREE.Vector3(WELL.x, outletY, lane)];
    route.push(new THREE.Vector3(WELL.x, surfaceHeight(WELL.x, lane) + 0.24, lane));
    const lastX = TANK.x - TANK.r - 1.1;
    for (let x = 0.9; x < lastX; x += 0.9) route.push(new THREE.Vector3(x, surfaceHeight(x, lane) + 0.24, lane));
    route.push(new THREE.Vector3(lastX, padTop + 0.3, lane));
    route.push(new THREE.Vector3(TANK.x - TANK.r - 0.02, base + 0.9, lane));

    route.forEach((p, i) => {
        if (i > 0) add(pipeSegment(route[i - 1], p, R));
        if (i > 0 && i < route.length - 1) { // elbow joint
            add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.35, 12, 8), mats.steel)).position.copy(p);
        }
        if (i > 0 && i < route.length - 1 && p.x > 0.5 && p.x < lastX - 0.4) { // supports
            const g = surfaceHeight(p.x, p.z);
            add(strut(new THREE.Vector3(p.x, g - 0.05, p.z), new THREE.Vector3(p.x, p.y - R, p.z), 0.025, mats.dark, 6));
        }
    });
    // valve at the tank inlet
    const inlet = route[route.length - 1];
    add(cyl(0.12, 0.16, mats.valve, inlet.x - 0.35, inlet.y - 0.08, inlet.z, 14)).rotation.z = 0;
    const wheel = add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 16), mats.dark));
    wheel.position.set(inlet.x - 0.35, inlet.y + 0.14, inlet.z);
    wheel.rotation.x = Math.PI / 2;

    group.traverse(o => { if (o.isMesh && o.material.transparent !== true) { o.castShadow = true; o.receiveShadow = true; } });

    let level = 0.12;
    function setLevel(f) {
        level = Math.min(1, Math.max(0.02, f));
        water.scale.y = level * waterMaxH;
        gaugeFill.scale.y = level * (TANK.h - 0.3);
    }
    setLevel(level);

    let auto = true; // free-running fill (stages 3-4); the timeline turns this off
    return {
        group,
        setLevel,
        setAuto(v) { auto = v; },
        get isFull() { return level >= 0.995; },
        update(dt) {
            if (auto && level < 1) setLevel(level + dt * 0.03); // fills up, then stops when full
        }
    };
}
