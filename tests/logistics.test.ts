import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectKind, localDateOf, parseCsv, parseHtmlTable, parseTmsTime, parseWmsTime, splitPos } from "@/lib/logistics/parse";
import { readLogisticsFile } from "@/lib/logistics/read";
import { carrierUrl, cartonRefs, cleanTrackingUrl } from "@/lib/logistics/refs";
import { buildLogistics, cancellationApplies, editDistance, filterPos, logisticsOverview, poDate, rangeBounds, rangeLabel, type IssueCancellation, type Shipment } from "@/lib/logistics/views";

const fixture = (n: string) => readLogisticsFile(new Uint8Array(readFileSync(`tests/fixtures/logistics/${n}`)));

async function sample() {
  const [w, s, p] = await Promise.all([fixture("WMS_Line_Data.xlsx"), fixture("Shipments.csv"), fixture("Purchase_Orders.csv")]);
  if (w.kind !== "WMS" || s.kind !== "TMS_SHIPMENTS" || p.kind !== "TMS_POS") throw new Error("wrong kinds");
  const shipments: Shipment[] = s.parsed.rows.map((r) => ({
    ...r,
    pickupAt: r.pickup?.at ?? null,
    pickupLocal: r.pickup?.local ?? null,
    deliveryAt: r.delivery?.at ?? null,
    deliveryLocal: r.delivery?.local ?? null,
  }));
  return { w, s, p, views: buildLogistics({ cartons: w.parsed.rows, shipments, pos: p.parsed.rows, parcels: [] }, "2026-11-14") };
}

