import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ExpenseService } from '../../core/services/expense.service';
import { AuthService } from '../../core/services/auth.service';
import { ExpenseSummaryDto } from '../../core/models/api.models';
import { ConfidenceBarComponent } from '../../shared/components/confidence-bar.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle.component';

@Component({
  selector: 'app-claims-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfidenceBarComponent, StatusBadgeComponent, ThemeToggleComponent],
  template: `
    <header class="sticky top-0 z-40 h-[56px] bg-ink-1 border-b border-line flex items-center px-6 gap-4">
      <a routerLink="/submit" class="text-sapphire-light text-[18px]">‹</a>
      <div>
        <div class="text-[14px] font-extrabold text-white tracking-tight">My Claims</div>
        <div class="text-[10px] text-fog">{{ items().length }} recent submissions</div>
      </div>
      <div class="flex-1"></div>
      <app-theme-toggle size="sm"></app-theme-toggle>
      <a routerLink="/submit" class="btn btn-primary btn-sm">+ New Claim</a>
    </header>

    <div class="page max-w-5xl mx-auto p-6">
      @if (loading()) {
        <div class="card text-center p-10">
          <div class="mx-auto w-9 h-9 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin"></div>
          <div class="text-[12px] text-fog mt-3">Loading recent claims…</div>
        </div>
      } @else if (items().length === 0) {
        <div class="card text-center p-12">
          <div class="text-[40px] mb-3">📋</div>
          <div class="text-[15px] font-bold text-mist">No claims yet</div>
          <div class="text-[12px] text-fog mt-1">Submit your first receipt to see it here.</div>
          <a routerLink="/submit" class="btn btn-primary mt-5">+ Submit a claim</a>
        </div>
      } @else {
        <div class="card p-0 overflow-hidden">
          <table class="w-full">
            <thead class="bg-ink-2">
              <tr class="text-left text-fog text-[10px] font-bold uppercase tracking-wider">
                <th class="py-2.5 px-4">Ref ID</th>
                <th>Vendor</th>
                <th>Total</th>
                <th>Status</th>
                <th>Confidence</th>
                <th class="px-4">Submitted</th>
              </tr>
            </thead>
            <tbody>
              @for (c of items(); track c.refId) {
                <tr class="border-t border-line hover:bg-ink-3 cursor-pointer transition"
                    [routerLink]="['/decision', c.refId]">
                  <td class="py-2.5 px-4 font-mono text-[11px] text-snow">{{ c.refId }}</td>
                  <td class="text-[12px] text-mist">{{ c.vendor || '—' }}</td>
                  <td class="text-[12px] font-semibold text-snow">
                    @if (c.total != null) { {{ c.currency }} {{ c.total | number:'1.2-2' }} } @else { — }
                  </td>
                  <td><app-status-badge [status]="c.status"></app-status-badge></td>
                  <td class="w-[160px]">
                    @if (c.overallConfidence != null) { <app-confidence-bar [value]="c.overallConfidence"></app-confidence-bar> }
                    @else { <span class="text-fog text-[11px]">—</span> }
                  </td>
                  <td class="px-4 text-[11px] text-fog">{{ c.submittedAt | date:'short' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (error(); as e) {
        <div class="alert alert-error mt-4"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
      }
    </div>
  `
})
export class ClaimsPageComponent {
  auth = inject(AuthService);
  private expense = inject(ExpenseService);

  items   = signal<ExpenseSummaryDto[]>([]);
  loading = signal(true);
  error   = signal<string | null>(null);

  ngOnInit() {
    this.expense.recent(50).subscribe({
      next: rows => { this.items.set(rows); this.loading.set(false); },
      error: err  => { this.loading.set(false); this.error.set(err.error?.detail || 'Could not load claims.'); }
    });
  }
}
