export default function Home() {
  return (
    <main>
      <h1>MIM VENTURES — Next.js migration scaffold</h1>
      <p>
        The static dashboard in <code>/web</code> remains the supported UI. This app proxies existing
        endpoints through <code>/api/[...path]</code> so components can be migrated incrementally.
      </p>
      <ul>
        <li><a href="/api/health">/api/health</a></li>
        <li><a href="/api/market">/api/market</a></li>
        <li><a href="/api/screener">/api/screener</a></li>
        <li><a href="/api/summary">/api/summary</a></li>
        <li><a href="/api/session">/api/session</a></li>
      </ul>
      <p>Set <code>MIM_VENTURES_UPSTREAM</code> to the running Node server before starting Next.js.</p>
    </main>
  );
}
