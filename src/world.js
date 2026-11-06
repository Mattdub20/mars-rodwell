import * as THREE from 'three';
import { hash, fbm, noise2, smoothstep, lerp, mulberry32 } from './noise.js';

// ---- Block dimensions (shared with the machinery that comes later) ----
export const HALF_W = 18;       // block spans x: -18 .. 18
export const HALF_D = 3.5;      // block spans z: -3.5 .. 3.5
export const BOTTOM = -2;
export const SURFACE = 4.3;     // average ground level
export const SHAFT_HALF = 0.5;  // the open well slot is x: -0.5 .. 0.5
export const SHAFT_BACK = -0.5; // ...from z = -0.5 out to the front
export const CAVITY = { cx: 0, cy: 1.1, rx: 1.5, ry: 0.6 };

const STEP = 0.25;

// ---- Height functions ----
// Squash every layer toward the base near the two ends so the block slopes
// down into the surrounding plain instead of stopping in a cliff.
const SLOPE_START = 9;
function squash(x, y) {
    const e = smoothstep(SLOPE_START, HALF_W, Math.abs(x));
    return BOTTOM + (y - BOTTOM) * (1 - 0.97 * e);
}
export function surfaceHeight(x, z) {
    // flat pad in the middle for the rig, rougher toward the edges
    const rough = smoothstep(2.6, 4.4, Math.hypot(x, z * 1.3));
    const bumps = (fbm(x * 0.45 + 10, z * 0.45 + 3, 4) - 0.45) * 1.3;
    const dunes = Math.sin(x * 0.9 + fbm(x * 0.3, z * 0.3, 2) * 4) * 0.12;
    return squash(x, SURFACE + rough * (bumps + dunes));
}
export function iceTop(x) {
    return squash(x, 2.15 + (fbm(x * 0.5 + 3.1, 1.7, 3) - 0.45) * 0.4);
}
export function iceBottom(x) {
    return squash(x, 0.05 + (fbm(x * 0.4 + 20, 3.3, 3) - 0.45) * 0.4);
}

// ---- Cavity outline (the pocket the Rodwell melts into the ice) ----
const THETA1 = Math.acos(-SHAFT_HALF / CAVITY.rx);
const THETA2 = Math.PI * 2 + Math.acos(SHAFT_HALF / CAVITY.rx);
export function cavityPoint(theta) {
    const below = Math.max(0, -Math.sin(theta)); // noise only on the lower half
    const m = 1 + 0.10 * Math.sin(5 * theta + 1) * below + 0.04 * Math.sin(9 * theta) * below;
    return [CAVITY.cx + CAVITY.rx * m * Math.cos(theta), CAVITY.cy + CAVITY.ry * m * Math.sin(theta)];
}

// ---- Procedural textures ----
function makeTexture(w, h, yMin, yMax, pixel) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const wx = -HALF_W + (px / w) * 2 * HALF_W;
            const wy = yMax - (py / h) * (yMax - yMin);
            const [r, g, b] = pixel(wx, wy);
            const i = (py * w + px) * 4;
            img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / (2 * HALF_W), 1 / (yMax - yMin));
    tex.offset.set(0.5, -yMin / (yMax - yMin));
    tex.anisotropy = 4;
    return tex;
}

function mix3(c, t, target) {
    return [lerp(c[0], target[0], t), lerp(c[1], target[1], t), lerp(c[2], target[2], t)];
}

