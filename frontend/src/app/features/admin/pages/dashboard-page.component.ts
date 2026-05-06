import { Component, inject, signal, ViewChild, ElementRef, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

import { AdminService } from '../../../core/services/admin.service';
import { DashboardResponse } from '../../../core/models/api.models';

Chart.register(...registerables);

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

    <div class="page p-7 space-y-6">
      @if (error(); as e) {
        <div class="alert alert-error mb-4"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
      }

      <!-- ============= KPI hero cards ============= -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div class="kpi kpi-blue">
          <div class="kpi-icon bg-sapphire/15 text-sapphire-light">📈</div>
          <div class="kpi-label">Submissions · 1h</div>
          <div class="kpi-val">{{ dash()?.kpis?.submissionsLast1h ?? '—' }}</div>
          <div class="kpi-sub"><span class="text-sapphire-light">●</span> rolling hour</div>
        </div>
        <div class="kpi kpi-green">
          <div class="kpi-icon bg-emerald/15 text-emerald-light">✅</div>
          <div class="kpi-label">Submissions · 24h</div>
          <div class="kpi-val">{{ dash()?.kpis?.submissionsLast24h ?? '—' }}</div>
          <div class="kpi-sub"><span class="text-emerald-light">●</span> last day</div>
        </div>
        <div class="kpi kpi-amber">
          <div class="kpi-icon bg-amber/15 text-amber-light">⏳</div>
          <div class="kpi-label">Pending review</div>
          <div class="kpi-val">{{ dash()?.kpis?.pendingReviews ?? '—' }}</div>
          <div class="kpi-sub"><span class="text-amber-light">●</span> human queue</div>
        </div>
        <div class="kpi kpi-red">
          <div class="kpi-icon bg-crimson/15 text-crimson-light">🚨</div>
          <div class="kpi-label">Error rate · 24h</div>
          <div class="kpi-val">{{ (dash()?.kpis?.errorRatePercent ?? 0) | number:'1.0-1' }}%</div>
          <div class="kpi-sub"><span class="text-crimson-light">●</span> failures</div>
        </div>
      </div>

      <!-- ============= TOP GRAPHS SECTION ============= -->
      <div class="grid xl:grid-cols-3 gap-4">
        <!-- Confidence histogram (2 cols on xl) -->
        <div class="card xl:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-[14px] font-bold text-snow uppercase tracking-wider">Confidence Distribution</div>
              <div class="text-[11px] text-fog mt-0.5">Statistical accuracy spread (Last 24h)</div>
            </div>
            <div class="flex items-center gap-3 text-[10px] sm:flex hidden">
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-crimson"></span>< 30%</span>
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-amber"></span>> 30%</span>
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-lime"></span>> 60%</span>
              <span class="flex items-center gap-1 text-fog"><span class="w-2 h-2 rounded-sm bg-emerald"></span>> 80%</span>
            </div>
          </div>

          @if (!histogram().length) {
            <div class="h-[200px] flex flex-col items-center justify-center text-fog opacity-50 italic">Waiting for telemetry...</div>
          } @else {
            <div class="flex items-end gap-1.5 h-[160px] px-1">
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
            <div class="flex items-center gap-1.5 mt-3 px-1">
              @for (b of histogram(); track $index) {
                <div class="flex-1 text-center text-[9px] font-mono text-fog uppercase">
                  {{ pct(b.bucketStart) }}%
                </div>
              }
            </div>
          }
        </div>

        <!-- Pipeline summary card -->
        <div class="card">
          <div class="text-[14px] font-bold text-snow uppercase tracking-wider mb-4">Pipeline Summary</div>
          <div class="space-y-4">
            <div>
              <div class="flex items-center justify-between text-[11px] mb-1.5">
                <span class="text-fog uppercase tracking-wider font-bold">Avg Confidence</span>
                <span class="text-snow font-bold">{{ avgConfidenceLabel() }}</span>
              </div>
              <div class="ring-bar">
                <div class="ring-fill ring-fill-blue" [style.width.%]="avgConfidencePct()"></div>
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between text-[11px] mb-1.5">
                <span class="text-fog uppercase tracking-wider font-bold">Model Stability</span>
                <span class="text-snow font-bold">{{ pipelineSuccessLabel() }}</span>
              </div>
              <div class="ring-bar">
                <div class="ring-fill" [class]="pipelineSuccessClass()" [style.width.%]="pipelineSuccessPct()"></div>
              </div>
            </div>
            <div class="pt-4 border-t border-line/40 grid grid-cols-2 gap-4">
              <div>
                <div class="text-[9px] text-fog uppercase font-black tracking-widest opacity-60">Modules</div>
                <div class="text-[18px] font-extrabold text-snow mt-0.5">{{ dash()?.moduleHealth?.length ?? 0 }}</div>
              </div>
              <div>
                <div class="text-[9px] text-fog uppercase font-black tracking-widest opacity-60">Signals</div>
                <div class="text-[18px] font-extrabold text-snow mt-0.5">{{ (dash()?.integrations?.length ?? 0) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ============= SECONDARY GRAPHS SECTION ============= -->
      <div class="grid lg:grid-cols-3 gap-6">
        <div class="card lg:col-span-2">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-[14px] font-bold text-snow uppercase tracking-wider">AI Model Efficiency</div>
              <div class="text-[11px] text-fog mt-0.5">Automation vs. Manual check ratio (24h)</div>
            </div>
          </div>
          <div class="h-[220px]">
            <canvas #lineChartCanvas></canvas>
          </div>
        </div>

        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-[14px] font-bold text-snow uppercase tracking-wider">Outcome Matrix</div>
              <div class="text-[11px] text-fog mt-0.5">Overall status distribution</div>
            </div>
          </div>
          <div class="h-[220px] flex items-center justify-center">
            <canvas #pieChartCanvas></canvas>
          </div>
        </div>
      </div>

      <!-- ============= Module health grid ============= -->
      <div class="card">
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
            <div class="text-[11px] text-fog mt-0.5">Circuit-breaker state signal</div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          @for (i of dash()?.integrations; track i.name) {
            <div class="integ-card">
              <div class="integ-icon">{{ integIcon(i.name) }}</div>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] font-extrabold text-snow uppercase tracking-tight">{{ i.name }}</div>
                <div class="text-[10px] text-fog">Last sync: {{ (i.lastChecked | date:'shortTime') ?? '—' }}</div>
              </div>
              <div class="flex flex-col items-end gap-1.5">
                <span class="badge" [class]="healthBadgeClass(i.health)">{{ i.health === 'up' ? 'Online' : i.health }}</span>
                <span class="text-[9px] font-mono text-fog flex items-center gap-1">
                  <span class="dot" [class]="circuitDotClass(i.circuitState)"></span>
                  {{ i.circuitState }}
                </span>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardPageComponent implements AfterViewInit {
  private admin = inject(AdminService);
  dash = signal<DashboardResponse | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  @ViewChild('lineChartCanvas') lineChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pieChartCanvas') pieChartCanvas!: ElementRef<HTMLCanvasElement>;

  private charts: { [key: string]: Chart } = {};

  constructor() {
    effect(() => {
      const data = this.dash();
      if (data) this.updateCharts(data);
    });
  }

  ngAfterViewInit() {
    this.initCharts();
    this.load();
  }

  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.admin.dashboard().subscribe({
      next: d => { this.dash.set(d); this.loading.set(false); },
      error: err => { this.error.set('Failed to sync telemetry.'); this.loading.set(false); }
    });
  }

  private initCharts() {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter, sans-serif';

    const tooltipBase: any = {
      backgroundColor: '#111827',
      padding: 10,
      cornerRadius: 4,
      borderColor: '#374151',
      borderWidth: 1,
      titleFont: { size: 11 },
      bodyFont: { size: 11 },
    };

    // STACKED BAR CHART (AI Efficiency)
    this.charts['bar'] = new Chart(this.lineChartCanvas.nativeElement, {
      type: 'bar',
      data: { 
        labels: [], 
        datasets: [
          { label: 'AI Approved', data: [], backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'AI Rejected', data: [], backgroundColor: '#f43f5e', borderRadius: 4 },
          { label: 'Manual Check', data: [], backgroundColor: '#8b5cf6', borderRadius: 4 }
        ] 
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 10, bottom: 5 } },
        plugins: { 
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 15, font: { size: 10, weight: 'bold' } } },
          tooltip: tooltipBase 
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 } } },
          y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, border: { dash: [4, 4] }, ticks: { font: { size: 9 } } }
        }
      }
    });

    // PIE CHART
    this.charts['pie'] = new Chart(this.pieChartCanvas.nativeElement, {
      type: 'pie',
      data: { 
        labels: ['Approved', 'Rejected', 'Review'], 
        datasets: [{ 
          data: [0,0,0], 
          backgroundColor: ['#10b981', '#f43f5e', '#8b5cf6'],
          borderWidth: 0,
          hoverOffset: 12
        }] 
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 10 },
        plugins: { 
          legend: { position: 'right', labels: { boxWidth: 10, padding: 15, font: { size: 10, weight: 'bold' } } },
          tooltip: tooltipBase 
        }
      }
    });
  }

  private updateCharts(d: DashboardResponse) {
    if (this.charts['bar']) {
      const hours = Array.from(new Set(d.hourlyVolumes.map(v => new Date(v.hour).getHours() + ':00'))).sort();
      this.charts['bar'].data.labels = hours;
      
      const mapData = (status: string) => hours.map(h => {
        return d.hourlyVolumes.filter(v => (new Date(v.hour).getHours() + ':00') === h && v.status === status)
               .reduce((sum, v) => sum + v.count, 0);
      });

      this.charts['bar'].data.datasets[0].data = mapData('approved');
      this.charts['bar'].data.datasets[1].data = mapData('rejected');
      this.charts['bar'].data.datasets[2].data = mapData('needs_review');
      this.charts['bar'].update();
    }
    if (this.charts['pie']) {
      this.charts['pie'].data.datasets[0].data = [
        d.statusDistribution.find(s => s.status === 'approved')?.count ?? 0,
        d.statusDistribution.find(s => s.status === 'rejected')?.count ?? 0,
        d.statusDistribution.find(s => s.status === 'needs_review')?.count ?? 0
      ];
      this.charts['pie'].update();
    }
  }

  // ---------- KPI helpers ----------
  histogram = () => this.dash()?.confidenceHistogram ?? [];
  pct = (n: number) => Math.round(n * 100);

  barHeightPct(count: number): number {
    const max = Math.max(1, ...this.histogram().map(b => b.count));
    return Math.max(8, (count / max) * 100);
  }

  histoBarClass(bucketStart: number): string {
    if (bucketStart < 0.30) return 'histo-bar-red';
    if (bucketStart < 0.60) return 'histo-bar-amber';
    if (bucketStart < 0.80) return 'histo-bar-lime';
    return 'histo-bar-emerald';
  }

  avgConfidence(): number {
    const buckets = this.histogram();
    if (!buckets.length) return 0;
    const total = buckets.reduce((a, b) => a + b.count, 0);
    if (total === 0) return 0;
    const weighted = buckets.reduce((a, b) => a + b.count * ((b.bucketStart + b.bucketEnd) / 2), 0);
    return weighted / total;
  }
  avgConfidencePct = () => Math.round(this.avgConfidence() * 100);
  avgConfidenceLabel = () => this.histogram().length ? `${this.avgConfidencePct()}%` : '—';

  pipelineSuccessRate(): number {
    const modules = this.dash()?.moduleHealth ?? [];
    if (!modules.length) return 0;
    return modules.reduce((a, m) => a + m.successRate, 0) / modules.length;
  }
  pipelineSuccessPct = () => Math.round(this.pipelineSuccessRate() * 100);
  pipelineSuccessLabel = () => (this.dash()?.moduleHealth?.length) ? `${this.pipelineSuccessPct()}%` : '—';
  pipelineSuccessClass(): string {
    const v = this.pipelineSuccessRate();
    if (v >= 0.9) return 'ring-fill-green';
    if (v >= 0.7) return 'ring-fill-amber';
    return 'ring-fill-red';
  }

  moduleDotClass(m: any) { return (m.successRate >= 0.9) ? 'dot-green' : 'dot-amber'; }
  moduleBarClass(m: any) { return (m.successRate >= 0.9) ? 'ring-fill-green' : 'ring-fill-amber'; }
  integIcon(name: string) { return name === 'openai' ? '🤖' : name === 'gstin' ? '🇮🇳' : '🔌'; }
  healthBadgeClass(h: string) { return h === 'up' ? 'b-green' : 'b-amber'; }
  circuitDotClass(state: string) { return state === 'closed' ? 'dot-green' : 'dot-amber'; }
}
