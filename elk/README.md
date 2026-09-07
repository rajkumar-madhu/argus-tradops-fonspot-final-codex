# Noren Elasticsearch mappings

The supplied Finspot Logstash pipeline writes each journal event twice:

- `noren-%{msg_type}-intraday`
- `noren-%{msg_type}-history`

For the observed Journal schema the event types are `ordupd`, `login`, `logout`, and `yel_connected`.

`noren-index-template.json` is a TradeOps template for **new** `noren-*` indices. Applying a template does not retroactively change existing field mappings. If current indices have incompatible mappings, create a new versioned index/data stream and reindex instead of changing a production mapping in-place.

Example:

```http
PUT _index_template/tradeops-noren-v1
<contents of noren-index-template.json>
```

TradeOps reads `NorenTimeStamp_N` as the operational event date because the supplied Logstash filter converts `NorenTimeStamp` (UNIX) into that field. `@timestamp` remains useful as the Logstash ingestion time, especially for `yel_connected`, which has no Noren event timestamp in the supplied sample.
