export const ORDER_JOURNAL_FIELD_TITLES = [
  ["Record No.", "Record #"],
  ["Event Time (UTC)", "Event Time"],
  ["NorenOrdNum", "Order ID"],
  ["NorenTimeStamp", "Order Timestamp"],
  ["msg_type", "Message Type"],
  ["ReportType", "Report Type"],
  ["OrdStatus", "Order Status"],
  ["AcctId", "Account ID"],
  ["UserId", "User ID"],
  ["BrokerId", "Broker ID"],
  ["TradingSymbol", "Trading Symbol"],
  ["ExchSeg", "Exchange Segment"],
  ["Token", "Instrument Token"],
  ["TransType", "Buy / Sell"],
  ["PriceType", "Order Type"],
  ["Product", "Product"],
  ["OrdDuration", "Order Validity"],
  ["QtyToFill", "Pending Qty"],
  ["PriceToFill", "Order Price"],
  ["FillQty", "Fill Qty"],
  ["TotalFillQty", "Total Filled Qty"],
  ["FillPrice", "Fill Price"],
  ["FillAvgPrice", "Average Fill Price"],
  ["RejReason", "Rejection Reason"],
  ["IpAddr", "IP Address"],
  ["Amo", "AMO"],
  ["BrokerGroup", "Broker Group"],
  ["CancelledQty", "Cancelled Qty"],
  ["DiscQty", "Disclosed Qty"],
  ["ExchOrdNum", "Exchange Order ID"],
  ["ExchTimeStamp", "Exchange Time"],
  ["ExchUserId", "Exchange User ID"],
  ["FillId", "Fill ID"],
  ["FillTime", "Fill Time"],
  ["OrdRemarks", "Order Remarks"],
  ["OrdSrc", "Order Source"],
  ["PanNum", "PAN"],
  ["RejBy", "Rejected By"],
  ["RejOrdSrc", "Rejection Source"],
  ["RejPriceType", "Rejected Price Type"],
  ["RejQty", "Rejected Qty"],
  ["TriggerPrice", "Trigger Price"],
  ["SrcUserId", "Source User ID"],
  ["StreamId", "Stream ID"],
] as const;

export type OrderJournalField = (typeof ORDER_JOURNAL_FIELD_TITLES)[number][0];
export type OrderJournalFieldValues = Partial<Record<OrderJournalField, unknown>>;

export function journalFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Mirrors `_PRICE_FIELDS` in backend/app/journal_snapshot.py. */
export const ORDER_JOURNAL_PRICE_FIELDS: ReadonlySet<string> = new Set(["PriceToFill", "FillPrice", "FillAvgPrice", "TriggerPrice"]);

/**
 * Field text for the evidence panel. On a segment whose price scale is
 * unverified (the row's `price_scale`), price fields hold the recorded integer
 * unscaled, and say so.
 */
export function journalFieldText(field: string, value: unknown, priceScale?: unknown): string {
  const text = journalFieldValue(value);
  return priceScale === "unverified" && ORDER_JOURNAL_PRICE_FIELDS.has(field) && text !== "—"
    ? `${text} raw · unverified scale`
    : text;
}
