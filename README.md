# Unified Business Management Platform

NASCON '26 Web Dev Hackathon project: a multi-tenant lead-management/CRM
platform whose centerpiece is a race-safe, restart-safe lead escalation
engine — every inbound lead has exactly one accountable owner at all times,
with automatic escalation if ignored. See `problem statement.pdf` for the
full spec.

## Stack

- **API**: NestJS, PostgreSQL + Prisma, Redis + BullMQ, Socket.IO — `apps/api`
- **Web**: React + Vite + TypeScript, TanStack Query, Tailwind — `apps/web`
- **Shared**: permission model, glossary, and DTO contracts — `packages/shared`

## Getting started

```bash
pnpm install
docker compose up -d            # Postgres (5433) + Redis (6380)

cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed   # demo workspace "Acme Solar"

pnpm dev:api    # http://localhost:4000
pnpm dev:web    # http://localhost:5180
```

Demo login (password `password123` for all): `owner@acmesolar.test`,
`admin@acmesolar.test`, `manager@acmesolar.test`, `sam@acmesolar.test`
(Available), `priya@acmesolar.test` (Offline).

## Status

Core (accounts/roles/permissions + the lead lifecycle engine) is built and
verified end-to-end. Customizable CRM, the mandatory third-party
integrations (Twilio WhatsApp, Stripe, Google Calendar, email
notifications), and the operational dashboard are next.
