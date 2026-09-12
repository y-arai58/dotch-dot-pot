# Quadruped model contract v1

JSON fields: `id`, `name`, `prompt`, `features`, `parts`, `rig.bones`, optional `motionCorrections`. Every part has unique ASCII `id`, primitive `shape` (box/ellipsoid/cylinder/cone), world-rest `position`, full-extent `size`, `color:'#rrggbb'`, optional XYZ `rotation` in **radians**, and `bone`. Corrections/animation keys use XYZ **degrees**. Keep 19–100 purposeful pieces; exact reference counts are not quotas.

## Coordinates and skeleton

+X is the animal's own left, −Y forward, +Z upward, ground Z=0. Front camera sees the muzzle along −Y. Bone pivots and part positions are absolute rest coordinates, not parent-relative offsets. Root is [0,0,0]; ankle/paw pivots are above the sole. The canvas anchor [32,52] is the projected root, not a fixed sole pixel row.

Exactly 19 bones follow this hierarchy:

- root → body → chest → neck → head
- body → tailBase → tailTip
- chest → frontUpperL → frontLowerL → frontPawL; same for R
- body → hindUpperL → hindLowerL → hindPawL; same for R

Root has no parent (null in structured output). Bind visible geometry to every non-root joint; a short tail may use small but nondegenerate segments. Keep belly clear of the ground during the default crouch, and leave room above the animal for jumping.

A useful starting envelope at default style: head/ears ≤1.4 Z, X width around .8, full front-to-tail Y range approximately −1.1 to +1.2. Shoulder/hip heights around .75, ankle pivots .10–.12, and each leg segment .30–.40 long. These are design starting points, not universal proportions. Change anatomy while retaining sufficient limb length, joint overlap, frame margins, and ground clearance.

## Motion mechanics

Front elbows bend toward +Y; hind knees toward −Y. Each leg uses two-segment IK; independent hocks/digits are not modeled. Keep slight neutral bend so the pole direction is unambiguous and stride has reach reserve. Do not change bone length during animation.

Walk is a four-beat cycle with contact starts at hind-left 0, front-left .25, hind-right .5, front-right .75. `cycle=(phase-offset+1)%1`. Stance occupies .75 of each foot's cycle; normally three paws support the body. This is a stylized walk, not trot or gallop. Paw swing uses a smooth height arc and matching horizontal tangent. Review body support and species impression visually.

Stride is the fore/aft distance covered during stance, not distance per full cycle. Game movement is external toward −Y. Full-cycle distance is `stride/.75 × modelScale`; recommended speed is that distance divided by clip duration. Export includes all four paws' contact/lift events. Idle/walk loop; crouch/jump end in a stable pose. Tail and neck belong to this rig and must not track human arm motion.

Foot keys apply after IK and may invalidate contact. Corrections are permitted for anatomy/attachments, but leg/root edits that move planted paws are errors. Toe and low ankle geometry should follow paw; higher leg geometry follows lower/upper. A long belly, collar pendant, or swinging tail must stay clear of the floor.

## Acceptance

Same model, same pose, same style for all eight directions. Never mirror the opposite side to invent asymmetric markings. Project lighting stays in world space. Render directly to 64×64 indexed pixels, transparent index 0, no antialiasing, outer 2px transparent margin, fixed project palette, and clipped=false. All vertices remain Z≥−.015 in every motion frame. All bones remain finite; no unreachable IK or displaced/tilted planted paws.

Default project: 30° downward elevation, 20 pixels/model-unit, light 225°/45°, 32-color palette, 1px outline. Do not alter a supplied style to conceal problems. Shading is quantized, so nearby fur/accent colors can merge. Inspect actual rendered markings and silhouettes. Auto checks do not certify perfect anatomy, self-collision avoidance, aesthetic quality, or input fidelity; user adoption remains separate.