describe("logistics files", () => {
  it("parses CSV with quoted lists, HTML tables and recognises each file by its headers", () => {
    expect(parseCsv('a,b,c\n1,"x, y",""""\r\n\n')).toEqual([["a", "b", "c"], ["1", "x, y", '"']]);
    expect(parseHtmlTable("<html><table><tr><th>A&amp;B</th><th>C</th></tr><tr><td>1</td><td><b>2</b></td></tr></table>")).toEqual([["A&B", "C"], ["1", "2"]]);
    expect(detectKind([["ORDER_NUM", "TrackingNumber", "CustomerPONumber", "GS128"]])?.kind).toBe("WMS");
    expect(detectKind([["Shipment", "Status", "Assigned Carrier", "Purchase Orders"]])?.kind).toBe("TMS_SHIPMENTS");
    expect(detectKind([["Purchase Order", "Status", "Destination Facility"]])?.kind).toBe("TMS_POS");
    expect(detectKind([["a", "b", "c"]])).toBeNull();
    expect(splitPos("1181331860, 1181351361,1181331860")).toEqual(["1181331860", "1181351361"]);
  });

  it("reads TMS times with their zone and WMS wall-clock times", () => {
    const t = parseTmsTime("9/28/26 21:00", "PDT")!;
    expect(t.at.toISOString()).toBe("2026-09-29T04:00:00.000Z");
    expect(t).toMatchObject({ local: "9/28/26 21:00 PDT", date: "2026-09-28" });
    expect(parseTmsTime("11/3/2026 7:05 PM", "EST")!.at.toISOString()).toBe("2026-11-04T00:05:00.000Z");
    expect(parseTmsTime("13/3/26", "EST")).toBeNull();
    expect(localDateOf("11/9/26 00:01 EST")).toBe("2026-11-09");
    expect(parseWmsTime("2026-11-12 06:24:00")!.toISOString()).toBe("2026-11-12T06:24:00.000Z");
  });

  it("tells TMS shipment IDs, UPS numbers, PROs and mistyped TMS IDs apart", () => {
    expect(cartonRefs("233480675", "233480675")).toEqual({ tms: "233480675", ups: null, pro: null, suspectTms: null });
    expect(cartonRefs("1Z9X0F560308403761", "SHP3435982")).toMatchObject({ ups: "1Z9X0F560308403761", tms: null });
    expect(cartonRefs("411492822706", "233480666")).toMatchObject({ tms: "233480666", pro: "411492822706" });
    expect(cartonRefs("23307363", "23307363")).toMatchObject({ suspectTms: "23307363", tms: null });
  });

  it("links a SCAC to its tracking page, filling in what is known", () => {
    const link = { scac: "FXFE", name: "FedEx Freight", mode: "LTL", trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={pro}" };
    expect(carrierUrl("FXFE", link, { pro: "123" })).toEqual({ url: "https://www.fedex.com/fedextrack/?trknbr=123", known: true });
    expect(carrierUrl("FXFE", link, {})).toEqual({ url: "https://www.fedex.com/fedextrack/", known: true });
    // No tracking page set: no link (never a web search)
    expect(carrierUrl("ZZZZ", null, {})).toEqual({ url: null, known: false });
    expect(carrierUrl("KNIG", { scac: "KNIG", name: "Knight", mode: "TL", trackingUrl: null }, {})).toEqual({ url: null, known: true });
    expect(cleanTrackingUrl("javascript:alert(1)")).toBeNull();
    expect(cleanTrackingUrl(" https://x.example/track?p={pro} ")).toBe("https://x.example/track?p={pro}");
    expect(editDistance("HAGGESTOWN", "HAGERSTOWN")).toBe(2);
    expect(editDistance("PERRIS", "DALLAS")).toBeGreaterThan(2);
  });
});

describe("logistics views of the sample files", () => {
  it("reads all three files without skipping rows", async () => {
    const { w, s, p } = await sample();
    expect([w.parsed.rows.length, s.parsed.rows.length, p.parsed.rows.length]).toEqual([356, 107, 162]);
    expect([w.parsed.skipped, s.parsed.skipped, p.parsed.skipped]).toEqual([[], [], []]);
    const shipment = s.parsed.rows.find((r) => r.shipmentNumber === "233241793")!;
    expect(shipment.poNumbers).toEqual(["1181331860", "1181351361", "1181356263"]);
  });

  it("flags what needs looking at", async () => {
    const { views } = await sample();
    const po = (n: string) => views.pos.find((p) => p.poNumber === n)!;
    const codes = (n: string) => po(n).flags.map((f) => f.code);
    // TMS ID problems are flagged at crossdocks (XD05) too
    expect(po("1191142969").flags.find((f) => f.code === "SUSPECT_TMS_ID")!.severity).toBe("high");
    expect(codes("1191142969")).toContain("CROSSDOCK");
    // Crossdock shipments: check the destination in PlanEx (a warning until delivered)
    expect(po("1191515251").flags.find((f) => f.code === "CHECK_PLANEX")!.severity).toBe("high");
    expect(po("1191142969").flags.find((f) => f.code === "CHECK_PLANEX")!.severity).toBe("info");
    // WMS cartons carry 233565631; TMS has the PO on 233586508, to XD05
    expect(po("1191515251").flags.find((f) => f.code === "TMS_ID_MISMATCH")!.severity).toBe("high");
    expect(po("1191515251").flags.filter((f) => f.code === "CROSSDOCK")).toHaveLength(1);
    expect(po("1191515251").flags.find((f) => f.code === "CROSSDOCK")!.severity).toBe("info");
    expect(codes("1191515132")).toContain("MULTIPLE_SHIPMENTS");
    expect(codes("1191515057")).toContain("PICKUP_PASSED");
    expect(codes("1193766084")).toContain("DELIVERY_OVERDUE");
    expect(codes("1193307282")).toContain("CITY_SPELLING");
    expect(codes("1193307282")).not.toContain("WRONG_DESTINATION");
    expect(codes("1178880969")).toContain("ORIGIN_MISMATCH");
    expect(codes("1191078978")).toContain("DATES_REVERSED");
    // A mixed carton is one carton with a line per product
    expect(new Set(po("1193305572").cartons.map((c) => c.lineKey))).toHaveProperty("size", po("1193305572").cartons.length);
    expect(po("1193305572").cartonCount).toBeLessThan(po("1193305572").cartons.length);
    expect(po("1184673169").status).toBe("Canceled");
    expect(po("1178880969").status).toBe("Delivered");
    // Other suppliers' POs on shared trucks aren't listed as this supplier's POs
    expect(views.pos.some((p) => p.poNumber === "1195611355")).toBe(false);
    expect(views.shipments.find((s) => s.shipmentNumber === "233593184")).toMatchObject({ ourPos: ["1195586897"], otherPos: ["1195611355"] });
    // TMS ID mismatch: the WMS has these POs' cartons under 233565631, TMS has the POs on 233586508.
    // The shipment shows them, matched by PO
    const mismatched = views.shipments.find((s) => s.shipmentNumber === "233586508")!;
    expect(mismatched.cartons.length).toBeGreaterThan(0);
    expect(new Set(mismatched.cartons.map((c) => c.trackingNumber))).toEqual(new Set(["233565631"]));
    expect(mismatched.cartonCount).toBe(po("1191515201").cartonCount + po("1191515216").cartonCount + po("1191515251").cartonCount + po("1191515253").cartonCount + po("1191515309").cartonCount + po("1191515344").cartonCount + po("1191515376").cartonCount + po("1191515391").cartonCount);
    // RG shipments whose POs went out with UPS numbers are UPS (UPSN); TMS's RG is kept
    const rgUps = views.shipments.find((s) => s.shipmentNumber === "233530043")!;
    expect(rgUps).toMatchObject({ scac: "UPSN", tmsScac: "RG" });
    expect(rgUps.ups).toEqual(["1Z9X0F560308361762"]);
    expect(rgUps.cartonCount).toBeGreaterThan(0);
    expect(po("1191138116").shipments[0].scac).toBe("UPSN");
    // An RG shipment with a PRO, not UPS numbers, stays RG
    expect(views.shipments.find((s) => s.shipmentNumber === "233480666")).toMatchObject({ scac: "RG" });
    expect(views.shipments.find((s) => s.shipmentNumber === "233480666")!.tmsScac).toBeUndefined();
    expect(filterPos(views.pos, { scac: "UPSN" }).map((p) => p.poNumber)).toContain("1191138116");
    // Cartons whose TMS ID is another shipment that lists their PO stay with that shipment
    const elsewhere = views.shipments.find((s) => s.shipmentNumber === "233564346")!;
    expect(elsewhere.cartons.every((c) => c.trackingNumber === "233564346")).toBe(true);
    expect(views.shipments.find((s) => s.shipmentNumber === "233523374")!.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["NO_CARRIER", "DELIVERY_OVERDUE"]));
    const o = logisticsOverview(views);
    expect(o.pos).toBe(171);
    expect(o.carriers[0]).toMatchObject({ scac: "EXLA", shipments: 53 });
    expect(filterPos(views.pos, { q: "233584383" }).map((p) => p.poNumber)).toEqual(["1191515132"]);
    expect(filterPos(views.pos, { flag: "SUSPECT_TMS_ID" })).toHaveLength(1);
    expect(filterPos(views.pos, { flag: "SUSPECT_TMS_ID", severity: "high" })).toHaveLength(1);
    expect(filterPos(views.pos, { flag: "SUSPECT_TMS_ID", severity: "info" })).toHaveLength(0);
    expect(o.flags.find((f) => f.code === "SUSPECT_TMS_ID")).toMatchObject({ severity: "high", pos: 1 });
    expect(filterPos(views.pos, { flag: "CHECK_PLANEX", severity: "high" }).length).toBeGreaterThan(0);
  });
});

