"""Read-only Prometheus summaries for infrastructure observability."""
from __future__ import annotations

import json
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import settings


def _query(prometheus_url: str, promql: str) -> list[dict]:
    url = f"{prometheus_url.rstrip('/')}/api/v1/query?query={quote(promql)}"
    try:
        request = Request(url, headers={"Accept": "application/json"})
        with urlopen(request, timeout=settings.prometheus_timeout_seconds) as response:
            payload = json.load(response)
        if payload.get("status") != "success":
            return []
        return payload.get("data", {}).get("result", [])
    except Exception:
        return []


def _value(result: dict) -> float | None:
    """Read a Prometheus scalar sample without trusting its shape."""
    try:
        return float(result.get("value", [None, None])[1])
    except (AttributeError, IndexError, TypeError, ValueError):
        return None


def node_summary() -> dict:
    """Return bounded node-exporter summaries; never expose transport errors."""
    if not settings.prometheus_url:
        return {"status": "Not configured", "nodes": [], "note": "Set PROMETHEUS_URL to read node-exporter metrics."}
    cpu = _query(settings.prometheus_url, '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)')
    memory = _query(settings.prometheus_url, '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))')
    load = _query(settings.prometheus_url, 'node_load1')
    uptime = _query(settings.prometheus_url, 'time() - node_boot_time_seconds')
    disk = _query(settings.prometheus_url, '100 * (1 - (node_filesystem_avail_bytes{fstype!="",mountpoint="/"} / node_filesystem_size_bytes{fstype!="",mountpoint="/"}))')
    network = _query(settings.prometheus_url, 'sum by (instance) (rate(node_network_receive_bytes_total{device!="lo"}[5m]) + rate(node_network_transmit_bytes_total{device!="lo"}[5m]))')
    exporter = _query(settings.prometheus_url, 'node_exporter_build_info')
    nodes: dict[str, dict] = {}
    for result in cpu:
        instance = str(result.get("metric", {}).get("instance", "unknown"))
        value = _value(result)
        if value is not None:
            nodes.setdefault(instance, {"instance": instance})["cpu_used_pct"] = round(value, 2)
    for result in memory:
        instance = str(result.get("metric", {}).get("instance", "unknown"))
        value = _value(result)
        if value is not None:
            nodes.setdefault(instance, {"instance": instance})["memory_used_pct"] = round(value, 2)
    for results, field in ((load, "load_1m"), (disk, "root_used_pct"), (network, "network_bytes_per_second")):
        for result in results:
            instance = str(result.get("metric", {}).get("instance", "unknown"))
            value = _value(result)
            if value is not None:
                nodes.setdefault(instance, {"instance": instance})[field] = round(value, 2)
    for result in uptime:
        instance = str(result.get("metric", {}).get("instance", "unknown"))
        value = _value(result)
        if value is not None:
            nodes.setdefault(instance, {"instance": instance})["uptime_seconds"] = round(value)
    for result in exporter:
        instance = str(result.get("metric", {}).get("instance", "unknown"))
        build = result.get("metric", {}).get("version") or result.get("metric", {}).get("branch")
        if build: nodes.setdefault(instance, {"instance": instance})["exporter_version"] = str(build)
    if not nodes:
        return {"status": "No node metrics", "nodes": [], "note": "Prometheus is configured but returned no node-exporter samples."}
    return {"status": "Connected", "nodes": list(nodes.values()), "node_count": len(nodes), "virtualization": {"status": "Unavailable", "note": "Node-exporter does not expose VM inventory. Add a libvirt, VMware, or cloud virtualization exporter for VM metrics."}}
