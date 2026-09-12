# Noren -> TradeOps field map

| TradeOps field | Noren field | Notes |
|---|---|---|
| order_id | `NorenOrdNum` | Primary order correlation |
| internal_ref | `Eref` | Secondary correlation |
| exchange_order_id | `ExchOrdNum` | Present after exchange acknowledgement |
| event_time | `NorenTimeStamp` + `NorenNsecs` | Also indexed as `NorenTimeStamp_N` by Logstash |
| original_time | `NorenOrgTimeStamp` + `NorenOrgNsecs` | Used for latency calculation |
| status | `OrdStatus` | Raw code retained as `status_code` |
| report_type | `ReportType` | Raw protocol code retained |
| account | `AcctId` | Masked by default |
| user | `UserId` | Masked by default |
| broker | `BrokerId` | Operational dimension |
| region | `Region` | Operational dimension |
| exchange | `ExchSeg` | NSE/NFO/BSE/etc. |
| symbol | `TradingSymbol` | Instrument symbol |
| side | `TransType` | B -> BUY, S -> SELL |
| order_type | `PriceType` | LMT/MKT/etc. |
| product | `Product` | Noren product code |
| qty | `QtyToFill` | Order quantity (units, not lots — see below) |
| price | `PriceToFill` | Divided by the segment's divisor (see [Price scale](#price-scale-per-exchange-segment)); `null` where the scale is unverified |
| fill_price | `FillAvgPrice`, else `FillPrice` | Same divisor as `price` |
| price_raw, fill_price_raw | `PriceToFill`, `FillAvgPrice`/`FillPrice` | The recorded integers, always returned |
| price_scale | derived from `ExchSeg` | `verified`, or `unverified` when the segment has no established divisor |
| price_divisor | derived from `ExchSeg` | Divisor applied, `null` when unverified |
| value_multiplier | `ExchSeg`, `Scripupdate.PriceMultiplier` | Rupee value = qty × price × value_multiplier; `null` where not established |
| reject_reason | `RejReason` | Classified into RMS/Exchange/Gateway/etc. |
| login_session | `UserSessId` | Used for correlation, masked in response |
| login_status | `ReqStatus` | Success/logout success/etc. |
| access_type | `AccessType` | TT/FU/etc. |
| session broker | `Userdetails.BrokerId` | Returned |
| session region | `Userdetails.Region` | Returned |
| app version | `Userdetails.NorenAppVersion` | Returned |
| exchange access | `Userdetails.UserExchDetails[].ExchSeg` | Enabled segments only |

## Price scale per exchange segment

Noren records every price (`PriceToFill`, `FillPrice`, `FillAvgPrice`, `TriggerPrice`, `RedPrice`, `Scripupdate.TickSize`, `Scripupdate.StrikePrice`) as an integer. The divisor that turns it into rupees depends on `ExchSeg`. `app/elastic/normalizer.py` applies it, and both the Elasticsearch and journal paths go through it.

| Segment | Divisor | Status | Evidence in the journal |
|---|---|---|---|
| NSE | `NOREN_PRICE_DIVISOR` (100) | Verified | 451/451 RMS circuit-limit rejections on new orders quote `Current:INR` = `PriceToFill` / 100. 172 delivery-buy margin rejections have shortfall + available = qty × price exactly. |
| BSE | `NOREN_PRICE_DIVISOR` (100) | Verified | 8/8 circuit-limit rejections match. 16 delivery-buy margin rejections match exactly. |
| NFO | `NOREN_PRICE_DIVISOR` (100) | Verified | 1,471,735/1,471,735 option strikes in `TradingSymbol` (`NIFTY07JUL26C24100`) equal `StrikePrice` / 100 (2410000). 104/104 circuit-limit rejections match. 45 option-buy margin rejections match the premium exactly. |
| BFO | `NOREN_PRICE_DIVISOR` (100) | Verified | 69,102/69,102 strikes (`SENSEX2670277000CE` against 7700000) match. 1/1 circuit-limit rejection and 12 option-buy margin rejections match. |
| MCX | `NOREN_PRICE_DIVISOR` (100) | Verified | 98,874/98,874 strikes (`SILVERM24SEP26P241000` against 24100000) match. 1/1 circuit-limit rejection matches (`NATGASMINI` 26940 against `Current:INR 269.40`). 193 option-buy margin rejections match qty × price × `PriceMultiplier`. |
| CDS | 10,000,000 | Verified (scale only) | `TickSize` 25000 on both instruments present (USDINR futures and the 6.48% GS 2035 interest-rate future). NSE's tick for both contracts is ₹0.0025, and 25000 / 0.0025 = 10⁷. That gives USDINR 94.88–94.92 and the bond future 97.82 per ₹100; 10⁶ or 10⁸ would give 948.8 or 9.488. `PricePrecision` is 4, as a ₹0.0025 tick needs. Only 6 events. The sample has no RMS text or option strike to cross-check against. |
| BCD, NCDEX, others, missing `ExchSeg` | — | Unverified | Not present in either journal. `price` is `null`, `price_raw` keeps the recorded integer, and the UI labels it "raw · unverified scale". |