describe("TMS IDs and crossdocks", () => {
  const ship = (n: string, dest: string, pos: string[]): Shipment => ({
    shipmentNumber: n, status: "Accepted", scac: "EXLA", pickupAt: null, pickupLocal: "11/20/26 00:01 EST", deliveryAt: null, deliveryLocal: "11/24/26 00:00 EST",
    originFacility: "875062OH001", originCity: "GROVEPORT", originState: "OH", destFacility: dest, destCity: "X", destState: "OH", poNumbers: pos, appointment: null, tmsFlags: [],
  });
  const carton = (po: string, tracking: string) => ({ label: `L-${po}-${tracking}`, poNumber: po, orderNum: "O", customer: null, trackingNumber: tracking, secondTrack: tracking, product: "1", quantity: 1, shippedAt: new Date("2026-11-19T10:00:00Z"), shipCity: null, shipState: null, shipZip: null });
  it("flags mismatched and malformed TMS IDs at crossdocks (XD…) too, and warns to check PlanEx", () => {
    const v = buildLogistics(
      {
        cartons: [carton("100", "233000001"), carton("200", "233000002"), carton("300", "23300000")],
        shipments: [ship("233000009", "5823", ["100"]), ship("233000008", "XD05", ["200", "300"])],
        pos: [],
        parcels: [],
      },
      "2026-11-19",
    );
    const codes = (po: string) => v.pos.find((p) => p.poNumber === po)!.flags.map((f) => [f.code, f.severity].join(":"));
    expect(codes("100")).toContain("TMS_ID_MISMATCH:high");
    expect(codes("200")).toContain("CROSSDOCK:info");
    expect(codes("200")).toContain("TMS_ID_MISMATCH:high");
    expect(codes("300")).toContain("SUSPECT_TMS_ID:high");
    expect(codes("300")).toContain("CHECK_PLANEX:high");
    expect(codes("100").some((c) => c.startsWith("CHECK_PLANEX"))).toBe(false);
    expect(v.shipments.find((s) => s.shipmentNumber === "233000008")!.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["CROSSDOCK", "CHECK_PLANEX"]));
  });
});

describe("POs on shared trucks", () => {
  it("counts a shipment's PO as ours only when the rest of the data has it", () => {
    const ship: Shipment = {
      shipmentNumber: "233000100", status: "Delivered", scac: "HJCS", pickupAt: null, pickupLocal: "11/3/26 07:00 EST", deliveryAt: null, deliveryLocal: "11/3/26 14:50 EST",
      originFacility: "28874OH001", originCity: "CAMBRIDGE", originState: "OH", destFacility: "XD05", destCity: "MONROE", destState: "OH",
      poNumbers: ["1190000001", "1190000002", "1190000003", "1190000004"], appointment: null, tmsFlags: [],
    };
    const v = buildLogistics(
      {
        cartons: [],
        shipments: [ship],
        pos: [{ poNumber: "1190000001", status: "Created", originFacility: null, originCity: null, originState: null, destFacility: null, destCity: null, destState: null, appointment: null, tmsFlags: [] }],
        parcels: [],
        // In THD's compliance data (with leading zeros) and in the Issue Log
        knownPos: ["001190000002", "1190000003"],
      },
      "2026-11-19",
    );
    expect(v.shipments[0]).toMatchObject({ ourPos: ["1190000001", "1190000002", "1190000003"], otherPos: ["1190000004"] });
    expect(v.pos.map((p) => p.poNumber).sort()).toEqual(["1190000001", "1190000002", "1190000003"]);
  });
});

