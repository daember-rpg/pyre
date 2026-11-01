# Pyre

Procedural spell, strike and condition effects for Pathfinder 2e on Foundry VTT V13/V14.
Everything is drawn live on the GPU from code (three.js, bundled locally). No video files: the whole module is about 600 KB.

## What plays, and when

| In the game | What Pyre shows |
| --- | --- |
| Spell with an area, when its area is placed on the map (PF2e Regions: burst, cone, line, emanation, cylinder, square) | The area effect where it was placed |
| Spell with an area that is never placed, when damage is rolled at targets | The area aimed at the targets (setting "Areas that are never placed") |
| Spell with an emanation | Plays at once around the caster |
| Spell attack (Ray of Frost, Hydraulic Push…) | Ray → impact, following the attack roll |
| Spell with a save and targets but no area (Electric Arc, Heal…) | Bolt or pulse on each target you had targeted when casting |
| Spell without damage (Haste, Fear, Mystic Armor…) | Tradition circle on the caster, then a blessing, hex or self glow |
| Weapon, unarmed and NPC strikes | A signature per weapon group: sword arc, axe chop with a gash, two dagger stabs, flail lash and crack, hammer shockwave, pick star crack, polearm reap that pulls, spear thrust, shield bash, arrow, crossbow bolt, sling stone, firearm flash and smoke, spinning thrown weapons; plus punch, claws, jaws, tail and bombs. Property runes tint any of them |
| Conditions and spell effects on an actor | Lasting auras (quickened, slowed, frightened, sickened, burning, bleeding, shielded, invisible, blessed, hexed) |
| Creature summoned with Conjure | Summon circle and arrival; dissolve on dismissal |

Effects are worked out from the item's own data (area, defense, damage types, traits, weapon group, runes). Attacks are read in this order: the GM's attack override, the PF2e weapon group, the attack's name in English or Portuguese (Claw/Garra, Jaws/Mandíbulas, Tail/Cauda, Longsword/Espada…), then traits and damage type. Every client plays the same effect from the same seed, without sockets.

## Secret rolls

When an attack roll is blind or whispered, players see a neutral strike: it lands, but shows no hit, miss or critical, and no rune effects.
The GM sees the real result, plus **Replay as Miss / Hit / Critical** buttons on the chat card. Clicking one plays that result for everyone.

## Pyre Studio (GM)

Open it from the fire icon in the token controls, or from Configure Settings → Pyre.

* **Test on the map**: select a token, target others with T, and play any standard effect, strike or cast glow (only on your screen).
* **Overrides**: change one spell's delivery, element, material or colours, or turn its animation off. A very dark core colour switches to shadow rendering. Under **Attacks**, pick how any attack name looks (and add a rune look, such as shock on a "Shadow Claw"). Overrides are stored in the world.

## Settings

Per player: on/off, quality, brightness, glow, screen shake, token reactions, ground marks, casting circle size, condition auras (everyone / only my and allied tokens / off), debug logging.
World: animate spells, animate strikes, animate posted (not cast) spell cards, areas without placing them.

**Debug logging** shows a small box at the bottom left with what Pyre decided for each attack and spell, and why (or why it played nothing). Turn it on when something looks wrong.

## Conjure

With both active, Conjure handles the summoning and Pyre draws it. Conjure 0.4.1 stops its own effect when Pyre is active, and keeps working on its own without Pyre.

## Changes in 0.5.0

* **Breakable walls** (world setting, off by default). After an area's damage roll (spells and creature abilities such as Breath Weapon), the walls the blast reaches take the damage minus their Hardness, using PF2e's structure statistics: wood 10/40, stone 14/56, iron 18/72, glass 2/8, or unbreakable. You confirm which walls break; the rest keep their damage. A broken wall stops blocking movement, sight, light and sound, collapses in splinters or rubble for everyone, and leaves rubble on the floor.
  * Pyre Studio → **Scene**: give selected walls a material, break selected walls by hand, restore every broken wall (and its rubble).
  * Setting **Wall material (default)** for walls without one.
* **Lasting marks** (world setting, off by default): fire, cold, acid, electricity, sonic, force and kinetic areas leave scorch, frost, acid burns or cracks on the map, stopped by walls, until you clear them in Pyre Studio → Scene. Drawn once into the scene, beneath the tokens.
* **Light** has its own aura: a warm pool of lantern light at the creature's feet and a small flame bobbing beside it, instead of the generic blessing.

## Changes in 0.4.1

* Flames, sparks, embers and smoke bounce off walls instead of being cut by them: whatever reaches a wall that blocks movement rebounds with some of its speed and piles up along it. Strike sparks and dust bounce off nearby walls too. Follows the *Walls stop areas* setting.

