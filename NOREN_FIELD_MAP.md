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