function icePixel(wx, wy) {
    const n = fbm(wx * 0.8 + 4, wy * 1.6 + 2, 4);
    const t = smoothstep(0.25, 0.75, n);
    let c = [lerp(60, 205, t), lerp(150, 238, t), lerp(195, 250, t)];
    // faint sediment banding
    const band = Math.sin(wy * 18 + fbm(wx * 0.7, wy * 0.5, 2) * 8) * 0.5 + 0.5;
    const k = 0.9 + 0.12 * band;
    c = [c[0] * k, c[1] * k, c[2] * k];
    // dusty patches
    const dust = smoothstep(0.62, 0.8, fbm(wx * 0.5 + 90, wy * 1.2 + 40, 3));
    c = mix3(c, dust * 0.55, [125, 120, 118]);
    // bright fractures
    const crack = 1 - smoothstep(0, 0.03, Math.abs(fbm(wx * 1.6 + 30, wy * 3.2 + 8, 4) - 0.47));
    c = mix3(c, crack * 0.8, [240, 250, 255]);
    // trapped bubbles / crystals
    if (hash(Math.floor(wx * 60), Math.floor(wy * 60)) > 0.985) c = mix3(c, 0.7, [255, 255, 255]);
    return c;
}

function rockPixel(wx, wy) {
    const n = fbm(wx * 0.9 + 12, wy * 1.3, 4);
    let v = lerp(42, 82, n);
    const strata = Math.sin(wy * 9 + fbm(wx * 0.5, wy * 0.6, 3) * 5) * 0.5 + 0.5;
    v *= 0.85 + 0.3 * strata;
    const speck = noise2(wx * 50, wy * 50) > 0.8 ? 1.25 : 1;
    v *= speck;
    return [v * 1.02, v * 0.98, v * 1.06];
}

// ---- Ground (terrain + regolith) built by hand so the front can be opened ----
function buildGround() {
    const nx = (2 * HALF_W) / STEP;   // 48
    const nz = (2 * HALF_D) / STEP;   // 28
    const slotI0 = (-SHAFT_HALF + HALF_W) / STEP;  // 22
    const slotI1 = (SHAFT_HALF + HALF_W) / STEP;   // 26
    const slotJ0 = (SHAFT_BACK + HALF_D) / STEP;   // 12
    const pos = [], col = [];

    const rust = new THREE.Color(0xc66b43);
    const darkRust = new THREE.Color(0x8e4a30);
    const deep = new THREE.Color(0x5e3324);
    const dust = new THREE.Color(0xd58a5c);

    function topColor(x, z, y) {
        const c = rust.clone();
        c.lerp(darkRust, smoothstep(0.35, 0.7, fbm(x * 0.7 + 5, z * 0.7 + 9, 3)) * 0.8);
        c.lerp(dust, smoothstep(0.08, 0.5, y - SURFACE) * 0.5);
        const j = 0.93 + 0.14 * noise2(x * 4, z * 4);
        return c.multiplyScalar(j);
    }
    function pushV(x, y, z, c) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
    function tri(a, b, c) { for (const v of [a, b, c]) pushV(...v); }

    // top surface
    const topV = (i, j) => {
        const x = -HALF_W + i * STEP, z = -HALF_D + j * STEP, y = surfaceHeight(x, z);
        return [x, y, z, topColor(x, z, y)];
    };
    const flat = (v) => [v[0], v[1], v[2], v[3]];
    function pushVert(v) { pushV(v[0], v[1], v[2], v[3]); }
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
            if (i >= slotI0 && i < slotI1 && j >= slotJ0) continue; // open well slot
            const a = topV(i, j), b = topV(i + 1, j), c = topV(i + 1, j + 1), d = topV(i, j + 1);
            [a, d, c, a, c, b].forEach(pushVert);
        }
    }

    // vertical cut faces, with strata colouring
    const ROWS = 7;
    function wall(points) {
        const rows = (x, z) => {
            const top = surfaceHeight(x, z), bot = iceTop(x);
            const out = [];
            for (let k = 0; k <= ROWS; k++) {
                const f = k / ROWS;
                const y = lerp(top, bot, f);
                const c = topColor(x, z, top).lerp(deep, Math.pow(f, 0.8) * 0.75);
                const band = 0.9 + 0.2 * noise2(x * 1.4, k * 1.9 + z * 0.7);
                c.multiplyScalar(band);
                out.push([x, y, z, c]);
            }
            return out;
        };
        for (let p = 0; p < points.length - 1; p++) {
            const A = rows(...points[p]), B = rows(...points[p + 1]);
            for (let k = 0; k < ROWS; k++) {
                [A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]].forEach(pushVert);
            }
        }
    }
    const line = (x0, z0, x1, z1) => {
        const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
        const n = Math.round(len / STEP);
        return Array.from({ length: n + 1 }, (_, i) => [lerp(x0, x1, i / n), lerp(z0, z1, i / n)]);
    };
    wall(line(-HALF_W, HALF_D, -SHAFT_HALF, HALF_D));            // front, left of slot
    wall(line(SHAFT_HALF, HALF_D, HALF_W, HALF_D));              // front, right of slot
    wall(line(-HALF_W, -HALF_D, HALF_W, -HALF_D));               // back
    wall(line(-HALF_W, -HALF_D, -HALF_W, HALF_D));               // left
    wall(line(HALF_W, -HALF_D, HALF_W, HALF_D));                 // right
    wall(line(-SHAFT_HALF, SHAFT_BACK, -SHAFT_HALF, HALF_D));    // slot left wall
    wall(line(SHAFT_HALF, SHAFT_BACK, SHAFT_HALF, HALF_D));      // slot right wall
    wall(line(-SHAFT_HALF, SHAFT_BACK, SHAFT_HALF, SHAFT_BACK)); // slot back wall

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide
    }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// ---- Ice and bedrock (extruded from wavy side profiles) ----
