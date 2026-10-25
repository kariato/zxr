# Zork II shared skyboxes

Sixteen new built-in ImageGen panoramas complement the three existing barrow, cavern and dragon-lair backgrounds. `manifest.json` accounts for all 86 logical rooms: 80 select one of 19 backgrounds, while four palantir interludes and the aquarium/cage interiors deliberately have no invented surrounding vista. Each assignment includes a reason and source hash.

Open `index.html` for the overview. Serve the repository with `npm run dev`, then open `/games/zork2/assets/skyboxes/viewer.html` for a rotating spherical preview. Drag or use the arrow keys; look-up and look-down buttons inspect the poles. The gallery and viewer are authoring tools, not additions to the published game build.

## Sharing decisions

| Background | Sharing rationale |
| --- | --- |
| Existing barrow | Warm enclosed carved-rock spaces; room-specific dimensions and staircase geometry remain separate. |
| Existing cavern | Limestone cavern, quarry and ravine surroundings; water, bridges, ledges, moss effects and paths remain separate. |
| Existing dragon lair | Scorched rock; dragon-room routes and damaged fresco panels remain separate. |
| Bare stone | Unspecified empty interior surfaces shared by bank, wizard and other dungeon rooms. Signage, shelves, machinery, furniture, lighting, pool, safe and other distinguishing content require separate geometry. This is a neutral background, not a claim that these rooms have identical architecture. |
| Dusty corridor | Plain worn corridor surfaces; turns, cobwebs, debris and openings remain separate. |
| Marble | Marble hall and crypt surroundings; stairs, bas reliefs, door, inscription and heads remain separate. |
| Diamond maze | One identical unmarked texture for all nine rooms; exits do not acquire visual solution clues. |
| Cave garden | Four garden locations share distant hedges and a moss-lit rock roof; topiary, gazebo, rose arbor and paths remain separate. |
| Ancient lava | Glacier hall and lava chamber share cold solidified lava. Ice, rubble and steam remain state-dependent geometry/effects. |
| Lava chimney | Separate tall vertical shaft, without a standing floor or open sky. |
| Volcano floor/lower/middle/upper/rim | Five different heights. Airborne views have no foreground standing platform. Middle-height ledge locations share distant cone surfaces; ledges, hooks, tunnels and balloon remain separate. The rim uses its own open-sky view. |
| Brick well | Damp cylindrical brick surroundings; top/bottom floors, bucket, etchings and entrances remain separate. |
| High/low circular chambers | Separate backgrounds preserve the carousel's high ceiling and magnet room's low ceiling. |
| Enormous room | Separate massive distant shell supports the scale puzzle; wooden posts, roof-like object and chasms remain separate. |

## Files and verification

Each new family contains its selected 1774 × 887 PNG, the exact generation/edit prompt, complete source packets, hashes and built-in generator provenance. Outputs were copied unmodified. The prompts include the complete approved `zork2-style-v1` guide and compact source constraints; the full source packets are retained alongside them. Superseded images and prompts are preserved. Existing backgrounds remain at their original paths under `src/prototype/assets/`.

Visual review removed painted passage mouths from the corridor and cold-lava images and reduced explicit sky/cloud detail in the middle/upper volcano images. Neutral light haze remains at the cone opening. Backgrounds contain no source actors, movable props, puzzle text or secret-door marks.

Run from the repository root:

```sh
out/asset-tools/shape-env/bin/python tools/assets/verify-skyboxes.py
```

`verification.json` records complete room coverage, PNG decoding, 2:1 dimensions, selected-image uniqueness, exact prompt hashes, complete style-guide inclusion, source-packet equality and retained-revision integrity. Edge differences are diagnostic measurements, not a seamlessness certificate. `browser-check.json` records successful loading and view controls for all 19 backgrounds in local desktop Chromium. Review screenshots remain under ignored `out/asset-production/skybox-review/`.

These are draft painted backgrounds. The spherical review shows polar stretching, especially around vertical shafts and the volcano nadir, and some wrap transitions may need further art cleanup before headset adoption. They supply neither geometry nor positional parallax. Foreground floors, collision, exits and observed objects must be authored separately. Baked authoring illumination does not grant light in a dark room. No runtime room mapping or gameplay lighting was changed, and this batch does not certify headset performance or complete room scenes.
