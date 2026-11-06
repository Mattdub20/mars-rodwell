import * as THREE from 'three';
import { surfaceHeight, iceTop, cavityPoint, CAVITY } from './world.js';
import { WELL } from './rig.js';
import { lerp, mulberry32 } from './noise.js';
import { pipeSegment } from './surface.js';

const WATER_Y = 1.2; // water level in the melt cavity

const mats = {
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.4, metalness: 0.85 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.5, metalness: 0.7 }),
    pump: new THREE.MeshStandardMaterial({ color: 0x2f6fb5, roughness: 0.35, metalness: 0.7 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.6, metalness: 0.8 }),
    valve: new THREE.MeshStandardMaterial({ color: 0xd9561c, roughness: 0.55, metalness: 0.5 }),
    heater: new THREE.MeshStandardMaterial({
        color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 2, roughness: 0.4, metalness: 0.3
    }),
    cable: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 }),
    water: new THREE.MeshStandardMaterial({
        color: 0x3aa0e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false
    }),
    bubble: new THREE.MeshStandardMaterial({
        color: 0xdff6ff, transparent: true, opacity: 0.7, roughness: 0.1, depthWrite: false
    })
};

const UP = new THREE.Vector3(0, 1, 0);

function strut(a, b, r, mat, seg = 8) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
}

function cyl(r, h, mat, x, yBottom, z, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, yBottom + h / 2, z);
    return m;
}

// Water filling the lower part of the melt cavity
function buildPool() {
    const pts = [];
    const N = 90;
    for (let k = 0; k <= N; k++) {
        const [x, y] = cavityPoint(lerp(Math.PI, Math.PI * 2, k / N));
        if (y <= WATER_Y) pts.push([x, y]);
    }
    pts.unshift([pts[0][0], WATER_Y]);
    pts.push([pts[pts.length - 1][0], WATER_Y]);
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.96, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -0.48);
    const mesh = new THREE.Mesh(geo, mats.water);
    mesh.renderOrder = 2;
    return mesh;
}

