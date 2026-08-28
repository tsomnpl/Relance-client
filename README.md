# Relance-client

Application Next.js pour generer des messages de relance de paiement en francais avec RodiumAi, avec quota global partage.

## Lancer en local

1. Installer les dependances:
   - `npm install`
2. Creer `.env.local` avec:
   - `RODIUMAI_API_KEY=...`
   - `KV_REST_API_URL=...` et `KV_REST_API_TOKEN=...` (ou variables Upstash)
3. Demarrer:
   - `npm run dev`

## Variables d'environnement

- `RODIUMAI_API_KEY` (obligatoire en production)
- `RODIUMAI_MODEL` (optionnel, par defaut `openai/gpt-4o-mini`)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
- ou `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)
