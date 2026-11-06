import * as THREE from 'three';
import { surfaceHeight, iceTop, CAVITY, SHAFT_HALF } from './world.js';

// Well centre (inside the open slot in the ground)
export const WELL = { x: 0, z: 0.1 };

const mats = {
    derrick: new THREE.MeshStandardMaterial({ color: 0xe3a21a, roughness: 0.55, metalness: 0.5 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.4, metalness: 0.85 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.5, metalness: 0.7 }),
    casing: new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.6, metalness: 0.2 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd9561c, roughness: 0.6, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.1, metalness: 0.6 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.5 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.2 }),
    bit: new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.35, metalness: 0.95, flatShading: true }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.9, flatShading: true })
};

const UP = new THREE.Vector3(0, 1, 0);

function strut(a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
}

function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z); // y is the bottom of the box
    return m;
}

function cyl(r, h, mat, x, y, z, seg = 16) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    m.position.set(x, y + h / 2, z);
    return m;
}

export function createRig() {
    const group = new THREE.Group();
    const gy = surfaceHeight(WELL.x, WELL.z); // ground level at the well
    const add = (m) => { group.add(m); return m; };
    const drilling = new THREE.Group(); // parts only present while drilling
    group.add(drilling);
    const addD = (m) => { drilling.add(m); return m; };

    // ---- Lattice derrick ----
    const H = 5.4, LEVELS = 6, hb = 0.8, ht = 0.38, y0 = gy + 0.15;
    const corner = (k, sx, sz) => {
        const f = k / LEVELS, h = hb + (ht - hb) * f;
        return new THREE.Vector3(WELL.x + sx * h, y0 + H * f, WELL.z + sz * h);
    };
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < LEVELS; k++) {
        corners.forEach(([sx, sz], i) => {
            add(strut(corner(k, sx, sz), corner(k + 1, sx, sz), 0.05, mats.derrick)); // legs
            const [nx, nz] = corners[(i + 1) % 4];
            // diagonal braces on each face, alternating direction
            const flip = (k + i) % 2 === 0;
            add(strut(corner(k, flip ? sx : nx, flip ? sz : nz), corner(k + 1, flip ? nx : sx, flip ? nz : sz), 0.022, mats.derrick));
        });
    }
    for (let k = 0; k <= LEVELS; k++) { // horizontal rings
        corners.forEach(([sx, sz], i) => {
            const [nx, nz] = corners[(i + 1) % 4];
            add(strut(corner(k, sx, sz), corner(k, nx, nz), 0.03, mats.derrick));
        });
    }

    // skid beams under the derrick
    [-0.95, 0.95].forEach(x => add(box(0.16, 0.14, 2.0, mats.darkSteel, WELL.x + x, gy - 0.02, WELL.z)));

    // crown block with sheaves and warning beacon
    const topY = y0 + H;
    add(box(0.95, 0.2, 0.95, mats.darkSteel, WELL.x, topY, WELL.z));
    [-0.22, 0, 0.22].forEach(dx => {
        const s = cyl(0.16, 0.1, mats.steel, WELL.x + dx, topY + 0.2, WELL.z, 20);
        s.rotation.z = Math.PI / 2;
        s.position.y = topY + 0.36;
        add(s);
    });
    const beacon = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mats.beacon));
    beacon.position.set(WELL.x + 0.38, topY + 0.28, WELL.z + 0.38);
    const lamp = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), mats.lamp));
    lamp.position.set(WELL.x, y0 + H * 0.55, WELL.z + 0.62);

    // ---- Top drive + drill string + casing ----
    const driveY = gy + 3.3;
    addD(box(0.5, 0.75, 0.5, mats.orange, WELL.x, driveY, WELL.z));
    addD(cyl(0.09, 0.45, mats.steel, WELL.x, driveY + 0.75, WELL.z, 12)); // swivel/hook
    // lines from crown block down to top drive
    [-0.18, 0.18].forEach(dx => addD(strut(
        new THREE.Vector3(WELL.x + dx, topY + 0.3, WELL.z),
        new THREE.Vector3(WELL.x + dx * 0.7, driveY + 1.1, WELL.z), 0.012, mats.darkSteel)));

    // casing: from just above ground down into the top of the ice
    const casingTop = gy + 0.45;
    const casingBottom = iceTop(WELL.x) - 0.28;
    const casingLen = casingTop - casingBottom;
    const casingGroup = new THREE.Group(); // lowered into the well in the timeline
    group.add(casingGroup);
    const addC = (m) => { casingGroup.add(m); return m; };
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, casingLen, 24, 1, true, Math.PI / 2, Math.PI), mats.casing);
    casing.position.set(WELL.x, casingBottom + casingLen / 2, WELL.z);
    addC(casing);
    addC(cyl(0.33, 0.12, mats.steel, WELL.x, casingTop - 0.12, WELL.z, 24)); // wellhead flange
    addC(cyl(0.3, 0.06, mats.steel, WELL.x, casingBottom, WELL.z, 24));      // casing shoe

    // rotating string
    const spin = new THREE.Group();
    spin.position.set(WELL.x, 0, WELL.z);
    drilling.add(spin);
    const bitBottom = CAVITY.cy - 0.3;
    const pipeTop = driveY;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12), mats.steel); // length set by scale.y
    spin.add(pipe);
    const joints = [];
    for (let k = 0; k < 7; k++) { // tool joints
        const j = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.2, 12), mats.darkSteel);
        spin.add(j);
        joints.push(j);
    }
    // drill bit: body + three roller cones (moves down as the well is drilled)
    const bitGroup = new THREE.Group();
    spin.add(bitGroup);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 10), mats.bit);
    body.position.y = bitBottom + 0.11;
    bitGroup.add(body);
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 7), mats.tooth);
        cone.position.set(Math.cos(a) * 0.07, bitBottom + 0.04, Math.sin(a) * 0.07);
        cone.rotation.set(Math.PI + Math.sin(a) * 0.4, 0, Math.cos(a) * -0.4);
        bitGroup.add(cone);
    }
    // p = 0: bit at the surface, p = 1: bit down in the ice. The string gets longer as it goes down.
    function setDrillProgress(p) {
        const bitY = (gy + 0.3) + (bitBottom - (gy + 0.3)) * p;
        bitGroup.position.y = bitY - bitBottom;
        const len = pipeTop - (bitY + 0.22);
        pipe.scale.y = len;
        pipe.position.y = bitY + 0.22 + len / 2;
        joints.forEach((j, k) => {
            const y = bitY + 0.7 + k * 1.2;
            j.visible = y < pipeTop - 0.2;
            j.position.y = y;
        });
    }
    setDrillProgress(1);
    // p = 0: casing above the rig, p = 1: set in the well
    function setCasing(p) {
        casingGroup.visible = p > 0.001;
        casingGroup.position.y = (1 - p) * 6;
    }

    // ---- Support equipment around the pad ----
    const onGround = (x, z) => surfaceHeight(x, z) - 0.04;

    // drawworks house (left)
    let y = onGround(-2.1, -0.4);
    add(box(1.3, 0.8, 0.9, mats.darkSteel, -2.1, y, -0.4));
    add(box(1.34, 0.12, 0.94, mats.derrick, -2.1, y + 0.8, -0.4));
    add(strut(new THREE.Vector3(-1.5, y + 0.8, -0.4), new THREE.Vector3(WELL.x - 0.3, topY + 0.3, WELL.z), 0.012, mats.darkSteel));

    // control cabin (right)
    y = onGround(2.3, -0.7);
    add(box(1.3, 0.85, 0.85, mats.white, 2.3, y, -0.7));
    add(box(0.5, 0.3, 0.02, mats.glass, 2.0, y + 0.4, -0.7 + 0.43));
    add(box(0.28, 0.6, 0.02, mats.darkSteel, 2.65, y + 0.02, -0.7 + 0.43));

    // generator with exhaust stack
    y = onGround(2.3, 0.9);
    add(box(0.95, 0.55, 0.6, mats.orange, 2.3, y, 0.9));
    add(cyl(0.05, 0.5, mats.darkSteel, 2.6, y + 0.55, 0.9, 8));

    // fuel tank lying on its side
    y = onGround(-2.2, 1.3);
    const tank = cyl(0.28, 1.1, mats.white, -2.2, y + 0.28, 1.3, 20);
    tank.rotation.z = Math.PI / 2;
    tank.position.y = y + 0.3;
    add(tank);
    add(box(0.12, 0.1, 0.5, mats.darkSteel, -2.5, y, 1.3));
    add(box(0.12, 0.1, 0.5, mats.darkSteel, -1.9, y, 1.3));

    // drill pipe rack
    y = onGround(1.6, 2.0);
    add(box(0.12, 0.08, 0.7, mats.darkSteel, 0.8, y, 2.0));
    add(box(0.12, 0.08, 0.7, mats.darkSteel, 2.4, y, 2.0));
    const rack = [[0, 0], [0.17, 0], [0.34, 0], [0.085, 0.14], [0.255, 0.14], [0.17, 0.28]];
    rack.forEach(([dx, dy]) => {
        const p = cyl(0.075, 1.8, mats.steel, 0, 0, 0, 10);
        p.rotation.z = Math.PI / 2;
        p.position.set(1.6, y + 0.16 + dy, 1.85 + dx);
        add(p);
    });

    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    beacon.castShadow = false;

    return {
        group,
        drilling,
        setDrillProgress,
        setCasing,
        update(dt, t) {
            spin.rotation.y += dt * 4;
            beacon.material.emissiveIntensity = 0.4 + 1.4 * (Math.sin(t * 4) > 0 ? 1 : 0);
        }
    };
}
