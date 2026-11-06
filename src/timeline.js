// The animated sequence (stage 5). Everything is a function of the time `t`,
// so the progress bar can jump anywhere and the model follows.

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);

export const END = 62;

export const PHASES = [
    { t: 0, title: '1 · Drilling',
      text: 'A drilling rig bores a well down through the dusty regolith until it reaches the buried ice.',
      cam: { pos: [0, 2.8, 18], target: [0, 2.8, 0] } },
    { t: 8, title: '2 · Casing the well',
      text: 'A steel casing is lowered into the hole to seal it off from the regolith, and the drill string is pulled out.',
      cam: { pos: [0, 2.8, 18], target: [0, 2.8, 0] } },
    { t: 15, title: '3 · Installing the heaters and pump',
      text: 'The heating elements and a submersible pump are lowered down the casing into the ice.',
      cam: { pos: [0, 2.8, 18], target: [0, 2.8, 0] } },
    { t: 20, title: '4 · Heating and melting',
      text: 'The heaters warm the ice around them. It melts into a growing pool of water, forming a cavity under a roof of ice.',
      cam: { pos: [0, 0.6, 8.5], target: [0, 0.6, 0] } },
    { t: 40, title: '5 · Pumping and storage',
      text: 'The pump lifts the melt water up the well and through the surface pipe into the storage tank.',
      cam: { pos: [3.6, 3.6, 18], target: [3.6, 3.6, 0] } }
];

export function createTimeline({ rig, well, surface, melt, flow, onPhase, ui }) {
    let t = 0;
    let playing = true;
    let phase = -1;
    let seeking = false;

    function apply() {
        // drilling: the bit goes down, then the string is pulled back out
        const drill = t < 8 ? ease(range(t, 0, 8)) : t < 12 ? 1 : 1 - ease(range(t, 12, 15));
        rig.setDrillProgress(drill);
        rig.drilling.visible = t < 15.05;
        rig.setCasing(ease(range(t, 8, 12)));

        // equipment lowered in, surface pipework fitted
        well.setInstall(ease(range(t, 15, 20)));
        surface.group.visible = t >= 15;

        // heating and melting
        well.setHeat(ease(range(t, 20, 23)));
        melt.setMelt(t < 21 ? 0 : 0.06 + 0.94 * ease(range(t, 21, 40)));

        // pumping and storage
        const pumping = t >= 40 && t < 60; // the pump stops once the tank is full
        well.setPumpOn(pumping);
        flow.setVisible(t >= 40);
        flow.speed = pumping ? 0.8 : 0;
        surface.setLevel(t < 40 ? 0.02 : 0.02 + 0.98 * ease(range(t, 40, 60)));

        // caption and camera follow the current phase
        let p = 0;
        PHASES.forEach((ph, i) => { if (t >= ph.t) p = i; });
        if (p !== phase) {
            phase = p;
            ui.setCaption(PHASES[p].title, PHASES[p].text);
            onPhase(PHASES[p].cam);
        }
        ui.setTime(t, END, playing, seeking);
    }

    return {
        apply,
        update(dt) {
            if (playing) {
                t = Math.min(END, t + dt);
                if (t >= END) playing = false;
            }
            apply();
        },
        play() { if (t >= END) t = 0; playing = true; },
        pause() { playing = false; },
        toggle() { playing ? this.pause() : this.play(); },
        restart() { t = 0; playing = true; phase = -1; },
        seek(frac) { t = clamp01(frac) * END; },
        setSeeking(v) { seeking = v; },
        get time() { return t; },
        get playing() { return playing; }
    };
}
