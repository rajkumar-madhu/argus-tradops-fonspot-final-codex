import Shell from "@/components/Shell";
import SessionsView from "@/components/SessionsView";
import { EmptyState } from "@/components/UI";
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
        <EmptyState
          title="Unable to load sessions"
          body={`${err}. Confirm the API is running on port 8001.`}
        />
      ) : (
        <SessionsView data={sessions} summary={summary} />
      )}
    </Shell>
  );
}
