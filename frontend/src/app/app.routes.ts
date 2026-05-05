import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'submit' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/auth-page.component').then(m => m.AuthPageComponent)
  },
  {
    path: 'submit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/employee/submit-page.component').then(m => m.SubmitPageComponent)
  },
  {
    path: 'decision/:refId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/employee/decision-page.component').then(m => m.DecisionPageComponent)
  },
  {
    path: 'my-claims',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/employee/claims-page.component').then(m => m.ClaimsPageComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('analyst', 'compliance', 'admin')],
    loadComponent: () =>
      import('./features/admin/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard',    loadComponent: () => import('./features/admin/pages/dashboard-page.component').then(m => m.DashboardPageComponent) },
      { path: 'review-queue', loadComponent: () => import('./features/admin/pages/review-queue-page.component').then(m => m.ReviewQueuePageComponent) },
      { path: 'thresholds',   loadComponent: () => import('./features/admin/pages/thresholds-page.component').then(m => m.ThresholdsPageComponent), canActivate: [roleGuard('compliance', 'admin')] },
      { path: 'allowances',   loadComponent: () => import('./features/admin/pages/allowance-config-page.component').then(m => m.AllowanceConfigPageComponent), canActivate: [roleGuard('compliance', 'admin')] },
      { path: 'audit-logs',   loadComponent: () => import('./features/admin/pages/audit-logs-page.component').then(m => m.AuditLogsPageComponent), canActivate: [roleGuard('compliance', 'admin')] },
      { path: 'integrations', loadComponent: () => import('./features/admin/pages/integrations-page.component').then(m => m.IntegrationsPageComponent) }
    ]
  },
  { path: '**', redirectTo: 'submit' }
];
