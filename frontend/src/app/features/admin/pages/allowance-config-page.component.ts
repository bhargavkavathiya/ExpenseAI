import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../../core/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  BandAllowances,
  EmployeeBandWithAllowancesDto,
  UpdateAllBandAllowancesRequest
} from '../../../core/models/api.models';

interface BandRow {
  code: string;
  name: string;
  allowances: BandAllowances;
}

@Component({
  selector: 'app-allowance-config-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="sticky top-0 z-30 h-[52px] bg-ink-1 border-b border-line flex items-center px-7">
      <div>
        <div class="text-[15px] font-bold text-snow flex items-center gap-2">
          <span class="text-sapphire-light">💳</span>
          Band-wise Allowance Configuration
        </div>
        <div class="text-[11px] text-fog">Runtime caps used by the policy engine · no redeploy required</div>
      </div>
      <div class="flex-1"></div>
      <button class="btn btn-ghost btn-sm" [disabled]="saving() || loading()" (click)="resetDefaults()">
        ↺ Reset Defaults
      </button>
      <button class="btn btn-primary btn-sm ml-2" [disabled]="saving() || loading() || !dirty()" (click)="save()">
        {{ saving() ? 'Saving…' : '💾 Save Configuration' }}
      </button>
    </header>

    <div class="page p-7">
      @if (loading()) {
        <div class="card text-center p-10">
          <div class="mx-auto w-8 h-8 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin"></div>
          <div class="text-[12px] text-fog mt-3">Loading band configuration…</div>
        </div>
      } @else if (rows().length === 0) {
        <div class="card text-center p-12 text-fog text-[13px]">No bands configured.</div>
      } @else {
        <div class="card p-0 overflow-hidden">
          <table class="w-full">
            <thead class="bg-ink-2">
              <tr class="text-left text-fog text-[10px] font-bold uppercase tracking-[0.1em]">
                <th class="py-3 px-6 w-[110px]">Band</th>
                <th class="px-2">Daily Limit (₹)</th>
                <th class="px-2">Meals Limit (₹)</th>
                <th class="px-2">Hotel Limit (₹)</th>
                <th class="px-2">Fuel Limit (₹)</th>
                <th class="px-6 pr-6">Mgr Review Threshold (₹)</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.code) {
                <tr class="border-t border-line hover:bg-ink-3/30 transition-colors">
                  <td class="py-4 px-6">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full
                                 bg-sapphire/15 border border-sapphire/30 text-sapphire-light
                                 font-semibold text-[12px] tracking-wide"
                          [title]="r.name">
                      <span class="w-1.5 h-1.5 rounded-full bg-sapphire-light"></span>
                      {{ r.code }}
                    </span>
                  </td>
                  <td class="px-2 py-3">
                    <input type="number" min="0" step="100"
                           class="fc !py-2.5 !px-3 w-full font-semibold text-snow"
                           [(ngModel)]="r.allowances.dailyLimit" name="dl-{{r.code}}"
                           (ngModelChange)="markDirty()">
                  </td>
                  <td class="px-2 py-3">
                    <input type="number" min="0" step="50"
                           class="fc !py-2.5 !px-3 w-full font-semibold text-snow"
                           [(ngModel)]="r.allowances.mealsLimit" name="ml-{{r.code}}"
                           (ngModelChange)="markDirty()">
                  </td>
                  <td class="px-2 py-3">
                    <input type="number" min="0" step="100"
                           class="fc !py-2.5 !px-3 w-full font-semibold text-snow"
                           [(ngModel)]="r.allowances.hotelLimit" name="hl-{{r.code}}"
                           (ngModelChange)="markDirty()">
                  </td>
                  <td class="px-2 py-3">
                    <input type="number" min="0" step="100"
                           class="fc !py-2.5 !px-3 w-full font-semibold text-snow"
                           [(ngModel)]="r.allowances.fuelLimit" name="fl-{{r.code}}"
                           (ngModelChange)="markDirty()">
                  </td>
                  <td class="px-6 py-3 pr-6">
                    <input type="number" min="0" step="100"
                           class="fc !py-2.5 !px-3 w-full font-semibold text-snow"
                           [(ngModel)]="r.allowances.mgrReviewThreshold" name="mrt-{{r.code}}"
                           (ngModelChange)="markDirty()">
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (dirty()) {
          <div class="alert alert-warn mt-4">
            <span class="alert-icon">⚠</span>
            <div>You have unsaved changes. Press <strong>Save Configuration</strong> to publish, or <strong>Reset Defaults</strong> to discard and restore the shipped baseline.</div>
          </div>
        } @else {
          <div class="mt-4 text-[11px] text-fog font-mono text-center">
            Config in sync with server · any submit after this moment uses these caps.
          </div>
        }
      }
    </div>
  `
})
export class AllowanceConfigPageComponent {
  private admin = inject(AdminService);
  private toast = inject(ToastService);

  rows    = signal<BandRow[]>([]);
  loading = signal(true);
  saving  = signal(false);
  dirty   = signal(false);

  ngOnInit() { this.load(); }

  private load() {
    this.loading.set(true);
    this.admin.employeeBands().subscribe({
      next: bands => {
        this.rows.set(this.toRows(bands));
        this.loading.set(false);
        this.dirty.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.toast.push(err.error?.detail || 'Failed to load bands.', 'error');
      }
    });
  }

  markDirty() { this.dirty.set(true); }

  save() {
    const req: UpdateAllBandAllowancesRequest = {
      bands: this.rows().map(r => ({
        code: r.code,
        allowances: {
          dailyLimit:         Number(r.allowances.dailyLimit ?? 0),
          mealsLimit:         Number(r.allowances.mealsLimit ?? 0),
          hotelLimit:         Number(r.allowances.hotelLimit ?? 0),
          fuelLimit:          Number(r.allowances.fuelLimit ?? 0),
          mgrReviewThreshold: Number(r.allowances.mgrReviewThreshold ?? 0)
        }
      }))
    };
    this.saving.set(true);
    this.admin.updateBands(req).subscribe({
      next: bands => {
        this.rows.set(this.toRows(bands));
        this.saving.set(false);
        this.dirty.set(false);
        this.toast.push('Band allowances saved and published.', 'success');
      },
      error: err => {
        this.saving.set(false);
        const body: any = err.error;
        const firstValidationMsg = body?.errors
          ? Object.values<any>(body.errors)[0]?.[0]
          : null;
        this.toast.push(body?.detail || firstValidationMsg || 'Save failed.', 'error');
      }
    });
  }

  resetDefaults() {
    if (!confirm('Restore all band allowances to the shipped defaults? This overwrites the current server-side values.')) return;
    this.saving.set(true);
    this.admin.resetBands().subscribe({
      next: bands => {
        this.rows.set(this.toRows(bands));
        this.saving.set(false);
        this.dirty.set(false);
        this.toast.push('Defaults restored.', 'info');
      },
      error: err => {
        this.saving.set(false);
        this.toast.push(err.error?.detail || 'Reset failed.', 'error');
      }
    });
  }

  private toRows(bands: EmployeeBandWithAllowancesDto[]): BandRow[] {
    return bands
      .slice()
      .sort((a, b) => a.rankOrder - b.rankOrder)
      .map(b => ({
        code: b.code,
        name: b.name,
        allowances: {
          dailyLimit:         Number(b.allowances?.dailyLimit         ?? 0),
          mealsLimit:         Number(b.allowances?.mealsLimit         ?? 0),
          hotelLimit:         Number(b.allowances?.hotelLimit         ?? 0),
          fuelLimit:          Number(b.allowances?.fuelLimit          ?? 0),
          mgrReviewThreshold: Number(b.allowances?.mgrReviewThreshold ?? 0)
        }
      }));
  }
}
