import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWorld, makeSkyTexture } from './world.js';
import { createRig } from './rig.js';
import { createWellEquipment } from './well.js';
import { createSurfacePlumbing, flow } from './surface.js';
import { createMeltZone } from './melt.js';
import { createTimeline } from './timeline.js';
import { createLabels } from './labels.js';
import { createSandwich } from './layers.js';

// Scene
const scene = new THREE.Scene();
scene.background = makeSkyTexture();
scene.fog = new THREE.FogExp2(0xc98a64, 0.0045);

// Camera
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(1.2, 2.0, 7.2);

// Renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

document.getElementById('scene').appendChild(renderer.domElement);

// Camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.5, 0);
controls.minDistance = 5;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

// Lighting
const ambient = new THREE.HemisphereLight(0xffffff, 0x553322, 2);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffd2a1, 3);
sun.position.set(-14, 14, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.normalBias = 0.03;
scene.add(sun);

// World: uneven terrain, open cutaway, natural ice, distant mountains
const world = buildWorld();
scene.add(world);
// solid ground, ice and rock (not the big distant plain) can hide labels behind them
const occluders = world.children.filter(o => o.isMesh && o.geometry.attributes.position.count < 30000 && o.castShadow);

// Stage 0: the original simple layers model (hidden unless that stage is chosen)
const sandwich = createSandwich();
scene.add(sandwich);
const skyBackground = scene.background;
const skyFog = scene.fog;

// Drilling rig, well equipment, surface plumbing, melt zone
const rig = createRig();
scene.add(rig.group);
const well = createWellEquipment();
scene.add(well.group);
const surface = createSurfacePlumbing();
scene.add(surface.group);
const melt = createMeltZone();
scene.add(melt.group);
// simple clock (THREE.Clock is deprecated)
const clock = {
    last: performance.now(),
    elapsedTime: 0,
    getDelta() {
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.last) / 1000); // cap so a tab switch does not cause a jump
        this.last = now;
        this.elapsedTime += dt;
        return dt;
    }
};

// ---- Camera gliding ----
let camGoal = null;
// As soon as you grab the camera (drag, scroll or touch), stop gliding to the stage view
controls.addEventListener('start', () => { camGoal = null; });
function glideTo(cam) {
    camGoal = { pos: new THREE.Vector3(...cam.pos), target: new THREE.Vector3(...cam.target) };
}

// ---- Animated sequence (stage 5) ----
const $ = (id) => document.getElementById(id);
const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const timeline = createTimeline({
    rig, well, surface, melt, flow,
    onPhase: glideTo,
    ui: {
        setCaption(title, text) {
            $('caption').querySelector('h2').textContent = title;
            $('caption').querySelector('p').textContent = text;
        },
        setTime(t, end, playing, seeking) {
            if (!seeking) $('seek').value = Math.round((t / end) * 1000);
            $('time').textContent = fmt(t) + ' / ' + fmt(end);
            $('play').textContent = playing ? '❚❚' : '▶';
        }
    }
});
$('play').addEventListener('click', () => timeline.toggle());
$('restart').addEventListener('click', () => timeline.restart());
$('seek').addEventListener('pointerdown', () => timeline.setSeeking(true));
$('seek').addEventListener('pointerup', () => timeline.setSeeking(false));
$('seek').addEventListener('input', (e) => timeline.seek(e.target.value / 1000));

// ---- Labels ----
// shown in the given stages; in stage 5 each one appears once its part exists (time in seconds)
let currentStage = -1;
const showIn = (stages, from = 0) => () =>
    stages.includes(currentStage) && (currentStage !== 5 || timeline.time >= from);
