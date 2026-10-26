# Sympl CM: THD Compliance Management Platform

Monthly compliance analysis for our Home Depot programs. Import the raw SPM exports, review each violation PO line by PO line, decide what can be disputed, and look up any PO's compliance history.

## What's built

- **Compliance reports**: create a report for a THD fiscal month, pick the programs, and import each program's SPM export. You see a preview first (lines, violations, offsets, warnings) and nothing is written until you confirm.
- **PO records database**: every line, compliant and non-compliant, from every import. Each line keeps the canonical fields plus every original column.
- **Analysis**: non-compliant lines grouped by program → metric. One line at a time, you record:
  - a decision: accepted, disputable (with the THD dispute reason code and the documents it needs), not disputable, cancelled / resolved, or needs research. **Cancelled / Resolved** is for lines that aren't real violations, such as orders the customer cancelled that THD's data still flags: they count as compliant on the scorecard (performance, violations and post-dispute offset) and are left out of its violations list; the pre-dispute offset still shows what THD charged.
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
- **PO Records:** each PO in PO Lookup opens its PO record (`/po/<id>`), with everything known about it: PO details, shipment references, items, every compliance line with all its fields and export columns, where it came from, its review, dispute (with events and attachments) and warehouse feedback, the reports it appears in, and an activity timeline. THD reuses PO numbers, so a record is one use of a number: the number plus its PO create date. Uses of the same number are listed and linked, and lines without a create date join the use nearest their ship or check-in date.
- **Public scorecard link:** each published scorecard has a link (`/s/<token>`, shown with a Copy button on the scorecard page) that anyone can open without signing in, with PDF and Excel downloads. It works for as long as the report is published; unpublishing takes the page down and republishing brings back the same link.
- **Scorecard Feedback:** the warehouse team reviews each violation of a published scorecard and adds context in a comment thread, filtered by program, team or violations still without feedback. The seeded **Warehouse** role has only this module (`feedback.view`, `feedback.submit`); Analysts can read and answer feedback, and each scorecard page links to it with a count. Scorecards published before this existed need regenerating before their violations take feedback. Feedback shows under its violation on the scorecard (internal pages, the public link, the PDF, and a Feedback column in the Excel) as soon as it's added, without regenerating.
- **Two SPM imports per program**, one per compliance period, each with its own status, Import and Purge: **On-Time & Fill Rate** (THD's Fill Rate and On Time, two months behind when grouping by month received) and **All other data**. Programs without Fill Rate or On Time (US Transportation) have only the second. A file's sheets for the other period only update lines already imported and never add new ones, so the same violation can't be counted in two reports.
- **Summarizer:** pick one or more published compliance reports and get a summary of their violations grouped by compliance type (program · metric), with each PO #, its offset and the team responsible, group and overall totals, totals by team, and links to each scorecard (public page) and the public dashboard when it's on. **Export PDF** downloads the summary as a PDF with clickable links. Each report, compliance type, PO and team also shows the amount **awaiting THD's decision**: disputes submitted in SPM and not yet decided, using each dispute's current status (so it stays right after a THD decision is recorded on an already-published scorecard). Admins, Analysts and Finance have it (`summarizer.use`); give it to other roles in Roles & Access.
- **Purge data** on each import slot in a report (Draft or In Review): deletes that period's imports for the program and the lines they created, with their reviews, so the data can be imported again. Lines that were already in the database and were only updated by those imports are kept (`ComplianceLine.createdBatchId` records which import created each line).
- **Line counts** on each report: every import slot (On-Time & Fill Rate, All other data) has a **Lines** box for the number of lines in that program's period. It is used to calculate compliance for metrics whose SPM export lists only violations (ASN, TMS, Routing Guide and the like), which otherwise show no percentage; the slot says which metrics it's used for, and the metrics table marks percentages "from lines entered". Where the export lists every line (Fill Rate, On Time), the export's own count is used. Editable until the scorecard is published.
- **Shipment counts** on each report: Small Parcel and LTL & TL shipments per program for each of the two compliance periods (On-Time & Fill Rate, and All other data), which together make the totals on the scorecard's shipment table. Drop Ship's suggestion fills the On-Time & Fill Rate period, since it comes from the On Time data. Counts entered before periods were collected became All other data. Drop Ship is suggested from THD's Parcel flag. RDC/DFC are entered from TMS/WMS, because SPM exports don't carry the mode. Transportation's LTL total is RDC + DFC LTL. Each report also records the two date ranges the counts cover: **On-Time & Fill Rate**, which THD reports two months behind, and **All other data**. A helper fills the first from the second minus two months. Both ranges show on the scorecard, PDF and Excel.
- **Backup & Restore** (Admin): one-click backups of all data, including attachments, saved on the server (`BACKUP_DIR`, default `./backups`). You can download them or restore from a stored or uploaded file. A restore replaces everything in one transaction, takes a safety backup first, and requires the same schema version. Scheduled backups: `npm run backup -- --keep 30` from cron. Disaster recovery: `npm run restore -- <file> --yes`.
- **Custom Branding** (Admin › Settings): a site name and logo that replace "Sympl CM" in the sidebar, on the sign-in page, in the browser tab and on exported scorecards. When it is off, the default branding is used.
- **Finance role:** read-only access to PO Lookup (with PO records), Scorecard Feedback (reads comments, cannot add them) and the Summarizer, including its PDF export. Links to pages the role can't open (reports, internal scorecards, dispute attachments) are hidden; scorecards open through their public pages.
- **PO Lookup**: search by PO (prefix), SKU, tracking #, PRO #, BOL #, TMS shipment ID or ASN doc trace ID.
- **Dashboard**: 12-month pre-dispute offsets by program, and open work. A chart shows the 12-month total for every month since the data begins (not only the last year), with columns for how much it rose or fell from the month before; months in the first year, with less than 12 months of data behind them, are shaded. Hover or use the arrow keys for each month's figures, or switch to the table.
  Recent reports lists published reports only, the most recent report month at the top.
- **Public dashboard** (Admin › Settings › Public dashboard, off by default): a sign-in-free copy of the dashboard at `/d/<token>` with the 12-month offsets, the chart, the latest scorecard and every published scorecard, each linking to its public scorecard page. Internal work in progress (reports under review, lines not yet reviewed) is left out. *New link* replaces the address (the old one stops working) and *Turn off* takes the page down.
- **Admin**:
  - Users
  - Roles & Access (role × permission matrix; built-in Admin, Analyst, Viewer, Warehouse and Finance roles)
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
npm run backfill -- reference/exports               # exports added after the archive zip
npm run historical-reports -- --dry-run             # then without --dry-run
```

Reports group lines by the **month the data was received** by default: the report it was imported into, or the archive folder it came from. This matches the monthly workbooks; Fill Rate is assessed about eight weeks after arrival, so it lands in a later report. Admin › Settings › Report periods can switch to THD's fiscal month instead. After changing it, rebuild the historical reports (`npm run historical-reports -- --rebuild`, or the Rebuild option in the Historical reports dialog).

`historical-reports` turns each archived month that has no report into a published, auto-reviewed report with a scorecard. Admins can also do this from the **Historical reports** button on the Compliance Reports page.
- **Violations** are accepted as THD reported them.
- **Dispute results** come from THD's exports: per-line Approve/Deny values, and otherwise THD's Summary post-dispute totals, marked "per THD".
- **Drop Ship shipment counts** come from THD's Parcel flag.
- **Which months:** everything up to two months ago; the current and previous month are left for the normal workflow; use `--from`/`--to` (fiscal months) to choose another range. Months that already have a report are skipped.

The backfill imports every `US_*.xlsx` file, oldest first. Each line keeps the fiscal month from its data. Folder names such as `Sep-2024` supply the month for Drop Ship exports, which have none. Files already imported (same SHA-256) are skipped, and other files (PDFs, emails, research sheets) are listed and skipped. On the Aug-2023 → Jun-2026 archive it loads about 9,300 lines across 7,850 POs.

### Updating a server

From the app folder on the server (the one with `.env`):

```bash
./scripts/deploy.sh
```

It backs up the database (`backups/…-pre-deploy.json.gz`, newest 10 kept), pulls the checked-out branch, runs `npm ci`, applies migrations, builds, restarts the `thd-compliance` service and waits for the site on port 8014. If the build or the restart fails, it puts the previous code back and restarts that; migrations are not undone, but the pre-deploy backup can be restored from Admin › Backup & Restore. It stops without changing anything if files on the server were edited.

Options: `--branch <name>` switches branch (e.g. `main` once merged), `--force` rebuilds with no new commits, `--skip-backup`, `--no-restart`. `SERVICE_NAME`, `PORT` and `BACKUP_KEEP` override the defaults.

`reference/exports/` holds SPM exports received after the archive zip, in the same `YYYY/Mon-YYYY/` folders (e.g. the May 2026 DFC summary, which supplies the $1,000 Missing ASN missing from the archive).

## How imports work

- **Program** comes from the filename prefix (`US_DS`, `US_RDC`, `US_DFC`, `US_TRANS`). **Export kind** comes from `ALL_RESULTS` / `NON_COMPLIANT` in the name.
- **Columns** are matched by header name through the column mappings, because THD's headers change between months (`Offset` / `Offset Amt` / `Offset Amount`, `Fiscal Month` / `Assessed Fscl Prd`, …). New headers can be mapped in Admin › Programs & Rules without a code change.
- **Export quirks the importer handles:**
  - US_TRANS exports where the offset sits under "Department #"
  - notes typed beside the data
  - hand-added subtotal rows
  - the "RESULT DATA EMPTY" placeholder sheets
  - Fill Rate given as a percent (older exports, `100`) or a fraction (newer, `1`); lines are judged by ordered vs received quantity whenever the export has it
  - US Drop Ship's Fill Rate sheet lists only cancelled lines, even in ALL_RESULTS exports, so the Fill Rate is calculated as THD defines it: (lines shipped, from the On Time sheet, + cancellations that aren't violations) ÷ lines closed. A percentage offset THD charged while its own rate already met the goal stays owed until it is disputed.
  - Invoice Timeliness (`US_INVOICE_TIMELINESS_RECORDS_…`, one "All LOC" sheet): THD lists POs whose goods were received but not invoiced, so every row is a violation (no offset). Weeks on report, location type, goods receipt and the first/latest report dates are kept as fields.
  - summary-only downloads (`…_SUM_…`): THD's totals with no PO lines. Each metric with offsets becomes one line without a PO, and the detail export for the same month replaces it.
- **Offsets are checked against THD's Summary sheet.** Any difference is shown as a warning.
- **Re-importing is safe.** A line is identified by metric, fiscal month and its shipment identifiers, so importing the same or a newer export updates lines instead of duplicating them.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```
