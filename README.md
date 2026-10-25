# detour

The best drives near you. Open it on a phone mounted in the car: it follows your location and lists the twisty, scenic, smooth and quiet roads within reach, with live closures and one-tap directions in Apple or Google Maps that drive you along the whole road.

California for now.

## How it works

```
OpenStreetMap ─┐
Caltrans scenic ┤  bun run data   roads.db (every road, every score)
Vista points ───┼──────────────▶  public/roads/<build>/<square>.json
FHWA pavement ──┘                 (listed roads, 0.5° squares)
                                          │
phone location ─▶ nearby squares ─▶ rank ─┴▶ drive times (OSRM) ─▶ list + map
```

- **Twisty**: curvature per mile from OSM geometry (tight curves weigh more), on a fixed scale.
- **Scenic**: Caltrans scenic highway status, closeness to the coast, OSM and Caltrans viewpoints.
- **Smooth**: FHWA HPMS roughness (IRI) where measured, else OSM `smoothness`.
- **Quiet**: HPMS daily traffic where measured, else a guess from road class.
- Live closures come from Caltrans (state highways only), cached for a few minutes by `/api/closures`.

## Commands

- `bun dev` runs the app.
- `bun run data` rebuilds the road data. Inputs are cached per month in `data/.cache/<YYYY-MM>/`; a new month downloads fresh ones.
- `bun run check` runs types, oxlint and oxfmt.

Data © OpenStreetMap contributors (ODbL), Caltrans, FHWA.
