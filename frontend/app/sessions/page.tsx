import Shell from "@/components/Shell";
import SessionsOverview from "@/components/SessionsOverview";
import { ApiErrorState } from "@/components/UI";
import { apiError, getJSON } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [sessions, summary]: any[] = await Promise.all([
    getJSON("/api/sessions"),
    getJSON("/api/sessions/summary"),
  ]);
  const err = apiError(sessions) || apiError(summary);

  return (
    <Shell>
      {err ? (
        <ApiErrorState title="Unable to load sessions" data={apiError(sessions) ? sessions : summary} />
      ) : (
        <SessionsOverview data={sessions} summary={summary} />
      )}
    </Shell>
  );
}