const xs = Array.from({ length: (2 * HALF_W) / STEP + 1 }, (_, i) => -HALF_W + i * STEP);

function iceShape(withCavity) {
    const pts = [];
    xs.forEach(x => { if (!withCavity || x <= -SHAFT_HALF + 1e-9) pts.push([x, iceTop(x)]); });
    if (withCavity) {
        const N = 56;
        for (let k = 0; k <= N; k++) pts.push(cavityPoint(lerp(THETA1, THETA2, k / N)));
        xs.forEach(x => { if (x >= SHAFT_HALF - 1e-9) pts.push([x, iceTop(x)]); });
    }
    [...xs].reverse().forEach(x => pts.push([x, iceBottom(x)]));
    return new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
}

function bedrockShape() {
    const pts = [[-HALF_W, BOTTOM]];
    xs.forEach(x => pts.push([x, iceBottom(x)]));
    pts.push([HALF_W, BOTTOM]);
    return new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
}

function extrude(shape, depth, zStart, materials) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    geo.translate(0, 0, zStart);
    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

// ---- Distant plain and mountains ----
function farHeight(x, z) {
    const r = Math.hypot(x, z);
    const near = smoothstep(26, 60, r);
    const dunes = (fbm(x * 0.06 + 40, z * 0.06, 3) - 0.45) * 3.2 * near;
    const m = smoothstep(90, 230, r);
    const ridged = Math.pow(1 - Math.abs(2 * fbm(x * 0.012 + 50, z * 0.012 + 9, 5) - 1), 2.2);
    const mountains = m * (ridged * 55 + fbm(x * 0.03, z * 0.03, 4) * 14);
    return -2.05 + dunes + mountains;
}

function buildFarland() {
    const rings = 72, sectors = 240;
    const pos = new Float32Array((rings + 1) * sectors * 3);
    const col = new Float32Array((rings + 1) * sectors * 3);
    const low = new THREE.Color(0xb86e48), mid = new THREE.Color(0x8c4f38), high = new THREE.Color(0xc8a07c);
    const tmp = new THREE.Color();
    for (let i = 0; i <= rings; i++) {
        const r = 420 * Math.pow(i / rings, 2.3);
        for (let j = 0; j < sectors; j++) {
            const a = (j / sectors) * Math.PI * 2;
            const x = r * Math.cos(a), z = r * Math.sin(a), y = farHeight(x, z);
            const idx = (i * sectors + j) * 3;
            pos[idx] = x; pos[idx + 1] = y; pos[idx + 2] = z;
            const t = Math.min(1, Math.max(0, (y + 2) / 55));
            tmp.copy(low).lerp(mid, smoothstep(0, 0.35, t)).lerp(high, smoothstep(0.55, 1, t));
            tmp.multiplyScalar(0.9 + 0.2 * noise2(x * 0.08, z * 0.08));
            col[idx] = tmp.r; col[idx + 1] = tmp.g; col[idx + 2] = tmp.b;
        }
    }
    const index = [];
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < sectors; j++) {
            const j2 = (j + 1) % sectors;
            const a = i * sectors + j, b = i * sectors + j2;
            const c = (i + 1) * sectors + j2, d = (i + 1) * sectors + j;
            index.push(a, c, b, a, d, c);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide
    }));
    mesh.receiveShadow = true;
    return mesh;
}