const labels = createLabels($('labels'), camera, [
    { text: 'Regolith', pos: [-3, 3.2, 3.5], show: showIn([0]) },
    { text: 'Ice', pos: [-3, 1.2, 3.5], show: showIn([0]) },
    { text: 'Bedrock', pos: [-3, -0.8, 3.5], show: showIn([0]) },
    { text: 'Regolith (dusty soil)', pos: [-5, 3.4, 3.5], show: showIn([1, 2, 3, 4, 5, 6]) },
    { text: 'Subsurface ice', pos: [-5, 1.3, 3.5], show: showIn([1, 2, 3, 4, 5, 6]) },
    { text: 'Bedrock', pos: [-5, -0.8, 3.5], show: showIn([1, 2, 3, 4, 5, 6]) },
    { text: 'Drilling rig', pos: [0.5, 9.2, 0.1], show: showIn([2, 3, 4, 5, 6]) },
    { text: 'Steel casing', pos: [0, 3.4, 0.45], show: showIn([2, 3, 4, 5, 6], 10) },
    { text: 'Wellhead valve', pos: [0, 5.05, 0.1], show: showIn([3, 4, 5, 6], 17) },
    { text: 'Submersible pump', pos: [0.15, 1.45, 0.1], show: showIn([3, 4, 5, 6], 19) },
    { text: 'Heating elements', pos: [0.8, 0.85, 0.5], show: showIn([3, 4, 5, 6], 20) },
    { text: 'Melt-water pool', pos: [-1.1, 1.0, 2.0], show: showIn([3, 4, 5, 6], 30) },
    { text: 'Surface pipe', pos: [3.8, 4.75, 1.4], show: showIn([4, 5, 6], 15) },
    { text: 'Storage tank', pos: [7.2, 6.6, 1.4], show: showIn([4, 5, 6], 15) }
], occluders, [$('sim'), $('stages')]);
const toggleLabels = () => {
    labels.setEnabled(!labels.enabled);
    $('labels-toggle').textContent = 'Labels: ' + (labels.enabled ? 'on' : 'off');
};
$('labels-toggle').addEventListener('click', toggleLabels);

// hide / show all the buttons (stage bar, view buttons, player) for a clean screen
const toggleButtons = () => {
    const hidden = document.body.classList.toggle('ui-hidden');
    $('buttons-toggle').textContent = 'Buttons: ' + (hidden ? 'hidden' : 'shown');
    layoutPanels();
};
$('buttons-toggle').addEventListener('click', toggleButtons);

// ---- Progress stages: each one adds a new piece to the model ----
const STAGES = {
    0: { layers: true, rig: false, drilling: false, well: false, surface: false,
         cam: { pos: [11, 9, 15], target: [0, 2, 0] } },          // original layers model
    1: { rig: false, drilling: false, well: false, surface: false,
         cam: { pos: [16, 11, 26], target: [0, 2.5, 0] } },       // environment only
    2: { rig: true, drilling: true, well: false, surface: false,
         cam: { pos: [6, 6.5, 12], target: [0, 3.2, 0] } },       // drilling rig
    3: { rig: true, drilling: false, well: true, surface: false,
         cam: { pos: [1.2, 2.0, 7.2], target: [0, 1.5, 0] } },    // heaters and pump
    4: { rig: true, drilling: false, well: true, surface: true,
         cam: { pos: [4.5, 5.6, 13.5], target: [3.4, 4.2, 1.2] } }, // pipes and tank
    6: { rig: true, drilling: false, well: true, surface: true,
         cam: { pos: [14, 9, 22], target: [2, 3, 0] } },          // explore the finished model
    5: { sim: true }                                              // animated sequence
};
function setStage(n) {
    const s = STAGES[n];
    if (!s) return;
    currentStage = n;
    const sim = !!s.sim;
    // stage 0 shows the simple layers model on a dark background; everything else shows the full world
    world.visible = !s.layers;
    sandwich.visible = !!s.layers;
    scene.background = s.layers ? new THREE.Color(0x171b25) : skyBackground;
    scene.fog = s.layers ? null : skyFog;
    $('sim').hidden = !sim;
    $('explore').hidden = n !== 6;
    if (sim) {
        // everything is shown and driven by the timeline
        rig.group.visible = true;
        well.group.visible = true;
        well.pool.visible = false;      // the melt zone draws the water instead
        melt.group.visible = true;
        surface.setAuto(false);
        timeline.restart();
        timeline.update(0); // applies the first phase right away (sets the starting camera)
    } else {
        // static views: finished equipment, no melt zone, running pump
        rig.setDrillProgress(1);
        rig.setCasing(1);
        well.setInstall(1);
        well.setHeat(1);
        well.setPumpOn(true);
        well.pool.visible = true;
        melt.group.visible = false;
        flow.setVisible(true);
        flow.speed = 0.7;
        surface.setAuto(true);
        rig.group.visible = s.rig;
        rig.drilling.visible = s.drilling;
        well.group.visible = s.well;
        surface.group.visible = s.surface;
        glideTo(s.cam);
    }
    document.querySelectorAll('#stages button[data-stage]').forEach(btn =>
        btn.classList.toggle('active', Number(btn.dataset.stage) === n));
    history.replaceState(null, '', '#stage' + n);
}
document.querySelectorAll('#stages button[data-stage]').forEach(btn =>
    btn.addEventListener('click', () => setStage(Number(btn.dataset.stage))));
