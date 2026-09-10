import Shell from "@/components/Shell";
import IncidentsView from "@/components/IncidentsView";
import { getJSON } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [persisted, derived, rejections, yel] = await Promise.all([
    getJSON("/api/incidents?limit=50"),
    getJSON("/api/incidents/derived?lookback=24h"),
    getJSON("/api/rejections"),
    getJSON("/api/exchanges/yel"),
  ]);

  return (
    <Shell>
      <IncidentsView persisted={persisted} derived={derived} rejections={rejections} yel={yel} />
    </Shell>
  );
}
