# Arcanorum

## Local development

1. Copy `.env.example` to `.env` and replace both development secrets with unique values of at least 32 characters.
2. Run `npm install` from the repository root.
3. In one terminal, run `npm run dev:server`.
4. In another terminal, run `npm run dev:client`.
5. Open `http://localhost:5173`.

The development client proxies `/api` to the Fastify server. Production serves `app/client/dist` through Fastify from the same origin after `npm run build`.

## Commands

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
