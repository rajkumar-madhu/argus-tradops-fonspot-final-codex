from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SymbolSpec:
    symbol: str
    exchange: str
    segment: str


def infer_exchange_segment(symbol: str) -> tuple[str, str]:
    """Best-effort mapping from TrueData symbol naming conventions."""
    upper = symbol.upper()
    if upper.endswith("-I") or "FUT" in upper or upper.startswith("NIFTY") and "-I" in upper:
        return "NFO", "FUT"
    if upper.endswith("-EQ") or "-EQ" in upper:
        return "NSE", "EQ"
    if upper.startswith("SENSEX") or upper.endswith("-BSE"):
        return "BSE", "EQ"
    return "NSE", "EQ"


def parse_symbol_specs(raw: str) -> list[SymbolSpec]:
    """Parse `TRUEDATA_SYMBOLS`.

    Accepted forms (comma-separated):
      RELIANCE-EQ
      NIFTY-I:NFO:FUT
      BANKNIFTY-I
    """
    specs: list[SymbolSpec] = []
    for part in (raw or "").split(","):
        token = part.strip()
        if not token:
            continue
        pieces = [p.strip() for p in token.split(":") if p.strip()]
        symbol = pieces[0]
        if len(pieces) >= 3:
            exchange, segment = pieces[1], pieces[2]
        else:
            exchange, segment = infer_exchange_segment(symbol)
        specs.append(SymbolSpec(symbol=symbol, exchange=exchange, segment=segment))
    return specs
