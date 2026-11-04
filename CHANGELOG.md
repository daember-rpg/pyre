# Changelog

## 1.0.0

The first stable release. Everything from the 0.x versions, tested at the table:

* Spell areas, rays, bolts, darts, chains and cast glows read from each spell's own data; breath weapons and other creature abilities read from the ability.
* A signature for every weapon group, natural attacks and bombs, with up to three property runes.
* Lasting auras for conditions and spell effects.
* Walls stop areas, and particles bounce off them. Walls, doors and windows can break, by material and damage type, with the GM's confirmation, rubble left on the floor and a one-click restore.
* Edit many walls at once, Pyre Studio for tests and overrides, adaptive resolution and an animation speed setting.
* All text in `lang/en.json`, ready for translation.
* New cover image.

## 0.9.14

* README: a red dragon's breath stopped by a wall, and the walls breaking after the GM confirms.

## 0.9.13

* The Pyre section of a door's sheet said "Scene default (Glass)" on a scene whose walls are glass, though a door without a material of its own is wood. It now says "Default for doors (Wood)", and a window's sheet "Default for windows (Glass)". The "edit many walls" window spells out the same rule.

## 0.9.12

* README: clips of a dragon's acid breath and of lasting auras and the Light spell.

## 0.9.11

* README with a cover image, clips of fireballs, strikes, runes and breaking and restoring walls, and screenshots of Pyre Studio and the wall tools. The cover also shows on Foundry's package page.
* Shorter choices in the "edit many walls" window, so they are no longer cut off.

## 0.9.10

* Fixed: floor effects (the light under an impact, dust, smoke, scorch, casting circles) could appear away from their target, pulled toward the top left corner of the screen, while the rest of the effect played in the right place. When the floor picture changed size (adaptive resolution, or resizing the window), Foundry kept showing it at its old size. Pyre now hands Foundry a fresh picture whenever the size changes, and the floor layer no longer changes resolution with adaptive resolution at all.
* The same safeguard for lasting marks when moving to a scene of a different size.

## 0.9.9

* Fixed: on heavy hits, the impact (sparks, rune fire, rings) could land beside the target, sometimes a square or more away. The screen shake and impact zoom were applied twice to the effects layer: once when measuring the shaken map, and again by the shake itself. Effects now stay locked to the map while it shakes. This also stops the effects layer from being resized on every frame of a shake.

## 0.9.8

* **Three property runes.** As in PF2e, a weapon holds one property rune per point of potency, up to three. Weapons with three runes now show all three (they used to show two), and the light is shared so they don't wash out to white.
* Pyre Studio: a **Third rune** field for strike tests, and the rune lists no longer show "None" twice. A test follows the potency rule: a +1 weapon shows one rune, and the Studio says when extra runes were left off.

## 0.9.7

* Pyre Studio scrolls again when its content is taller than the window.
* The spell and attack fields under Overrides show a short list of up to 8 matches as you type (names that start with what you typed come first, the typed part highlighted), instead of the browser's list of every spell. Arrow keys move, Enter picks, Escape closes.
* More room around the tabs at the top of Pyre Studio, with a clearer active tab.

## 0.9.6

* Fixed: emanations (areas around the caster, which are never placed) did not damage walls or leave lasting marks.

## 0.9.5

* Fixed: damage from a creature's breath weapon (and other area abilities) did not reach walls. An unlinked creature's ability carries a different item address on its area than on its damage roll, so the two were never matched. Pyre now matches the damage roll to the area by the item, then by the ability's name, then by the same creature's latest area, and never takes a Strike's damage for the area's.
* With debug logging on, a damage roll that finds no area says so.

## 0.9.4

* Fixed: the Walls layer buttons (edit many walls, restore broken walls) ran twice per click, opening two windows.

## 0.9.3

* **Better stone walls breaking.** The pieces are now flat-sided broken blocks with bevelled, lit faces and real shadows, instead of round pale blobs. They burst out at a spread of angles, arc through the air, bounce once and skid to a stop. A few big blocks stay near the wall and grit flies farthest. The dust is a darker, ragged billowing cloud. What broke the wall (fire, acid, frost…) tints only some edges and cools as the pieces land.
* **Animation speed** (new per-player setting). Every effect now plays a little slower by default (0.85). Set it to 1 for the original pace, or anywhere from 0.5 to 1.5.

## 0.9.2

* **Edit many walls at once.** A new button in the Walls layer controls (and *Edit many walls at once…* in Pyre Studio → Scene) sets material, Hardness and HP for the selected walls, or for every wall, every door or every window in the scene, in one go. Foundry's own sheet only ever edits one wall.

## 0.9.1

* The Pyre section of the wall, door and window sheet now sits with the sheet's own sections (after Door Triggers), scrolls with them and looks like them, instead of hanging below the Update button.
* Picking a new material in that section also clears custom Hardness and HP, so the wall takes the new material's numbers.

## 0.9.0 (release candidate for 1.0)

