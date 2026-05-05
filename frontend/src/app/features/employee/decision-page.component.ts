import { Component, inject, signal, computed, Input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ExpenseService } from '../../core/services/expense.service';
import { AuthService } from '../../core/services/auth.service';
import { ExpenseDecisionResponse, FindingDto, ModuleExecutionDto } from '../../core/models/api.models';

import { environment } from '../../../environments/environment';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle.component';

@Component({
  selector: 'app-decision-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ThemeToggleComponent],
  template: `
    <header class="sticky top-0 z-40 h-[56px] bg-ink-1 border-b border-line flex items-center px-6 gap-4">
      <a routerLink="/submit" class="text-sapphire-light text-[18px] hover:underline">‹</a>
      <div>
        <div class="text-[14px] font-extrabold text-white tracking-tight">AI Audit Summary</div>
        <div class="text-[10px] text-fog font-mono">{{ refId }}</div>
      </div>
      <div class="flex-1"></div>
      <app-theme-toggle size="sm"></app-theme-toggle>
      <a routerLink="/my-claims" class="btn btn-ghost btn-sm">📋 My Claims</a>
      <a routerLink="/submit" class="btn btn-primary btn-sm">+ New Claim</a>
    </header>

    <div class="page max-w-4xl mx-auto p-6">
      @if (loading()) {
        <div class="card text-center p-12">
          <div class="mx-auto w-12 h-12 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin mb-4"></div>
          <div class="text-[15px] font-bold text-sapphire-light">{{ statusMsg() }}</div>
          <div class="text-[11px] text-fog mt-1 font-mono">Prompt: {{ promptVersion }}</div>
        </div>
      }

      @if (error(); as e) {
        <div class="alert alert-error"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
      }

      @if (decision(); as d) {
        <!-- ===== Header: Claim Reference + AI Confidence ===== -->
        <div class="card">
          <div class="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div class="text-[10px] font-bold text-fog uppercase tracking-[0.12em]">Claim Reference</div>
              <div class="font-mono text-[22px] font-extrabold text-white tracking-wider mt-1">{{ d.refId }}</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] font-bold text-fog uppercase tracking-[0.12em]">AI Confidence</div>
              <div class="text-[34px] font-extrabold leading-none mt-1"
                   [style.color]="confidenceColor()">
                {{ confidencePct() }}%
              </div>
              @if (modulesFiredLabel(); as l) {
                <div class="text-[10px] text-fog mt-1">{{ l }}</div>
              }
            </div>
          </div>

          <!-- Context pills -->
          <div class="flex flex-wrap items-center gap-2 mt-4">
            @if (userBand(); as b) {
              <span class="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full bg-sapphire/15 border border-sapphire/30 text-sapphire-light font-semibold text-[11px]">
                <span class="w-1.5 h-1.5 rounded-full bg-sapphire-light"></span>{{ b }}
              </span>
            }
            <span class="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full font-semibold text-[11px]"
                  [class]="stageBadgeClass()">
              <span class="w-1.5 h-1.5 rounded-full" [class]="stageDotClass()"></span>
              {{ stageLabel() }}
            </span>
            @if (d.paymentMode) {
              <span class="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full bg-ink-4 border border-line text-fog font-semibold text-[11px]">
                <span class="w-1.5 h-1.5 rounded-full bg-fog"></span>{{ d.paymentMode.toUpperCase() }} scenario
              </span>
            }
          </div>

          <!-- Claim quick-strip: employee | amount | category | payment | merchant -->
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-4 border-t border-line">
            <div>
              <div class="text-[9px] font-bold text-fog uppercase tracking-[0.12em]">Employee</div>
              <div class="text-[14px] font-semibold text-snow mt-0.5 truncate">{{ d.employeeName || employeeName() }}</div>
            </div>
            <div>
              <div class="text-[9px] font-bold text-fog uppercase tracking-[0.12em]">Amount</div>
              <div class="text-[14px] font-semibold text-snow mt-0.5">
                @if (d.claimedAmount != null) { ₹{{ d.claimedAmount | number:'1.0-0' }} }
                @else if (d.result?.total != null) { ₹{{ d.result!.total | number:'1.0-0' }} }
                @else { — }
              </div>
            </div>
            <div>
              <div class="text-[9px] font-bold text-fog uppercase tracking-[0.12em]">Category</div>
              <div class="text-[14px] font-semibold text-snow mt-0.5">{{ d.category || '—' }}</div>
            </div>
            <div>
              <div class="text-[9px] font-bold text-fog uppercase tracking-[0.12em]">Payment</div>
              <div class="text-[14px] font-semibold text-snow mt-0.5">{{ d.paymentMode || '—' }}</div>
            </div>
            <div>
              <div class="text-[9px] font-bold text-fog uppercase tracking-[0.12em]">Merchant</div>
              <div class="text-[14px] font-semibold text-snow mt-0.5 truncate">{{ d.claimedMerchant || d.result?.vendor || '—' }}</div>
            </div>
          </div>
        </div>

        <!-- ===== Findings ===== -->
        <div class="card mt-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[15px]">🛡</span>
            <div class="text-[11px] font-bold text-fog uppercase tracking-[0.12em]">
              AI Audit Findings ({{ d.findings.length }} {{ d.findings.length === 1 ? 'flag' : 'flags' }})
            </div>
          </div>
          @if (!d.findings.length) {
            <div class="alert alert-success">
              <span class="alert-icon">✓</span>
              <div>No findings — the claim passes all automated checks.</div>
            </div>
          } @else {
            <div class="space-y-2.5">
              @for (f of d.findings; track $index) {
                <div class="flex items-start gap-3 p-3 rounded-lg border"
                     [class]="findingClasses(f)">
                  <span class="text-[15px] mt-px shrink-0">{{ findingIcon(f) }}</span>
                  <div class="text-[12.5px] leading-relaxed">{{ f.message }}</div>
                </div>
              }
            </div>
          }
        </div>

        <!-- ===== Modules Executed ===== -->
        <div class="card mt-4">
          <div class="text-[11px] font-bold text-fog uppercase tracking-[0.12em] mb-3">
            AI Modules Executed
          </div>
          <div class="flex flex-wrap gap-2">
            @for (m of d.modulesExecuted; track m.module) {
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                    [class]="moduleChipClasses(m)">
                <span class="w-1.5 h-1.5 rounded-full"
                      [class]="moduleDotClass(m)"></span>
                {{ m.module }}
              </span>
            }
          </div>
        </div>

        <!-- ===== Actions ===== -->
        <div class="mt-5 flex gap-2 flex-wrap">
          <button class="btn btn-ghost btn-sm" (click)="refresh()">🔄 Refresh</button>
          <a routerLink="/submit" class="btn btn-primary btn-sm">+ Submit Another</a>
          <a routerLink="/my-claims" class="btn btn-ghost btn-sm">📋 My Claims</a>
          @if (auth.isAnalyst()) {
            <a routerLink="/admin/review-queue" class="btn btn-ghost btn-sm">🛡 Review Queue</a>
          }
        </div>
      }
    </div>
  `
})
export class DecisionPageComponent implements OnDestroy {
  @Input() refId!: string;

