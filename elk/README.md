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

## Corrected pipeline files (P0 hardening)

The supplied Filebeat and Logstash configs have four defects that together
make ingestion both lossy and duplicating. Corrected versions live here; they
are applied to the `linkedeye-analytics-*` deployment, not to this repo's
containers.

| File | Replaces | Fixes |
|---|---|---|
| `filebeat.noren.yml` | `linkedeye-analytics-fb-conf/filebeat.yml` | Rotation keys were nested under `processors:` (invalid YAML → inert), so `tail_files`/`file_identity` never applied. Output listed `analytics-ls:5045`, which has no pipeline file, without `loadbalance` — a coin-flip hang. `Journal.log` itself was not in `paths`. |
| `noren_filebeat.conf` | `linkedeye-analytics-ls-conf/pipeline/noren_filebeat.conf` | No `document_id` → every replay was a new document. Every event written twice (`-history` has no reader). PII indexed verbatim. Redundant `json` filter emitting a parse failure per event. `linkedeye_cleanup` from ingest date. |
| `noren-ilm-policy.json` | nothing (no retention existed) | Daily rollover, 45-day delete. Size `delete.min_age` to the node's disk. |
| `noren-index-template.json` | dynamic mapping | Now also maps `Scripupdate` explicitly, freezes `Userdetails` (`dynamic: false`) and attaches the ILM policy. |

Rollout order, on a quiet market:

1. `PUT _ilm/policy/tradeops-noren` with `noren-ilm-policy.json`.
2. `PUT _index_template/tradeops-noren-v1` with `noren-index-template.json`. Existing indices keep their mapping; the next daily index picks it up.
3. Create the write aliases the rollover needs, one per `msg_type`:
   `PUT noren-ordupd-intraday-000001 {"aliases":{"noren-ordupd-intraday":{"is_write_index":true}}}` — but only if `noren-ordupd-intraday` is not already a concrete index. If it is, reindex it into `-000001` first; the API queries the alias name and needs no change.
4. Add a persistent volume at `/usr/share/filebeat/data` on the Filebeat pod (the registry). Back up the current registry first if the pod still has one.
5. Replace the Logstash pipeline, then the Filebeat config; `filebeat test config -c filebeat.noren.yml` before restart.
6. Verify: `GET noren-ordupd-intraday/_count` grows; `GET noren-ordupd-intraday/_search?q=PanNum:*` returns 0; no `_jsonparsefailure` tags; ingest lag on `/api/freshness` stays under a few seconds.

The `-history` indices can be deleted once a snapshot exists; nothing in
TradeOps reads them (`NOREN_HISTORY_INDEX` has no consumer).
