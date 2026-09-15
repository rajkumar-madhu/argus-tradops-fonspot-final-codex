import json
from typing import Any

from fastapi.responses import JSONResponse


class ListJSONResponse(JSONResponse):
    """A JSON response for large list payloads that skips FastAPI's encoder.

    A dict returned from a route goes through ``fastapi.encoders.jsonable_encoder``,
    a pure-Python walk of every value. On a 10 000-row order list with journal
    evidence (~15 MB) that walk costs ~8x more than serialising the same dict with
    ``json.dumps`` (measured: 436 ms vs 55 ms on the 26 MB sample journal), and on
    a CPU-capped pod it was the dominant cost of ``/api/orders``. Returning a
    Response instance bypasses the encoder; ``default=str`` keeps the one thing it
    did for us (datetimes and other non-JSON scalars render as their string form).
    """

    def render(self, content: Any) -> bytes:
        return json.dumps(content, default=str, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
