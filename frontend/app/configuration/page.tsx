import Shell from "@/components/Shell";
import ConfigurationView from "@/components/ConfigurationView";
import { EmptyState } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";
import { priceDivisorsText } from "@/lib/format";
import { serverRuntimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [config, bus, elk, exchanges, infra, market, files]: any[] = await Promise.all([
    getJSON("/api/config"),
    getJSON("/api/event-bus/status"),
    getJSON("/api/elk/status"),
    getJSON("/api/exchanges"),
    getJSON("/api/infra"),
    getJSON("/api/market-data"),
    getJSON("/api/files/sources"),
  ]);
  const err = apiError(config);

  return (
    <Shell>
      {err ? (
        <EmptyState title="Unable to load configuration" body={err} />
      ) : (
        <ConfigurationView
          config={config}
          priceDivisors={priceDivisorsText(config)}
          bus={apiError(bus) ? {} : bus}
          elk={apiError(elk) ? {} : elk}
          exchanges={apiError(exchanges) ? {} : exchanges}
          infra={apiError(infra) ? {} : infra}
          market={apiError(market) ? {} : market}
          files={apiError(files) ? {} : files}
          apiUrl={serverRuntimeConfig().apiUrl}
        />
      )}
    </Shell>
  );
}
