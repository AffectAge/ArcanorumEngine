# Arcanorum

## Local development

1. Adjust [server_configuration.json](/B:/Arcanorum/server_configuration.json) when you need another port, origin, seed, map size, or generation parameters.
2. Run `npm install` from the repository root.
3. Run `npm run dev`. On its first run it creates an ignored `.env` with random development-only secrets; copy `.env.example` instead if you need to provide values manually.
4. Open the `http://<LAN-IP>:5173` address printed by the command on any device connected to the same Wi-Fi network. If Windows Firewall asks, allow access on private networks.
5. Stop the development runtime with `Ctrl+C` in its terminal or `npm run dev:stop` from another terminal.

The development client proxies `/api` to the Fastify server. Production serves `app/client/dist` through Fastify from the same origin after `npm run build`.

## Development runtime policy

For interactive game work, keep both the client and server running in LAN-accessible development mode when it is safe and feasible. Use `npm run dev` for the shared runtime and leave it running while implementing or reviewing playable changes; report clearly when validation, a port conflict, a missing environment configuration, or a requested shutdown prevents that. Use `npm run dev:stop` only to stop the runtime created by this launcher.

## Worlds

`server_configuration.json` is the global server configuration. On first startup, it creates `world/` with `manifest.json`, an immutable `generation.json`, and `world.sqlite`. The database owns accounts, sessions, countries, generated hexes, water bodies, landmasses, and river edges. Changes to the configuration do not alter an existing world; delete the whole `world/` directory to create a new game from the current configuration.

The renderer assets are required WebP atlas files in `app/client/public/assets/world/terrain/`. Regenerate them after changing [generate-terrain-atlas.mjs](/B:/Arcanorum/tools/generate-terrain-atlas.mjs) with `node tools/generate-terrain-atlas.mjs`.

## Commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run dev` — launch the server and client together for local and LAN play.
- `npm run dev:stop` — stop that shared development runtime.
