import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';
import { ExpenseService } from '../../core/services/expense.service';
import { GstinService } from '../../core/services/gstin.service';
import { ToastService } from '../../core/services/toast.service';
import { GstinVerifyResponse } from '../../core/models/api.models';
import { environment } from '../../../environments/environment';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle.component';

@Component({
  selector: 'app-submit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ThemeToggleComponent],
  template: `
    <header class="sticky top-0 z-40 h-[56px] bg-ink-1 border-b border-line flex items-center px-6 gap-4">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-sapphire to-teal-light flex items-center justify-center text-[14px]">💼</div>
        <div>
          <div class="text-[14px] font-extrabold text-white tracking-tight">{{ appName }}</div>
          <div class="text-[10px] text-fog uppercase tracking-[0.1em]">New Claim</div>
        </div>
      </div>
      <div class="flex-1"></div>
      <app-theme-toggle size="sm"></app-theme-toggle>
      <a routerLink="/my-claims" class="btn btn-ghost btn-sm">📋 My Claims</a>
      @if (auth.isAnalyst()) {
        <a routerLink="/admin" class="btn btn-ghost btn-sm">🛡️ Admin</a>
      }
      <button class="btn btn-ghost btn-sm" (click)="auth.logout()">Sign out</button>
    </header>

    <div class="page max-w-4xl mx-auto p-6">
      <div class="card">
        <div class="flex items-center gap-2.5 mb-5">
          <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-sapphire to-teal-light flex items-center justify-center text-[16px]">📝</div>
          <div>
            <div class="text-[17px] font-bold text-white">New Expense Claim</div>
            <div class="text-[11px] text-fog">Upload a receipt — the AI pipeline extracts fields, compares with what you claim, validates against your band's allowances, and produces an audit summary.</div>
          </div>
        </div>

        <form (ngSubmit)="submit()" class="space-y-6">

          <!-- ─────── Section 1: Employee context ─────── -->
          <section>
            <div class="text-[10px] font-bold text-ink-5 uppercase tracking-[0.14em] mb-3">Employee</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="fl">Employee Name</label>
                <input class="fc" name="empName" [(ngModel)]="form.employeeName" placeholder="Priya Mehta">
                <div class="fhint text-[10px] text-fog mt-1">Prefilled from your profile. Edit if this claim is on behalf of someone else.</div>
              </div>
              <div>
                <label class="fl">Department</label>
                <select class="fc" name="dept" [(ngModel)]="form.department">
                  <option value="">—</option>
                  @for (d of departments; track d) { <option [value]="d">{{ d }}</option> }
                </select>
              </div>
            </div>
          </section>

          <!-- ─────── Section 2: Claim details ─────── -->
          <section>
            <div class="text-[10px] font-bold text-ink-5 uppercase tracking-[0.14em] mb-3">Claim Details</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="fl">Category <span class="text-crimson-light">*</span></label>
                <select class="fc" name="cat" [(ngModel)]="form.category" required>
                  <option>Meals</option>
                  <option>Hotel</option>
                  <option>Fuel</option>
                  <option>Travel</option>
                  <option>Entertainment</option>
                  <option>Office Supplies</option>
                </select>
              </div>
              <div>
                <label class="fl">Payment Mode</label>
                <select class="fc" name="pay" [(ngModel)]="form.paymentMode">
                  <option>Corporate Card</option>
                  <option>Personal Card</option>
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Net Banking</option>
                </select>
              </div>
              <div>
                <label class="fl">Amount (₹) <span class="text-crimson-light">*</span></label>
                <input type="number" min="0" step="0.01"
                       class="fc text-[15px] font-bold"
                       name="amt" [(ngModel)]="form.claimedAmount" required
                       placeholder="0.00">
              </div>
              <div>
                <label class="fl">Date <span class="text-crimson-light">*</span></label>
                <input type="date" class="fc" name="date" [(ngModel)]="form.claimedDate" required>
              </div>
              <div>
                <label class="fl">Merchant Name <span class="text-crimson-light">*</span></label>
                <input class="fc" name="merchant" [(ngModel)]="form.claimedMerchant" required
                       placeholder="Hotel Grand Hyatt · Auto Travels · Swiggy …">
              </div>
              <div>
                <label class="fl">GSTIN</label>
                <div class="relative">
                  <input class="fc font-mono pr-8" name="gstin"
                         [ngModel]="form.claimedGstin"
                         (ngModelChange)="onGstinChange($event)"
                         maxlength="15"
                         placeholder="27AABCU9603R1ZX">
                  @if (gstinChecking()) {
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-line-2 border-t-sapphire-light rounded-full animate-spin"></span>
                  }
                  @if (!gstinChecking() && gstinResult(); as g) {
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[14px]"
                          [style.color]="g.verified ? '#10b981' : '#ef4444'">
                      {{ g.verified ? '✓' : '✕' }}
                    </span>
                  }
                </div>
                @if (gstinHint(); as h) {
                  <div class="fhint mt-1" [class]="h.class">{{ h.text }}</div>
                } @else {
                  <div class="fhint text-[10px] text-fog mt-1">15-char GSTIN — verification runs automatically as you type.</div>
                }
              </div>
            </div>
          </section>

          <!-- ─────── Section 3: Context ─────── -->
          <section>
            <div class="text-[10px] font-bold text-ink-5 uppercase tracking-[0.14em] mb-3">Context</div>
            <div class="space-y-4">
              <div>
                <label class="fl">Business Purpose <span class="text-crimson-light">*</span></label>
                <input class="fc" name="purpose" [(ngModel)]="form.purpose" required
                       placeholder="Client lunch with Infosys team · vendor onsite travel · team offsite …">
              </div>
              <div class="md:max-w-xs">
                <label class="fl">City</label>
                <input class="fc" name="city" [(ngModel)]="form.city" placeholder="Mumbai">
              </div>
            </div>
          </section>

          <!-- ─────── Section 4: Documents ─────── -->
          <section>
            <div class="text-[10px] font-bold text-ink-5 uppercase tracking-[0.14em] mb-3">Documents</div>
            <label class="fl">Merchant Bill (Image or PDF) <span class="text-crimson-light">*</span></label>
            <div class="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer bg-ink-3 transition"
                 [class]="file() ? 'border-emerald/50 bg-emerald/5 hover:border-emerald' : 'border-line-2 hover:border-sapphire-light hover:bg-sapphire/5'"
                 (click)="fileInput.click()">
              <input type="file" #fileInput accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
                     (change)="onFile($event)" class="hidden">
              @if (file(); as f) {
                <div class="flex items-center justify-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-emerald/15 flex items-center justify-center text-emerald-light text-[18px]">✓</div>
                  <div class="text-left">
                    <div class="text-[13px] font-semibold text-snow">{{ f.name }}</div>
                    <div class="text-[11px] text-fog">{{ fmtBytes(f.size) }} · {{ f.type }}</div>
                  </div>
                  <button type="button" class="ml-4 text-[11px] text-crimson-light hover:underline" (click)="clearFile($event)">Remove</button>
                </div>
              } @else {
                <div class="text-[24px] mb-1">📄</div>
                <div class="text-[12px] font-semibold text-mist">Tap to upload receipt</div>
                <div class="text-[10px] text-fog mt-1">JPEG · PNG · WebP · PDF · max 10 MB</div>
              }
            </div>
          </section>

          <!-- Info alert -->
          <div class="alert alert-info">
            <span class="alert-icon">ℹ</span>
            <div>
              The AI runs Optical Character Recognition (OCR), duplicate detection, anomaly detection,
              policy rules, and Goods and Services Tax Identification Number (GSTIN) lookup in parallel.
              What you enter above is compared with what OCR reads from the receipt — any mismatch
              shows up as a flag on the next screen. Audit entries are appended to a SHA-256 hash-chained log.
            </div>
          </div>

          @if (error(); as e) {
            <div class="alert alert-error"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
          }

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-line">
            <a routerLink="/my-claims" class="btn btn-ghost">Cancel</a>
            <button type="submit" class="btn btn-primary" [disabled]="!canSubmit() || submitting()">
              @if (submitting()) {
                <span class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin mr-1.5"></span>
                <span>{{ processingMsg() }}</span>
              } @else {
                <span>⚡ Submit &amp; Audit</span>
              }
            </button>
          </div>
        </form>
      </div>

      <div class="mt-4 text-[11px] text-fog text-center font-mono">
        Signed in as {{ auth.user()?.email || '—' }}
        @if (auth.user()?.profile?.band; as b) { · band <span class="text-sapphire-light">{{ b }}</span> }
        · role(s): {{ auth.roles().join(', ') || '—' }}
      </div>
    </div>
  `
})
export class SubmitPageComponent implements OnInit {
  auth    = inject(AuthService);
  private expense = inject(ExpenseService);
  private gstin   = inject(GstinService);
  private toast   = inject(ToastService);
  private router  = inject(Router);

