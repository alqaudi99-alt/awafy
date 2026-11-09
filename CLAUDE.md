# CLAUDE.md — Awafy (عوافي) Project Operating Manual

This file tells any Claude session (chat, Claude Code, scheduled task) how to run this project.
Read it fully before doing any work. Keep it current; it is the project's standing instruction.

## 1. The project

- **Product:** Awafy (عوافي) — "care & pharmacy". A service for ordering medicines and health products
  from licensed private pharmacies in Oman, with home delivery.
- **Owner / CEO:** project owner (alqaudi99@gmail.com), sole owner since 9 Nov 2026. Final decision-maker on everything.
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
- GitHub: private repo `alqaudi99-alt/awafy` (connected 4 Nov 2026). New work goes on feature
  branches from `dev`; `main` only receives reviewed, releasable code.
- Not yet in place: production Supabase project (region pending legal advice),
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
  `reviewed_by` / `review_date` from the clinical reviewer; changes are audit-logged; the app shows
  a "consult your pharmacist/doctor" notice. No clinical content ships without the owner's sign-off
  (sole clinical reviewer from 9 Nov 2026; Ahmed is no longer involved).
- Family health records (members, weights, medicines) are visible only to the registered account holder:
  never to pharmacies, drivers or admins. Guests (no account) cannot create them.
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
| 2026-11-04 | Security review fixes (0004) approved by owner ("proceed") and applied to dev; 0005 trigger fix, 0006 stock + drivers; 20/20 access checks passed | Done |
| 2026-11-04 | Phase 1 = order in app, collect and pay at the pharmacy; delivery = Phase 2 | Superseded 7 Nov |
| 2026-11-04 | Dosage, symptom and growth tools in v1; clinical reviewers = owner + colleague Ahmed (role `clinical_reviewer`) | Changed 9 Nov: owner is sole reviewer |
| 2026-11-04 | Prototype calculator errors found (honey per-kg, ibuprofen daily max unit, ondansetron, rounding, "0 tablets"); corrected copy in `prototype/` | Owner approved publishing 7 Nov; owner uploads (this session cannot reach the file server) |
| 2026-11-04 | SMS login via Omantel (developer OTP API) — owner choice | On hold until the Saeed / You Vers partnership is settled (7 Nov) |
| 2026-11-04 | GitHub repo `alqaudi99-alt/awafy` (private) connected; full history pushed to `main`, `dev` branch created | Done |
| 2026-11-07 | **Three ways to receive an order from launch:** collect at pharmacy, normal delivery, urgent delivery (pharmacy-set urgent fee). Migration 0009 `fulfilment_options` | Owner decision; applied to dev 9 Nov (owner approved), 22/22 checks passed |
| 2026-11-07 | Daily status (Sun–Thu 08:13 Muscat) and weekly report (Thu 14:42 Muscat) scheduled tasks, push notifications | Owner approved; running |
| 2026-11-07 | Company contact number = owner's number +968 99022641 (call/WhatsApp in app) until a company line exists | Owner decision |
| 2026-11-07 | Legal/licensing checks done by owner personally; pilot pharmacy later; NDA and partnership contract pending owner's edits; trademark filing after logo is final | Owner decision |
| 2026-11-09 | Ahmed has left the project; owner is the sole owner and sole clinical reviewer | Owner decision |
| 2026-11-09 | Dr Saeed (You Vers) has signed the NDA; business case may be shared with him | Owner |
| 2026-11-09 | **Order without an account** (guest = anonymous sign-in + name/phone, max 2 open orders). Registered users get the family health record: members, weight/length history, medicines, dose worked out from the latest weight (approved records only), reminder when weight is out of date (under 1 yr: 30 days, under 5 yrs: 90, else 180) | Built; migrations 0010–0011 on dev, 21/21 checks passed. Owner to switch on anonymous sign-ins in Supabase |
| 2026-11-09 | Telemedicine / private clinics directory: admin adds and verifies clinics; patients see verified ones under "online doctor consultation". E-prescriptions from clinics = next step | Built (directory); e-prescription pending |
| 2026-11-09 | **Medicines needing the doctor's original stamped prescription** ("restricted"): visible and orderable so the pharmacy prepares them; **collection only**; the pharmacist must record receiving and checking the original before the pickup code hands it over. Admin marks products in the dashboard | Built; migration 0012 on dev, 11/11 checks passed |
| 2026-11-09 | You Vers (Dr Saeed) is approached as a **technology service provider** (paid service contract), **not an equity partner**; Awafy keeps ownership of code, accounts and data. The earlier equity partnership draft is superseded | Owner decision; business case updated |
| 2026-11-09 | You Vers will build the production system on **Omantel cloud** (data inside Oman), starting from this code. Recommended: self-hosted Supabase on Omantel so migrations, access rules and the 54 tests carry over unchanged. Handover doc + source zip (no secrets) given to owner to pass on | Owner decision; handover prepared |
