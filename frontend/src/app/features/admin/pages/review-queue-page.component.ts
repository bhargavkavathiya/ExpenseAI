import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AdminService } from '../../../core/services/admin.service';
import {
  ExpenseDecisionResponse, FindingDto, ReviewQueueItemDto
} from '../../../core/models/api.models';
import { ToastService } from '../../../core/services/toast.service';
import { ConfidenceBarComponent } from '../../../shared/components/confidence-bar.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';

@Component({
  selector: 'app-review-queue-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfidenceBarComponent, StatusBadgeComponent],
  template: `
    <header class="sticky top-0 z-30 h-[52px] bg-ink-1 border-b border-line flex items-center px-7">
      <div>
        <div class="text-[15px] font-bold text-snow">Human Review Queue</div>
        <div class="text-[11px] text-fog">Claims needing human decision</div>
      </div>
      <div class="flex-1"></div>
      <span class="badge b-amber">{{ pendingCount() }} pending</span>
      <button class="btn btn-ghost btn-sm ml-2" (click)="load()">🔄 Refresh</button>
    </header>

    <div class="page p-7">
      @if (error(); as e) {
        <div class="alert alert-error mb-4"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
      }

      <div class="flex gap-2 mb-4 flex-wrap">
        @for (s of statuses; track s.value) {
          <button class="px-3 py-1.5 rounded-full text-[11px] font-semibold border transition"
                  [class]="statusFilter() === s.value ? 'bg-sapphire border-sapphire text-white' : 'border-line text-fog hover:border-line-2 hover:text-snow'"
                  (click)="setStatus(s.value)">{{ s.label }}</button>
        }
      </div>

      @if (loading()) {
        <div class="card text-center p-10"><div class="mx-auto w-8 h-8 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin"></div></div>
      } @else if (items().length === 0) {
        <div class="card text-center p-12">
          <div class="text-[40px] mb-3">✅</div>
          <div class="text-[13px] text-fog">No claims with this status.</div>
        </div>
      } @else {
        <div class="space-y-3">
          @for (it of items(); track it.id) {
            <div class="card cursor-pointer hover:border-line-2 transition"
                 (click)="openDetail(it)">
              <div class="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div class="font-mono text-[12px] text-fog">{{ it.expenseRefId }}</div>
                  <div class="text-[14px] font-semibold text-snow mt-0.5">{{ it.vendor || '—' }}
                    @if (it.total != null) { · <span class="text-sapphire-light">{{ it.currency }} {{ it.total | number:'1.2-2' }}</span> }
                  </div>
                  <div class="text-[11px] text-fog mt-0.5">{{ it.userEmail || '—' }} · queued {{ it.createdAt | date:'short' }}</div>
                </div>
                <div class="text-right">
                  <app-status-badge [status]="it.status"></app-status-badge>
                </div>
              </div>

              <div class="mt-3"><app-confidence-bar [value]="it.overallConfidence ?? 0"></app-confidence-bar></div>

              <div class="mt-3 alert alert-warn"><span class="alert-icon">⚠</span><div>{{ it.reason }}</div></div>

              @if (it.status === 'pending') {
                <div class="mt-3 flex items-center gap-2 flex-wrap"
                     (click)="$event.stopPropagation()">
                  <input class="fc flex-1 min-w-[200px]" placeholder="Decision note (optional)"
                         [(ngModel)]="notes[it.id]" name="note-{{it.id}}">
                  <button class="btn btn-success btn-sm" (click)="decide(it.id, 'approve')" [disabled]="!!busy()[it.id]">✓ Approve</button>
                  <button class="btn btn-danger btn-sm"  (click)="decide(it.id, 'reject')"  [disabled]="!!busy()[it.id]">✕ Reject</button>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- ========== Detail drawer ========== -->
    @if (selected(); as sel) {
      <div class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
           (click)="closeDetail()"></div>
      <aside class="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[540px] bg-ink-1 border-l border-line flex flex-col">
        <!-- header -->
        <div class="px-7 pt-6 pb-4 border-b border-line flex items-start justify-between gap-3">
          <div>
            <div class="text-[22px] font-bold text-snow leading-tight">
              @if (sel.result?.total != null) {
                <span>{{ sel.result!.currency }} {{ sel.result!.total | number:'1.2-2' }}</span>
              } @else if (sel.claimedAmount != null) {
                <span>₹{{ sel.claimedAmount | number:'1.2-2' }}</span>
              } @else {
                <span>—</span>
              }
              @if (sel.category) { <span class="text-fog"> · {{ sel.category }}</span> }
            </div>
            <div class="font-mono text-[12px] text-fog mt-1">{{ sel.refId }}</div>
          </div>
          <button class="text-fog hover:text-snow text-[18px] w-8 h-8 rounded-lg hover:bg-ink-2"
                  (click)="closeDetail()" aria-label="Close">✕</button>
        </div>

        <!-- scrollable body -->
        <div class="flex-1 overflow-y-auto px-7 py-5 space-y-6">
          @if (detailLoading()) {
            <div class="text-center p-10">
              <div class="mx-auto w-8 h-8 rounded-full border-2 border-line-2 border-t-sapphire-light animate-spin"></div>
            </div>
          } @else {
            <!-- receipt -->
            <section>
              <div class="text-[10px] font-bold text-fog tracking-[0.12em] mb-2">RECEIPT</div>
              <div class="rounded-xl border border-line bg-ink-2 overflow-hidden">
                @if (receipt(); as r) {
                  @if (r.isPdf) {
                    <iframe [src]="r.safeUrl"
                            class="w-full block bg-white border-0"
                            style="height: 480px;"
                            title="Receipt PDF"></iframe>
                    <div class="px-3 py-2 text-[10px] text-fog flex items-center justify-between border-t border-line">
                      <span>PDF receipt</span>
                      <a [href]="r.url" target="_blank" rel="noopener"
                         class="text-sapphire-light hover:underline">Open in new tab ↗</a>
                    </div>
                  } @else {
                    <img [src]="r.url" class="w-full object-contain max-h-[360px]"
                         alt="Receipt image" />
                  }
                } @else {
                  <div class="h-[180px] flex flex-col items-center justify-center text-fog">
                    <div class="text-[12px]">[ receipt image preview — not available ]</div>
                    <div class="text-[11px] mt-1">
                      {{ sel.category || '—' }} ·
                      @if (sel.claimedAmount != null) { ₹{{ sel.claimedAmount | number:'1.2-2' }} }
                      @if (sel.submittedAt) { · {{ sel.submittedAt | date:'short' }} }
                    </div>
                  </div>
                }
              </div>
            </section>

            <!-- OCR extraction -->
            @if (sel.result; as r) {
              <section>
                <div class="text-[10px] font-bold text-fog tracking-[0.12em] mb-2">
                  OCR EXTRACTION · {{ r.perModule?.ocr?.modelVersion || 'GPT-4o VISION' | uppercase }}
                </div>
                <div class="rounded-xl border border-line bg-ink-2 divide-y divide-line">
                  <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Merchant</div><div class="text-snow flex-1">{{ r.vendor || '—' }}</div></div>
                  <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Amount</div><div class="text-snow flex-1">
                    @if (r.total != null) { {{ r.currency }} {{ r.total | number:'1.2-2' }} } @else { — }
                  </div></div>
                  <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Date</div><div class="text-snow flex-1">{{ r.date || '—' }}</div></div>
                  <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">GSTIN</div><div class="flex-1">
                    <span class="font-mono text-snow">{{ r.gstin || '—' }}</span>
                    @if (r.gstin) {
                      @if (r.gstinVerified) { <span class="ml-2 text-emerald-400 text-[11px]">✓ verified</span> }
                      @else { <span class="ml-2 text-amber-400 text-[11px]">⚠ unverified</span> }
                    }
                  </div></div>
                  <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Confidence</div><div class="flex-1">
                    <span [class]="confidenceColor(r.overallConfidence)">{{ r.overallConfidence | number:'1.2-2' }}</span>
                  </div></div>
                </div>
              </section>
            }

            <!-- Claimed vs OCR (only when claimed metadata present) -->
            @if (hasClaimedMetadata(sel)) {
              <section>
                <div class="text-[10px] font-bold text-fog tracking-[0.12em] mb-2">EMPLOYEE CLAIM</div>
                <div class="rounded-xl border border-line bg-ink-2 divide-y divide-line">
                  @if (sel.employeeName) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Employee</div><div class="text-snow flex-1">{{ sel.employeeName }} @if (sel.department) { <span class="text-fog">· {{ sel.department }}</span> }</div></div> }
                  @if (sel.claimedMerchant) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Claimed merchant</div><div class="text-snow flex-1">{{ sel.claimedMerchant }}</div></div> }
                  @if (sel.claimedAmount != null) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Claimed amount</div><div class="text-snow flex-1">₹{{ sel.claimedAmount | number:'1.2-2' }}</div></div> }
                  @if (sel.claimedDate) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Claimed date</div><div class="text-snow flex-1">{{ sel.claimedDate }}</div></div> }
                  @if (sel.claimedGstin) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Claimed GSTIN</div><div class="text-snow flex-1 font-mono">{{ sel.claimedGstin }}</div></div> }
                  @if (sel.purpose) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Purpose</div><div class="text-snow flex-1">{{ sel.purpose }}</div></div> }
                  @if (sel.city) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">City</div><div class="text-snow flex-1">{{ sel.city }}</div></div> }
                  @if (sel.paymentMode) { <div class="flex px-4 py-2.5 text-[13px]"><div class="w-32 text-fog">Payment</div><div class="text-snow flex-1">{{ sel.paymentMode }}</div></div> }
                </div>
              </section>
            }

            <!-- AI findings -->
            @if (sel.findings?.length) {
              <section>
                <div class="text-[10px] font-bold text-fog tracking-[0.12em] mb-2">AI FINDINGS</div>
                <div class="space-y-2">
                  @for (f of sel.findings; track $index) {
                    <div class="rounded-xl border px-4 py-3 text-[13px] flex items-start gap-2"
                         [class]="findingClass(f)">
                      <span class="mt-0.5">{{ findingIcon(f) }}</span>
                      <div class="flex-1">
                        <div class="text-snow">{{ f.message }}</div>
                      </div>
                    </div>
                  }
                </div>
              </section>
            }

            <!-- Modules executed -->
            @if (sel.modulesExecuted?.length) {
              <section>
                <div class="text-[10px] font-bold text-fog tracking-[0.12em] mb-2">PIPELINE</div>
                <div class="flex gap-2 flex-wrap">
                  @for (m of sel.modulesExecuted; track m.module) {
                    <span class="px-2.5 py-1 rounded-full text-[11px] border"
                          [class]="moduleClass(m.status)">
                      {{ m.module }} · {{ m.status }}
                    </span>
                  }
                </div>
              </section>
            }

            @if (sel.result?.explanation) {
              <section>
                <div class="text-[10px] font-bold text-fog tracking-[0.12em] mb-2">EXPLANATION</div>
                <div class="rounded-xl border border-line bg-ink-2 px-4 py-3 text-[13px] text-snow leading-relaxed">
                  {{ sel.result!.explanation }}
                </div>
              </section>
            }
          }
        </div>

        <!-- actions -->
        @if (selectedItem(); as si) {
          @if (si.status === 'pending') {
            <div class="drawer-footer">
              <label class="text-[10px] font-bold text-fog uppercase tracking-[0.12em] mb-1.5 block">Decision note</label>
              <input class="fc w-full" placeholder="Add a note for the audit log (optional)"
                     [(ngModel)]="drawerNote" name="drawer-note">
              <div class="flex items-center gap-2 mt-3">
                <button class="btn btn-danger btn-sm flex-1" (click)="decideDrawer('reject')" [disabled]="!!busy()[si.id]">✕ Reject</button>
                <button class="btn btn-success btn-sm flex-1" (click)="decideDrawer('approve')" [disabled]="!!busy()[si.id]">✓ Approve claim</button>
              </div>
            </div>
          }
        }
      </aside>
    }
  `
})
export class ReviewQueuePageComponent {
  private admin = inject(AdminService);
  private toast = inject(ToastService);

