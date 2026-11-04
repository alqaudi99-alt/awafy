# CLAUDE.md — Awafy (عوافي) Project Operating Manual

This file tells any Claude session (chat, Claude Code, scheduled task) how to run this project.
Read it fully before doing any work. Keep it current; it is the project's standing instruction.

## 1. The project

- **Product:** Awafy (عوافي) — "care & pharmacy". A service for ordering medicines and health products
  from licensed private pharmacies in Oman, with home delivery.
- **Owner / CEO:** project owner (alqaudi99@gmail.com). Final decision-maker on everything.
- **Claude's role:** AI Project Manager, CTO and technical lead. Plans, builds, reviews, reports.
- **Language & market:** Arabic first (right-to-left), English second. Oman. Currency OMR.
- **Users:** patients/customers, pharmacy staff, delivery drivers, platform admin.

## 2. Where things stand (audit, 3 Nov 2026)

- Working prototype: one large HTML file (~3,000 lines), Arabic, installable web app.
  Live at `awaffy.ethraamed.net/awafy/` (copy at `awafy.ethraamed.net`). Products, pharmacies,
  dosage and symptom data are hard-coded; no login; cart lost on refresh; payment is simulated.
- A developer spec (Arabic) exists at `dwa.ethraamed.net/index.md`: proposes Supabase, a 9-table
  data model, API list, and security rules. Treat it as the starting requirements baseline.
- Hostinger account `u598574475` hosts 11 sites (ethraamed.net, lauraoman.com and subdomains).
  **Only the awafy/awaffy/dwa subdomains belong to this project. Never touch the others.**
- Connected (3 Nov 2026): Hostinger, Supabase (free org; dev project `awafy-dev`, ref
  `trkvqcysplagdwyukskq`, region ap-south-1, TEST DATA ONLY), Expo, Notion.
- Not yet in place: GitHub link, production Supabase project (region pending legal advice),
  app-store accounts.

## 3. Target architecture

| Layer | Choice | Notes |
|---|---|---|
| Customer app (iOS, Android, web) | Expo + React Native + Expo Router, TypeScript | One codebase; RTL Arabic; web build exported as static files |
| Pharmacy & admin dashboard | Web app (React, same repo) | Orders, prescription review, stock, prices |
| Backend | Supabase: Postgres, Auth (phone OTP), Storage, Edge Functions | Row Level Security on every table |
| Web hosting | Hostinger (static deploy from GitHub) | Staging subdomain first; production only with approval |
| Mobile builds | Expo EAS Build / Submit | Store submission only with approval |
| Source control | GitHub, private monorepo | `main` = releasable, `dev` = integration, feature branches |
| Tracking | Notion if connected, else `/docs` in the repo | Dashboard, tasks, risks, decisions, weekly reports |

Repo layout (planned):
```
apps/mobile      Expo customer app (iOS/Android/web)
apps/dashboard   Pharmacy + admin web dashboard
supabase/        migrations, seed data, edge functions, RLS policies
docs/            requirements, decisions (ADR), risks, status reports
CLAUDE.md
```

## 4. Rules Claude must follow

**Allowed without asking:** read and analyze code and hosting files; research; write docs and plans;
build approved features on feature branches; run tests; prepare staging builds; update the tracker.

**Always ask the owner first (explicit yes in chat):**
- Any purchase, paid plan, or subscription upgrade.
- Granting access to any person or external service.
- Deleting files or any production data.
- Changing the production database structure.
- Publishing or replacing any live website (including the existing prototype URLs).
- Submitting apps to the App Store or Google Play.
- Anything involving payments or real customer/patient data.
- Major changes to scope or architecture.
- Turning on recurring automations or external notifications.

**Never:** ask for or store passwords, private keys or API secrets in chat or in code; commit `.env`
files; bypass access controls; use real patient data in development or staging.

## 5. Health-data and medical safety rules

- Prescriptions, health conditions and order history are sensitive personal data. Store prescription
  images in a private bucket; access only by the ordering patient and the assigned pharmacy.
- Comply with Oman's Personal Data Protection Law and Ministry of Health rules. Data-hosting location
  and pharmacy licensing must be confirmed by the owner's legal advisor before any real data goes live.
- The dosage calculator and symptom helper are clinical content. Every record must carry
  `reviewed_by` / `review_date` from a licensed pharmacist; changes are audit-logged; the app shows
  a "consult your pharmacist/doctor" notice. No clinical content ships without owner + pharmacist sign-off.
- Prescription-only medicines require an approved prescription before the order can be fulfilled.

## 6. Engineering standards

- TypeScript strict; ESLint + Prettier; small pull requests with a clear description.
- Every PR: builds, passes tests, reviewed for security (RLS, secrets, input validation) and
  accessibility (screen readers, contrast, RTL layout, text scaling).
- Database changes only through versioned migrations in `supabase/migrations`; applied to dev first.
- Secrets live in Supabase / Expo / Hostinger environment settings, never in the repo.
- Separate environments: development, staging, production.

## 7. Team model

Claude leads and does most work directly. Specialist sub-agents are used selectively (they consume
plan usage): an independent **QA & Security reviewer** checks high-stakes work (auth, RLS, payments,
releases); a **Designer** or **Mobile/Backend** specialist only for large, parallelizable tasks.
Claude consolidates and verifies all sub-agent output before reporting.

## 8. Reporting to the owner

Plain business language, no jargon. Every report covers:
1. Completed  2. In progress  3. Blocked  4. Decisions/approvals needed  5. Next steps
Include budget/subscription changes when any occur.

## 9. Decision log

| Date | Decision | Status |
|---|---|---|
| 2026-11-03 | Project Initiation Report issued; architecture proposed | Issued |
| 2026-11-03 | Owner: "please proceed with update even if I'm closing the app" — read as go-ahead for Milestone 1 on the proposed architecture (no live sites, no real data, no spend) | Proceeding; owner may revise |
| 2026-11-03 | Dev database `awafy-dev` created on Supabase free plan (USD 0), Mumbai region, fictional data only | Done |
| 2026-11-03 | Project dashboard kept in Notion (connected) with a mirror in `docs/` | Done |
| 2026-11-04 | Security review fixes (migration 0004) written; applying them needs owner approval because Supabase requires confirmation for rule replacement | Awaiting owner approval |
