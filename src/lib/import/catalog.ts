// Default program configuration seeded into the database. Admins can change all of it
// afterwards (Admin > Programs); the importer reads the database, not this file.
// Sources: Supplier Hub "Compliance Program Overview" and "Compliance Dispute Process"
// articles, plus the header variants found in SPM exports from Aug-2023 to Jun-2026.

export type OffsetKind = "NONE" | "FLAT" | "PCT_VALUE";

export interface ReasonCodeDef {
  code: string;
  whenToUse?: string;
  requiredDocs?: string;
  docDetails?: string;
}

export interface MetricDef {
  code: string;
  name: string;
  sheetNames: string[];
  thresholdPct: number;
  offsetType: OffsetKind;
  offsetAmount: number;
  ruleNotes?: string;
  reasonCodes?: ReasonCodeDef[];
}

export interface ProgramDef {
  code: string;
  name: string;
  filePrefix: string | null;
  metrics: MetricDef[];
}

/** Metrics whose SPM sheet lists every line (compliant and not); other sheets list violations, or carry a $0 offset on compliant rows. */
export const FULL_POPULATION_METRICS = new Set(["FILL_RATE", "ON_TIME", "ASN_TIMELINESS"]);

const DC_FILL_RATE_CODES: ReasonCodeDef[] = [
  { code: "Inaccurate SKU Status", whenToUse: "THD ordered inactive SKU and supplier did not ship", requiredDocs: "Email or ticket communication", docDetails: "SKU(s) required maintenance; Merchant, Merchant Planner, or IPR Analyst acknowledgement" },
  { code: "Unexpected Spike Demand", whenToUse: "Spike order quantity, no advance notice provided by THD", requiredDocs: "Email or ticket communication", docDetails: "PO/SKU(s) impacted; timing of the spike; clear outline of the circumstances" },
  { code: "PO/SKU Cancelled", whenToUse: "IPR cut PO in error or IPR cancelled as \"Supplier No Stock\" in error", requiredDocs: "Email or ticket communication", docDetails: "PO/SKU(s) impacted; fiscal month and year of cancellation; IPR Analyst acknowledgement" },
  { code: "Incorrect Pack Size", whenToUse: "Shipped full quantities based on PO, however THD order shows quantity not equal to pack size", requiredDocs: "Email or ticket communication", docDetails: "PO/SKU(s) impacted; fiscal month and year of agreed pack size; IPR Analyst acknowledgement" },
  { code: "Order Shipped Complete", whenToUse: "Shipped full quantities based on PO", requiredDocs: "Packing list, Bill of Lading, or Proof of Delivery", docDetails: "PO number; PO date; shipment destination; THD SKU numbers; # of units shipped in eaches" },
];

const DC_ON_TIME_CODES: ReasonCodeDef[] = [
  { code: "Order Shipment On Time", whenToUse: "THD asked supplier to ship after the estimated ship date on the PO (Collect)", requiredDocs: "Email or ticket communication", docDetails: "Ship-after-ESD email or ticket incl. PO/SKU(s) impacted; THD instructed supplier to ship after ESD" },
  { code: "Building Closures", whenToUse: "Supplier is closed for holiday/weather/inventory outside of THD allowances", requiredDocs: "Email or ticket communication", docDetails: "Closure dates; HD acknowledged closures prior to closure dates" },
  { code: "Inaccurate V-Code status", whenToUse: "V-Code was disputed but was not systematically changed by THD (RDC SYNC orders only)", requiredDocs: "Email or ticket communication", docDetails: "PO/TMS Shipment ID impacted; HD Transportation acknowledged incorrect code was used" },
  { code: "Order Delivered On Time", whenToUse: "Order delivery to DC/Store was delayed by THD (Prepaid)", requiredDocs: "Proof of Delivery", docDetails: "PO number; PO date; shipment destination; delivery date" },
];