export function createWellEquipment() {
    const group = new THREE.Group();
    const add = (m) => { group.add(m); return m; };
    const gy = surfaceHeight(WELL.x, WELL.z);
    const { x, z } = WELL;

    const pool = buildPool();
    group.add(pool);
    const tree = new THREE.Group();   // wellhead valve + outlet, fitted once the pump is installed
    group.add(tree);
    const addT = (m) => { tree.add(m); return m; };
    const down = new THREE.Group();   // everything lowered into the well
    group.add(down);
    const addDn = (m) => { down.add(m); return m; };

    // ---- Wellhead (production tree) and surface outlet ----
    const flangeTop = gy + 0.45;
    addT(cyl(0.14, 0.4, mats.valve, x, flangeTop, z));
    addT(cyl(0.18, 0.06, mats.steel, x, flangeTop + 0.4, z));
    const wheel = addT(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), mats.darkSteel));
    wheel.position.set(x, flangeTop + 0.5, z);
    wheel.rotation.x = Math.PI / 2;
    const outletY = flangeTop + 0.22;
    addT(pipeSegment(new THREE.Vector3(x, outletY, z), new THREE.Vector3(x, outletY, z + 1.3), 0.055));
    addT(cyl(0.085, 0.07, mats.valve, x, outletY - 0.035, z + 1.3, 16)).rotation.x = Math.PI / 2;
    tree.children[tree.children.length - 1].position.set(x, outletY, z + 1.3);

    // ---- Riser (water pipe) from the pump up to the wellhead ----
    const pumpTop = 1.42;
    const pumpBottom = 0.86;
    addDn(pipeSegment(new THREE.Vector3(x, pumpTop, z), new THREE.Vector3(x, outletY, z), 0.06));
    for (let y = pumpTop + 0.5; y < flangeTop; y += 0.7) addDn(cyl(0.085, 0.1, mats.darkSteel, x, y, z, 12)); // couplings

    // power cables down the casing
    [-0.12, 0.12].forEach(dx => addDn(strut(
        new THREE.Vector3(x + dx, flangeTop, z - 0.12), new THREE.Vector3(x + dx, 0.78, z - 0.12), 0.014, mats.cable, 6)));

    // ---- Submersible pump ----
    const pump = new THREE.Group();
    pump.add(cyl(0.14, 0.38, mats.pump, x, pumpBottom + 0.18, z, 20));      // motor/stages
    pump.add(cyl(0.12, 0.18, mats.screen, x, pumpBottom, z, 20));            // intake screen
    for (let i = 0; i < 4; i++) pump.add(cyl(0.125, 0.012, mats.steel, x, pumpBottom + 0.02 + i * 0.045, z, 20));
    pump.add(cyl(0.09, 0.08, mats.steel, x, pumpTop - 0.08, z, 16));         // discharge head
    down.add(pump);

    // ---- Heating elements ----
    const heaterTop = pumpBottom;
    const heaterY = 0.7;
    addDn(cyl(0.04, heaterTop - heaterY + 0.05, mats.darkSteel, x, heaterY - 0.05, z, 10));
    const arms = [[-1, 0], [1, 0], [0, 1], [-0.7, 0.7], [0.7, 0.7]];
    arms.forEach(([dx, dz], i) => {
        const len = 0.75;
        const a = new THREE.Vector3(x, heaterY + (i % 2) * 0.06, z);
        const b = new THREE.Vector3(x + dx * len, heaterY + (i % 2) * 0.06, z + dz * len);
        addDn(strut(a, b, 0.032, mats.heater, 8));
        const tip = addDn(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mats.heater));
        tip.position.copy(b);
        for (let c = 1; c <= 3; c++) { // glowing coil rings along each arm
            const ring = addDn(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), mats.heater));
            ring.position.lerpVectors(a, b, c / 4);
            ring.lookAt(b);
        }
    });
    const heaterLight = new THREE.PointLight(0xff7a2a, 3, 3.5);
    heaterLight.position.set(x, heaterY + 0.15, z + 0.4);
    down.add(heaterLight);

    // ---- Bubbles rising off the hot elements ----
    const rng = mulberry32(21);
    const bubbles = [];
    const bubbleGeo = new THREE.SphereGeometry(1, 6, 5);
    for (let i = 0; i < 26; i++) {
        const m = new THREE.Mesh(bubbleGeo, mats.bubble);
        const s = 0.018 + rng() * 0.025;
        m.scale.setScalar(s);
        const ang = rng() * Math.PI * 2, rad = 0.1 + rng() * 0.65;
        m.userData = {
            bx: x + Math.cos(ang) * rad * 1.0,
            bz: z + Math.abs(Math.sin(ang)) * rad,
            y: heaterY + rng() * (WATER_Y - heaterY),
            speed: 0.15 + rng() * 0.25,
            phase: rng() * 6
        };
        down.add(m);
        bubbles.push(m);
    }

    group.traverse(o => { if (o.isMesh && o.material !== mats.water && o.material !== mats.bubble) { o.castShadow = true; } });

    let heat = 1, pumpOn = true;
    return {
        group,
        pool,
        // p = 0: pump and heaters above the rig, p = 1: lowered into the cavity
        setInstall(p) {
            down.visible = p > 0.001;
            down.position.y = (1 - p) * 5;
            tree.visible = p > 0.95;
        },
        setHeat(h) { heat = h; },
        setPumpOn(v) { pumpOn = v; },
        update(dt, t) {
            const pulse = Math.sin(t * 2.5);
            mats.heater.emissiveIntensity = 0.15 + heat * (1.45 + 0.6 * pulse);
            heaterLight.intensity = heat * (2.4 + 0.9 * pulse);
            pump.position.x = pumpOn ? Math.sin(t * 40) * 0.0015 : 0; // motor vibration
            bubbles.forEach(b => {
                const d = b.userData;
                b.visible = heat > 0.3;
                d.y += d.speed * dt * heat;
                if (d.y > WATER_Y) d.y = heaterY;
                b.position.set(d.bx + Math.sin(t * 2 + d.phase) * 0.02, d.y, d.bz);
            });
        }
    };
}