  appName = environment.appName;

  // ---- GSTIN live-verification state ----
  gstinChecking = signal(false);
  gstinResult   = signal<GstinVerifyResponse | null>(null);
  private gstinDebounce: ReturnType<typeof setTimeout> | null = null;

  onGstinChange(value: string) {
    const upper = (value || '').toUpperCase();
    this.form.claimedGstin = upper;

    // Reset any pending check; clear the result when the user edits the field.
    if (this.gstinDebounce) { clearTimeout(this.gstinDebounce); this.gstinDebounce = null; }
    this.gstinResult.set(null);
    this.gstinChecking.set(false);

    if (upper.length === 0) return;

    // Wait until it's the correct length before hitting the server; but do show
    // a warning hint if the format is clearly wrong once they've typed 15.
    if (upper.length === 15) {
      if (!this.gstin.isWellFormed(upper)) {
        this.gstinResult.set({
          gstin: upper, verified: false, status: 'invalid_format',
          legalName: null, stateCode: null, state: null, circuitOpen: false
        });
        return;
      }
      this.gstinChecking.set(true);
      this.gstinDebounce = setTimeout(() => {
        this.gstin.verify(upper).subscribe({
          next: r => { this.gstinResult.set(r); this.gstinChecking.set(false); },
          error: () => {
            this.gstinChecking.set(false);
            this.gstinResult.set({
              gstin: upper, verified: false, status: 'lookup_failed',
              legalName: null, stateCode: null, state: null, circuitOpen: false
            });
          }
        });
      }, 300);
    }
  }

