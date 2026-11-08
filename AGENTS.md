# detour

Phone-first web app that ranks nearby drives by twisty, scenic, smooth and quiet. See README.md for the data flow.

- `bun run check` (lint, format, types, `bun test`) before finishing; lefthook and CI run it. Fix what fails; never loosen `oxlint.config.ts`.
- `app/` is the page and `/api/closures`; `lib/` is shared by app and build: the road format (`road.ts`, `geo.ts`), ranking (`rank.ts`, `verdict.ts`, tested in `test/`) and the page's hooks; `data/` is the road build.
- `data/extract.py` (osmium reads the OSM extract) and `data/elevation.py` (numpy decodes terrain tiles) are uv inline scripts because those libraries have no Bun equal; `data/*.ts` calls them.
- Read `node_modules/next/dist/docs/` before using Next APIs. This Next is newer than model memory.
- Versions are pinned exact.
- Road data is built locally (`bun run data`) and committed under `public/roads/<build>/`; the build writes `roads.db` (all roads, listed or not, with OSM way ids) next to its cached inputs.
- Road ids are made from the road's name and its two ends, so they survive rebuilds; anything people add about a road (reports, bumps) is stored with its own location and attached by distance at build time.
