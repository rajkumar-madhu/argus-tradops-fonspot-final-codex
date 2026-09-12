# Journal data grounding

The supplied `mirae-finspot-management-console-elk/Journal.log` contains 18,675 valid JSON records: 18,504 order updates, 149 logins, 14 logouts, and 8 exchange connectivity events. It contains 7,592 unique order IDs. Noren event timestamps span June 30, 2026, 03:44:01–03:53:38 UTC. This is historical evidence, not a current live feed.

`Journal_Converted.xlsx` is unusable as supplied: its ZIP directory cannot be read and the binary contains 2,402,964 UTF-8 replacement sequences. The original has not been modified. Use the raw journal for reliable field values; regenerate Excel from the original binary if needed.

The order snapshot uses the existing Noren normalizer: `NorenOrdNum` identifies orders, `NorenTimeStamp` plus `NorenNsecs` supplies event time, numeric `OrdStatus` supplies status, and prices use the per-segment divisor described below. Each order also carries an allowlisted `journal_fields` projection for the mapped Order / Trade Journal evidence panel. PAN and IP are masked, account and user identifiers follow the existing masking policy, and the source row is exposed as `Record No.`. Arbitrary raw documents are never returned. The order list withholds free-text rejection reasons. The lifecycle route, rejection summaries, RCA and event-bus payloads carry the reason masked by `mask_reason` (applied in `normalize_order()` after code and category are derived from the raw text). The Journal Explorer (`/api/journal/explore`, `/records` and its CSV export) shows `RejReason` masked by `mask_reason`: client codes (`C-***-PSB`, `clientid ***-KFS`, `CLIENT CODE : ***`), INR balances, shortfalls and margins, holding quantities, PAN, phone numbers and IPs are masked, while circuit prices, freeze quantities and the bracketed product group stay readable because they explain the rejection. Other remarks fields stay `[redacted]`.

## Prices

Noren price integers have a different scale per exchange segment. The journal establishes paise (÷100) for NSE, BSE, NFO, BFO and MCX. Option strikes in the symbol, and the RMS's own circuit-limit and margin figures, agree on that. CDS is ÷10⁷: its tick size against the exchange's ₹0.0025 tick puts USDINR at 94.92, where a single divisor of 100 had shown 9,492,000. Evidence, counts and configuration (`NOREN_PRICE_DIVISOR`, `NOREN_PRICE_DIVISORS`) are in [`NOREN_FIELD_MAP.md`](../NOREN_FIELD_MAP.md#price-scale-per-exchange-segment).

- `price` and `fill_price` are rupees. `price_raw` and `fill_price_raw` keep the recorded integers. `price_divisor` names the divisor applied.
- A segment with no established divisor (BCD, NCDEX, any other, or a record without `ExchSeg`) is not scaled: `price` is `null`, `price_scale` is `"unverified"`, and the `journal_fields` price fields keep the recorded integer. The UI shows it as "raw · unverified scale", never as rupees.
- `value_multiplier` turns qty × price into rupees. It is 1 on NSE, BSE, NFO and BFO, and `Scripupdate.PriceMultiplier` on MCX. It is `null` on CDS and on unverified segments, because the journal does not show how CDS quantity and `Scripupdate.Multiplier` combine into a notional. Rupee totals (Risk & Limits working value, trade value) leave those orders out and say so.

The journal establishes an order's price and, on the segments above, its placed value. It does not establish positions, margin or a settled notional.

Set `TRADEOPS_JOURNAL_PATH` to a local, read-only journal path in the backend process. `/api/journal/orders` returns the latest normalized state per order; `/api/journal/orders/{order_id}/lifecycle` returns its chronologically sorted evidence. Both require `orders:read`. The file is loaded on demand once per process and remains fixed until restart; there is no polling or Elasticsearch write. A missing or unreadable file returns 503 rather than demo data.

Open `/orders?source=journal` to inspect the historical snapshot with loaded-row search, facets, dates, sorting, pagination, CSV export and order lifecycle. It does not subscribe to SSE. Other pages continue using their configured API sources. The journal alone does not establish current holdings, balances, risk limits, market depth, or infrastructure health.

The order table labels times as IST. Its event interval is the difference between Noren original and current event timestamps; it is not a network latency measurement. Measured order latency remains the separate latency dataset.
