# Arcanorum

## Local development

1. Copy `.env.example` to `.env` and replace both development secrets with unique values of at least 32 characters.
2. Adjust [server_configuration.json](/B:/Arcanorum/server_configuration.json) when you need another port, origin, seed, map size, or generation parameters.
3. Run `npm install` from the repository root.
4. In one terminal, run `npm run dev:server`.
5. In another terminal, run `npm run dev:client`.
6. Open one of the configured origins, normally `http://localhost:5173`.

The development client proxies `/api` to the Fastify server. Production serves `app/client/dist` through Fastify from the same origin after `npm run build`.

## Worlds

`server_configuration.json` is the global server configuration. On first startup, it creates `world/` with `manifest.json`, an immutable `generation.json`, and `world.sqlite`. The database owns accounts, sessions, countries, generated hexes, water bodies, landmasses, and river edges. Changes to the configuration do not alter an existing world; delete the whole `world/` directory to create a new game from the current configuration.

The renderer assets are required WebP atlas files in `app/client/public/assets/world/terrain/`. Regenerate them after changing [generate-terrain-atlas.mjs](/B:/Arcanorum/tools/generate-terrain-atlas.mjs) with `node tools/generate-terrain-atlas.mjs`.

## Commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