Counts cover both the 26 MB sample (`mirae-finspot-management-console-elk/Journal.log`: NSE, NFO, BSE, BFO, 6 CDS events) and the 3.5 GB root `Journal.log` (NFO, NSE, 106,951 MCX events, BFO, BSE; no CDS). Every circuit-limit mismatch (29 in all) is a rejected *modification* (`ReportType` 114), where `Current` is the requested new price and `PriceToFill` is still the working one. None of them is off by a power of ten. Margin rejections that do not match exactly carry cumulative requirements from other working orders. None of those is off by a power of ten either. `PricePrecision` is display precision, not the divisor: CDS has 4 decimals but a 10⁷ divisor.

Configuration: `NOREN_PRICE_DIVISOR` (default 100) sets the divisor for NSE, BSE, NFO, BFO and MCX. `NOREN_PRICE_DIVISORS` adds or overrides per segment, e.g. `NOREN_PRICE_DIVISORS=BCD=10000000` once BCD is verified. Built-in entries (CDS=10000000) stay unless overridden. A malformed entry stops the process at startup. `/api/config` reports the resolved map as `price_divisors`.

### Quantity and rupee value

`value_multiplier` is set only where the RMS's own arithmetic establishes it:

- **NSE, BSE, NFO, BFO: 1.** `QtyToFill` counts shares or contract units. It is always a multiple of `Scripupdate.LotSize` (130 on a 65-lot NIFTY option), and the margin matches above use qty × price with no further factor.
- **MCX: `Scripupdate.PriceMultiplier`.** `QtyToFill` is in `LotSize` units, and the multiplier converts to the quote unit: GOLD 100 (1 kg lot, quoted per 10 g), GOLDM, GOLDTEN and SILVER100 0.1, GOLDGUINEA 0.125, ZINC and ALUMINI 1000 (quantity in tonnes, quoted per kg), 1.0 elsewhere. GOLDM's 27 exact margin matches hold only with 0.1 applied. A record without the multiplier gets `null`.
- **CDS: `null`.** Records carry `LotSize` 1, `Multiplier` 1000, and `PriceMultiplier` 2.0 on the bond future. The contract sizes are suggestive: USD 1,000 per USDINR lot, and 2,000 bonds per interest-rate lot, which is 1000 × 2.0. But no RMS figure in the journal ties `QtyToFill` (1000 and 250 here) to a notional. So rupee value is not computed. Risk & Limits excludes these orders and names them, and trade value is `null`.

The Journal Explorer (`/logs`, `/api/journal/records`) is an evidence view and keeps raw source units by design.

## September CSV contract

`ORDERLATENCY_08-Sep-2026.csv` has separate uppercase feed fields. It omits OMS_STATUS/EXCH_STATUS/EXT_RMKS. Never apply Noren journal status-code meanings or assume its duration units. See [File analytics](docs/FILE_ANALYTICS.md) for validated fields, null/zero semantics, timestamp normalization, source reconciliation and exact percentile definitions.
