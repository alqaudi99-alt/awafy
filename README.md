# Awafy (عوافي)

Medicine ordering and home delivery from licensed private pharmacies in Oman.
Project rules and status for anyone (or any Claude session) working here: **CLAUDE.md**.

| Folder | What it is |
|---|---|
| `apps/mobile` | Customer app — iPhone, Android and web from one Expo codebase (Arabic first, RTL) |
| `apps/dashboard` | Pharmacy and admin web dashboard (React + Vite) |
| `supabase/migrations` | Database structure, access rules, order functions (applied in order) |
| `supabase/seed.sql` | Development test data generated from the prototype (`scripts/build-seed.mjs`) |
| `supabase/tests` | Access-rule test script (always rolls back) |
| `docs/` | Requirements, status, roadmap, risks, decisions |

## Run locally
```bash
cd apps/mobile && cp .env.example .env.local   # fill with the DEV project URL + publishable key
npm install && npx expo start                    # press w for web, or scan with Expo Go
cd apps/dashboard && cp .env.example .env.local && npm install && npm run dev
```

## Environments
- **Development:** Supabase project `awafy-dev` (fictional data only).
- **Staging / Production:** not created yet — production region needs legal confirmation first.

Never commit secret or service keys. Publishable keys are fine in `.env.local` (git-ignored).