describe("PO order", () => {
  it("lists POs newest first by number, with the create date from THD's data when known", async () => {
    const { byPoNumberDesc } = await import("@/lib/logistics/views");
    expect(["1176595372", "1191515132", "001141585118", "1124000000"].map((poNumber) => ({ poNumber })).sort(byPoNumberDesc).map((p) => p.poNumber)).toEqual(["1191515132", "1176595372", "001141585118", "1124000000"]);
    const v = buildLogistics({ cartons: [], shipments: [], parcels: [], pos: ["1176595372", "1191515132"].map((poNumber) => ({ poNumber, status: "Created", originFacility: null, originCity: null, originState: null, destFacility: null, destCity: null, destState: null, appointment: null, tmsFlags: [] })), poCreated: { "1191515132": "2026-11-04" } }, "2026-11-16");
    expect(v.pos.map((p) => [p.poNumber, p.createdAt?.toISOString().slice(0, 10) ?? null])).toEqual([["1191515132", "2026-11-04"], ["1176595372", null]]);
  });
});

describe("Send Email", () => {
  it("drafts the email from the selection and the issue types ticked", async () => {
    const { ediDraft, parseAddresses, poLine, shipmentLine, suggestedTypes } = await import("@/lib/logistics/edi");
    const { views } = await sample();
    const po = views.pos.find((p) => p.poNumber === "1191515251")!;
    const line = poLine(po);
    expect(line).toContain("PO 1191515251");
    expect(line).toContain("TMS 233586508 (LOAA)");
    expect(line).toContain("WMS has TMS ID 233565631");
    expect(line).toContain("TMS ID mismatch");
    expect(suggestedTypes(po.flags.map((f) => f.code))).toEqual(["tms-id", "planex"]);
    const d = ediDraft({ kind: "po", lines: [line], poNumbers: ["1191515251"], types: ["tms-id", "planex"], sender: "Jon Brulotte", fileName: "r.pdf" });
    expect(d.subject).toBe("Action needed: 1 PO (Correct the TMS shipment ID; Confirm the destination in Vendor PlanEx)");
    expect(d.body).toContain("- Correct the TMS shipment ID on the ASN and labels");
    expect(d.body).toContain(`- ${line}`);
    expect(d.body).toContain("The attached report (r.pdf)");
    expect(d.body.endsWith("Thanks,\nJon Brulotte")).toBe(true);
    expect(d.body.startsWith("Hi,\n")).toBe(true);
    const greet = (team: string) => ediDraft({ kind: "po", lines: [line], poNumbers: [], types: [], sender: "J", fileName: "r.pdf", team }).body.split("\n")[0];
    expect(greet("Ohio Shipping")).toBe("Hi Ohio Shipping team,");
    expect(greet("EDI Team")).toBe("Hi EDI Team,");
    const ship = views.shipments.find((s) => s.shipmentNumber === "233480604")!;
    expect(shipmentLine(ship)).toContain("POs 1191139146");
    expect(ediDraft({ kind: "shipment", lines: [shipmentLine(ship)], poNumbers: ship.ourPos, types: [], sender: "J", fileName: "r.pdf" }).body).toContain(`PO numbers: ${ship.ourPos.join(", ")}`);
    expect(parseAddresses("a@b.com; c@d.org,  A@b.com")).toEqual(["a@b.com", "c@d.org"]);
    expect(parseAddresses("")).toEqual([]);
    expect(parseAddresses("not an address")).toBeNull();
  });

  it("keeps the message's layout in the email's HTML (Outlook ignores pre-wrap)", async () => {
    const { textToHtml } = await import("@/lib/logistics/edi");
    const html = textToHtml("Hi <team> & co,\n\nPlease act.\n\nWhat's needed:\n- Fix the ID\n- Resend the ASN\n\nThanks,\nJon");
    expect(html).not.toContain("pre-wrap");
    expect(html).toContain(">Hi &lt;team&gt; &amp; co,</p>");
    expect(html).toContain(">What&#39;s needed:</p><ul");
    expect(html).toContain('<li style="margin:0 0 4px 0">Fix the ID</li><li style="margin:0 0 4px 0">Resend the ASN</li></ul>');
    expect(html).toContain(">Thanks,<br>Jon</p>");
    expect(textToHtml("  indented")).toContain("&nbsp;&nbsp;indented");
  });

  it("checks team addresses and adds typed ones to a team's", async () => {
    const { parseTeamAddresses } = await import("@/lib/team-options");
    const { mergeAddresses } = await import("@/lib/email-address");
    expect(parseTeamAddresses({ emailTo: "a@x.com, b@x.com", emailCc: "b@x.com; c@x.com" })).toEqual({ emailTo: ["a@x.com", "b@x.com"], emailCc: ["c@x.com"] });
    expect(parseTeamAddresses({ emailTo: "", emailCc: undefined })).toEqual({ emailTo: [], emailCc: undefined });
    expect(parseTeamAddresses({ emailTo: "a@x" })).toEqual({ error: "Check the To addresses (separate them with commas)" });
    expect(mergeAddresses(["a@x.com"], ["A@x.com", "d@x.com"])).toEqual(["a@x.com", "d@x.com"]);
  });

  it("writes the report of the selection as a PDF", async () => {
    const { logisticsReportPdf } = await import("@/lib/logistics/report-pdf");
    const { views } = await sample();
    const pos = views.pos.filter((p) => ["1191515251", "1191142969"].includes(p.poNumber));
    const pdf = await logisticsReportPdf({ kind: "po", pos, shipments: [], by: "Jon", timeZone: "America/New_York" });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const ships = await logisticsReportPdf({ kind: "shipment", pos: [], shipments: views.shipments.slice(0, 3), by: "Jon", timeZone: "America/New_York" });
    expect(ships.length).toBeGreaterThan(1000);
  });
});

