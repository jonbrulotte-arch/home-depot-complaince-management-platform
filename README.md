# Sympl CM: THD Compliance Management Platform

Monthly compliance analysis for our Home Depot programs. Import the raw SPM exports, review each violation PO line by PO line, decide what can be disputed, and look up any PO's compliance history.

## What's in Phase 1

- **Compliance reports**: create a report for a THD fiscal month, pick the programs, and import each program's SPM export. You see a preview first (lines, violations, offsets, warnings) and nothing is written until you confirm.
- **PO records database**: every line, compliant and non-compliant, from every import. Each line keeps the canonical fields plus every original column.
- **Analysis**: non-compliant lines grouped by program → metric. One line at a time, you record:
  - a decision: accepted, disputable (with the THD dispute reason code and the documents it needs), not disputable, or needs research
  - team influence and root cause
  - notes and extra research inputs

  The workspace also shows the PO's other violations. A report can move to *Disputes* once every line has a decision.
- **PO Lookup**: search by PO (prefix), SKU, tracking #, PRO #, BOL #, TMS shipment ID or ASN doc trace ID.
- **Dashboard**: 12-month pre-dispute offsets by program, and open work.
- **Admin**:
  - Users
  - Roles & Access (role × permission matrix; built-in Admin, Analyst and Viewer roles)
  - Programs & Rules: metrics, threshold/offset rules by effective fiscal month, dispute reason codes, and SPM column mappings

Coming next: the dispute workflow with outcomes, the scorecard (pre/post-dispute) with Excel/PDF export, published scorecards, and backup & restore.

## Setup

Requires Node 20+ and PostgreSQL.

```bash
cp .env.example .env          # set DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npm install                   # also generates the Prisma client
npx prisma migrate deploy     # create the schema
npm run db:seed               # roles, admin user, programs, rules, column mappings, fiscal periods
npm run dev
```

### Load the historical archive

```bash
unzip "reference/Compliance Tool Exports.zip" -d reference/_extracted
npm run backfill -- reference/_extracted            # add --dry-run to preview
```

The backfill imports every `US_*.xlsx` file, oldest first. Each line keeps the fiscal month from its data. Folder names such as `Sep-2024` supply the month for Drop Ship exports, which have none. Files already imported (same SHA-256) are skipped, and other files (PDFs, emails, research sheets) are listed and skipped. On the Aug-2023 → Jun-2026 archive it loads about 9,300 lines across 7,850 POs.

## How imports work

- **Program** comes from the filename prefix (`US_DS`, `US_RDC`, `US_DFC`, `US_TRANS`). **Export kind** comes from `ALL_RESULTS` / `NON_COMPLIANT` in the name.
- **Columns** are matched by header name through the column mappings, because THD's headers change between months (`Offset` / `Offset Amt` / `Offset Amount`, `Fiscal Month` / `Assessed Fscl Prd`, …). New headers can be mapped in Admin › Programs & Rules without a code change.
- **Export quirks the importer handles:**
  - US_TRANS exports where the offset sits under "Department #"
  - notes typed beside the data
  - hand-added subtotal rows
  - the "RESULT DATA EMPTY" placeholder sheets
- **Offsets are checked against THD's Summary sheet.** Any difference is shown as a warning.
- **Re-importing is safe.** A line is identified by metric, fiscal month and its shipment identifiers, so importing the same or a newer export updates lines instead of duplicating them.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```
