# Maps

v0.1 starts with hand-authored JSON maps and validation. The default arena should be small, symmetric, and easy to reason about: 2–4 spawns, central contested pickup, side pickups, simple cover, and no doors/elevators/verticality/hazards.

Maps use `schemaVersion` `fps-arena-bench.schema.v0.1` with non-empty `id` and `version`, positive integer `width` and `height`, at least two `spawns`, optional `walls` and `pickups` arrays that default to `[]`, and `symmetry`. Spawn `contenderSlot` values must be unique and contiguous from `0`, spawn and pickup positions must use integer grid coordinates within bounds and outside walls, wall rectangles must stay within bounds, and all spawns and pickups must be reachable from the first spawn.

Positions are strict objects with finite numeric `x` and `y` fields. Spawns contain non-empty `id`, `contenderSlot`, `position`, and cardinal `headingDegrees` from `0` to `359` in 90-degree increments. Walls contain non-empty `id`, finite numeric `x`/`y`, and positive numeric `width`/`height`. Pickups contain non-empty `id`, `type`, `position`, and optional positive `respawnTicks`; pickup `type` is one of `health`, `ammo`, or `armor`.

Validation caps maps at 64 spawns, 256 walls, 1024 pickups, and 65,536 reachable grid cells. Supported symmetry modes are `rotational-180`, `mirror-x`, `mirror-y`, and `none`; non-`none` modes require `notes`, and `notes` must be non-empty whenever provided. Non-`none` modes also require matching counterpart spawns, walls, and same-type pickups with matching `respawnTicks`. Rotational spawn counterparts must use opposite headings, while `mirror-x` and `mirror-y` counterparts must use mirrored headings.

`maps/default-arena.json` is the M1 baseline. It uses 180-degree rotational symmetry:

- two east/west contender slots spawn at the same distance from center and face inward
- cover rectangles are paired by rotating around the arena center
- the central health pickup sits on the rotation center, while side ammo pickups are paired
- spawn and pickup coordinates use integer grid points so reachability checks can stay simple