const DC_TMS_CODES: ReasonCodeDef[] = [
  { code: "Correct TMS Shipment ID populated in Ref*CN segment of the ASN", whenToUse: "Shipment ID in compliance data details is inaccurate", requiredDocs: "Screenshot of TMS or Vendor PlanEx AND ASN (856) Ref*CN segment", docDetails: "PO number, destination, shipment ID; ASN screenshot with PO number, shipment ID, Ref*CN segment" },
  { code: "TMS Shipment ID changed by THD", whenToUse: "Instructed to change shipment ID by THD", requiredDocs: "Email or ticket communication", docDetails: "PO number; original shipment ID; new shipment ID" },
];

const DC_ASN_CODES: ReasonCodeDef[] = [
  { code: "ASN Sent On-Time", whenToUse: "ASN was not missing or late; ASN transmitted prior to trailer check-in", requiredDocs: "Screenshot of 856 (ASN)", docDetails: "PO number; shipping ID; EDI transmission date/timestamp" },
  { code: "PO Cancelled", whenToUse: "Errors within order", requiredDocs: "Email or ticket communication", docDetails: "PO/SKU(s) impacted; fiscal month and year of cancellation; IPR Analyst acknowledgement PO cancelled" },
];

const ROUTING_GUIDE_CODES: ReasonCodeDef[] = [
  { code: "Exception granted by THD", whenToUse: "THD approved to use a different carrier", requiredDocs: "Email or ticket communication", docDetails: "Effective date range; acceptable carrier(s) to use" },
  { code: "Instructed to utilize incorrect LTL carrier", whenToUse: "THD associate directed supplier to use the wrong LTL carrier", requiredDocs: "Email or ticket communication", docDetails: "PO impacted; ship origin; destination; carrier to be used" },
  { code: "Shipped using Correct Carrier", whenToUse: "Designated carrier utilized as per Routing Guide or TMS or Vendor PlanEx", requiredDocs: "Bill of Lading or screenshot of TMS / Vendor PlanEx", docDetails: "BOL: PO number, origin, destination, freight terms. TMS: PO number, shipment ID, carrier directed" },
];

const DQC_CODES: ReasonCodeDef[] = [
  { code: "Not my item", whenToUse: "Item does not belong in the vendor account or was requested obsolete", requiredDocs: "Email communication from IDM including IDM Support Ticket number", docDetails: "IDM Support Ticket number stating the OMSID in question is attached to the incorrect SKU" },
  { code: "Inactive SKU", whenToUse: "Vendor's item is not an active SKU; vendor previously requested it be made obsolete" },
  { code: "Item corrected within 3 days grace period", whenToUse: "Vendor corrected and completed the item within the allowed grace period" },
];

