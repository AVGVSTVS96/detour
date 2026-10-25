# detour

Phone-first web app that ranks nearby drives by twisty, scenic, smooth and quiet. See README.md for the data flow.

- `bun run check` before finishing; lefthook runs it on every commit. Fix what fails; never loosen `oxlint.config.ts`.
- Read `node_modules/next/dist/docs/` before using Next APIs. This Next is newer than model memory.
- Versions are pinned exact.
- Road data is built locally (`bun run data`) and committed under `public/roads/<build>/`; the build writes `roads.db` (all roads, listed or not, with OSM way ids) next to its cached inputs.
- Road ids are made from the road's name and its two ends, so they survive rebuilds; anything people add about a road (reports, bumps) is stored with its own location and attached by distance at build time.
