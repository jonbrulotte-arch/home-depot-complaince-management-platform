# Sympl CM: THD Compliance Management Platform

## Design System: "Sympl UI"

This platform MUST match the look, feel and UX patterns of the existing **SymplPM Product Development Platform**. The complete reference is `docs/design-system.md`. The components in `src/components/ui/` and `src/components/layout/` are the canonical implementations. Use them as they are, and extend rather than restyle them.

## Architecture

- **Framework:** Next.js 16 (App Router, Turbopack), React 19, TypeScript
- **Database:** PostgreSQL via Prisma 7 with `@prisma/adapter-pg` (see `src/lib/prisma.ts`)
- **Auth:** NextAuth v5 (credentials provider, bcrypt, JWT). The session carries `id` and `role` (`src/types/next-auth.d.ts`).
- **Styling:** Tailwind CSS v4. There is no tailwind.config; `globals.css` uses `@import "tailwindcss"`.
- **UI primitives:** Radix UI + class-variance-authority + tailwind-merge
- **Icons:** Lucide React (`h-5 w-5 shrink-0` in nav, `h-4 w-4` in buttons)
- **Fonts:** Geist (via `next/font/google`)
- **Excel:** ExcelJS. Use it to parse uploads (with size and column limits), and to write when styling or a template must be preserved.

## Key Conventions

- All pages under `src/app/(app)/` are authenticated and wrapped by AppShell.
- Login is at `src/app/login/page.tsx`: gray-900 background with a centred white card.
- Use `cn()` from `@/lib/utils` for all className merging.
- Primary colour is **blue-600** (buttons, active nav, focus rings).
- Sidebar: **gray-900** background, **blue-600** active item, **gray-300** inactive text. An item is active on an exact match or a child route (`/x` or `/x/…`), never a plain prefix.
- Content area: **gray-50** background; **white** cards with gray-200 borders.
- Text hierarchy: gray-900 headings, gray-700 body, gray-500 secondary, gray-400 placeholder.
- Forms use the Input, Select and Textarea components, not raw HTML elements.
- Dialogs use the provided `DialogContent`.
- Badges use the Badge component's semantic variants (default/secondary/success/warning/destructive/purple/outline).
- Tables: white background, gray-200 borders, gray-50 header row, text-sm, left-aligned.
- Hierarchical data (categories etc.) uses a `parentId` tree with no depth cap. Pickers show full paths via `categoryPaths()`, and moves are checked for cycles on the server.
- API routes check the session and then a permission. Validate and trim request bodies at the route boundary.
- React effects only set state inside async callbacks, never synchronously (the lint rule `react-hooks/set-state-in-effect` is on).

## Domain

- Supplier (JS Products, P-Vendor 875062) compliance with The Home Depot programs: US Drop Ship, US RDC, US DFC, US Transportation, Data Quality Compliance, Invoice Timeliness.
- Data comes from SPM (Supplier Performance Management, supplierhub.homedepot.com) xlsx exports: one file per program, one sheet per metric, an optional "Summary" sheet with THD's own totals. Reference material and the historical archive are in `reference/`.
- **Fiscal months** are `YYYYMM` with month 01 = February (`src/lib/fiscal.ts`). Lines keep the fiscal month from the file; US Drop Ship exports have none and use the report's period.
- **Import pipeline** (`src/lib/import/`): `parse.ts` (ExcelJS → rows) → `transform.ts` (header aliases → canonical fields, classification, line keys; pure and unit-tested) → `persist.ts` (one transaction per file, idempotent by `lineKey`). Map columns by header name through `ColumnAlias`, never by position: THD's headers drift between months. Every source column is kept in `ComplianceLine.raw`.
- Program, metric, threshold/offset rule and dispute reason code defaults live in `src/lib/import/catalog.ts` and are seeded; admins edit them in the database afterwards.
- Imported timestamps are UTC wall-clock values; format them with `formatUtcDate`/`formatUtcDateTime`.
- Permissions are keys in `src/lib/permissions.ts`, stored on `Role.permissions` and re-read per request (`src/lib/auth-guard.ts`).

## Important: Next.js 16

@AGENTS.md

## File Structure

```
src/
  app/
    (app)/          # Authenticated routes (wrapped by AppShell)
      admin/        # Admin pages
      dashboard/    # Landing dashboard
    api/            # Route handlers (export only HTTP methods from route.ts)
    login/          # Public login page
    layout.tsx      # Root layout
    providers.tsx   # SessionProvider
    globals.css     # Tailwind + CSS variables
  components/
    layout/         # AppShell, Sidebar
    ui/             # Shared primitives
  lib/              # auth, auth-guard, prisma, utils, fiscal, permissions, reports
    import/         # SPM export parsing, mapping, persistence
  types/            # next-auth.d.ts
prisma/
  schema.prisma
  seed.ts           # roles, admin user, programs/metrics/rules, column aliases, periods
scripts/
  backfill.ts       # bulk-import a folder of historical SPM exports
tests/              # Vitest unit tests with real SPM export fixtures
```
