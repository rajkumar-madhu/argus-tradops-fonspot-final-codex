# Journal data grounding

The supplied `mirae-finspot-management-console-elk/Journal.log` contains 18,675 valid JSON records: 18,504 order updates, 149 logins, 14 logouts, and 8 exchange connectivity events. It contains 7,592 unique order IDs. Noren event timestamps span June 30, 2026, 03:44:01–03:53:38 UTC. This is historical evidence, not a current live feed.

`Journal_Converted.xlsx` is unusable as supplied: its ZIP directory cannot be read and the binary contains 2,402,964 UTF-8 replacement sequences. The original has not been modified. Use the raw journal for reliable field values; regenerate Excel from the original binary if needed.

The order snapshot uses the existing Noren normalizer: `NorenOrdNum` identifies orders, `NorenTimeStamp` plus `NorenNsecs` supplies event time, numeric `OrdStatus` supplies status, and prices use `NOREN_PRICE_DIVISOR`. Each order also carries an allowlisted `journal_fields` projection for the mapped Order / Trade Journal evidence panel. PAN and IP are masked, account and user identifiers follow the existing masking policy, and the source row is exposed as `Record No.`. Arbitrary raw documents are never returned. The order list withholds free-text rejection reasons; the authorized lifecycle route retains the existing rejection evidence behavior.

Set `TRADEOPS_JOURNAL_PATH` to a local, read-only journal path in the backend process. `/api/journal/orders` returns the latest normalized state per order; `/api/journal/orders/{order_id}/lifecycle` returns its chronologically sorted evidence. Both require `orders:read`. The file is loaded on demand once per process and remains fixed until restart; there is no polling or Elasticsearch write. A missing or unreadable file returns 503 rather than demo data.

Open `/orders?source=journal` to inspect the historical snapshot with loaded-row search, facets, dates, sorting, pagination, CSV export and order lifecycle. It does not subscribe to SSE. Other pages continue using their configured API sources. The journal alone does not establish current holdings, balances, risk limits, market depth, or infrastructure health.

The order table labels times as IST. Its event interval is the difference between Noren original and current event timestamps; it is not a network latency measurement. Measured order latency remains the separate latency dataset.
