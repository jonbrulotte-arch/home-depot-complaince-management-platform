# Sympl CM: THD Compliance Management Platform

(The default brand. Admins can rename it and add a logo under Admin › Settings.)

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
- **Report periods**: each line also has `receivedMonth` (the report it was imported into, or its archive folder; never before its fiscal month). Reports, the dashboard and scorecards group by one or the other per `SiteSettings.reportPeriodBasis`. Always select lines for a period with `linesInPeriod(await getPeriodField(), month)` from `src/lib/periods.ts`, never `{ fiscalMonth }` directly.
- **Import pipeline** (`src/lib/import/`): `parse.ts` (ExcelJS → rows) → `transform.ts` (header aliases → canonical fields, classification, line keys; pure and unit-tested) → `persist.ts` (one transaction per file, idempotent by `lineKey`). Map columns by header name through `ColumnAlias`, never by position: THD's headers drift between months. Every source column is kept in `ComplianceLine.raw`. A summary-only export (`…_SUM_…`, THD's totals, no PO lines) becomes one PO-less line per metric with offsets (`sourceSheet` = `SUMMARY_SHEET`); detail lines for the same metric and fiscal month replace it. `ComplianceLine.createdBatchId` is the import that created a line (`batchId` is the latest to write it); purging a report's imports (`src/lib/purge.ts`) deletes only lines they created. A report has one import per program per `DataPeriod` (`ImportBatch.period`): FILL_ON_TIME takes the Fill Rate and On Time sheets, OTHER the rest (`periodOfMetric` in `src/lib/shipment-ranges.ts`); the other period's sheets are update-only (`MappedLine.updateOnly`).
- Program, metric, threshold/offset rule and dispute reason code defaults live in `src/lib/import/catalog.ts` and are seeded; admins edit them in the database afterwards.
- Imported timestamps are UTC wall-clock values; format them with `formatUtcDate`/`formatUtcDateTime`.
- **Cancelled / Resolved** (`Disposition.RESOLVED`): a reviewed line that is not a real violation. `getMetricStats` counts it as compliant (shortfall restored, offset not owed post-dispute) and the scorecard leaves it out of violations; the raw `nonCompliant` count still includes it for review progress.
- **US Drop Ship Fill Rate**: THD's Drop Ship Fill Rate sheet lists only cancelled lines, even in ALL_RESULTS exports; the shipped lines are the program's On Time lines. `getMetricStats` computes it as THD defines it, (shipped + non-violation lines) ÷ lines closed, in lines (`dropShipFillRatePct`). A percentage-of-value offset falls away after disputes only when THD's own rate was below the threshold (`pctOffsetFallsAway`); a charge made while THD's rate already met it stands until disputed.
- **Line counts** (`LineCount`, `src/lib/line-counts.ts`): lines per program and compliance period, entered in each import slot on the report page. `getMetricStats(programIds, month, lineCounts)` uses them as the denominator (`enteredLinesPct`) only for metrics whose export gives none (`linesSource` "ENTERED"); the export's own lines win where it lists every line. Pass `getLineCounts(reportId)` wherever stats are built for a report. Data Quality Compliance and Invoice Timeliness (`PASS_FAIL_PROGRAMS`) take no line count: they are 100% unless a violation stands (`passFailPct`), and show no percentage while one does.
- **Chargeback packages** (`ChargebackPackage`, `src/lib/packages.ts`): a Package ID THD gives a program's chargebacks, entered by hand per report, program and compliance period (it is not in the SPM data; editable at any stage, published included). A package covers that slot's lines with an offset (`packageReport`). PO Lookup finds packages by ID prefix and opens `/po-lookup/package/<id>` with an xlsx export (`package-export.ts`), both under `view.polookup`. Validate IDs with `normalizePackageId` (`src/lib/package-id.ts`).
- **Disputes** (`src/lib/disputes.ts`, `src/lib/dispute-sync.ts`): one `Dispute` per non-compliant line, created from a Disputable review when a report enters the Disputes stage. Status moves are limited to `canTransition`. Outcomes are recorded by people; SPM decisions found on import are only flagged (`spmDecisionSeen`).
- **Scorecards** (`src/lib/scorecard.ts` builds, `scorecard-store.ts` saves, `scorecard-export.ts` writes Excel): a `Scorecard` row stores a JSON snapshot so published results never shift. Pages render the snapshot with `ScorecardView`, never live data, except the preview before generation and Scorecard Feedback, which `withFeedback` (`src/lib/feedback.ts`) attaches to the violations when a scorecard is shown or downloaded, so new feedback appears without regenerating.
- **PO records** (`PoRecord`): one per use of a PO number, keyed by `instanceKey` = number + PO create date (`src/lib/po.ts`), because THD reuses PO numbers. Never look a PO record up by `poNumber` alone; lines without a create date join the nearest use (`pickPoInstance`). The PO Record page is `/po/<id>` (`src/lib/po-record.ts`).
- **Sharing and feedback**: published scorecards get a public token (`Scorecard.shareToken`, `src/lib/scorecard-share.ts`; `/s/<token>` and `/api/s/<token>/…` need no sign-in and check the report is still published). `ScorecardFeedback` rows (`src/lib/feedback.ts`) attach to `ScorecardViolation.lineId` in the snapshot. Users land on the first page their role allows (`homePath` in `src/lib/permissions.ts`), so roles without the dashboard (Warehouse, Finance) work. Seeded roles beyond Admin/Analyst/Viewer: Warehouse (feedback) and Finance (read-only PO Lookup, feedback and Summarizer); hide links to pages a role can't open.
- **Dashboards**: the figures live in `src/lib/dashboard.ts` and the cards in `src/components/dashboard/dashboard-sections.tsx`, shared by `/dashboard` and the public dashboard `/d/<token>` (`SiteSettings.publicDashboardToken`, off when null; Admin › Settings turns it on, resets or turns it off). The public page leaves out work in progress (reports under review, lines not yet reviewed), though its offset totals and chart use all imported lines, and links scorecards to their `/s/<token>` pages. Recent reports list published reports only, newest report month first.
- **Summarizer** (`/summarizer`, permission `summarizer.use`): published scorecards picked by the user (`?r=<ids>`) rolled into one summary of their violations by compliance type (`buildSummary`, pure in `src/lib/summarizer.ts`); `loadSummary` (`summarizer-data.ts`) loads it for the page and the PDF export (`/api/summarizer/pdf?r=…`, `summary-pdf.ts`, which has its own layout helpers so the scorecard PDF is untouched). Links go to the public scorecard pages and public dashboard. "Awaiting THD decision" is disputes with status SUBMITTED, read live by line id because a published snapshot keeps the status it had when generated.
- **Copying in the browser**: use `copyText` (`src/lib/clipboard.ts`); the server is reached over plain http, where `navigator.clipboard` doesn't exist.
- **Branding**: never hard-code the site name. Use `getBranding()` (`src/lib/branding.ts`, server) and `BrandMark` for the logo and name; `src/lib/brand.ts` holds the database-free constants. Pages that show branding before sign-in call `connection()` so they render per request.
- **Backups** (`src/lib/backup.ts`) cover the models in `TABLE_ORDER`; add every new model there (a test enforces it).
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
