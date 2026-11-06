import * as THREE from 'three';

// Floating text labels that follow points in the 3D scene.
// items: [{ text, pos: [x, y, z], show: () => boolean }]
export function createLabels(container, camera, items, occluders = [], avoid = []) {
    const v = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3();
    const anchor = new THREE.Vector3();
    let frame = 0;
    const entries = items.map(item => {
        const el = document.createElement('div');
        el.className = 'label';
        el.textContent = item.text;
        container.appendChild(el);
        return { ...item, el };
    });
    let enabled = true;

    return {
        setEnabled(on) {
            enabled = on;
            container.hidden = !on;
        },
        get enabled() { return enabled; },
        update() {
            if (!enabled) return;
            const w = window.innerWidth, h = window.innerHeight;
            frame++;
            // screen areas taken by the caption, player and stage buttons
            const blocks = avoid.filter(a => !a.hidden).map(a => a.getBoundingClientRect());
            for (const e of entries) {
                v.set(...e.pos).project(camera);
                const x = (v.x * 0.5 + 0.5) * w;
                const y = (-v.y * 0.5 + 0.5) * h;
                let visible = e.show() && v.z < 1 && x > 70 && x < w - 70 && y > 20 && y < h;
                if (visible && blocks.some(r => x > r.left - 40 && x < r.right + 40 && y > r.top && y - 26 < r.bottom)) visible = false;
                // hide labels whose part is hidden behind the ground or ice (checked every 3rd frame)
                if (visible && frame % 3 === 0) {
                    anchor.set(...e.pos);
                    dir.subVectors(anchor, camera.position);
                    const dist = dir.length();
                    ray.set(camera.position, dir.normalize());
                    ray.far = dist - 0.15;
                    e.hidden = ray.intersectObjects(occluders, false).length > 0;
                }
                e.el.style.display = visible && !e.hidden ? 'block' : 'none';
                if (visible) e.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
            }
        }
    };
}
