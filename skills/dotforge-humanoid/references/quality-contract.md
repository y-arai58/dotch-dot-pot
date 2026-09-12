# Humanoid model contract v1

The artifact is JSON with `id`, `name`, `prompt`, `features`, `parts`, `rig.bones`, and optional `motionCorrections`. Parts contain `id`, `shape` (`box`, `ellipsoid`, `cylinder`, `cone`), `position:[x,y,z]`, `size:[width,depth,height]` (full extents), `color:'#rrggbb'`, optional `rotation:[x,y,z]`, and `bone`. Part IDs are unique ASCII letters/digits/underscore/hyphen. Keep 16–100 useful pieces; the reference counts are not quotas.

## Coordinates and units

- +X = character's own left, −Y = forward, +Z = up; ground Z=0. Front camera sees −Y surfaces. Positive elevation looks downward.
- Geometry, bone pivots and part positions are absolute world coordinates in the neutral rest pose, not parent-relative offsets.
- Part rotations are **radians**. Bone motion corrections and animation keys are **degrees**. Rotation order and projection are defined by the studio renderer.
- Root pivot is [0,0,0]. Foot pivots are at the ankles, above the sole, not on the floor. The anchor [32,52] is projected root, not a sole pixel row.
- Canonical hierarchy: root → pelvis → torso → head; torso → upperArmL → lowerArmL → handL and mirrored R; pelvis → thighL → shinL → footL and mirrored R. Include all 16 joints exactly once and bind visible geometry to every non-root joint. Root has no parent (null is accepted in structured output).

## Motion constraints

Knees bend toward −Y. The solver preserves leg lengths and levels feet. Crouch lowers pelvis; jump raises root. Per-joint corrections apply after IK and can break contact if applied to legs. Do not shorten bones per frame.

Floor-adjacent rigid hems or tall boot cuffs bound to shin may rotate below the floor. The reference scout's boot cuffs and mage's lowest panels/hem are bound to foot; higher panels follow shin/thigh. Use that reasoning to design each garment. Split long robes enough to keep stride readable. Cloth simulation is not implemented.

The mage holds a long staff using `motionCorrections.lowerArmL=[-55,0,0]`; this is a weapon-specific repair, not a general pose. Keep held equipment attached to the correct hand and clear of the floor in every action. A zero vector means no correction.

## Pixel and identity acceptance

Use the existing CPU depth renderer and project palette. Output 64×64 exactly, transparent index 0, hard pixel edges without antialiasing. Eight-direction order: S, SE, E, NE, N, NW, W, SW. Re-render the same model and pose for each view. Never mirror the body to invent the other side; asymmetric equipment must remain on the correct anatomical side. Lighting stays in project/world space.

All static and animated frames must have `clipped=false`, no out-of-range palette indices, visible body, and a transparent outer 2px margin. Motion validation must report no unreachable IK, lost planted-foot contact, or vertices below Z=−0.015. Idle/walk loop; crouch/jump play once with a stable end pose. All 8 + (8+12+10+12)×8 = 344 frames are checked by the bridge.

The default project uses elevation 30°, scale 20, light azimuth 225° / elevation 45°, fixed 32-color palette and a 1px outline. These are defaults, not permission to overwrite a supplied style. Three quantized lighting bands may collapse similar RGB accents; assess the actual pixels. Project styles with insufficient space/contrast may need a smaller character or a clear failure report.

Match sample quality through connected silhouette, intentional 1–2px accents, readable hands/boots/face, front-side-back design, solid joint connections, and stable clusters across time. The validator does not detect all self-intersections, floating joints, semantic identity errors or stylistic mismatch; inspect the PNGs and describe the visual checks honestly.
