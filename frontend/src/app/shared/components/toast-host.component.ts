import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      @for (t of toasts(); track t.id) {
        <div class="flex items-center gap-2.5 bg-ink-2 border border-line rounded-lg px-4 py-2.5 text-[13px] text-snow shadow-card max-w-sm animate-fade-up"
             [class]="'border-l-[3px] ' + borderClass(t.kind)">
          <span>{{ icon(t.kind) }}</span>
          <span>{{ t.text }}</span>
        </div>
      }
    </div>
  `
})
export class ToastHostComponent {
  private svc = inject(ToastService);
  toasts = this.svc.toasts;
  borderClass(k: string) {
    return { success: 'border-l-emerald-light', error: 'border-l-crimson-light',
             warn: 'border-l-amber-light', info: 'border-l-sapphire-light' }[k] || 'border-l-sapphire-light';
  }
  icon(k: string) {
    return { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' }[k] || 'ℹ';
  }
}
