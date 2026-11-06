# Mars Rodwell Simulation: Progress

Last updated: 4 Nov 2026

Run it with `npm run dev`, then open the address Vite prints (e.g. http://localhost:5173).
Controls: drag to rotate, scroll to zoom. The buttons at the bottom (or keys **0-6**) switch between the progress stages:

0. **Layers**: the original first version, a simple sandwich of flat layers (`src/layers.js`)
1. **Environment**: terrain, mountains, cutaway, ice and melt cavity only
2. **Drilling rig**: adds the derrick, casing, drill string and support equipment
3. **Heaters and pump**: swaps the drill string for heaters, pump, riser, wellhead and water
4. **Pipes and tank**: adds the surface pipe from the wellhead to a storage tank. The tank fills, the pump stops when it is full, and a "Tank full!" box asks if you want to reset
5. **Full simulation**: the whole process as a 1:02 animation with captions, play/pause, restart and a scrub bar (space bar also plays/pauses)
6. **Explore**: the finished model with free camera movement (see below)

You can also open a stage directly, e.g. `http://localhost:5173/#stage2`.

## Done

- [x] **Scene setup**: Three.js scene, camera, orbit controls, lighting, shadows (`src/main.js`)
- [x] **Terrain**: uneven Martian ground with dunes, rocks and a flat pad for the rig (`src/world.js`)
- [x] **Distant mountains**: ridge range, dusty sky and fog (`src/world.js`)
- [x] **Wide block**: 36 units wide so it doesn't read as a small box
- [x] **Sloped ends**: the block tapers down into the plain at both ends
- [x] **Cutaway**: open front face showing regolith, ice and bedrock, plus the well slot
- [x] **Natural ice**: wavy ice layer with a textured, fractured look and crystals
- [x] **Melt cavity**: pocket in the ice under the well (`CAVITY` in `src/world.js`)
- [x] **Drilling rig**: derrick, top drive, casing, spinning drill string and bit, support equipment (`src/rig.js`)
- [x] **Heaters**: glowing heating elements, bubbles, orange light (`src/well.js`)
- [x] **Pump**: submersible pump, riser pipe, wellhead and surface outlet (`src/well.js`)
- [x] **Water pool**: see-through water in the melt cavity (`src/well.js`)

## To do

- [x] **Surface pipes**: pipe run from the wellhead outlet across the ground (`src/surface.js`)
- [x] **Storage tank**: tank on the surface, with a water level that rises (`src/surface.js`)
- [x] **Water flow animation**: moving water in the riser and surface pipes
- [x] **Melting animation**: a hole grows in the ice around the heaters and fills with water (`src/melt.js`)
- [x] **Timeline sequence**: drill, case, install, melt, pump, store, played in order (`src/timeline.js`)
- [x] Captions for each phase
- [x] **Labels**: names on the parts (`src/labels.js`); the Labels button or the L key turns them on and off
- [x] **Controls**: play, pause, restart and scrub bar
- [x] **Final polish**: console warnings fixed, labels avoid the caption and screen edges, production build tested

## Notes

- Dimensions and positions that the machinery shares are exported from `src/world.js` (`HALF_W`, `CAVITY`, `SHAFT_HALF`) and `src/rig.js` (`WELL`).
- The drilling rig and the heater/pump set are two separate groups, which is what the 1 / 2 keys switch between. The timeline will use the same switch.
- Plan: 6 days. Days 1 to 4 were scene, rig, heaters and pump. Days 5 and 6 are for pipes, tank, animation and polish.

## Presenting or recording

- **Live demo:** run `npm.cmd run dev`, open the address, click **5 · Full simulation**. Press **space** to pause, drag the bar to jump to a part, **L** hides the labels, **H** hides all the buttons.
- **Video:** press **Win + G** (Xbox Game Bar) with the browser focused and start a recording, or use OBS. Click **Restart** first and let all 1:02 play. Hide the labels with **L** if you want a cleaner shot.
- **Full screen:** press **F11** in the browser for a bigger picture.
- **Send it as a website:** run `npm.cmd run build`. This makes a `dist` folder you can upload to a static host (e.g. GitHub Pages or Netlify). It will not open by double-clicking `index.html`; it needs a web server.
- **If it runs slowly:** close other tabs, or make the browser window smaller. The slowest part is the shadows.

## Explore mode (stage 6)

The finished model with a free camera. Press **6** or click "6 · Explore".

- **W / A / S / D:** fly forward, left, back, right (in the direction you are looking)
- **Q / E:** move down / up, **Shift** to go faster
- **Left-drag** rotates, **right-drag** pans, **scroll** zooms
- **View buttons:** Overview, Drilling rig, Underground, Tank, Landscape glide the camera to a good spot
- **Auto-orbit:** slowly circles the model, handy for a hands-free demo

## Hiding the interface

Top right of the screen: **Buttons** (or the H key) hides the stage bar, view buttons and player controls, and **Labels** (or the L key) hides the part labels. The number keys 0-6 and the space bar still work with the buttons hidden. The "Tank full!" notice appears in this same corner.
