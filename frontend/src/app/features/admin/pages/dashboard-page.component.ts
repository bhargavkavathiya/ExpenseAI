import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminService } from '../../../core/services/admin.service';
import { ConfidenceBucketDto, DashboardResponse, ModuleHealthDto } from '../../../core/models/api.models';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="sticky top-0 z-30 h-[60px] bg-ink-1/95 backdrop-blur border-b border-line flex items-center px-7">
      <div>
        <div class="text-[16px] font-extrabold text-snow tracking-tight">Executive Dashboard</div>
        <div class="text-[11px] text-fog">Real-time overview · AI audit pipeline</div>
      </div>
      <div class="flex-1"></div>
      <span class="badge b-green flex items-center gap-2 px-2.5 py-1">
        <span class="pulse-dot"></span>
        Live
      </span>
      <button class="btn btn-ghost btn-sm ml-2" (click)="load()">
        <span class="text-[13px]">↻</span> Refresh
      </button>
    </header>

    <div class="page p-7">
      @if (error(); as e) {
        <div class="alert alert-error mb-4"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
      }

      <!-- ============= KPI hero cards ============= -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div class="kpi kpi-blue">
          <div class="kpi-icon bg-sapphire/15 text-sapphire-light">📈</div>
          <div class="kpi-label">Submissions · 1h</div>
          <div class="kpi-val">{{ dash()?.kpis?.submissionsLast1h ?? '—' }}</div>
          <div class="kpi-sub">
            <span class="text-sapphire-light">●</span>
            rolling hour
          </div>
        </div>

        <div class="kpi kpi-green">
          <div class="kpi-icon bg-emerald/15 text-emerald-light">✅</div>
          <div class="kpi-label">Submissions · 24h</div>
          <div class="kpi-val">{{ dash()?.kpis?.submissionsLast24h ?? '—' }}</div>
          <div class="kpi-sub">
            <span class="text-emerald-light">●</span>
            last day
          </div>
        </div>

        <div class="kpi kpi-amber">
          <div class="kpi-icon bg-amber/15 text-amber-light">⏳</div>
          <div class="kpi-label">Pending review</div>
          <div class="kpi-val">{{ dash()?.kpis?.pendingReviews ?? '—' }}</div>
          <div class="kpi-sub">
            <span class="text-amber-light">●</span>
            human queue
          </div>
        </div>

        <div class="kpi kpi-red">
          <div class="kpi-icon bg-crimson/15 text-crimson-light">🚨</div>
          <div class="kpi-label">Error rate · 24h</div>
          <div class="kpi-val">{{ errorRateLabel() }}</div>
          <div class="kpi-sub">
            <span class="text-crimson-light">●</span>
            pipeline failures
          </div>
        </div>
      </div>

      <!-- ============= Charts row ============= -->
      <div class="grid xl:grid-cols-3 gap-4 mb-6">
        <!-- Confidence histogram (2 cols on xl) -->
        <div class="card xl:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-[14px] font-bold text-snow">Confidence Distribution</div>
              <div class="text-[11px] text-fog mt-0.5">Last 24 hours · {{ totalInvocations() }} invocations</div>
            </div>
            <div class="flex items-center gap-3 text-[10px]">
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-crimson"></span>0–30</span>
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-amber"></span>30–60</span>
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-lime"></span>60–80</span>
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-emerald"></span>80+</span>
            </div>
          </div>

          @if (!histogram().length) {
            <div class="h-[200px] flex flex-col items-center justify-center text-fog">
              <div class="text-[36px] opacity-40 mb-2">📊</div>
              <div class="text-[12px]">No invocations recorded yet</div>
            </div>
          } @else {
            <div class="flex items-end gap-1.5 h-[180px] px-1">
              @for (b of histogram(); track $index) {
                <div class="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group">
                  <div class="text-[10px] font-bold text-snow opacity-0 group-hover:opacity-100 transition-opacity">{{ b.count }}</div>
                  <div class="histo-bar"
                       [class]="histoBarClass(b.bucketStart)"
                       [style.height.%]="barHeightPct(b.count)"
                       [title]="b.count + ' invocations'"></div>
                </div>
              }
            </div>
            <div class="flex items-center gap-1.5 mt-2 px-1">
              @for (b of histogram(); track $index) {
                <div class="flex-1 text-center text-[9px] font-mono text-fog">
                  {{ pct(b.bucketStart) }}–{{ pct(b.bucketEnd) }}
                </div>
              }
            </div>
          }
        </div>

        <!-- Pipeline summary card -->
        <div class="card">
          <div class="text-[14px] font-bold text-snow mb-4">Pipeline summary</div>
          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between text-[11px] mb-1.5">
                <span class="text-fog uppercase tracking-wider font-bold">Avg confidence</span>
                <span class="text-snow font-bold">{{ avgConfidenceLabel() }}</span>
              </div>
              <div class="ring-bar">
                <div class="ring-fill ring-fill-blue" [style.width.%]="avgConfidencePct()"></div>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between text-[11px] mb-1.5">
                <span class="text-fog uppercase tracking-wider font-bold">Pipeline success</span>
                <span class="text-snow font-bold">{{ pipelineSuccessLabel() }}</span>
              </div>
              <div class="ring-bar">
                <div class="ring-fill" [class]="pipelineSuccessClass()" [style.width.%]="pipelineSuccessPct()"></div>
              </div>
            </div>
            <div class="pt-2 border-t border-line/60 grid grid-cols-2 gap-3">
              <div>
                <div class="text-[9px] text-fog uppercase tracking-wider">Modules tracked</div>
                <div class="text-[18px] font-extrabold text-snow mt-0.5">{{ dash()?.moduleHealth?.length ?? 0 }}</div>
              </div>
              <div>
                <div class="text-[9px] text-fog uppercase tracking-wider">Integrations</div>
                <div class="text-[18px] font-extrabold text-snow mt-0.5">{{ dash()?.integrations?.length ?? 0 }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============= Module health grid ============= -->
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <div class="text-[14px] font-bold text-snow">Module health</div>
            <div class="text-[11px] text-fog mt-0.5">Per-module success rate · last 24h</div>
          </div>
        </div>
        @if (!(dash()?.moduleHealth?.length)) {
          <div class="text-fog text-[12px] py-10 text-center">No module invocations yet.</div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            @for (m of dash()!.moduleHealth; track m.module) {
              <div class="module-card">
                <div class="flex items-center justify-between mb-2.5">
                  <div class="flex items-center gap-2">
                    <span class="dot" [class]="moduleDotClass(m)"></span>
                    <span class="text-[13px] font-bold text-snow capitalize">{{ m.module }}</span>
                  </div>
                  <span class="text-[10px] font-mono text-fog">{{ m.invocations }}×</span>
                </div>
                <div class="ring-bar mb-2.5">
                  <div class="ring-fill" [class]="moduleBarClass(m)"
                       [style.width.%]="m.successRate * 100"></div>
                </div>
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-fog">success</span>
                  <span class="text-snow font-bold">{{ (m.successRate * 100) | number:'1.0-1' }}%</span>
                </div>
                <div class="flex items-center justify-between text-[10px] mt-0.5">
                  <span class="text-fog">avg conf.</span>
                  <span class="text-snow font-bold">{{ (m.averageConfidence * 100) | number:'1.0-1' }}%</span>
                </div>
                <div class="flex items-center justify-between text-[10px] mt-0.5">
                  <span class="text-fog">avg latency</span>
                  <span class="text-snow font-bold">{{ m.averageDurationMs }}ms</span>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- ============= Integrations ============= -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div>
            <div class="text-[14px] font-bold text-snow">External integrations</div>
            <div class="text-[11px] text-fog mt-0.5">OpenAI · GSTIN · circuit-breaker state</div>
          </div>
        </div>
        @if (!(dash()?.integrations?.length)) {
          <div class="text-fog text-[12px] py-8 text-center">No integrations configured.</div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            @for (i of dash()!.integrations; track i.name) {
              <div class="integ-card">
                <div class="integ-icon">{{ integIcon(i.name) }}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-extrabold text-snow uppercase tracking-tight">{{ i.name }}</div>
                  <div class="text-[10px] text-fog">last check: {{ i.lastChecked ? (i.lastChecked | date:'short') : '—' }}</div>
                  @if (i.lastError) { <div class="text-[10px] text-crimson-light mt-0.5 truncate" [title]="i.lastError">{{ i.lastError }}</div> }
                </div>
                <div class="flex flex-col items-end gap-1.5">
                  <span class="badge" [class]="healthBadgeClass(i.health)">{{ i.health }}</span>
                  <span class="text-[9px] font-mono text-fog flex items-center gap-1">
                    <span class="dot" [class]="circuitDotClass(i.circuitState)"></span>
                    {{ i.circuitState }}
                  </span>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class DashboardPageComponent {
  private admin = inject(AdminService);

  dash  = signal<DashboardResponse | null>(null);
  error = signal<string | null>(null);

  ngOnInit() { this.load(); }

  load() {
    this.error.set(null);
    this.admin.dashboard().subscribe({
      next: d   => this.dash.set(d),
      error: err => this.error.set(err.error?.detail || 'Failed to load dashboard.')
    });
  }

  // ---------- KPI helpers ----------
  errorRateLabel = () => {
    const n = this.dash()?.kpis?.errorRatePercent;
    return n == null ? '—' : `${n.toFixed(1)}%`;
  };

  // ---------- Histogram ----------
  histogram = () => this.dash()?.confidenceHistogram ?? [];
  totalInvocations = () => this.histogram().reduce((a, b) => a + (b.count || 0), 0);

  pct = (n: number) => Math.round(n * 100);

  barHeightPct(count: number): number {
    const max = Math.max(1, ...this.histogram().map(b => b.count));
    // 8% floor so empty buckets are still visible as a sliver.
    return Math.max(8, (count / max) * 100);
  }

  histoBarClass(bucketStart: number): string {
    if (bucketStart < 0.30) return 'histo-bar-red';
    if (bucketStart < 0.60) return 'histo-bar-amber';
    if (bucketStart < 0.80) return 'histo-bar-lime';
    return 'histo-bar-emerald';
  }

  // ---------- Pipeline summary ring bars ----------
  avgConfidence(): number {
    const buckets = this.histogram();
    if (!buckets.length) return 0;
    const total = buckets.reduce((a, b) => a + b.count, 0);
    if (total === 0) return 0;
    const weighted = buckets.reduce((a, b) =>
      a + b.count * ((b.bucketStart + b.bucketEnd) / 2), 0);
    return weighted / total;
  }
  avgConfidencePct = () => Math.round(this.avgConfidence() * 100);
  avgConfidenceLabel = () => {
    const buckets = this.histogram();
    if (!buckets.length) return '—';
    return `${this.avgConfidencePct()}%`;
  };

  pipelineSuccessRate(): number {
    const modules = this.dash()?.moduleHealth ?? [];
    if (!modules.length) return 0;
    return modules.reduce((a, m) => a + m.successRate, 0) / modules.length;
  }
  pipelineSuccessPct = () => Math.round(this.pipelineSuccessRate() * 100);
  pipelineSuccessLabel = () => {
    if (!(this.dash()?.moduleHealth?.length)) return '—';
    return `${this.pipelineSuccessPct()}%`;
  };
  pipelineSuccessClass(): string {
    const v = this.pipelineSuccessRate();
    if (v >= 0.9) return 'ring-fill-green';
    if (v >= 0.7) return 'ring-fill-amber';
    return 'ring-fill-red';
  }

  // ---------- Module cards ----------
  moduleDotClass(m: ModuleHealthDto): string {
    if (m.successRate >= 0.9) return 'dot-green';
    if (m.successRate >= 0.7) return 'dot-amber';
    return 'dot-red';
  }
  moduleBarClass(m: ModuleHealthDto): string {
    if (m.successRate >= 0.9) return 'ring-fill-green';
    if (m.successRate >= 0.7) return 'ring-fill-amber';
    return 'ring-fill-red';
  }

  // ---------- Integrations ----------
  integIcon(name: string): string {
    return name === 'openai' ? '🤖' : name === 'gstin' ? '🇮🇳' : '🔌';
  }
  healthBadgeClass(h: string) {
    return ({ up: 'b-green', degraded: 'b-amber', down: 'b-red', unknown: 'b-muted' } as Record<string, string>)[h] || 'b-muted';
  }
  circuitDotClass(state: string): string {
    return ({ closed: 'dot-green', half_open: 'dot-amber', open: 'dot-red' } as Record<string, string>)[state] || 'dot-blue';
  }
}
