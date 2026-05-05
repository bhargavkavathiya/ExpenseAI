import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThresholdDto } from '../../../core/models/api.models';

@Component({
  selector: 'app-thresholds-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="sticky top-0 z-30 h-[52px] bg-ink-1 border-b border-line flex items-center px-7">
      <div>
        <div class="text-[15px] font-bold text-snow">Runtime Thresholds</div>
        <div class="text-[11px] text-fog">Tune audit behavior without redeployment</div>
      </div>
    </header>

    <div class="page p-7 max-w-4xl">
      <div class="alert alert-info">
        <span class="alert-icon">ℹ</span>
        <div>Changes are persisted via <code class="font-mono">sp_update_threshold</code> and reflected on subsequent submissions immediately.</div>
      </div>

      @if (loading()) {
        <div class="card text-center p-10"><div class="mx-auto w-8 h-8 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin"></div></div>
      } @else {
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-[13px]">
            <thead class="bg-ink-2">
              <tr class="text-left text-fog text-[10px] font-bold uppercase tracking-wider">
                <th class="py-2.5 px-4">Key</th>
                <th>Current value</th>
                <th class="px-4">New value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (t of items(); track t.key) {
                <tr class="border-t border-line hover:bg-ink-3">
                  <td class="py-3 px-4 font-mono text-[11px] text-snow">{{ t.key }}</td>
                  <td class="text-mist">{{ t.value }}</td>
                  <td class="px-4"><input type="number" class="fc !py-1.5 !px-2 w-40 text-[12px]"
                                          [(ngModel)]="edits[t.key]" name="k-{{t.key}}"></td>
                  <td class="px-4">
                    <button class="btn btn-primary btn-xs"
                            (click)="save(t.key)"
                            [disabled]="edits[t.key] == null || edits[t.key] === t.value || busy()[t.key]">
                      {{ busy()[t.key] ? 'Saving…' : 'Save' }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `
})
export class ThresholdsPageComponent {
  private admin = inject(AdminService);
  private toast = inject(ToastService);

  items   = signal<ThresholdDto[]>([]);
  loading = signal(true);
  busy    = signal<Record<string, boolean>>({});
  edits: Record<string, number> = {};

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.admin.thresholds().subscribe({
      next: rows => {
        this.items.set(rows);
        rows.forEach(r => this.edits[r.key] = r.value);
        this.loading.set(false);
      },
      error: err => { this.loading.set(false); this.toast.push(err.error?.detail || 'Load failed.', 'error'); }
    });
  }

  save(key: string) {
    const v = this.edits[key];
    if (v == null) return;
    this.busy.update(b => ({ ...b, [key]: true }));
    this.admin.updateThreshold(key, v).subscribe({
      next: r => {
        this.toast.push(`${key} → ${r.value}`, 'success');
        this.busy.update(b => ({ ...b, [key]: false }));
        this.load();
      },
      error: err => {
        this.toast.push(err.error?.detail || 'Save failed.', 'error');
        this.busy.update(b => ({ ...b, [key]: false }));
      }
    });
  }
}
