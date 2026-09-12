import test from "node:test";
import assert from "node:assert/strict";
import { journalFieldText, ORDER_JOURNAL_FIELD_TITLES, ORDER_JOURNAL_PRICE_FIELDS } from "../lib/order-journal-fields.ts";

test("ordupd journal fields preserve the authoritative title order", () => {
  assert.deepEqual(ORDER_JOURNAL_FIELD_TITLES, [
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
  ]);
});

test("price fields of a segment with an unverified scale are labelled raw", () => {
  const titles = new Set(ORDER_JOURNAL_FIELD_TITLES.map(([field]) => field));
  for (const field of ORDER_JOURNAL_PRICE_FIELDS) assert.ok(titles.has(field), field);
  assert.equal(journalFieldText("PriceToFill", 554500, "unverified"), "554500 raw · unverified scale");
  assert.equal(journalFieldText("PriceToFill", 94.92, "verified"), "94.92");
  assert.equal(journalFieldText("QtyToFill", 250, "unverified"), "250");
  assert.equal(journalFieldText("FillPrice", null, "unverified"), "—");
  assert.equal(journalFieldText("Amo", true), "Yes");
});
