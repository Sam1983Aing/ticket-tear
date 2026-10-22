# The prompt

Paste this into Google Antigravity (Gemini 4 Argon, set to High) or another coding agent. Every run comes out a little different.

```text
Build an interactive 3D physical paper "Ticket Tear" event checkout component ("ADMIT ONE // HOLOGRAPHIC PASS") using Vite, TypeScript, Three.js, custom GLSL shaders, and the Web Audio API.

1. Visual Direction & Layout
- Use a clean, high-craft studio checkout layout on a Warm Gallery Alabaster background (#F4F2ED) with a subtle hairline dot grid, soft radial studio lighting, and an optional Dark Concert Hall theme toggle in the top header.
- Left column: a sleek event checkout card ("KINETIC LIGHTS SYMPOSIUM") with a 3-way Holographic Foil Edition selector (01 Silver Holo, 02 Founders Gold Leaf, 03 Ultraviolet Prism), seat/zone selector, live perforation fiber tear meter (25/25 fibers), and a primary action button.
- Right/Center stage: the large 3D perforated pass (2 : 3.4 vertical proportions) suspended in 3D space and casting a real, deforming soft contact shadow onto the studio floor.

2. Real-Time 3D Verlet Card-Stock Physics & Split-Seam Topology
- Build a custom 900-vertex (25 columns x 36 rows) 3D Verlet physics solver (VerletPaperEngine) stepped at 10 constraint iterations per frame.
- Use 4 spring constraint types so the mesh feels like heavy 350gsm laminated card stock rather than floppy cloth:
  a) Structural springs (stiffness = 0.94) along horizontal and vertical grid edges.
  b) Shear springs (stiffness = 0.82) across diagonals to prevent skewing.
  c) 2-hop and 4-hop Bending springs (stiffness = 0.76 and 0.56) so the card resists sharp creases and bends in smooth, stiff arcs.
  d) Split-Seam Perforation Topology (The Secret to a Real V-Gap Tear):
     - Split the geometry at 72% down the card (UPPER_SEAM_ROW = 24, LOWER_SEAM_ROW = 25) so the upper pass body and lower detachable QR stub do NOT share welded triangle indices across the seam.
     - Bridge row 24 and row 25 exclusively with 25 breakable perforation seam springs (one per column).
     - When a seam spring at column c is severed, deactivate the structural, shear, and bending springs crossing the seam at column c and apply a slight curl impulse so the torn edge physically opens into a 3D V-shaped gap as you slice across.

3. Two Tactile Ways to Tear & Flex the Pass
- Grab, Flex & Tilt: Raycast pointer movement tilts the card toward the cursor so the holographic foil catches the studio lights. Dragging anywhere on the upper pass pulls vertices in 3D space with damped elastic recoil. Double-clicking (or pressing F) flips the pass 180 degrees to inspect the back face.
- Slice or Pull to Tear the Stub:
  - Dragging across the perforation seam (or pulling the bottom QR stub downward) severs the 25 perforation fibers sequentially (0% to 100% torn).
  - Once all 25 fibers are severed, release the bottom stub under gravity with air-drag flutter and rotational tumble, recoil the upper pass, and transition the checkout UI to "PASS VERIFIED · ADMIT ONE".
  - Pressing R ("Issue Fresh Pass") slides a crisp untorn pass into the stage.

4. Custom GLSL Prismatic Holographic Foil & Emboss Shader
- Generate high-DPI (1024 x 1740) procedural canvas textures for both the front and back faces:
  - Diffuse + Alpha Map: Ticket typography, fine guilloche security rosette, QR/barcode stub, rounded corners, side security notches, and 24 punched circular perforation holes along the seam (discard alpha in fragment shader so the punched holes and torn scalloped teeth are see-through).
  - RGB Foil / Emboss / Phase Mask: Red channel = foil reflectivity mask, Green channel = embossed heightfield for finite-difference normal perturbation, Blue channel = local phase offset.
- In the custom GLSL fragment shader (with position and normal attributes recomputed every frame after the Verlet step):
  - Evaluate a diagonal thin-film rainbow sweep driven by view angle, vertex normal, light direction, and UV projection.
  - Add 2D Voronoi cellular micro-glitter flakes that sparkle individually when each cell's random tilted normal aligns with the studio light.

5. Procedural Web Audio & [X] Physics X-Ray Mode
- Synthesize all audio in code via Web Audio API: band-passed noise bursts (1.35kHz to 2.8kHz) pitched up across columns 0..24 as each paper fiber snaps, culminating in a warm Fmaj9 verification chord on detachment.
- Pressing X ("Physics & Shader X-Ray") overlays a live THREE.LineSegments lattice of all active Verlet springs color-coded by type and strain (cyan = structural, indigo = shear/bending, amber/red = breakable perforation seam fibers).
```

Back to the [README](README.md) · [Live demo](https://sam1983aing.github.io/ticket-tear/)
