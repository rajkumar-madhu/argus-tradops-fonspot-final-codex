#!/usr/bin/env python3
"""
Order Latency CSV Generator
Finspot Technology Solutions - LinkedEye Platform
Generates L_ORDERLATENCY<TIMESTAMP>.csv with enhanced fields

Output columns:
  NOREN_ORD_NUM, EXCH_SEG, EXT_RMKS, OMS_STATUS, OMS_LATENCY,
  EXCH_STATUS, OMS_EXCH_CONFIRMATION, OMSUPDATETIME, EXCHUPDATETIME
"""

import csv
import os
import random
import time
import datetime

# ---------------------------------------------------------------------------
# Constants / Mappings
# ---------------------------------------------------------------------------

EXCH_SEGMENTS = ["NSE", "BSE", "NFO", "BFO", "MCX"]

# OMS status codes (65 = complete, 56 = open, 45 = rejected, etc.)
OMS_STATUS_CODES = {
    65: "COMPLETE",
    56: "OPEN",
    45: "REJECTED",
    48: "AFTER_MARKET_ORDER",
}

# Exchange status codes (48 = confirmed, empty = not confirmed)
EXCH_STATUS_CODES = {
    48: "CONFIRMED",
    0:  "PENDING",
    "": "NOT_SENT",
}

# ---------------------------------------------------------------------------
# Helper: generate a realistic External Remarks token (EXT_RMKS)
# Format mirrors the reference: L<digits><hex-chars>
# ---------------------------------------------------------------------------

def gen_ext_rmks():
    prefix   = "L"
    digits   = ''.join([str(random.randint(0, 9)) for _ in range(7)])
    hex_part = ''.join(random.choices('0123456789abcdef', k=random.randint(2, 6)))
    return f"{prefix}{digits}{hex_part}"

# ---------------------------------------------------------------------------
# Helper: simulate OMS / Exchange timestamps (epoch-like large int)
# ---------------------------------------------------------------------------

def gen_timestamps():
    base = 1780889400 + random.randint(0, 200)   # base epoch window
    oms_ts  = base + random.randint(0, 30)
    # ~30% orders not yet exchange-confirmed
    if random.random() < 0.30:
        exch_ts = 0
    else:
        exch_ts = oms_ts + random.randint(0, 5)
    return oms_ts, exch_ts

# ---------------------------------------------------------------------------
# Helper: compute latencies
# ---------------------------------------------------------------------------

def compute_latencies(oms_ts, exch_ts):
    # OMS latency: random microseconds (realistic range 1200–3500 µs)
    oms_latency = round(random.uniform(1200, 3500), 2)

    # OMS→Exchange confirmation latency
    if exch_ts == 0:
        oms_exch_conf = 0
    else:
        oms_exch_conf = round((exch_ts - oms_ts) * 1e6 + random.uniform(100, 7300), 2)

    return oms_latency, oms_exch_conf

# ---------------------------------------------------------------------------
# Core: generate N sample orders
# ---------------------------------------------------------------------------

def generate_orders(n=20, base_date="20260608", start_seq=1782):
    orders = []
    seq = start_seq

    for _ in range(n):
        exch_seg   = random.choice(EXCH_SEGMENTS)
        ext_rmks   = gen_ext_rmks()
        oms_status = random.choice(list(OMS_STATUS_CODES.keys()))
        oms_ts, exch_ts = gen_timestamps()
        oms_latency, oms_exch_conf = compute_latencies(oms_ts, exch_ts)

        # Exchange status: only set if exch_ts > 0
        exch_status = 48 if exch_ts > 0 else ""

        orders.append({
            "NOREN_ORD_NUM":        f"{base_date}{str(seq).zfill(6)}",
            "EXCH_SEG":             exch_seg,
            "EXT_RMKS":             ext_rmks,
            "OMS_STATUS":           oms_status,
            "OMS_LATENCY":          oms_latency,
            "EXCH_STATUS":          exch_status,
            "OMS_EXCH_CONFIRMATION": oms_exch_conf,
            "OMSUPDATETIME":        oms_ts,
            "EXCHUPDATETIME":       exch_ts,
        })
        seq += 1

    return orders

# ---------------------------------------------------------------------------
# Writer: dump to L_ORDERLATENCY<TIMESTAMP>.csv
# ---------------------------------------------------------------------------

FIELDNAMES = [
    "NOREN_ORD_NUM",
    "EXCH_SEG",
    "EXT_RMKS",
    "OMS_STATUS",
    "OMS_LATENCY",
    "EXCH_STATUS",
    "OMS_EXCH_CONFIRMATION",
    "OMSUPDATETIME",
    "EXCHUPDATETIME",
]

def write_csv(orders, output_dir="/home/claude"):
    ts       = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"L_ORDERLATENCY{ts}.csv"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for row in orders:
            writer.writerow(row)

    return filepath, filename

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    random.seed(42)                      # deterministic for test run
    orders   = generate_orders(n=25)
    filepath, filename = write_csv(orders)

    print(f"\n✅  File written: {filepath}")
    print(f"\n{'='*72}")
    print(f"head {filename}")
    print(','.join(FIELDNAMES))

    with open(filepath, newline="") as fh:
        reader = csv.DictReader(fh)
        for i, row in enumerate(reader):
            if i >= 10:
                break
            vals = [str(row[f]) for f in FIELDNAMES]
            print(','.join(vals))

    print(f"\n{'='*72}")
    print(f"Total rows written : {len(orders)}")
    print(f"Filename prefix    : L_  ✓")
    print(f"Header columns     : {len(FIELDNAMES)}")
    print(f"New fields added   : EXT_RMKS, OMS_STATUS, EXCH_STATUS  ✓")