export const PROGRAM_CATALOG: ProgramDef[] = [
  {
    code: "US_DS",
    name: "US Drop Ship",
    filePrefix: "US_DS",
    metrics: [
      {
        code: "FILL_RATE", name: "Fill Rate", sheetNames: ["Fill Rate"], thresholdPct: 98.5, offsetType: "PCT_VALUE", offsetAmount: 10,
        ruleNotes: "10% of the gross value",
        reasonCodes: [
          { code: "Fraud", whenToUse: "THD has determined customer is fraudulent", requiredDocs: "Email communication from THD requesting cancellation" },
          { code: "Force Majeure (FR3)", whenToUse: "Act of God or other event that could not have been prevented by reasonable steps", requiredDocs: "Proof of official company communication" },
          { code: "New Vendor", whenToUse: "New supplier adjustment (60-day grace period)", requiredDocs: "Screenshot of first order in Rithum" },
        ],
      },
      {
        code: "ON_TIME", name: "On Time", sheetNames: ["On Time"], thresholdPct: 95, offsetType: "PCT_VALUE", offsetAmount: 10,
        ruleNotes: "10% of the gross value",
        reasonCodes: [
          { code: "Customer Request Delay", whenToUse: "Customer requests supplier to delay shipment", requiredDocs: "THD approval to your customer request delay submission" },
          { code: "Carrier Inclement Weather/Natural Disaster", whenToUse: "Carrier cannot perform pickup due to inclement weather / natural disaster", requiredDocs: "Missed Pickup Form submitted by 1 business day after ESD, or carrier communication" },
          { code: "Carrier Performance Issue", whenToUse: "Shipment was ready on/before ESD and pickup scheduled with advance notice, but carrier picked up late", requiredDocs: "Missed Pickup Form submitted by 1 business day after ESD, or carrier communication" },
          { code: "Invalid Customer Address", whenToUse: "Carrier says customer address is invalid and will not perform pickup", requiredDocs: "Carrier communication confirming cannot pickup" },
          { code: "Customer Unresponsive Custom Item", whenToUse: "Customer unresponsive to request for required information", requiredDocs: "Email to customer or dropship ticket requesting alternate customer contact info" },
          { code: "Force Majeure (OT5)", whenToUse: "Act of God or other event that could not have been prevented by reasonable steps", requiredDocs: "Proof of official company communication" },
          { code: "New Vendor", whenToUse: "New supplier adjustment (60-day grace period)", requiredDocs: "Screenshot of first order in Rithum" },
        ],
      },
      {
        code: "LTL_ROUTING_GUIDE", name: "LTL Routing Guide", sheetNames: ["LTL Routing Guide"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 100,
        ruleNotes: "$100 per LTL violation (Ship to Customer)",
        reasonCodes: [
          { code: "A1 Proper Documentation", whenToUse: "Vendor supplied proper and valid documentation" },
        ],
      },
    ],
  },
  {
    code: "US_RDC",
    name: "US Rapid Deployment Center",
    filePrefix: "US_RDC",
    metrics: [
      { code: "FILL_RATE", name: "Fill Rate", sheetNames: ["Fill Rate"], thresholdPct: 98, offsetType: "PCT_VALUE", offsetAmount: 10, ruleNotes: "10% of the value of each unshipped unit", reasonCodes: DC_FILL_RATE_CODES },
      { code: "ON_TIME", name: "On Time", sheetNames: ["On Time"], thresholdPct: 90, offsetType: "PCT_VALUE", offsetAmount: 10, ruleNotes: "10% of COGS of the SKU (line) shipped late", reasonCodes: DC_ON_TIME_CODES },
      { code: "ASNT_MISSING_ASN", name: "Missing ASN", sheetNames: ["ASNT MISSING ASN"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 1000, ruleNotes: "$1,000 per shipment", reasonCodes: DC_ASN_CODES },
      { code: "ASNT_LATE_ASN", name: "Late ASN", sheetNames: ["ASNT LATE ASN"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 250, ruleNotes: "$250 per shipment; $350 with TMS violation", reasonCodes: DC_ASN_CODES },
      { code: "ASNT_TMS_UTIL", name: "TMS Utilization", sheetNames: ["ASNT TMS UTIL"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 100, ruleNotes: "$100 per shipment", reasonCodes: DC_TMS_CODES },
      { code: "FLUID_RECEIVING", name: "Fluid Receiving", sheetNames: ["Fluid Receiving"], thresholdPct: 99, offsetType: "FLAT", offsetAmount: 5, ruleNotes: "$5 per carton at >1% and <2% defects; $10 per carton above 2% (max 1% of COGS). No formal dispute process." },
    ],
  },
  {
    code: "US_DFC",
    name: "US Direct Fulfillment Center",
    filePrefix: "US_DFC",
    metrics: [
      { code: "FILL_RATE", name: "Fill Rate", sheetNames: ["Fill Rate"], thresholdPct: 98, offsetType: "PCT_VALUE", offsetAmount: 10, ruleNotes: "10% of the value of each unshipped unit", reasonCodes: DC_FILL_RATE_CODES },
      { code: "ON_TIME", name: "On Time", sheetNames: ["On Time"], thresholdPct: 90, offsetType: "PCT_VALUE", offsetAmount: 10, ruleNotes: "10% of COGS of the SKU (line) shipped late", reasonCodes: DC_ON_TIME_CODES },
      { code: "ASNT_MISSING_ASN", name: "Missing ASN", sheetNames: ["ASNT MISSING ASN"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 1000, ruleNotes: "$1,000 per shipment", reasonCodes: DC_ASN_CODES },
      { code: "ASNT_LATE_ASN", name: "Late ASN", sheetNames: ["ASNT LATE ASN"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 250, ruleNotes: "$250 per shipment; $350 with TMS violation", reasonCodes: DC_ASN_CODES },
      { code: "ASNT_TMS_UTIL", name: "TMS Utilization", sheetNames: ["ASNT TMS UTIL"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 100, ruleNotes: "$100 per shipment", reasonCodes: DC_TMS_CODES },
      { code: "ASN_TIMELINESS", name: "ASN Timeliness (legacy)", sheetNames: ["ASN Timeliness"], thresholdPct: 100, offsetType: "NONE", offsetAmount: 0, ruleNotes: "Pre-Nov 2023 combined ASN sheet" },
    ],
  },
  {
    code: "US_TRANS",
    name: "US Transportation",
    filePrefix: "US_TRANS",
    metrics: [
      { code: "ROUTING_GUIDE", name: "Routing Guide", sheetNames: ["ROUTING GUIDE"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 250, ruleNotes: "$250 per LTL violation", reasonCodes: ROUTING_GUIDE_CODES },
      { code: "MULTIPLE_BOL", name: "Multiple BOL", sheetNames: ["MULTIPLE BOL"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 75, ruleNotes: "$75 per LTL PRO", reasonCodes: [{ code: "Advised by THD personnel to send more than one BOL", requiredDocs: "Documentation from THD personnel", docDetails: "PO number, origin and destination" }] },
      {
        code: "PARCEL_PO", name: "Parcel PO", sheetNames: ["PARCEL PO"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 10, ruleNotes: "$10 per parcel tracking number",
        reasonCodes: [
          { code: "Ref1 and Ref2 fields populated correctly", requiredDocs: "Copy of label and UPS manifest", docDetails: "Tracking number and Ref1 and Ref2 fields" },
          { code: "PO Number is not 8 or 10 digits / not shipped to store", requiredDocs: "Copy of PO", docDetails: "PO number and destination" },
          { code: "Not my ship origin/PO", requiredDocs: "Confirmation of vendor origins and tracking numbers", docDetails: "Origin, examples of tracking numbers for shipments from vendor origin" },
        ],
      },
    ],
  },
  {
    code: "DQC",
    name: "Data Quality Compliance",
    filePrefix: "DQC",
    metrics: [
      { code: "SPECS_IMAGES", name: "Specs & Images", sheetNames: ["Specs & Images", "Specs & Digital Images", "SPECS & IMAGES"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 1000, ruleNotes: "$1,000 per item per week, capped at 1% of avg weekly COGS", reasonCodes: DQC_CODES },
      { code: "SUPPLY_CHAIN", name: "Supply Chain", sheetNames: ["Supply Chain", "SUPPLY CHAIN"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 1000, ruleNotes: "$1,000 per item per week, capped at 1% of avg weekly COGS", reasonCodes: DQC_CODES },
      { code: "HAZMAT", name: "Hazmat", sheetNames: ["Hazmat", "HAZMAT"], thresholdPct: 100, offsetType: "FLAT", offsetAmount: 1000, ruleNotes: "$1,000 per item per week (10 business day grace), capped at 1% of avg weekly COGS", reasonCodes: DQC_CODES },
    ],
  },
  {
    code: "INVOICE_TIMELINESS",
    name: "Invoice Timeliness",
    filePrefix: "INVOICE",
    metrics: [
      { code: "INVOICE_TIMELINESS", name: "Invoice Timeliness", sheetNames: ["Invoice Timeliness", "Invoice"], thresholdPct: 100, offsetType: "NONE", offsetAmount: 0, ruleNotes: "Configure once a sample export is available" },
    ],
  },
];

/** Earliest fiscal month the seeded rules apply to. */
export const RULES_EFFECTIVE_FROM = 202301;

/**
 * Global header aliases (normalized header -> canonical field). Program- or metric-scoped
 * aliases in the database take precedence over these.
 */
export const DEFAULT_ALIASES: Record<string, string> = {
  "po number": "poNumber",
  "fiscal month": "fiscalMonth",
  "assessed fscl prd": "fiscalMonth",
  "p-vendor #": "pVendor",
  "m-vendor #": "mVendor",
  "m-vendor name": "mVendorName",
  "dept number": "dept",
  "department #": "dept",
  "department number": "dept",
  "dc number": "dcNumber",
  "loc nbr": "dcNumber",
  "sku number": "sku",
  "vendor sku": "vendorSku",
  "sku description": "skuDescription",
  "customer order #": "customerOrder",
  "oms id": "omsId",
  "omsid": "omsId",
  "tracking #": "trackingNumber",
  "ordered quantity": "orderedQty",
  "sku quantity": "orderedQty",
  "received quantity": "receivedQty",
  "fill rate": "fillRatePct",
  "po create date": "poCreateDate",
  "order date": "poCreateDate",
  "order timestamp": "poCreateDate",
  "expected arrival date": "expectedArrivalDate",
  "estimated ship date": "estShipDate",
  "expected ship date": "estShipDate",
  "estimated delivery date": "estDeliveryDate",
  "actual shipment date": "actualShipDate",
  "ship date": "actualShipDate",
  "rts sent": "rtsSent",
  "local rts ts": "rtsSent",
  "pick up request date": "pickupRequestDate",
  "original pick up request date": "pickupRequestDate",
  "trailer check-in": "trailerCheckIn",
  "first check in ts": "trailerCheckIn",
  "trailer gate check-in timestamp": "trailerCheckIn",
  "asn transmission timestamp": "asnTimestamp",
  "asn transmit timestamp": "asnTimestamp",
  "asn crt ts": "asnTimestamp",
  "asn received timestamp": "asnReceivedAt",
  "closed date": "closedDate",
  "cancel date": "cancelDate",
  "cancelled on": "cancelDate",
  "bol number": "bolNumber",
  "tms id #/freight bill #": "tmsId",
  "freight bill # (ref *cn)": "tmsId",
  "tms id #": "tmsId",
  "shipment number": "shipmentNumber",
  "doc trace id": "docTraceId",
  "carrier used": "carrierUsed",
  "carrier code": "carrierUsed",
  "carrier pro number": "carrierPro",
  "rg carrier code 1": "rgCarriers",
  "rg carrier code 2": "rgCarriers",
  "rg carrier code 3": "rgCarriers",
  "rg carrier code 4": "rgCarriers",
  "rg carrier code 5": "rgCarriers",
  "rg crpt carrier code": "rgCarriers",
  "origin state": "originState",
  "destination state": "destinationState",
  "freight terms": "freightTerms",
  "metric": "freightTerms",
  "invoice number": "invoiceNumber",
  "offset type": "offsetType",
  "reason": "reason",
  "late reason": "lateReason",
  "business days late": "businessDaysLate",
  "rescheduled": "rescheduled",
  "supplier rescheduled flag": "rescheduled",
  "offset": "offset",
  "offset amt": "offset",
  "offset amount": "offset",
  "status": "spmStatus",
  "program status": "spmStatus",
  "dispute reason": "spmDisputeReason",
  "supplier comment": "spmSupplierComment",
  "approve/deny": "spmDecision",
  "approve/deny detailed description": "spmDecisionDetail",
  "coordinator comment": "spmCoordinatorComment",
};
