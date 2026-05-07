// =============================================================
// PROD environment — what ships in the Docker image deployed to the
// hackathon portal (and any same-origin nginx-fronted host).
//
// `apiBase: '/api'` is RELATIVE, so the browser sends requests to whichever
// host is currently serving the SPA. Inside the frontend container,
// nginx.conf reverse-proxies `/api/*` and `/health` to the `backend`
// service on the internal Docker network. This means:
//   - Zero CORS (same-origin)
//   - Zero hardcoded URL — works on localhost:4300, on the portal's
//     proxy-…run.app domain, or anywhere else without a config change.
//
// Don't put a backend URL here unless you specifically want the SPA to
// call a different host than the one serving it.
// =============================================================
export const environment = {
  production: true,
  apiBase: 'http://expenseiq.runasp.net/api',
  appName: 'ExpenseIQ Pro',
  buildTag: 'FRS v2.0 · Enterprise',
  promptVersion: 'UC10_AUDIT_PROMPT_V2'
};
