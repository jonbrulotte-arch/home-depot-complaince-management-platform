import { describe, expect, it } from "vitest";
import { vendorProgramMap } from "@/lib/vendor-numbers";
import { buildCancellations, NO_PROGRAM, programLabel, cancelFrame, cancelTotals, filterCancellations, groupCancellations, type CancelChargeLine, type CancelPomLine } from "@/lib/cancellations";

const pom = (o: Partial<CancelPomLine>): CancelPomLine => ({ poNumber: "1197910528", poStatus: "Shipped", poCreateDate: "2026-11-17", month: 202610, destination: "6707", thdSku: "1002977047", partNumber: "41562", description: "DEWALT ADJ STOOL", units: 144, unitCost: 83.48, wholePo: false, ...o });
const charge = (o: Partial<CancelChargeLine>): CancelChargeLine => ({ id: "c1", month: 202611, poNumber: "001197910528", programCode: "US_DFC", programName: "US Direct Fulfillment Center", dcNumber: "6707", sku: "1002977047", vendorSku: null, description: null, offset: 1202.11, team: "Warehouse (Site 3)", rootCause: "Out of stock", dispute: null, ...o });

describe("cancellations", () => {
  it("merges POM's cancelled line, THD's Fill Rate charge and a cancellation issue on the same PO and SKU", () => {
    const rows = buildCancellations({
      pom: [pom({}), pom({ poNumber: "1200109179", poStatus: "Cancelled", vendorNumber: "28773", reasonCode: "220", thdSku: "1002989430", partNumber: "41567", units: 12, unitCost: 140, wholePo: true, destination: "5831", month: 202610 })],
      charges: [charge({}), charge({ id: "c2", poNumber: "1190000001", sku: null, vendorSku: "41561", offset: 50, dispute: { status: "APPROVED", recovered: 50 }, team: null, rootCause: null })],
      issues: [{ id: "i1", number: 7, title: "Cancelled for stock", category: "Line cancellation", status: "RESOLVED", team: "Customer Service", month: 202610, estimatedFine: 300, pos: [{ poNumber: "1197910528", estimatedFine: null }] }],
    });
    expect(rows).toHaveLength(3);
    const merged = rows.find((r) => r.poNumber === "1197910528")!;
    expect(merged).toMatchObject({ sources: ["pom", "compliance", "issue"], units: 144, value: 12021.12, offsets: 1202.11, net: 1202.11, month: 202610, programCode: "US_DFC", team: "Warehouse (Site 3)", estimatedFine: 300 });
    expect(merged.issues[0].number).toBe(7);
    const won = rows.find((r) => r.poNumber === "1190000001")!;
    expect(won).toMatchObject({ recovered: 50, net: 0, disputeStatus: "APPROVED", ourSku: "41561" });
    const t = cancelTotals(rows);
    expect(t).toMatchObject({ rows: 3, pos: 3, units: 156, value: 13701.12, offsets: 1252.11, recovered: 50, net: 1202.11, estimatedFines: 300, charged: 2, disputed: 1 });

    // The PO's create month (POM) wins over THD's charge month
    expect(filterCancellations(rows, { months: [202610] }).map((r) => r.poNumber).sort()).toEqual(["1197910528", "1200109179"]);
    expect(filterCancellations(rows, { months: [202611] }).map((r) => r.poNumber)).toEqual(["1190000001"]);
    expect(filterCancellations(rows, { ...cancelFrame({ key: "3", months: [202609, 202610], to: 202610 }) }).map((r) => r.poNumber).sort()).toEqual(["1190000001", "1197910528", "1200109179"]);
    expect(filterCancellations(rows, { ...cancelFrame({ key: "custom", months: [202610], to: 202610 }) }).map((r) => r.poNumber).sort()).toEqual(["1197910528", "1200109179"]);
    expect(cancelFrame({ key: "all", months: [202610], to: 202610 })).toEqual({});
    expect(filterCancellations(rows, { scope: "po" })).toHaveLength(1);
    expect(filterCancellations(rows, { vendor: "28773" }).map((r) => r.poNumber)).toEqual(["1200109179"]);
    expect(filterCancellations(rows, { reason: "220" })).toHaveLength(1);
    expect(filterCancellations(rows, { source: "issue" })).toHaveLength(1);
    expect(filterCancellations(rows, { dispute: "won" })).toHaveLength(1);
    expect(filterCancellations(rows, { dispute: "none" })).toHaveLength(2);
    expect(filterCancellations(rows, { team: "Not assigned" }).map((r) => r.poNumber).sort()).toEqual(["1190000001", "1200109179"]);
    expect(filterCancellations(rows, { dc: "05831" })).toHaveLength(1);
    expect(filterCancellations(rows, { sku: "4156" })).toHaveLength(3);
    expect(filterCancellations(rows, { q: "ISS-0007" })).toHaveLength(1);
    expect(filterCancellations(rows, { program: "US_DFC" })).toHaveLength(2);

    const byTeam = groupCancellations(rows, (r) => r.team ?? "Not assigned");
    expect(byTeam[0]).toMatchObject({ label: "Warehouse (Site 3)", offsets: 1202.11 });
  });

  it("takes a row's program from THD's charge, else its POM vendor number's program, else the issue's", () => {
    const vendorPrograms = vendorProgramMap([
      { code: "US_RDC", name: "US Rapid Deployment Center", vendorNumbers: ["20632"] },
      { code: "US_DFC", name: "US Direct Fulfillment Center", vendorNumbers: ["28773"] },
    ]);
    const rows = buildCancellations({
      pom: [
        pom({ vendorNumber: "28773" }),
        pom({ poNumber: "1200109179", vendorNumber: "020632", thdSku: "1", partNumber: "A" }),
        pom({ poNumber: "1200109180", vendorNumber: "99999", thdSku: "2", partNumber: "B" }),
      ],
      // THD charged the first under US_DS, which wins over its vendor's US_DFC
      charges: [charge({ programCode: "US_DS", programName: "US Drop Ship" })],
      issues: [{ id: "i1", number: 1, title: "x", category: "Order cancellation", status: "OPEN", team: null, month: 202610, estimatedFine: null, programCode: "US_TRANS", programName: "US Transportation", pos: [{ poNumber: "1200109180", estimatedFine: null }, { poNumber: "1200109179", estimatedFine: null }] }],
      vendorPrograms,
    });
    const by = (po: string) => rows.find((r) => r.poNumber === po)!;
    expect(by("1197910528")).toMatchObject({ programCode: "US_DS", programFrom: "thd" });
    expect(by("1200109179")).toMatchObject({ programCode: "US_RDC", programName: "US Rapid Deployment Center", programFrom: "vendor" });
    expect(by("1200109180")).toMatchObject({ programCode: "US_TRANS", programFrom: "issue" });
    expect(filterCancellations(rows, { program: "US_RDC" }).map((r) => r.poNumber)).toEqual(["1200109179"]);
    const none = buildCancellations({ pom: [pom({ vendorNumber: "99999" })], charges: [], issues: [], vendorPrograms });
    expect(programLabel(none[0])).toBe(NO_PROGRAM);
  });

  it("gives an issue with no other data a PO-level row, sharing the issue's estimate across its POs", () => {
    const rows = buildCancellations({ pom: [], charges: [], issues: [{ id: "i", number: 3, title: "x", category: "Order cancellation", status: "OPEN", team: null, month: 202609, estimatedFine: 200, pos: [{ poNumber: "1", estimatedFine: null }, { poNumber: "2", estimatedFine: null }] }] });
    expect(rows.map((r) => [r.poNumber, r.wholePo, r.estimatedFine])).toEqual([
      ["1", true, 100],
      ["2", true, 100],
    ]);
  });
});
