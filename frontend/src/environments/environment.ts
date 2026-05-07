// =============================================================
// DEV environment — used by `ng serve` and `ng build` (default config).
// `apiBase` is an ABSOLUTE URL pointing at the .NET backend running locally
// from Visual Studio (HTTPS profile). The Angular dev server on
// http://localhost:4200 calls https://localhost:7029 cross-origin, so:
//
//   1. The backend must allow that origin in CORS — already configured in
//      backend/src/Uc10.Api/appsettings.Development.json under
//      "Cors:AllowedOrigins" (includes http://localhost:4200).
//   2. The browser must trust the .NET dev HTTPS cert. One-time setup:
//        dotnet dev-certs https --trust
//      If you skip this, calls fail silently with no console error.
//   3. If HTTPS gets in the way, swap the URL to http://localhost:5191/api
//      — Visual Studio's HTTPS profile binds both 7029 (https) and 5191
//      (http), so HTTP-only is always available.
//
// `environment.prod.ts` is what ships in the Docker image (nginx proxies
// /api → backend), and `angular.json -> configurations.production
// -> fileReplacements` handles the swap automatically. Edit this file
// freely — production builds don't read it.
// =============================================================
export const environment = {
  production: false,
  apiBase: 'http://expenseiq.runasp.net/api',
  appName: 'ExpenseIQ Pro',
  buildTag: 'FRS v2.0 · Enterprise',
  promptVersion: 'UC10_AUDIT_PROMPT_V2'
};