window.addEventListener('keydown', (e) => {
    if (STAGES[e.key]) setStage(Number(e.key));
    if (e.key === 'l' || e.key === 'L') toggleLabels();
    if (e.key === 'h' || e.key === 'H') toggleButtons();
    if (e.key === ' ' && currentStage === 5) { e.preventDefault(); timeline.toggle(); }
});
const hashStage = location.hash.match(/stage(\d)/);
const startStage = hashStage ? Number(hashStage[1]) : 3;
setStage(startStage);
if (camGoal) {
    camera.position.copy(camGoal.pos);
    controls.target.copy(camGoal.target);
    camGoal = null;
}

// ---- Explore mode (stage 6): fly around the finished model ----
const VIEWS = {
    overview: { pos: [14, 9, 22], target: [2, 3, 0] },
    rig: { pos: [5, 6.5, 10], target: [0, 4, 0.1] },
    underground: { pos: [1.5, 1.9, 7.0], target: [0, 0.9, 0] },
    tank: { pos: [9, 5.5, 8], target: [7.2, 5, 1.4] },
    wide: { pos: [20, 10, 30], target: [0, 3, 0] }
};
document.querySelectorAll('#views button[data-view]').forEach(btn =>
    btn.addEventListener('click', () => glideTo(VIEWS[btn.dataset.view])));
$('orbit').addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 1.5;
    $('orbit').textContent = 'Auto-orbit: ' + (controls.autoRotate ? 'on' : 'off');
    $('orbit').classList.toggle('on', controls.autoRotate);
});
const keysDown = new Set();
window.addEventListener('keydown', (e) => keysDown.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keysDown.clear());
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3();
function flyCamera(dt) {
    const k = (key) => keysDown.has(key) ? 1 : 0;
    const f = k('w') - k('s'), r = k('d') - k('a'), u = k('e') - k('q');
    if (!f && !r && !u) return;
    camGoal = null; // stop any glide as soon as you steer
    camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, camera.up).normalize();
    _move.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, r);
    _move.y += u;
    const speed = (keysDown.has('shift') ? 18 : 6) * dt;
    _move.multiplyScalar(speed);
    // keep the camera above the desert floor
    if (camera.position.y + _move.y < -1.5) _move.y = -1.5 - camera.position.y;
    camera.position.add(_move);
    controls.target.add(_move);
}

// ---- Tank full: stop the pump and ask whether to reset ----
$('resetTank').addEventListener('click', () => {
    if (currentStage === 5) timeline.restart();
    else surface.setLevel(0.02);
});

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    flow.tick(dt);
    if (currentStage === 5) timeline.update(dt);
    const tankFull = surface.group.visible && surface.isFull && [4, 5, 6].includes(currentStage);
    if (tankFull && currentStage !== 5) { flow.speed = 0; well.setPumpOn(false); }
    else if (currentStage !== 5) { flow.speed = 0.7; well.setPumpOn(true); }
    $('fullprompt').hidden = !tankFull;
    rig.update(dt, clock.elapsedTime);
    well.update(dt, clock.elapsedTime);
    if (surface.group.visible) surface.update(dt);
    if (currentStage === 6) flyCamera(dt);
    if (camGoal) { // glide the camera to the new view
        const k = 1 - Math.exp(-dt * 2.5); // same glide speed at any frame rate
        camera.position.lerp(camGoal.pos, k);
        controls.target.lerp(camGoal.target, k);
        if (camera.position.distanceTo(camGoal.pos) < 0.05) camGoal = null;
    }
    controls.update();
    labels.update();
    renderer.render(scene, camera);
}

animate();

// keep the caption and explore panels just above the stage buttons, however many rows those wrap to
function layoutPanels() {
    document.documentElement.style.setProperty('--panel-bottom', ($('stages').offsetHeight + 28) + 'px');
}
layoutPanels();

// Resize handling
window.addEventListener('resize', () => {
    layoutPanels();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
});