  gstinHint(): { text: string; class: string } | null {
    const g = this.gstinResult();
    if (!g) {
      const cur = this.form.claimedGstin || '';
      if (cur.length === 0) return null;
      if (cur.length < 15)   return { text: `${cur.length}/15 chars…`, class: 'text-[10px] text-fog mt-1' };
      return null;
    }
    if (g.verified) {
      const loc = g.state ? ` · ${g.state}` : '';
      const name = g.legalName ? ` · ${g.legalName}` : '';
      const sim  = g.status.includes('simulated') ? ' (simulated — configure Gstin:ApiKey for live)' : '';
      return { text: `✓ ${g.status.toUpperCase()}${loc}${name}${sim}`, class: 'text-[10px] text-emerald-light mt-1 font-mono' };
    }
    if (g.status === 'invalid_format')
      return { text: '✕ Not a valid GSTIN format (expected 15 chars · state-code + PAN + entity + Z + check).', class: 'text-[10px] text-crimson-light mt-1' };
    if (g.circuitOpen)
      return { text: '⚠ GSTIN service temporarily unavailable — claim will still submit.', class: 'text-[10px] text-amber-light mt-1' };
    return { text: `✕ Lookup failed (${g.status}).`, class: 'text-[10px] text-crimson-light mt-1' };
  }

  submitting    = signal(false);
  error         = signal<string | null>(null);
  processingMsg = signal('Submitting…');

  private _file = signal<File | null>(null);
  file = this._file.asReadonly();

  departments = ['Sales', 'Engineering', 'Marketing', 'Finance', 'HR', 'Operations', 'IT', 'Legal', 'Procurement'];

