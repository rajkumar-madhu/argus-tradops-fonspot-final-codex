'use client';
export default function Error({reset}:{reset:()=>void}){return <main className="route-loading" role="alert"><h1>This view is temporarily unavailable</h1><p>Retry the request or return to the operations overview.</p><button type="button" onClick={reset}>Try again</button><a href="/dashboard">Operations overview</a></main>}
