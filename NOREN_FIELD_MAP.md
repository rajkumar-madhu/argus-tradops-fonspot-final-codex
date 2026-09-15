# Noren -> TradeOps field map

| TradeOps field | Noren field | Notes |
|---|---|---|
| order_id | `NorenOrdNum` | Primary order correlation |
| internal_ref | `Eref` | Secondary correlation |
| exchange_order_id | `ExchOrdNum` | Present after exchange acknowledgement |
| event_time | `NorenTimeStamp` + `NorenNsecs` | Unix second plus a genuine sub-second remainder. Also indexed as `NorenTimeStamp_N` by Logstash |
| original_time | `NorenOrgTimeStamp` + `NorenOrgNsecs` | Same shape as event_time. Used for latency calculation |
| exchange_time | `ExchTimeStamp` (+ `ExchNsecs` fraction) | Unix second. **`ExchNsecs` is not a sub-second remainder** — see [Exchange time](#exchange-time). Empty when the exchange did not stamp the event |
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
| qty | `QtyToFill` | Order quantity |
| price | `PriceToFill` | Divided by configurable `NOREN_PRICE_DIVISOR` |
| reject_reason | `RejReason` | Classified into RMS/Exchange/Gateway/etc. |
| login_session | `UserSessId` | Used for correlation, masked in response |
| login_status | `ReqStatus` | Success/logout success/etc. |
| access_type | `AccessType` | TT/FU/etc. |
| session broker | `Userdetails.BrokerId` | Returned |
| session region | `Userdetails.Region` | Returned |
| app version | `Userdetails.NorenAppVersion` | Returned |
| exchange access | `Userdetails.UserExchDetails[].ExchSeg` | Enabled segments only |

## Exchange time

`ExchTimeStamp` is a unix second and is the authority for `exchange_time`. `ExchNsecs`
is **not** its sub-second remainder — unlike `NorenNsecs`/`NorenOrgNsecs`, which are
true remainders below 1e9, `ExchNsecs` is a full 19-digit nanosecond timestamp, and
the journals carry **two epochs** for it:

| Epoch of `ExchNsecs` | Segments | Check that holds |
|---|---|---|
| Nanoseconds since the unix epoch | `BSE`, `BFO`, `MCX` | `ExchNsecs // 1e9 == ExchTimeStamp` |
| Nanoseconds since 1980-01-01 00:00 IST | `NSE`, `NFO`, `CDS` | `ExchNsecs // 1e9 + 315513000 == ExchTimeStamp` |

`315513000` is the 1970→1980 span (`315532800`) less the 5h30m IST offset (`19800`).
On `CDS` the same 1980-epoch second is also carried as the string `OrgExchTime`, and on
`NSE`/`NFO` `OrgExchTime` is what `ExchTimeStamp` tracks.

Measured over 1,652,724 `ordupd` rows of the two supplied journals
(`mirae-finspot-management-console-elk/Journal.log` and the 3.5 GB root `Journal.log`),
every row's `ExchNsecs` was explained by one of those two readings and none by a third.
Because the two readings are ten years apart only one can ever match, so
`normalizer.exchange_time()` establishes the convention **per row** rather than from a
segment table — a segment absent from the samples resolves without being named.

The derivation is therefore: take the second from `ExchTimeStamp`, and add the
`ExchNsecs % 1e9` fraction **only when one of the two readings reproduces that exact
second**. When neither does — `ExchNsecs` times the current event while `ExchTimeStamp`
tracks `OrgExchTime`, diverging by up to an hour on `NFO` — the second stands alone at
one-second precision rather than borrowing a fraction from a different instant. That is
1.7% of rows; the other 98.3% keep microsecond precision.

`ExchTimeStamp == 315513000` (the 1980 epoch's own zero, as a unix second) means the
exchange never stamped the event — it appears only on exchange rejections, 108 rows
across both journals, always with `ExchNsecs` absent. It yields an **empty**
`exchange_time`, which the UI renders as `—`. Zero and unparseable stamps do the same.
Never render it as a 1980 timestamp.

Do not relabel these: adding `ExchNsecs` to `ExchTimeStamp` dates every order decades
into the future (2072 for `NSE`/`NFO`, 2082 for `BSE`/`BFO`, 2083 for `MCX`).

## September CSV contract

`ORDERLATENCY_08-Sep-2026.csv` has separate uppercase feed fields. It omits OMS_STATUS/EXCH_STATUS/EXT_RMKS. Never apply Noren journal status-code meanings or assume its duration units. See [File analytics](docs/FILE_ANALYTICS.md) for validated fields, null/zero semantics, timestamp normalization, source reconciliation and exact percentile definitions.
