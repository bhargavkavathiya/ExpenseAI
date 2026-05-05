import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="badge" [class]="cls()">{{ icon() }} {{ label() }}</span>`
})
export class StatusBadgeComponent {
  private _v = signal<string>('');
  @Input() set status(v: string | null | undefined) { this._v.set((v ?? '').toString()); }

  label = computed(() => {
    const m: Record<string, string> = {
      approved: 'Auto Approved', auto_approved: 'Auto Approved',
      needs_review: 'Needs Review', review_pending: 'Finance Review',
      rejected: 'Rejected', processing: 'Processing', failed: 'Failed',
      pending: 'Pending'
    };
    const key = this._v().toLowerCase().replaceAll(' ', '_');
    return m[key] || this._v();
  });

  cls = computed(() => {
    const key = this._v().toLowerCase().replaceAll(' ', '_');
    switch (key) {
      case 'approved':
      case 'auto_approved':
        return 'b-green';
      case 'needs_review':
      case 'review_pending':
      case 'pending':
        return 'b-amber';
      case 'rejected':
      case 'failed':
        return 'b-red';
      case 'processing':
        return 'b-blue';
      default:
        return 'b-muted';
    }
  });

  icon = computed(() => {
    const key = this._v().toLowerCase().replaceAll(' ', '_');
    return { approved: '✓', auto_approved: '✓', needs_review: '⚠', rejected: '✕', processing: '⋯', failed: '✕' }[key] || '';
  });
}