describe("UPS tracking answers", () => {
  it("keeps the status, delivery and last activity", async () => {
    const { parseUpsTrack } = await import("@/lib/logistics/ups-parse");
    const delivered = parseUpsTrack({
      trackResponse: {
        shipment: [
          {
            package: [
              {
                currentStatus: { description: "Delivered", code: "011" },
                deliveryDate: [{ type: "DEL", date: "20261105" }],
                deliveryTime: { type: "DEL", endTime: "134500" },
                activity: [{ date: "20261105", time: "134500", status: { type: "D", description: "DELIVERED", code: "FS" }, location: { address: { city: "JOLIET", stateProvince: "IL", country: "US" } } }],
              },
            ],
          },
        ],
      },
    });
    expect(delivered).toMatchObject({ delivered: true, status: "Delivered", statusType: "D", lastLocation: "JOLIET, IL, US", error: null });
    expect(delivered.deliveredAt!.toISOString()).toBe("2026-11-05T13:45:00.000Z");
    const moving = parseUpsTrack({ trackResponse: { shipment: [{ package: [{ currentStatus: { description: "In Transit" }, deliveryDate: [{ type: "SDD", date: "20261118" }], activity: [{ date: "20261114", status: { type: "I", description: "Departed from Facility" } }] }] }] } });
    expect(moving).toMatchObject({ delivered: false, statusType: "I", lastActivity: "Departed from Facility" });
    expect(moving.expectedAt!.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(parseUpsTrack({ trackResponse: { shipment: [{ warnings: [{ message: "Tracking Information Not Found" }] }] } }).error).toBe("Tracking Information Not Found");
  });
});

describe("POs canceled through the Issue Log", () => {
  it("marks a PO canceled when a resolved Order cancellation issue has it, and drops its open-shipment timing flags", async () => {
    const { w, s, p, views } = await sample();
    const late = views.pos.find((x) => x.status !== "Canceled" && x.flags.some((f) => ["PICKUP_PASSED", "DELIVERY_OVERDUE"].includes(f.code)))!;
    expect(late).toBeTruthy();
    const shipments = s.parsed.rows.map((r) => ({ ...r, pickupAt: r.pickup?.at ?? null, pickupLocal: r.pickup?.local ?? null, deliveryAt: r.delivery?.at ?? null, deliveryLocal: r.delivery?.local ?? null }));
    const build = (canceledByIssue: IssueCancellation[], poCreated?: Record<string, string>) =>
      buildLogistics({ cartons: w.parsed.rows, shipments, pos: p.parsed.rows, parcels: [], canceledByIssue, poCreated }, "2026-11-14");
    const cancel = { poNumber: `00${late.poNumber}`, issueNumber: 12, issueDate: "2026-11-10", poCreateDate: null };
    const po = build([cancel]).pos.find((x) => x.poNumber === late.poNumber)!;
    expect(po.status).toBe("Canceled");
    expect(po.flags.some((f) => ["PICKUP_PASSED", "DELIVERY_OVERDUE", "NO_CARRIER"].includes(f.code))).toBe(false);
    const note = po.flags.find((f) => f.code === "CANCELED_BY_ISSUE")!;
    expect(note.severity).toBe("info");
    expect(note.message).toContain("Issue Log #12 (Order cancellation) is resolved");
    // Its open shipment: canceled too once every one of our POs on it is, keeping TMS's status aside
    const before = views.shipments.find((x) => x.poNumbers.includes(late.poNumber) && !/^cancel/i.test(x.status))!;
    expect(before.tmsStatus).toBeNull();
    const ourOthers = before.ourPos.filter((po) => po !== late.poNumber);
    const all = build([cancel, ...ourOthers.map((po, i) => ({ ...cancel, poNumber: po, issueNumber: 20 + i }))]);
    const ship = all.shipments.find((x) => x.shipmentNumber === before.shipmentNumber)!;
    expect(ship.status).toBe("Canceled");
    expect(ship.tmsStatus).toBe(before.status);
    expect(ship.flags.some((f) => ["PICKUP_PASSED", "DELIVERY_OVERDUE", "NO_CARRIER"].includes(f.code))).toBe(false);
    expect(ship.flags.some((f) => f.code === "CANCELED_BY_ISSUE" && f.message.startsWith(`PO ${late.poNumber}:`))).toBe(true);
    expect(all.pos.find((x) => x.poNumber === late.poNumber)!.shipments.find((x) => x.shipmentNumber === ship.shipmentNumber)!.status).toBe("Canceled");
    // While one of our POs on it is still live, the shipment keeps its TMS status
    if (ourOthers.length) expect(build([cancel]).shipments.find((x) => x.shipmentNumber === before.shipmentNumber)!.status).toBe(before.status);
    // Another PO is untouched
    const other = views.pos.find((x) => x.poNumber !== late.poNumber)!;
    expect(build([cancel]).pos.find((x) => x.poNumber === other.poNumber)!.status).toBe(other.status);
    // A reused PO number: an issue about an earlier use doesn't cancel this one
    const created = { [late.poNumber]: "2026-11-01" };
    expect(build([{ ...cancel, issueDate: "2026-10-01" }], created).pos.find((x) => x.poNumber === late.poNumber)!.status).not.toBe("Canceled");
    expect(build([{ ...cancel, issueDate: "2026-10-01", poCreateDate: "2026-11-01" }], created).pos.find((x) => x.poNumber === late.poNumber)!.status).toBe("Canceled");
    expect(build([{ ...cancel, poCreateDate: "2025-03-01" }], created).pos.find((x) => x.poNumber === late.poNumber)!.status).not.toBe("Canceled");
  });

  it("decides which use of a reused PO number an issue is about", () => {
    const c = { poNumber: "1", issueNumber: 1, issueDate: "2026-05-10", poCreateDate: null };
    expect(cancellationApplies(c, null)).toBe(true);
    expect(cancellationApplies(c, "2026-05-01")).toBe(true);
    expect(cancellationApplies(c, "2026-06-01")).toBe(false);
    expect(cancellationApplies({ ...c, poCreateDate: "2026-06-01" }, "2026-06-01")).toBe(true);
  });
});

describe("Logistics email log", () => {
  it("ties an email to the selection and what it's tied to", async () => {
    const { emailSubjects, recipientsSummary, selectionSummary } = await import("@/lib/logistics/email-summary");
    const { views } = await sample();
    const po = views.pos.find((p) => p.poNumber === "1191515251")!;
    const byPo = emailSubjects("po", [po], []);
    expect(byPo.selected).toEqual(["1191515251"]);
    expect(byPo.poNumbers).toEqual(["1191515251"]);
    expect(byPo.shipmentNumbers).toEqual(po.shipments.map((s) => s.shipmentNumber));
    const ship = views.shipments.find((s) => s.shipmentNumber === "233586508")!;
    const byShipment = emailSubjects("shipment", [], [ship]);
    expect(byShipment).toEqual({ selected: ["233586508"], poNumbers: ship.ourPos, shipmentNumbers: ["233586508"] });
    expect(recipientsSummary({ teamName: "Ohio Shipping", to: ["a@x.com", "b@x.com"], cc: ["c@x.com"] })).toBe("Ohio Shipping +1");
    expect(recipientsSummary({ teamName: null, to: ["a@x.com", "b@x.com", "d@x.com"], cc: [] })).toBe("a@x.com, b@x.com +1");
    expect(selectionSummary({ kind: "po", selected: ["1", "2", "3", "4"] })).toBe("4 POs: 1, 2, 3…");
    expect(selectionSummary({ kind: "shipment", selected: ["9"] })).toBe("1 shipment: 9");
  });
});

describe("Date ranges for POs", () => {
  it("dates a PO by the WMS ship date, else its TMS pickup, else its create date", () => {
    const ship = (pickupLocal: string | null) => ({ pickupLocal, pickupAt: null }) as unknown as Shipment;
    expect(poDate({ firstShipped: new Date("2026-11-12T05:43:00Z"), shipments: [ship("11/17/26 00:01 EST")], createdAt: new Date("2026-11-01") })).toBe("2026-11-12");
    expect(poDate({ firstShipped: null, shipments: [ship("11/20/26 00:01 EST"), ship("11/17/26 00:01 EST")], createdAt: new Date("2026-11-01") })).toBe("2026-11-17");
    expect(poDate({ firstShipped: null, shipments: [], createdAt: new Date("2026-11-01") })).toBe("2026-11-01");
    expect(poDate({ firstShipped: null, shipments: [], createdAt: null })).toBeNull();
  });

  it("turns a range into bounds and words", () => {
    expect(rangeBounds({ range: "14" }, "2026-11-17")).toEqual({ from: "2026-11-03", to: null });
    expect(rangeBounds({ range: "all" }, "2026-11-17")).toBeNull();
    expect(rangeBounds({}, "2026-11-17")).toBeNull();
    expect(rangeBounds({ range: "custom", from: "2026-11-10", to: "2026-11-01" }, "2026-11-17")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
    expect(rangeBounds({ range: "custom", from: "nope" }, "2026-11-17")).toBeNull();
    expect(rangeLabel({ range: "14" }, "2026-11-17")).toBe("Last 2 weeks");
    expect(rangeLabel({ range: "custom", from: "2026-11-01", to: "2026-11-15" }, "2026-11-17")).toBe("Nov 1, 2026 – Nov 15, 2026");
    expect(rangeLabel({ range: "custom", from: "2026-11-01" }, "2026-11-17")).toBe("From Nov 1, 2026");
  });

  it("filters POs and the flag counts by the range", async () => {
    const { views } = await sample();
    const all = filterPos(views.pos, {}, "2026-11-14");
    expect(all.length).toBe(views.pos.length);
    const week = filterPos(views.pos, { range: "7" }, "2026-11-14");
    expect(week.length).toBeGreaterThan(0);
    expect(week.length).toBeLessThan(all.length);
    expect(week.every((p) => (poDate(p) ?? "") >= "2026-11-07")).toBe(true);
    const day = filterPos(views.pos, { range: "custom", from: "2026-11-12", to: "2026-11-12" }, "2026-11-14");
    expect(day.every((p) => poDate(p) === "2026-11-12")).toBe(true);
    const counts = logisticsOverview({ ...views, pos: week }).flags.reduce((n, f) => n + f.pos, 0);
    expect(counts).toBeLessThanOrEqual(logisticsOverview(views).flags.reduce((n, f) => n + f.pos, 0));
  });
});

describe("Warehouses", () => {
  const WH = [
    { prefix: "3-", name: "Ohio Warehouse (Site 3)" },
    { prefix: "0-", name: "LV Warehouse (Site 0)" },
  ];

  it("reads the warehouse from the OrderNumber prefix (the longest match wins)", async () => {
    const { warehouseOf, matchesWarehouse, warehouseRank } = await import("@/lib/logistics/warehouses");
    expect(warehouseOf("3-S-ORD1005437", WH)?.name).toBe("Ohio Warehouse (Site 3)");
    expect(warehouseOf(" 0-s-ord1", WH)?.name).toBe("LV Warehouse (Site 0)");
    expect(warehouseOf("S-ORD1005437S", WH)).toBeNull();
    expect(warehouseOf(null, WH)).toBeNull();
    expect(warehouseOf("3-X-1", [...WH, { prefix: "3-X", name: "Ohio annex" }])?.name).toBe("Ohio annex");
    expect(matchesWarehouse([WH[0]], "3-")).toBe(true);
    expect(matchesWarehouse([WH[0]], "0-")).toBe(false);
    expect(matchesWarehouse([], "none")).toBe(true);
    expect(warehouseRank([], WH)).toBe(2);
  });

  it("gives POs and shipments their warehouse, and filters and sorts by it", async () => {
    const { w, s, p } = await sample();
    const shipments = s.parsed.rows.map((r) => ({ ...r, pickupAt: r.pickup?.at ?? null, pickupLocal: r.pickup?.local ?? null, deliveryAt: r.delivery?.at ?? null, deliveryLocal: r.delivery?.local ?? null }));
    // Every sample carton is Site 3; ship one PO from Site 0 instead
    const lv = w.parsed.rows.find((c) => c.poNumber === "1191515251")!.poNumber;
    const cartons = w.parsed.rows.map((c) => (c.poNumber === lv ? { ...c, orderNumber: `0-${c.orderNum}` } : { ...c, orderNumber: `3-${c.orderNum}` }));
    const v = buildLogistics({ cartons, shipments, pos: p.parsed.rows, parcels: [], warehouses: WH }, "2026-11-14");
    const po = v.pos.find((x) => x.poNumber === lv)!;
    expect(po.warehouses.map((x) => x.name)).toEqual(["LV Warehouse (Site 0)"]);
    const ship = v.shipments.find((x) => x.ourPos.includes(lv))!;
    expect(ship.warehouses.map((x) => x.prefix)).toContain("0-");
    expect(filterPos(v.pos, { wh: "0-" }).map((x) => x.poNumber)).toEqual([lv]);
    expect(filterPos(v.pos, { wh: "none" }).every((x) => x.warehouses.length === 0)).toBe(true);
    const { sortPos, filterShipments } = await import("@/lib/logistics/views");
    const sorted = sortPos(v.pos, "warehouse", WH);
    const ranks = sorted.map((x) => (x.warehouses[0] ? WH.findIndex((h) => h.prefix === x.warehouses[0].prefix) : 2));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(filterShipments(v.shipments, { wh: "0-" }, WH).every((x) => x.warehouses.some((h) => h.prefix === "0-"))).toBe(true);
    const by = logisticsOverview(v, WH).warehouses;
    expect(by.map((x) => x.name)).toEqual(expect.arrayContaining(["Ohio Warehouse (Site 3)", "LV Warehouse (Site 0)"]));
    expect(by.find((x) => x.prefix === "0-")!.pos).toBe(1);
  });
});

describe("Channels, destination sorts and UPS parcels", () => {
  const CH = [
    { code: "THD", name: "Rapid Distribution Center (RDC)" },
    { code: "THD.COM-DFDC", name: "Direct Fulfillment Center (DFC)" },
  ];

  it("reads the channel from the WMS CUST_NUM, exactly and ignoring case", async () => {
    const { channelOf, matchesChannel } = await import("@/lib/logistics/channels");
    expect(channelOf("THD", CH)?.name).toBe("Rapid Distribution Center (RDC)");
    expect(channelOf(" thd.com-dfdc ", CH)?.name).toBe("Direct Fulfillment Center (DFC)");
    expect(channelOf("THD.CA", CH)).toBeNull();
    expect(matchesChannel([], "none")).toBe(true);
    expect(matchesChannel([CH[1]], "THD")).toBe(false);
  });

  it("gives POs, shipments and parcels their channel and filters by it", async () => {
    const { w, s, p } = await sample();
    const shipments = s.parsed.rows.map((r) => ({ ...r, pickupAt: r.pickup?.at ?? null, pickupLocal: r.pickup?.local ?? null, deliveryAt: r.delivery?.at ?? null, deliveryLocal: r.delivery?.local ?? null }));
    const v = buildLogistics({ cartons: w.parsed.rows, shipments, pos: p.parsed.rows, parcels: [], channels: CH }, "2026-11-14");
    const withCh = v.pos.filter((x) => x.channels.length);
    expect(withCh.length).toBeGreaterThan(0);
    const codes = new Set(withCh.flatMap((x) => x.channels.map((c) => c.code)));
    for (const code of codes) expect(filterPos(v.pos, { ch: code }).every((x) => x.channels.some((c) => c.code === code))).toBe(true);
    expect(filterPos(v.pos, { ch: "none" }).every((x) => x.cartonCount === 0)).toBe(true);
    const { filterShipments, parcelRows, filterParcels } = await import("@/lib/logistics/views");
    const code = [...codes][0];
    expect(filterShipments(v.shipments, { ch: code }, []).every((x) => x.channels.some((c) => c.code === code))).toBe(true);
    const parcels = parcelRows(v, "2026-11-14", [], CH);
    if (parcels.length) {
      expect(parcels.every((r) => r.state === "unchecked")).toBe(true);
      const c0 = parcels.find((r) => r.channels.length)!;
      expect(filterParcels(parcels, { ch: c0.channels[0].code }, "2026-11-14").length).toBeGreaterThan(0);
      expect(filterParcels(parcels, { q: c0.pos[0] }, "2026-11-14").every((r) => r.pos.includes(c0.pos[0]))).toBe(true);
    }
  });

  it("sorts by destination Store/DC #, city or state, blanks last", async () => {
    const { destCompare } = await import("@/lib/logistics/views");
    const d = (facility: string | null, city: string | null, state: string | null) => ({ facility, city, state });
    const list = [d("6760", "HAGERSTOWN", "MD"), d(null, "AUSTIN", "TX"), d("5023", "DALLAS", "TX"), d("XD05", "MONROE", "OH"), d("650", "ATLANTA", "GA")];
    expect([...list].sort(destCompare("dest")!).map((x) => x.facility)).toEqual(["650", "5023", "6760", "XD05", null]);
    expect([...list].sort(destCompare("city")!).map((x) => x.city)).toEqual(["ATLANTA", "AUSTIN", "DALLAS", "HAGERSTOWN", "MONROE"]);
    expect([...list].sort(destCompare("state")!).map((x) => `${x.state} ${x.city}`)).toEqual(["GA ATLANTA", "MD HAGERSTOWN", "OH MONROE", "TX AUSTIN", "TX DALLAS"]);
    expect(destCompare("po")).toBeNull();
  });

  it("works out a UPS parcel's state", async () => {
    const { parcelState } = await import("@/lib/logistics/views");
    const t = (o: Record<string, unknown>) => ({ trackingNumber: "1Z", status: "In Transit", statusType: "I", delivered: false, deliveredAt: null, expectedAt: null, lastActivity: null, lastLocation: null, activityAt: null, checkedAt: null, error: null, ...o }) as never;
    expect(parcelState(null, "2026-11-14")).toBe("unchecked");
    expect(parcelState(t({ delivered: true }), "2026-11-14")).toBe("delivered");
    expect(parcelState(t({ statusType: "X" }), "2026-11-14")).toBe("exception");
    expect(parcelState(t({ expectedAt: new Date("2026-11-10") }), "2026-11-14")).toBe("late");
    expect(parcelState(t({ statusType: "M" }), "2026-11-14")).toBe("label");
    expect(parcelState(t({ status: null, error: "Not found" }), "2026-11-14")).toBe("error");
    expect(parcelState(t({}), "2026-11-14")).toBe("transit");
  });
});
