import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminService } from '../../../core/services/admin.service';
import { AuditLogRow, AuditVerifyResponse } from '../../../core/models/api.models';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="sticky top-0 z-30 h-[52px] bg-ink-1 border-b border-line flex items-center px-7">
      <div>
        <div class="text-[15px] font-bold text-snow">Audit Log</div>
        <div class="text-[11px] text-fog">Append-only · SHA-256 hash-chained · PII redacted</div>
      </div>
      <div class="flex-1"></div>
      <button class="btn btn-ghost btn-sm" (click)="verify()" [disabled]="verifying()">
        {{ verifying() ? 'Verifying…' : '🔐 Verify Chain' }}
      </button>
      <button class="btn btn-ghost btn-sm ml-2" (click)="download()">⬇ Export CSV</button>
      <button class="btn btn-ghost btn-sm ml-2" (click)="load()">🔄 Refresh</button>
    </header>

    <div class="page p-7">
      @if (verifyResult(); as v) {
        <div class="alert" [class]="v.intact ? 'alert-success' : 'alert-error'">
          <span class="alert-icon">{{ v.intact ? '✓' : '✕' }}</span>
          <div>
            @if (v.intact) {
              Chain integrity verified — {{ rowsCount() }} entries, 0 divergences.
            } @else {
              <strong>Tamper detected</strong> at seq {{ v.divergences[0].seq }}:
              expected <code class="font-mono">{{ v.divergences[0].expectedHash.slice(0, 16) }}…</code>
              but stored <code class="font-mono">{{ v.divergences[0].actualHash.slice(0, 16) }}…</code>.
              ({{ v.divergences.length }} total divergence{{ v.divergences.length === 1 ? '' : 's' }})
            }
          </div>
        </div>
      }

      @if (loading()) {
        <div class="card text-center p-10"><div class="mx-auto w-8 h-8 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin"></div></div>
      } @else if (rows().length === 0) {
        <div class="card text-center p-10 text-fog text-[12px]">No audit entries in the chain yet.</div>
      } @else {
        <div class="card p-0 overflow-hidden">
          <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="bg-ink-2">
              <tr class="text-left text-fog text-[10px] font-bold uppercase tracking-wider">
                <th class="py-2.5 px-3">Seq</th>
                <th class="px-2">Timestamp</th>
                <th class="px-2">Module</th>
                <th class="px-2">Model</th>
                <th class="px-2">Prompt</th>
                <th class="px-2">Confidence</th>
                <th class="px-2">Prev hash</th>
                <th class="px-3">Hash</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.seq) {
                <tr class="border-t border-line hover:bg-ink-3">
                  <td class="py-2 px-3 font-mono text-snow">{{ r.seq }}</td>
                  <td class="px-2 text-mist whitespace-nowrap">{{ r.ts | date:'medium' }}</td>
                  <td class="px-2 text-snow font-semibold">{{ r.module }}</td>
                  <td class="px-2 font-mono text-fog">{{ r.modelVersion }}</td>
                  <td class="px-2 font-mono text-violet-light">{{ r.promptVersion || '—' }}</td>
                  <td class="px-2 font-mono text-emerald-light">{{ r.confidence != null ? ((r.confidence * 100) | number:'1.1-1') + '%' : '—' }}</td>
                  <td class="px-2 font-mono text-fog">{{ r.prevHash.slice(0, 12) }}…</td>
                  <td class="px-3 font-mono text-teal-light">{{ r.hash.slice(0, 12) }}…</td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        </div>
      }
    </div>
  `
})
export class AuditLogsPageComponent {
  private admin = inject(AdminService);
  private toast = inject(ToastService);
  private auth  = inject(AuthService);

  rows          = signal<AuditLogRow[]>([]);
  loading       = signal(true);
  verifying     = signal(false);
  verifyResult  = signal<AuditVerifyResponse | null>(null);

  ngOnInit() { this.load(); }

  rowsCount = () => this.rows().length;

  load() {
    this.loading.set(true);
    this.verifyResult.set(null);
    this.admin.auditLogs({ limit: 500 }).subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: err  => { this.loading.set(false); this.toast.push(err.error?.detail || 'Load failed.', 'error'); }
    });
  }

  verify() {
    this.verifying.set(true);
    this.admin.verifyChain().subscribe({
      next: r => { this.verifyResult.set(r); this.verifying.set(false); this.toast.push(r.intact ? 'Chain intact' : 'Tamper detected!', r.intact ? 'success' : 'error'); },
      error: err => { this.verifying.set(false); this.toast.push(err.error?.detail || 'Verify failed.', 'error'); }
    });
  }

  download() {
    // Download via fetch with auth header, then trigger save — raw <a href> would miss the JWT.
    const url = this.admin.exportCsvUrl();
    const token = this.auth.token();
    if (!token) { this.toast.push('Not authenticated.', 'error'); return; }
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch(e => this.toast.push(String(e), 'error'));
  }
}
