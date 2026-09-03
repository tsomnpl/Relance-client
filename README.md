# Relance-client

Application Next.js pour generer des messages de relance de paiement en francais avec RodiumAi, avec quota global partage.

## Lancer en local

1. Installer les dependances:
   - `npm install`
2. Creer `.env.local` avec:
   - `RODIUMAI_API_KEY=...`
   - `RODIUMAI_MODEL=openai/gpt-4o-mini`
   - `RODIUMAI_MAX_TOKENS=220` (optionnel)
   - `RODIUMAI_TIMEOUT_MS=25000` (optionnel)
   - `KV_REST_API_URL=...` et `KV_REST_API_TOKEN=...` (ou variables Upstash)
3. Demarrer:
   - `npm run dev`

## Variables d'environnement

- `RODIUMAI_API_KEY` (obligatoire en production, uniquement cote serveur)
- `RODIUMAI_MODEL` (optionnel, par defaut `openai/gpt-4o-mini`)
- `RODIUMAI_MAX_TOKENS` (optionnel, par defaut `220`, plus bas = moins de cout)
- `RODIUMAI_TIMEOUT_MS` (optionnel, par defaut `25000`)
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
- ou `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash)