  form = {
    employeeName:    '' as string,
    department:      '' as string,
    category:        'Meals' as string,
    paymentMode:     'Corporate Card' as string,
    claimedAmount:   null as number | null,
    claimedDate:     new Date().toISOString().slice(0, 10),
    claimedMerchant: '' as string,
    claimedGstin:    '' as string,
    purpose:         '' as string,
    city:            '' as string
  };

  // Plain method (not a signal-tracking computed) so ngModel updates to the
  // mutable `form` object are picked up on every change-detection cycle —
  // without this, editing Amount/Date/Merchant after dropping the file left
  // canSubmit cached at `false` and the button stayed disabled.
  canSubmit(): boolean {
    const amt = Number(this.form.claimedAmount);
    return !!this.form.purpose?.trim() &&
           !!this.form.claimedMerchant?.trim() &&
           !!this.form.claimedDate &&
           !Number.isNaN(amt) && amt > 0 &&
           !!this._file();
  }

  ngOnInit() {
    // Prefill from cached profile so the form is populated immediately.
    this.applyProfileToForm(this.auth.user()?.profile, this.auth.user()?.email);

    // Then refresh from /api/auth/me — picks up the latest profile data the
    // user may have set after their cached login (e.g. via an admin-side
    // edit). Silent on failure since the form is already prefilled.
    this.auth.me().subscribe({
      next: u => this.applyProfileToForm(u.profile, u.email),
      error: () => { /* network blip — keep the cached values */ }
    });
  }

  private applyProfileToForm(profile: any, email: string | null | undefined) {
    // Only overwrite empty fields so any user edits aren't clobbered when the
    // /me refresh lands after they've already started typing.
    if (!this.form.employeeName) {
      this.form.employeeName = profile?.fullName || this.deriveNameFromEmail(email) || '';
    }
    if (!this.form.department && profile?.department) {
      this.form.department = profile.department;
    }
  }

  // "nikunj.trivedi@amnex.com" → "Nikunj Trivedi"; "admin@demo.local" → "Admin".
  // Used as a softer default when the user hasn't filled their full name in
  // registration. Always editable, so picking something is harmless.
  private deriveNameFromEmail(email: string | null | undefined): string {
    if (!email) return '';
    const local = email.split('@')[0] || '';
    return local.split(/[._-]/).filter(Boolean)
      .map(s => s[0].toUpperCase() + s.slice(1).toLowerCase())
      .join(' ');
  }

  onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      this.toast.push('File exceeds 10 MB limit.', 'error');
      return;
    }
    this._file.set(f);
  }

  clearFile(event: Event) {
    event.stopPropagation();
    this._file.set(null);
  }

  submit() {
    const f = this._file();
    if (!f || !this.canSubmit()) return;
    this.error.set(null);
    this.submitting.set(true);
    this.cycleProcessingMessages();

    this.expense.submit(f, {
      category:        this.form.category,
      paymentMode:     this.form.paymentMode,
      purpose:         this.form.purpose.trim(),
      city:            this.form.city.trim() || undefined,
      claimedAmount:   this.form.claimedAmount ?? undefined,
      claimedDate:     this.form.claimedDate || undefined,
      claimedMerchant: this.form.claimedMerchant.trim() || undefined,
      claimedGstin:    this.form.claimedGstin.trim().toUpperCase() || undefined,
      employeeName:    this.form.employeeName.trim() || undefined,
      department:      this.form.department || undefined
    }).subscribe({
      next: r => {
        this.submitting.set(false);
        this.toast.push(`Submitted ${r.refId}`, 'success');
        this.router.navigate(['/decision', r.refId]);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.error?.detail || 'Submission failed.');
      }
    });
  }

  private cycleProcessingMessages() {
    const msgs = [
      '🔍 Uploading receipt…',
      '📄 OCR extraction…',
      '🔁 Duplicate check…',
      '📈 Anomaly scan…',
      '📋 Policy rules…',
      '🎯 Scoring confidence…'
    ];
    let i = 0;
    const tick = () => {
      if (!this.submitting()) return;
      this.processingMsg.set(msgs[i % msgs.length]);
      i++;
      setTimeout(tick, 450);
    };
    tick();
  }

  fmtBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n / (1024*1024)).toFixed(2)} MB`;
  }
}
