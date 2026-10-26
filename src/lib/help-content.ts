import type { Permission } from "@/lib/permissions";

// Help & Docs content (/help). Plain data so the page can filter topics by role and search them;
// **text** in a string is shown bold. Keep it in step with the app when a screen changes.

export type HelpBlock =
  | { h: string }
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { terms: [string, string][] }
  | { note: string };

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  /** Shown to roles with any of these permissions; every signed-in user when absent */
  anyOf?: Permission[];
  blocks: HelpBlock[];
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "What the platform does, who can see what, and how months work.",
    blocks: [
      {
        p: "This platform replaces the monthly THD compliance workbook. Each month you import The Home Depot's SPM exports, review every violation, dispute the ones THD got wrong, and publish a scorecard. Everything you import stays searchable by PO afterwards.",
      },
      { h: "Where things are" },
      {
        list: [
          "**Dashboard**: offsets over the last 12 months, the rolling 12-month total and the latest scorecard.",
          "**Scorecards**: every published scorecard.",
          "**Compliance Reports**: one report per month, where the work happens (import, review, disputes, scorecard).",
          "**Disputes**: every dispute across reports, by deadline.",
          "**PO Lookup**: any PO, SKU, tracking #, PRO #, BOL #, TMS shipment ID, ASN doc trace ID or chargeback Package ID.",
          "**Scorecard Feedback**: the warehouse team's comments on each violation of a published scorecard.",
          "**Summarizer**: one summary of several published reports, exported as a PDF.",
          "**Help & Docs**: this page.",
        ],
      },
      { p: "The menu only shows what your role allows, and you start on the first page your role can open. If something you need is missing, ask an administrator to change your role under Admin › Roles & Access." },
      { h: "Roles" },
      {
        terms: [
          ["Admin", "Everything, including users, roles, programs and rules, settings and backups."],
          ["Analyst", "Creates reports, imports data, reviews violations, works disputes, publishes scorecards, reads and answers feedback, and uses the Summarizer."],
          ["Viewer", "The dashboard, published scorecards and PO Lookup, read-only."],
          ["Warehouse", "Scorecard Feedback only: reads published violations and adds comments."],
          ["Finance", "PO Lookup (including chargeback packages), Scorecard Feedback without commenting, and the Summarizer, all read-only."],
        ],
      },
      { h: "Months" },
      {
        p: "THD's fiscal year starts in February, so fiscal month **202605** is June 2026. Reports and screens show the calendar month name. Each line keeps THD's fiscal month and also the month it was received (the report it was imported into). By default reports group lines by **month received**, which matches the monthly workbooks; an administrator can switch to THD's fiscal month under Admin › Settings › Report periods.",
      },
      {
        p: "THD reports Fill Rate and On Time about two months behind everything else, so each report has two **compliance periods**: **On-Time & Fill Rate** (THD's data from two months earlier) and **All other data** (ASN, TMS, Routing Guide and the rest).",
      },
    ],
  },
  {
    id: "monthly-workflow",
    title: "The monthly workflow",
    summary: "The five stages of a compliance report, start to finish.",
    anyOf: ["reports.view"],
    blocks: [
      { p: "Every compliance report moves through five stages, shown across the top of the report. The button at the top right moves it on; the button beside it moves it back a step." },
      {
        steps: [
          "**Import data** (Draft): create the report, import each program's SPM exports, and enter line counts, Package IDs and shipment counts. Then **Start review**.",
          "**Review violations** (In Review): give every non-compliant line a decision. When none is left undecided, click **Ready for disputes**.",
          "**Disputes**: a dispute is created for every line marked Disputable. Prepare and submit each in SPM. Once every dispute is submitted or withdrawn, click **Generate scorecard**.",
          "**Scorecard**: check the scorecard, record THD's decisions as they arrive and **Regenerate** it, then **Publish scorecard**.",
          "**Published**: the scorecard is frozen, shared through its public link, and opens for warehouse feedback.",
        ],
      },
      { note: "Going back is always possible: **Back to import**, **Reopen review**, **Back to disputes** and **Unpublish**. Unpublishing takes the public link down until you publish again (the link stays the same)." },
    ],
  },
  {
    id: "importing",
    title: "Creating a report and importing SPM exports",
    summary: "New reports, the two import slots, purging, line counts, Package IDs and shipment counts.",
    anyOf: ["reports.create", "reports.import"],
    blocks: [
      { h: "Create the report" },
      { steps: ["Open **Compliance Reports** and click **New compliance report**.", "Pick the compliance period (the month) and the programs to include.", "Click **Create report**."] },
      { h: "Import the exports" },
      {
        p: "Each program has one import box per compliance period. **On-Time & Fill Rate** takes the Fill Rate and On Time sheets; **All other data** takes the rest. Programs without Fill Rate or On Time (US Transportation, Data Quality, Invoice Timeliness) only have the second box. Each box says which THD month to download.",
      },
      {
        steps: [
          "Download the program's export from SPM (supplierhub.homedepot.com), for the month the box shows. In SPM you can choose just Fill Rate & On Time for the first box.",
          "Click **Import SPM export** in the matching box and choose the file.",
          "Check the preview: lines, violations and offsets per sheet, plus any warnings. Nothing is saved yet.",
          "Confirm to import. Importing the same or a newer file again updates lines instead of duplicating them.",
        ],
      },
      {
        list: [
          "Sheets for the other compliance period are marked **Other period: only updates lines already imported**. They refresh lines (so THD's decisions still arrive) but never add new ones, so a violation can't count in two reports.",
          "THD's column names change from month to month. Columns are matched by name, and an administrator can add a new name under Admin › Programs & Rules › Column mappings without a code change. Unknown columns are still kept with the line.",
          "Summary-only downloads (file names with **_SUM_**) carry THD's totals but no PO lines. Each metric with offsets becomes one line without a PO, replaced when the detailed export arrives.",
        ],
      },
      { h: "Purge data" },
      {
        p: "If you imported the wrong file, **Purge data** on that box (Draft or In Review) shows what will be removed, then deletes that period's imports for the program and the lines they created, with their reviews and disputes. Lines that already existed before that import are kept.",
      },
      { h: "Lines" },
      {
        p: "Some exports list only violations, so a compliance percentage can't be worked out from the file. Enter the number of lines for that program and period in the box's **Lines** field; the box says which metrics it's used for. Where the export lists every line (Fill Rate and On Time), the export's own count is used and the box says it isn't needed. Data Quality Compliance and Invoice Timeliness have no Lines field: they are 100% unless a violation stands.",
      },
      { h: "Package ID" },
      {
        p: "Enter the **Package ID** THD gives this program's chargebacks for the period (letters and digits; it isn't in the SPM data). You can add or change it at any stage, after publishing too, since it usually arrives with THD's remittance. Finance uses it in PO Lookup to find every PO in the package.",
      },
      { h: "Shipment counts" },
      {
        p: "The **Shipment counts** card collects Small Parcel and LTL & TL shipments for each program in both compliance periods, and the date range each period covers. SPM exports don't carry the mode for RDC and DFC, so enter those from TMS/WMS; Drop Ship's On-Time & Fill Rate counts are suggested from THD's Parcel flag (**Use**). A helper fills the On-Time & Fill Rate dates from the All other data dates, two months earlier. Both periods together make the scorecard's shipment totals.",
      },
    ],
  },
  {
    id: "reviewing",
    title: "Reviewing violations",
    summary: "Decisions, team influence, root cause and notes for every non-compliant line.",
    anyOf: ["lines.triage", "reports.view"],
    blocks: [
      {
        p: "Click **Review lines** on the report. Violations are grouped by program and metric on the left; each line shows every field THD sent, the PO's other violations, and the dispute reason codes that apply with the documents each needs.",
      },
      {
        steps: [
          "Choose a **Decision**.",
          "Set the **Team influence** (Warehouse Site 0 or Site 3, Customer Service, EDI, Ecomm, Carrier, THD and so on).",
          "Add the **Root cause**, **Notes** and any extra research fields.",
          "For a Disputable line, pick the **Dispute reason code**.",
          "Click **Save & next**.",
        ],
      },
      {
        terms: [
          ["Accepted", "A real violation you won't dispute."],
          ["Disputable", "THD is wrong and you can prove it: a dispute is created when the report moves to Disputes."],
          ["Not disputable", "Possibly wrong, but no dispute is possible."],
          ["Cancelled / Resolved", "Not a real violation (for example a Drop Ship order the customer cancelled that THD still flags). It counts as compliant on the scorecard and is left out of its violations; the pre-dispute offset still shows what THD charged."],
          ["Needs research", "Not decided yet. The report can't move to Disputes while any line is undecided or needs research."],
        ],
      },
    ],
  },
  {
    id: "disputes",
    title: "Disputes",
    summary: "Preparing, submitting and recording THD's decision for each dispute.",
    anyOf: ["disputes.manage", "reports.view"],
    blocks: [
      {
        p: "Moving a report to Disputes creates one dispute for every Disputable line. Open them from the report's **Disputes** step or from the **Disputes** page, which lists every dispute across reports by deadline.",
      },
      {
        steps: [
          "**To prepare**: confirm the reason code, work through the document checklist built from THD's dispute matrix, and attach files (up to 10 MB each). The review's decision, team, root cause, notes and research are shown under **From the violation review**.",
          "**Submit in SPM**: copy the ready-made comment into SPM before the **SPM dispute window** closes (THD's rule by default: opens the 2nd Wednesday, closes the 2nd Tuesday of the following month; editable), then mark it submitted.",
          "**Decided**: record THD's decision (approved, partially approved or denied), the review code and the amount recovered.",
        ],
      },
      {
        list: [
          "Every dispute keeps a timeline of notes and status changes.",
          "When a later SPM export carries an Approve/Deny value for a disputed line, the dispute is flagged; the decision is still recorded by a person.",
          "If you change a review after disputes were created, **Sync from review** adds or withdraws disputes to match.",
        ],
      },
    ],
  },
  {
    id: "scorecards",
    title: "Scorecards and how results are calculated",
    summary: "Generating, publishing and sharing the scorecard, and the maths behind it.",
    anyOf: ["reports.view", "view.dashboard"],
    blocks: [
      {
        p: "A scorecard is a frozen snapshot: once generated, its figures don't move when data changes, until you **Regenerate** it (Scorecard stage only). It shows each program's metrics against goal before and after disputes, offsets, recovered, pending and denied amounts, the violations, offsets by team influence and a 12-month trend. Download it as **PDF** or **Excel**.",
      },
      { h: "Sharing" },
      {
        p: "Each published scorecard has a **Public link** (Copy button on the scorecard page) that opens without signing in, with PDF and Excel downloads. Warehouse feedback appears under each violation, on the internal and public pages and in the downloads, as soon as it's added.",
      },
      { h: "How results are calculated" },
      {
        list: [
          "**Compliance %** = compliant lines ÷ all lines. Cancelled / Resolved lines and approved disputes count as compliant after disputes.",
          "**Fill Rate** (RDC, DFC) is measured in units: units received ÷ units ordered.",
          "**US Drop Ship Fill Rate** follows THD's definition: (lines shipped + cancellations that aren't violations) ÷ lines closed. THD's Fill Rate sheet lists only the cancellations; the shipped lines come from the On Time sheet.",
          "Where the export lists only violations, the **Lines** you entered are used: (lines − violations) ÷ lines, marked “from lines entered”.",
          "**Data Quality Compliance** and **Invoice Timeliness** are pass/fail: 100% unless a violation stands.",
          "When there's no percentage at all, the result is **Below goal** if a violation (or, for percentage-based offsets, an offset) still stands, otherwise no result is shown.",
          "**Offsets**: flat offsets are a fixed amount per violation; Fill Rate and On Time offsets are a percentage of value. A percentage-based offset falls away after disputes when THD's own rate was below goal and your disputes or resolutions lift it to goal. If THD charged one while its own rate already met goal, it stays owed until you dispute it.",
        ],
      },
      { note: "Changed something after publishing? Unpublish, regenerate, then publish again. The public link stays the same." },
    ],
  },
  {
    id: "feedback",
    title: "Scorecard Feedback",
    summary: "The warehouse team's comments on each violation.",
    anyOf: ["feedback.view"],
    blocks: [
      {
        p: "**Scorecard Feedback** lists each published scorecard with how many violations already have feedback. Open one to see every violation with its site, offset, team, dispute status, and the compliance team's root cause and notes.",
      },
      {
        list: [
          "Filter by program, team, or only violations still without feedback.",
          "Type in the box under a violation and click **Add feedback** (roles that can give feedback). You can delete your own comments.",
          "Click a PO number to open its PO record (roles with PO Lookup).",
          "New feedback shows on the scorecard straight away, with no regenerating.",
        ],
      },
      { note: "Scorecards published before this module existed need regenerating once before their violations take feedback." },
    ],
  },
  {
    id: "summarizer",
    title: "Summarizer",
    summary: "One summary of several published reports, as a PDF.",
    anyOf: ["summarizer.use"],
    blocks: [
      {
        steps: [
          "Open **Summarizer** and tick the published reports to include (newest month first).",
          "Click **Build summary**.",
          "Review the summary, then click **Export PDF**.",
        ],
      },
      {
        p: "The summary shows totals (violations, offsets, recovered, post-dispute offsets and the amount **awaiting THD decision**), each report with links to its scorecard, the violations grouped by compliance type with PO #, offset and team responsible, and totals by team. “Awaiting THD decision” is the amount on disputes submitted in SPM and not yet decided, using each dispute's current status. The address keeps your selection, so you can bookmark or share a summary.",
      },
    ],
  },
  {
    id: "po-lookup",
    title: "PO Lookup, PO records and chargeback packages",
    summary: "Finding any PO, reading its full record, and matching THD's chargeback packages.",
    anyOf: ["view.polookup"],
    blocks: [
      {
        p: "Search by PO number (the start of a number is enough), SKU, tracking #, PRO #, BOL #, TMS shipment ID or ASN doc trace ID. Results are grouped by PO with every line, compliant or not.",
      },
      { h: "PO records" },
      {
        p: "Click a PO to open its **PO record**: PO details, shipment references, items, every compliance line with all its fields and THD's original columns, its review, dispute and warehouse feedback, the reports it appears in, and an activity timeline. THD reuses PO numbers, so a record is one use of a number (the number plus its PO create date); a search showing **Reused PO number** has one card per use.",
      },
      { h: "Chargeback packages" },
      {
        steps: [
          "Find the Package ID in the invoice column of THD's remittance.",
          "Type it into PO Lookup (the start is enough; capitals don't matter).",
          "Click the package under **Chargeback packages**.",
          "The package page lists every PO and chargeback in it, with offset, decision, team, dispute, amount recovered and net chargeback, and totals.",
          "Click **Export to Excel** for a spreadsheet with one row per chargeback line.",
        ],
      },
      { note: "A package only appears once someone has entered its Package ID on the compliance report." },
    ],
  },
  {
    id: "dashboards",
    title: "Dashboards",
    summary: "The internal dashboard, the rolling 12-month chart and the public dashboard.",
    anyOf: ["view.dashboard"],
    blocks: [
      {
        list: [
          "**12-month offsets by program**, and the latest month's violations.",
          "**Rolling 12-month total**: the 12-month offset total for every month since the data begins, with a column chart of how much it rose (red) or fell (blue) from the month before. The first year, with less than 12 months behind it, is shaded. Hover or use the arrow keys for each month's figures, or click **Show table**.",
          "**Recent reports**: published reports, the most recent month first.",
          "The **latest scorecard**.",
        ],
      },
      {
        p: "An administrator can turn on a **public dashboard** (Admin › Settings › Public dashboard): a link anyone on the network can open without signing in, with the same figures and every published scorecard. Work in progress isn't shown. **New link** replaces the address; **Turn off** takes it down.",
      },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    summary: "Users, roles, programs and rules, settings, backups, View Analytics, the App Log and historical reports.",
    anyOf: ["admin.users", "admin.rbac", "admin.programs", "admin.settings", "admin.backup", "admin.analytics", "admin.audit"],
    blocks: [
      {
        terms: [
          ["Users", "**Add user** with a temporary password, change roles, **Set password**, and **Deactivate** or **Reactivate** accounts."],
          ["Roles & Access", "A grid of roles and permissions. The built-in Admin role always has everything; add roles for other teams as needed."],
          ["Programs & Rules", "Each program's metrics, goals and offset rules (with the fiscal month they take effect, so past months keep their rules), dispute reason codes with required documents, the SPM sheet names, and **Column mappings** from THD's column names to the platform's fields."],
          ["Settings", "**Custom Branding** (site name and logo), **Report periods** (month received or THD fiscal month) and the **Public dashboard**."],
          ["Backup & Restore", "**Back up now** saves everything, attachments included, on the server; download any backup, or restore one (type RESTORE to confirm; a safety backup is taken first)."],
          ["View Analytics", "Hits on each published scorecard, in the app and through its public link: **Hits** (views plus PDF and Excel downloads), **Unique sessions** (a session is one browser's visit and ends after 30 minutes without activity), **Signed-in users**, and **Public-link hits**. Open a scorecard for hits per day, the signed-in users who opened it, and the latest hits. Choose the period at the top right."],
          ["App Log", "Every event in the platform, newest first: sign-ins, **failed sign-ins** (with the email typed and the reason), report work, imports, reviews, disputes, scorecards, feedback, exports, and changes to users, roles, configuration and backups. Filter by search text, user, category and dates; **Show all** opens an event's full details; **Export CSV** downloads what the filters show."],
        ],
      },
      { h: "Historical reports" },
      {
        p: "On **Compliance Reports**, **Historical reports** turns each archived month without a report into a published, auto-reviewed report: violations accepted as THD reported them, and dispute results from THD's own data. Its **Rebuild** option regroups them after changing the report period setting or the calculations.",
      },
      { h: "Updating the server" },
      {
        p: "From the app folder on the server run **./scripts/deploy.sh**. It backs up the database, pulls the latest code, installs, applies database changes, builds, restarts the service and checks the site, and puts the previous version back if the build or restart fails.",
      },
    ],
  },
  {
    id: "faq",
    title: "Questions and troubleshooting",
    summary: "Common surprises and what to do about them.",
    blocks: [
      { h: "A metric shows “—” instead of a percentage" },
      { p: "The export lists only violations, so there's no total to divide by. Enter the program's **Lines** for that compliance period on the report." },
      { h: "My change doesn't show on the scorecard" },
      { p: "Scorecards are snapshots. Regenerate it in the Scorecard stage, or Unpublish, regenerate and publish again. Warehouse feedback is the exception: it shows straight away." },
      { h: "The import says some sheets only update existing lines" },
      { p: "Those sheets belong to the report's other compliance period. Import them in that period's box (or in the report for that month) to add their lines." },
      { h: "A Copy button doesn't copy" },
      { p: "Some browsers block copying on internal (http) addresses. Select the text in the box and press Ctrl+C instead." },
      { h: "I can't see a page someone else uses" },
      { p: "Your role doesn't include it. An administrator can change your role under Admin › Users, or what the role can do under Admin › Roles & Access." },
    ],
  },
  {
    id: "glossary",
    title: "Glossary",
    summary: "The terms used across the platform.",
    blocks: [
      {
        terms: [
          ["SPM", "THD's Supplier Performance Management, on supplierhub.homedepot.com, where the compliance exports come from."],
          ["Program", "A THD compliance program: US Drop Ship, US RDC, US DFC, US Transportation, Data Quality Compliance, Invoice Timeliness."],
          ["Metric", "One measure within a program, such as Fill Rate, On Time, Missing ASN or Routing Guide. Each has a goal and an offset rule."],
          ["Offset", "The amount THD charges for a violation (a chargeback): a flat amount, or a percentage of the goods' value."],
          ["Pre-dispute / post-dispute", "Before and after disputes and Cancelled / Resolved decisions are applied."],
          ["Fiscal month", "THD's month, YYYYMM, with month 01 = February."],
          ["Month received", "The report a line was imported into; the default way reports group lines."],
          ["Compliance period", "On-Time & Fill Rate (two months behind) or All other data."],
          ["Package ID", "THD's reference for a batch of chargebacks, shown on the remittance and entered on the report."],
          ["PO record", "One use of a PO number (number plus PO create date), since THD reuses numbers."],
          ["Scorecard snapshot", "The frozen copy of a report's results that published scorecards show."],
        ],
      },
    ],
  },
];

/** Topics a role can see; `all` shows every topic */
export function helpTopicsFor(permissions: Set<Permission>, all = false): HelpTopic[] {
  return HELP_TOPICS.filter((t) => all || !t.anyOf || t.anyOf.some((p) => permissions.has(p)));
}

/** Everything a topic says, for searching */
export function helpText(topic: HelpTopic): string {
  const parts: string[] = [topic.title, topic.summary];
  for (const b of topic.blocks) {
    if ("h" in b) parts.push(b.h);
    else if ("p" in b) parts.push(b.p);
    else if ("note" in b) parts.push(b.note);
    else if ("steps" in b) parts.push(...b.steps);
    else if ("list" in b) parts.push(...b.list);
    else parts.push(...b.terms.flat());
  }
  return parts.join(" ").replace(/\*\*/g, "").toLowerCase();
}