## Changes in 0.4.0

* Floor effects are drawn beneath the tokens, inside Foundry's own canvas (between tiles and tokens, like Sequencer's "below tokens"): floor light, scorch and frost, gashes and cracks, smoke and dust, casting circles and auras that sit at the feet. Flames, projectiles and lightning stay above. If Foundry's canvas does not accept the layer, everything is drawn above as before. Setting: *Floor effects under tokens* (per computer).
* Walls stop areas: bursts, breaths, columns and fields are clipped to what Foundry says the blast reaches from its origin (walls that block movement; open doors let it through), and creatures behind a wall do not react. Setting: *Walls stop areas* (world).
* Softer leading edge on weapon swings.

## Changes in 0.3.1

* New settings (per computer): **Smoke and dust duration** (how long smoke hangs over tokens and the map) and **Ground mark duration** in seconds (scorch, frost, gashes, cracks).

## Changes in 0.3.0

* Every PF2e weapon group has its own strike:
  * Sword: steel arc. Axe: heavy chop, wood chips and a gash left on the floor. Dagger/knife: two quick, quiet stabs.
  * Flail/whip: a wavering lash and a crack. Hammer/club: a dust shockwave and pebbles. Pick: a puncture and a star crack.
  * Polearm: a long reap from reach that pulls the target in. Spear: a long thrust. Shield: a wave front that shoves.
  * Crossbow: a fast bolt with a snap. Sling: a stone in a short arc. Firearm: muzzle flash, lingering smoke, dry impact. Thrown weapons spin through the air.
* A melee weapon with the thrown trait used beyond its reach (thrown dagger, javelin, hatchet) plays as a thrown weapon.
* Names in English and Portuguese map to the new groups (Machado, Adaga, Chicote, Picareta, Alabarda, Escudo, Besta, Funda, Pistola…).
* Studio and attack overrides list all the new looks.

## Changes in 0.2.10

* Creature abilities also read older inline rolls (`[[/r 11d6[cold]]]`) and plain text ("11d6 cold damage in a 30-foot cone").

## Changes in 0.2.9

* NPC abilities such as Breath Weapon read their element and area from the inline rolls in their text (`@Damage[...[acid]]`, `@Template[line|distance:80]`), so a black dragon breathes acid and a red dragon fire.

## Changes in 0.2.8

* Pyre Studio: the Overrides tab opens again (Foundry V14 reserves the `tab` action name).

## Changes in 0.2.7

* The real cause of the flat white shapes and the missing trails on macOS: Pyre's layer handed the compositor light with no alpha of its own. The Mac compositor drops that light and shows only the dark backings, in white. The layer now writes valid premultiplied colour, so trails, lightning, glows and sword cuts look the same on every machine.

## Changes in 0.2.6

* Fixed effects turning into flat white shapes (sword cuts, fireball puffs, lightning) once Foundry had been open for a while: the shader clock grew too large for the GPU's precision. It now stays small.
* Short throws still fly long enough to be seen (Fireball at least ~0.5 s), and the trail thins with the distance instead of piling up.
* Sword cuts and fire bursts are less white.

## Changes in 0.2.5

* Projectile spells (Fireball, Chain Lightning, rays, bolts, darts) gather in the caster's hands first, lighting the floor, then fly; Fireball's trail is longer.
* Area spells always wait for their area to be placed, even with targets. If nobody places it and damage is rolled at targets, the area is aimed at them. Emanations still play at once around the caster.

## Changes in 0.2.4

* Spells cast from any source play (sheet, Triad, macros). PF2e 8.4 does not always mark a cast, so any spell card from a spellcasting entry counts as cast.
* Blade strikes no longer wash out to a white blob: thinner steel-tinted cut, softer swing and token flash, rune fire and ground light toned down (two runes share the light), Holy rune more golden.
* Removed the deprecated renderChatMessage hook.

## Changes in 0.2.3

* Sword and other blade strikes draw a crescent cut across the target, with a dark backing so it reads on bright maps; the token flash is softer for blades, claws and jaws.
* Spells without a slug, or with translated (Babele) names, are matched by their English name.
* A spell cast without targets plays when its damage is rolled with a target.

## Changes in 0.2.2

* The GM sees "Pyre 0.2.2 is active" when the world loads, to confirm which copy is installed.
* Strikes also read the attack roll's own options (item:group, item:base, item:trait), so the weapon is known even if its item cannot be found.

## Changes in 0.2.1

* Items are read through PF2e itself (the chat card's item): strikes get their real weapon, spells their cast variant.
* A placed area finds its caster from the chat card first, so Fireball flies from the caster to the area again.
* Debug box shows the weapon's type, group, base weapon and traits.

## Changes in 0.2.0

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
