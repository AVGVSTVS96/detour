# detour

The best drives near you. Open it on a phone mounted in the car: it follows your location and shows the one best drive within reach, how far, how long and how bumpy along its length, with one big Go that drives you along the whole road in Apple or Google Maps. Swipe for the next best; search a road for its pavement or a town for its best drives. On a road it knows, it shows what the pavement is like ahead.

California for now.

## How it works

```
OpenStreetMap ────────┐
Caltrans scenic, vistas┤
AWS terrain tiles ────┤  bun run data   roads.db (every road, every score)
FHWA HPMS 2018, 2025 ─┼──────────────▶  public/roads/<build>/<square>.json
city/county pavement ─┤                 (listed roads, 0.5° squares)
rider reports ────────┘                           │
                                   bun data/glance.ts (at build)
                                                  ▼
                            public/glance/<build>/<square>.json  (best 40 per square, light lines, towns)
                            public/glance/<build>/search.json    (every road and town, with pavement)
                                                  │
phone location ─▶ nearby squares ─▶ rank ─────────┴▶ drive times (OSRM) ─▶ one answer + sketch
```

A road is one named road (or route number), carried over bridges and tunnels whatever they're named, never turning back onto the other side of a divided road, and cut where it changes character: at long straights, and where it passes between open country and built-up areas. Roads over 37 miles are cut into even parts; roads under a mile are dropped.

- **Twisty**: curvature per mile from OSM geometry (tight curves weigh more), on a fixed scale.
- **Scenic**: Caltrans scenic highway status, the coast, OSM and Caltrans viewpoints, open country (few roads around) and how much the road climbs.
- **Smooth**: every 100 m of road takes the newest measurement there (FHWA roughness, or a city or county pavement survey), unless riders reported on it at least two years later; then OSM's `smoothness` tag. Each source becomes one 0–100 scale: smooth from 70 (IRI under 95, PCI over 70), rough under 35 (IRI over 170, PCI under 50). The app shows where along the road it's smooth, fair or rough.
- **Quiet**: HPMS daily traffic where counted on the road itself, else a guess from road class.
- **Listed**: paved roads of a mile or more that are twisty, scenic, or written about by riders. Roads in built-up areas need riders or strong scenery.
- Live closures come from Caltrans (state highways only), cached for a few minutes by `/api/closures`.

## Data

Inputs are cached per month in `data/.cache/<YYYY-MM>/`; a new month downloads fresh OSM, Caltrans, FHWA, terrain and pavement surveys (`data/surveys.ts` lists each endpoint). Rider reports are local inputs copied into the month's folder: `reports.db` (quotes with sources and dates) and `placed.ndjson` (where each report sits on the map).

## Commands

- `bun dev` runs the app.
- `bun run data` rebuilds the road data (about 5 minutes).
- `bun run check` runs types, oxlint and oxfmt.

Data © OpenStreetMap contributors (ODbL), Caltrans, FHWA, City of Los Angeles, Los Angeles County, MTC, City and County of San Diego, Santa Barbara, Sonoma, San Luis Obispo and Santa Cruz counties, AWS Terrain Tiles. Rider quotes link to their sources.