// ---- Public builder ----
export function buildWorld() {
    const group = new THREE.Group();

    group.add(buildGround());
    group.add(buildFarland());

    // ice
    const iceTex = makeTexture(3072, 256, -0.3, 2.5, icePixel);
    const iceFace = new THREE.MeshStandardMaterial({
        map: iceTex, roughness: 0.3, metalness: 0.05,
        emissive: 0x0b2f44, emissiveIntensity: 0.6
    });
    const iceCavityWall = new THREE.MeshStandardMaterial({
        color: 0x1f5f7f, roughness: 0.2, emissive: 0x0a3550, emissiveIntensity: 0.8
    });
    group.add(extrude(iceShape(true), 4, -0.5, [iceFace, iceFace]));
    group.add(extrude(iceShape(false), 3, -3.5, [iceCavityWall, iceFace]));

    // bedrock
    const rockTex = makeTexture(3072, 256, -2.2, 0.6, rockPixel);
    const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1 });
    group.add(extrude(bedrockShape(), 2 * HALF_D, -HALF_D, [rockMat, rockMat]));

    // ice crystals growing from the cavity floor
    const rng = mulberry32(7);
    const shardMat = new THREE.MeshStandardMaterial({
        color: 0xcff3ff, roughness: 0.15, emissive: 0x3a8fb0, emissiveIntensity: 0.5, flatShading: true
    });
    for (let k = 0; k < 22; k++) {
        const theta = Math.PI + 0.35 + rng() * (Math.PI - 0.7);
        const [px, py] = cavityPoint(theta);
        const h = 0.08 + rng() * 0.22;
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.035 + rng() * 0.05, h, 5), shardMat);
        shard.position.set(px, py + h * 0.4, -0.3 + rng() * 3.5);
        shard.rotation.set((rng() - 0.5) * 0.5, rng() * 3, (rng() - 0.5) * 0.5);
        group.add(shard);
    }

    // surface rocks, kept clear of the well slot and rig pad
    const rockColors = [0x75402e, 0x5f3426, 0x8a4f37, 0x4a2b21];
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMats = rockColors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
    let placed = 0;
    while (placed < 150) {
        const x = (rng() - 0.5) * 2 * (HALF_W - 0.4);
        const z = (rng() - 0.5) * 2 * (HALF_D - 0.4);
        if (Math.abs(x) < 2.2 && z > -1.6) continue;
        const s = 0.07 + Math.pow(rng(), 2.2) * 0.4;
        const rock = new THREE.Mesh(rockGeo, rockMats[Math.floor(rng() * rockMats.length)]);
        rock.scale.set(s * (0.8 + rng() * 0.6), s * (0.5 + rng() * 0.4), s * (0.8 + rng() * 0.6));
        rock.position.set(x, surfaceHeight(x, z) + s * 0.15, z);
        rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        rock.castShadow = true;
        rock.receiveShadow = true;
        group.add(rock);
        placed++;
    }

    return group;
}

// ---- Sky backdrop ----
export function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0.0, '#4a3036');
    g.addColorStop(0.35, '#a96c57');
    g.addColorStop(0.55, '#dba57a');
    g.addColorStop(1.0, '#c98a64');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}