  items         = signal<ReviewQueueItemDto[]>([]);
  loading       = signal(true);
  error         = signal<string | null>(null);
  statusFilter  = signal<'pending' | 'approved' | 'rejected'>('pending');
  busy          = signal<Record<string, boolean>>({});
  notes: Record<string, string> = {};

  // drawer state
  selected       = signal<ExpenseDecisionResponse | null>(null);
  selectedItem   = signal<ReviewQueueItemDto | null>(null);
  detailLoading  = signal(false);
  // Receipt blob URL + whether it should render as a PDF iframe instead of
  // an <img>. `safeUrl` is the same blob URL passed through Angular's
  // DomSanitizer so [src] on an <iframe> doesn't get stripped as unsafe.
  receipt        = signal<{ url: string; safeUrl: SafeResourceUrl; isPdf: boolean } | null>(null);
  drawerNote     = '';

  private sanitizer = inject(DomSanitizer);

  statuses = [
    { value: 'pending' as const,   label: 'Pending' },
    { value: 'approved' as const,  label: 'Approved' },
    { value: 'rejected' as const,  label: 'Rejected' }
  ];

  pendingCount = () => this.items().filter(x => x.status === 'pending').length;

  ngOnInit() { this.load(); }

  setStatus(s: 'pending' | 'approved' | 'rejected') { this.statusFilter.set(s); this.load(); }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.admin.reviewQueue(this.statusFilter()).subscribe({
      next: rows => { this.items.set(rows); this.loading.set(false); },
      error: err  => { this.loading.set(false); this.error.set(err.error?.detail || 'Load failed.'); }
    });
  }

  openDetail(it: ReviewQueueItemDto) {
    this.selectedItem.set(it);
    this.selected.set(null);
    this.drawerNote = this.notes[it.id] || '';
    this.detailLoading.set(true);
    this.revokeReceipt();

    this.admin.getExpense(it.expenseRefId).subscribe({
      next: res => {
        this.selected.set(res);
        this.detailLoading.set(false);
      },
      error: err => {
        this.detailLoading.set(false);
        this.toast.push(err.error?.detail || 'Could not load claim detail.', 'error');
      }
    });

    // Receipt is optional — swallow 404s silently; the panel shows a placeholder.
    this.admin.getExpenseReceiptBlob(it.expenseRefId).subscribe({
      next: blob => {
        const isPdf = blob.type === 'application/pdf';
        const url = URL.createObjectURL(blob);
        this.receipt.set({
          url,
          safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(url),
          isPdf
        });
      },
      error: () => this.receipt.set(null)
    });
  }

  closeDetail() {
    this.revokeReceipt();
    this.selected.set(null);
    this.selectedItem.set(null);
    this.drawerNote = '';
  }

  private revokeReceipt() {
    const r = this.receipt();
    if (r) URL.revokeObjectURL(r.url);
    this.receipt.set(null);
  }

  decide(id: string, action: 'approve' | 'reject') {
    this.busy.update(b => ({ ...b, [id]: true }));
    const note = this.notes[id]?.trim() || undefined;
    const req$ = action === 'approve' ? this.admin.approve(id, note) : this.admin.reject(id, note);
    req$.subscribe({
      next: () => {
        this.toast.push(`Review ${action}d.`, 'success');
        this.busy.update(b => ({ ...b, [id]: false }));
        this.load();
      },
      error: err => {
        this.toast.push(err.error?.detail || `${action} failed.`, 'error');
        this.busy.update(b => ({ ...b, [id]: false }));
      }
    });
  }

  decideDrawer(action: 'approve' | 'reject') {
    const si = this.selectedItem();
    if (!si) return;
    this.notes[si.id] = this.drawerNote;
    this.decide(si.id, action);
    this.closeDetail();
  }

  hasClaimedMetadata(d: ExpenseDecisionResponse): boolean {
    return !!(d.claimedMerchant || d.claimedAmount != null || d.claimedDate ||
              d.claimedGstin || d.purpose || d.city || d.paymentMode ||
              d.employeeName || d.department);
  }

  confidenceColor(v: number | null | undefined): string {
    if (v == null) return 'text-fog';
    if (v < 0.6)   return 'text-rose-400';
    if (v < 0.8)   return 'text-amber-400';
    return 'text-emerald-400';
  }

  findingIcon(f: FindingDto): string {
    switch (f.severity) {
      case 'error': return '⛔';
      case 'warn':  return '⚠';
      default:      return 'ℹ';
    }
  }

  findingClass(f: FindingDto): string {
    switch (f.severity) {
      case 'error': return 'border-rose-500/40 bg-rose-500/10';
      case 'warn':  return 'border-amber-500/40 bg-amber-500/10';
      default:      return 'border-line bg-ink-2';
    }
  }

  moduleClass(status: string): string {
    switch (status) {
      case 'ok':      return 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10';
      case 'warn':    return 'border-amber-500/40 text-amber-300 bg-amber-500/10';
      case 'failed':  return 'border-rose-500/40 text-rose-300 bg-rose-500/10';
      default:        return 'border-line text-fog bg-ink-2';
    }
  }
}