* **Natural attacks with more character.** Claws leave three raked scratches on the floor; jaws lunge harder and throw dust and grit; a punch flashes a sharp star inside its impact ring; a tail sweep drags a wide ring of dust and kicks up pebbles.
* **Adaptive resolution** (new per-player setting, on by default). When effects make the game stutter, Pyre draws them at a lower resolution until frames are quick again, then climbs back.
* **Ready for translation.** Every piece of text (settings, Pyre Studio, the wall dialog, the wall sheet section, chat cards, notifications, the GM's reveal buttons) now lives in `lang/en.json`. Missing keys in a translation fall back to English.
* Fixed: the Overrides tab could also appear under Scene in Pyre Studio.
* Removed unused code.

## 0.6.0

* **Breakable doors and windows.** Closed doors (including secret and locked ones) and windows (walls that block movement but let sight through, Foundry's window preset) break like walls. Doors default to wood and windows to glass unless you give them a material.
  * A door bursts into long planks and leaves boards on the floor; a broken door is just a hole (no door control) until restored, when it comes back as it was, closed or locked.
  * A window shatters into a spray of glinting shards and leaves broken glass on the floor.
* Everything in the interface is now in English: the confirmation dialog, the chat card, the wall sheet section and notifications.

## 0.5.3

* Each wall's sheet (double-click a wall) has a **Pyre: breakable wall** section: material, Hardness, maximum HP and current HP (with a button back to full). Empty fields use the material's numbers. Tick **apply to the other selected walls** to set many walls at once. Saves the moment a field changes.
* The module settings only turn breakable walls on or off. The scene's default material and the "materials react to damage types" rule moved to Pyre Studio → Scene; the default material is now per scene.

## 0.5.2

* Materials react to damage types (world setting *Materials react to damage types*, on by default). Each part of the damage is multiplied before Hardness:

  | Material | Takes more | Takes less |
  |---|---|---|
  | Wood | fire ×2, acid and slashing ×1.25 | cold and piercing ÷2 |
  | Stone | sonic ×2, bludgeoning and acid ×1.5 | fire, cold, electricity, piercing and slashing ÷2 |
  | Iron / steel | acid ×2, cold ×1.5 | fire, electricity, piercing and slashing ÷2 |
  | Glass | sonic and bludgeoning ×2, cold ×1.5 | — |

  Force hits every material the same. The confirmation dialog shows why ("fire ×2").
* What broke the wall shows on the pieces: wood broken by fire flies off charred with burning edges and leaves charred rubble; frost leaves pale, frozen rubble; acid, lightning, sound and force tint the edges of the flying pieces.

## 0.5.1

* New wall break: the wall cracks with a flash, then chunks (and a few big slabs) fly out, mostly away from the blast, tumble and land as rubble in a cloud of dust; the rubble left on the floor lies on that same side.
* Restoring a wall plays it backwards: the rubble rises, flies back into the wall and the wall closes with a seam of light.
* Easier restore:
  * a card only the GM sees after each break, with a **Restore** button for those walls;
  * a **restore broken walls** button in the Walls layer controls;
  * Pyre Studio → Scene, as before.
* **Material (Pyre)** field in each wall's own configuration sheet (double-click a wall), saved the moment it changes. Selecting several walls and setting them in Pyre Studio → Scene still works.

## 0.5.0

* **Breakable walls** (world setting, off by default). After an area's damage roll (spells and creature abilities such as Breath Weapon), the walls the blast reaches take the damage minus their Hardness, using PF2e's structure statistics: wood 10/40, stone 14/56, iron 18/72, glass 2/8, or unbreakable. You confirm which walls break; the rest keep their damage. A broken wall stops blocking movement, sight, light and sound, collapses in splinters or rubble for everyone, and leaves rubble on the floor.
  * Pyre Studio → **Scene**: give selected walls a material, break selected walls by hand, restore every broken wall (and its rubble).
  * Setting **Wall material (default)** for walls without one.
* **Lasting marks** (world setting, off by default): fire, cold, acid, electricity, sonic, force and kinetic areas leave scorch, frost, acid burns or cracks on the map, stopped by walls, until you clear them in Pyre Studio → Scene. Drawn once into the scene, beneath the tokens.
* **Light** has its own aura: a warm pool of lantern light at the creature's feet and a small flame bobbing beside it, instead of the generic blessing.

## 0.4.1

* Flames, sparks, embers and smoke bounce off walls instead of being cut by them: whatever reaches a wall that blocks movement rebounds with some of its speed and piles up along it. Strike sparks and dust bounce off nearby walls too. Follows the *Walls stop areas* setting.

## 0.4.0

* Floor effects are drawn beneath the tokens, inside Foundry's own canvas (between tiles and tokens, like Sequencer's "below tokens"): floor light, scorch and frost, gashes and cracks, smoke and dust, casting circles and auras that sit at the feet. Flames, projectiles and lightning stay above. If Foundry's canvas does not accept the layer, everything is drawn above as before. Setting: *Floor effects under tokens* (per computer).
* Walls stop areas: bursts, breaths, columns and fields are clipped to what Foundry says the blast reaches from its origin (walls that block movement; open doors let it through), and creatures behind a wall do not react. Setting: *Walls stop areas* (world).
* Softer leading edge on weapon swings.

## 0.3.1

* New settings (per computer): **Smoke and dust duration** (how long smoke hangs over tokens and the map) and **Ground mark duration** in seconds (scorch, frost, gashes, cracks).

## 0.3.0

* Every PF2e weapon group has its own strike:
  * Sword: steel arc. Axe: heavy chop, wood chips and a gash left on the floor. Dagger/knife: two quick, quiet stabs.
  * Flail/whip: a wavering lash and a crack. Hammer/club: a dust shockwave and pebbles. Pick: a puncture and a star crack.
  * Polearm: a long reap from reach that pulls the target in. Spear: a long thrust. Shield: a wave front that shoves.
  * Crossbow: a fast bolt with a snap. Sling: a stone in a short arc. Firearm: muzzle flash, lingering smoke, dry impact. Thrown weapons spin through the air.
* A melee weapon with the thrown trait used beyond its reach (thrown dagger, javelin, hatchet) plays as a thrown weapon.
* Names in English and Portuguese map to the new groups (Machado, Adaga, Chicote, Picareta, Alabarda, Escudo, Besta, Funda, Pistola…).
* Studio and attack overrides list all the new looks.

## 0.2.10

* Creature abilities also read older inline rolls (`[[/r 11d6[cold]]]`) and plain text ("11d6 cold damage in a 30-foot cone").

## 0.2.9

* NPC abilities such as Breath Weapon read their element and area from the inline rolls in their text (`@Damage[...[acid]]`, `@Template[line|distance:80]`), so a black dragon breathes acid and a red dragon fire.

## 0.2.8

* Pyre Studio: the Overrides tab opens again (Foundry V14 reserves the `tab` action name).

## 0.2.7

* The real cause of the flat white shapes and the missing trails on macOS: Pyre's layer handed the compositor light with no alpha of its own. The Mac compositor drops that light and shows only the dark backings, in white. The layer now writes valid premultiplied colour, so trails, lightning, glows and sword cuts look the same on every machine.

## 0.2.6

* Fixed effects turning into flat white shapes (sword cuts, fireball puffs, lightning) once Foundry had been open for a while: the shader clock grew too large for the GPU's precision. It now stays small.
* Short throws still fly long enough to be seen (Fireball at least ~0.5 s), and the trail thins with the distance instead of piling up.
* Sword cuts and fire bursts are less white.

## 0.2.5

* Projectile spells (Fireball, Chain Lightning, rays, bolts, darts) gather in the caster's hands first, lighting the floor, then fly; Fireball's trail is longer.
* Area spells always wait for their area to be placed, even with targets. If nobody places it and damage is rolled at targets, the area is aimed at them. Emanations still play at once around the caster.

## 0.2.4

* Spells cast from any source play (sheet, Triad, macros). PF2e 8.4 does not always mark a cast, so any spell card from a spellcasting entry counts as cast.
* Blade strikes no longer wash out to a white blob: thinner steel-tinted cut, softer swing and token flash, rune fire and ground light toned down (two runes share the light), Holy rune more golden.
* Removed the deprecated renderChatMessage hook.

## 0.2.3

* Sword and other blade strikes draw a crescent cut across the target, with a dark backing so it reads on bright maps; the token flash is softer for blades, claws and jaws.
* Spells without a slug, or with translated (Babele) names, are matched by their English name.
* A spell cast without targets plays when its damage is rolled with a target.

## 0.2.2

* The GM sees "Pyre 0.2.2 is active" when the world loads, to confirm which copy is installed.
* Strikes also read the attack roll's own options (item:group, item:base, item:trait), so the weapon is known even if its item cannot be found.

## 0.2.1

* Items are read through PF2e itself (the chat card's item): strikes get their real weapon, spells their cast variant.
* A placed area finds its caster from the chat card first, so Fireball flies from the caster to the area again.
* Debug box shows the weapon's type, group, base weapon and traits.

## 0.2.0

* Fixed: spells with damage never played (PF2e keeps damage kinds as a Set).
* Fixed: spell areas were never detected. PF2e places areas as Regions; all shapes are read now, with the direction you aimed.
* Area spells cast at targets play without placing the area; emanations play around the caster at once.
* NPC attacks are recognised by name; new looks for claws, jaws and tail or wing sweeps. The sword slash lasts a little longer so it reads at table speed.
* Attack overrides in Pyre Studio; on-screen debug box.

## Known limits (0.2.0)

* Effects draw on a transparent layer above the board, so they cannot bend the map underneath: heat haze and the chromatic kick from the labs are not in the module. Light and ground marks are painted on top.
* Effects are drawn above walls and fog of war. Strikes and casts play only when you can see the caster or the target; areas always play.
* Flurry of Blows plays as two separate strikes, one per attack roll.
* Spell areas are read from the Region's first shape; report anything that plays in the wrong spot.
* If an area spell is cast at targets and its area is also placed afterwards, only the first (aimed at the targets) plays.
