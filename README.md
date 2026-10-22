# Sympl CM: THD Compliance Management Platform

Monthly compliance analysis for our Home Depot programs. Import the raw SPM exports, review each violation PO line by PO line, decide what can be disputed, and look up any PO's compliance history.

## What's built

- **Compliance reports**: create a report for a THD fiscal month, pick the programs, and import each program's SPM export. You see a preview first (lines, violations, offsets, warnings) and nothing is written until you confirm.
- **PO records database**: every line, compliant and non-compliant, from every import. Each line keeps the canonical fields plus every original column.
- **Analysis**: non-compliant lines grouped by program → metric. One line at a time, you record:
  - a decision: accepted, disputable (with the THD dispute reason code and the documents it needs), not disputable, or needs research
  - team influence and root cause
  - notes and extra research inputs

  The workspace also shows the PO's other violations. A report can move to *Disputes* once every line has a decision.
- **Disputes** (Phase 2): moving a report to *Disputes* creates a dispute for every line marked Disputable. Each dispute is a guided checklist:
  1. Confirm the reason code and gather documents. The checklist is built from THD's required documents, with file attachments up to 10 MB each.
  2. Submit in SPM, using a copy-ready comment and the dispute-window deadline.
  3. Record THD's decision: approved, partially approved or denied, with the review code and $ recovered.

  Every dispute has a timeline of notes and status changes. The period's dispute window defaults to THD's rule (opens 2nd Wednesday, closes 2nd Tuesday of the following month) and is editable. Later SPM exports carrying an Approve/Deny value are flagged on the matching dispute. Reports show post-dispute performance and offsets; a %-of-value offset falls away when the recalculated metric meets its goal. The **Disputes** page lists every dispute across reports by deadline.
- **Scorecards** (Phase 3): once every dispute is submitted or withdrawn, the report generates a scorecard, a frozen snapshot that holds:
  - each program's metrics against goal, pre- and post-dispute, with offsets
  - recovered, pending and denied totals
  - the violation list with dispute outcomes
  - offsets by team influence and a 12-month trend

  You can regenerate it while in the Scorecard stage, for example after recording THD decisions. Then publish it, or unpublish to reopen it. Download it as a PDF or as Excel (Scorecard, Violations, 12-Month Offsets and Team Influence sheets). Published scorecards are on the **Scorecards** page and the dashboard, and the Viewer role can see them.
- **Shipment counts** on each report: Small Parcel and LTL & TL shipments per program, for the scorecard's shipment table. Drop Ship is suggested from THD's Parcel flag. RDC/DFC are entered from TMS/WMS, because SPM exports don't carry the mode. Transportation's LTL total is RDC + DFC LTL.
- **Backup & Restore** (Admin): one-click backups of all data, including attachments, saved on the server (`BACKUP_DIR`, default `./backups`). You can download them or restore from a stored or uploaded file. A restore replaces everything in one transaction, takes a safety backup first, and requires the same schema version. Scheduled backups: `npm run backup -- --keep 30` from cron. Disaster recovery: `npm run restore -- <file> --yes`.
- **Custom Branding** (Admin › Settings): a site name and logo that replace "Sympl CM" in the sidebar, on the sign-in page, in the browser tab and on exported scorecards. When it is off, the default branding is used.
- **PO Lookup**: search by PO (prefix), SKU, tracking #, PRO #, BOL #, TMS shipment ID or ASN doc trace ID.
- **Dashboard**: 12-month pre-dispute offsets by program, and open work.
- **Admin**:
  - Users
  - Roles & Access (role × permission matrix; built-in Admin, Analyst and Viewer roles)
  - Programs & Rules: metrics, threshold/offset rules by effective fiscal month, dispute reason codes, and SPM column mappings



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
npm run historical-reports -- --dry-run             # then without --dry-run
```

`historical-reports` turns each archived month that has no report into a published, auto-reviewed report with a scorecard. Admins can also do this from the **Historical reports** button on the Compliance Reports page.
- **Violations** are accepted as THD reported them.
- **Dispute results** come from THD's exports: per-line Approve/Deny values, and otherwise THD's Summary post-dispute totals, marked "per THD".
- **Drop Ship shipment counts** come from THD's Parcel flag.
- **Which months:** the newest two are left for the normal workflow; use `--from`/`--to` (fiscal months) to choose another range. Months that already have a report are skipped.

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