  auth = inject(AuthService);
  private expense = inject(ExpenseService);

  loading = signal(true);
  decision = signal<ExpenseDecisionResponse | null>(null);
  error = signal<string | null>(null);
  statusMsg = signal('Awaiting decision…');
  promptVersion = environment.promptVersion;

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit() { this.refresh(); }
  ngOnDestroy() { this.stopPoll(); }

  refresh() {
    this.stopPoll();
    this.loading.set(true);
    const attempt = () => {
      this.expense.getDecision(this.refId).subscribe({
        next: d => {
          this.decision.set(d);
          if (d.status === 'processing') {
            this.statusMsg.set('Pipeline running…');
            this.pollHandle ||= setInterval(attempt, 900);
          } else {
            this.loading.set(false);
            this.stopPoll();
          }
        },
        error: err => {
          this.loading.set(false);
          this.stopPoll();
          this.error.set(err.status === 404
            ? `Reference ${this.refId} not found or not yours.`
            : (err.error?.detail || 'Failed to load decision.'));
        }
      });
    };
    attempt();
  }

  private stopPoll() {
    if (this.pollHandle) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  // ---- derived view state ----

  userBand = computed(() => this.auth.user()?.profile?.band ?? null);
  employeeName = computed(() =>
    this.auth.user()?.profile?.fullName?.trim() || this.auth.user()?.email || '—');

  confidencePct = computed(() =>
    Math.round(((this.decision()?.overallConfidence ?? 0) as number) * 100));

  confidenceColor = computed(() => {
    const c = this.decision()?.overallConfidence ?? 0;
    return c >= 0.8 ? '#10b981' : c >= 0.6 ? '#f59e0b' : '#ef4444';
  });

  modulesFiredLabel = computed(() => {
    const mods = this.decision()?.modulesExecuted ?? [];
    const fired = mods.filter(m => m.status !== 'skipped').map(m => m.module.split(' ')[0]);
    if (!fired.length) return null;
    // Short list like "OCR · Policy · Anomaly"
    const short = fired.slice(0, 3).join(' · ');
    return fired.length > 3 ? `${short} · +${fired.length - 3}` : short;
  });

  stageLabel = computed(() => {
    const d = this.decision(); if (!d) return '';
    switch (d.status) {
      case 'approved':     return 'Auto Approved';
      case 'needs_review': return 'Pending Manager Approval';
      case 'rejected':     return 'Rejected';
      case 'failed':       return 'Pipeline Failed';
      default:             return 'Processing';
    }
  });

  stageBadgeClass = computed(() => {
    const d = this.decision(); if (!d) return 'bg-ink-4 border-line text-fog';
    switch (d.status) {
      case 'approved':     return 'bg-emerald/15 border-emerald/30 text-emerald-light';
      case 'needs_review': return 'bg-amber/15 border-amber/30 text-amber-light';
      case 'rejected':
      case 'failed':       return 'bg-crimson/15 border-crimson/30 text-crimson-light';
      default:             return 'bg-sapphire/15 border-sapphire/30 text-sapphire-light';
    }
  });

  stageDotClass = computed(() => {
    const d = this.decision(); if (!d) return 'bg-fog';
    switch (d.status) {
      case 'approved':     return 'bg-emerald-light';
      case 'needs_review': return 'bg-amber-light';
      case 'rejected':
      case 'failed':       return 'bg-crimson-light';
      default:             return 'bg-sapphire-light';
    }
  });

  findingClasses(f: FindingDto): string {
    switch (f.severity) {
      case 'error': return 'bg-crimson/10 border-crimson/30 text-crimson-light';
      case 'warn':  return 'bg-amber/10 border-amber/30 text-amber-light';
      case 'info':
      default:      return 'bg-sapphire/10 border-sapphire/30 text-sapphire-light';
    }
  }

  findingIcon(f: FindingDto): string {
    switch (f.severity) {
      case 'error': return '✕';
      case 'warn':  return '⚠';
      default:      return 'ℹ';
    }
  }

  moduleChipClasses(m: ModuleExecutionDto): string {
    switch (m.status) {
      case 'ok':
        return 'bg-emerald/10 border-emerald/30 text-emerald-light';
      case 'warn':
        return 'bg-amber/10 border-amber/30 text-amber-light';
      case 'failed':
        return 'bg-crimson/10 border-crimson/30 text-crimson-light';
      case 'skipped':
      default:
        return 'bg-ink-4 border-line text-fog';
    }
  }

  moduleDotClass(m: ModuleExecutionDto): string {
    switch (m.status) {
      case 'ok':      return 'bg-emerald-light';
      case 'warn':    return 'bg-amber-light';
      case 'failed':  return 'bg-crimson-light';
      case 'skipped':
      default:        return 'bg-fog';
    }
  }
}
