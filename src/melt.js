import * as THREE from 'three';
import { cavityPoint, CAVITY, SHAFT_HALF } from './world.js';
import { lerp } from './noise.js';

// The melt zone: before melting, the cavity is filled with solid (see-through) ice.
// As the heaters work, a hole grows outward from them and fills with water.
const CENTER = { x: 0, y: 1.0 };   // where the heaters sit; the hole grows from here
const WATER_Y = 1.2;               // water level once fully melted (matches well.js)
const T1 = Math.acos(-SHAFT_HALF / CAVITY.rx);
const T2 = Math.PI * 2 + Math.acos(SHAFT_HALF / CAVITY.rx);

// outline of the cavity (lower arc, closed by a straight line across the top)
const OUTLINE = Array.from({ length: 57 }, (_, k) => cavityPoint(lerp(T1, T2, k / 56)));

const scaled = (m) => OUTLINE.map(([x, y]) => [
    CENTER.x + m * (x - CENTER.x),
    CENTER.y + m * (y - CENTER.y)
]);

function extrude(points, holePoints) {
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
    if (holePoints) shape.holes.push(new THREE.Path(holePoints.map(p => new THREE.Vector2(p[0], p[1]))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.96, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, -0.48);
    return geo;
}

export function createMeltZone() {
    const group = new THREE.Group();

    const iceMat = new THREE.MeshStandardMaterial({
        color: 0xb5e4f2, roughness: 0.25, emissive: 0x0b2f44, emissiveIntensity: 0.5,
        transparent: true, opacity: 0.55, depthWrite: false
    });
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x3aa0e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false
    });
    const plug = new THREE.Mesh(extrude(OUTLINE), iceMat);
    plug.renderOrder = 1;
    const pool = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
    pool.renderOrder = 2;
    group.add(plug, pool);

    function poolGeometry(m) {
        const pts = scaled(m);
        const bottom = Math.min(...pts.map(p => p[1]));
        const level = Math.min(WATER_Y, bottom + 0.75 * m);
        const wet = pts.filter(p => p[1] <= level);
        if (wet.length < 3) return null;
        wet.unshift([wet[0][0], level]);
        wet.push([wet[wet.length - 1][0], level]);
        return extrude(wet);
    }

    let lastM = -1;
    // m = 0: solid ice. m = 1: fully melted cavity full of water.
    function setMelt(m) {
        if (Math.abs(m - lastM) < 0.003 && m !== 0 && m !== 1) return;
        lastM = m;
        if (m <= 0) {
            pool.visible = false;
            plug.visible = true;
            plug.geometry.dispose();
            plug.geometry = extrude(OUTLINE);
            return;
        }
        const mm = Math.min(1, m);
        pool.geometry.dispose();
        const g = poolGeometry(mm);
        pool.visible = !!g;
        if (g) pool.geometry = g;
        if (m >= 0.985) {            // melted all the way out to the cavity wall
            plug.visible = false;
            return;
        }
        plug.visible = true;
        plug.geometry.dispose();
        plug.geometry = extrude(OUTLINE, scaled(m));
    }
    setMelt(0);

    return { group, setMelt };
}
