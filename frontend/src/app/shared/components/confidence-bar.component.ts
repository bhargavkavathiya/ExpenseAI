import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confidence-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center gap-2">
      <div class="flex-1 h-[5px] bg-ink-4 rounded-[3px] overflow-hidden min-w-[60px]">
        <div class="h-full rounded-[3px] transition-[width] duration-700 ease-out"
             [style.width.%]="pct()"
             [style.background]="color()"></div>
      </div>
      <span class="font-mono text-[11px] font-semibold min-w-[34px] text-right"
            [style.color]="color()">{{ pct() }}%</span>
    </div>
  `
})
export class ConfidenceBarComponent {
  private _value = signal(0);
  @Input() set value(v: number | null | undefined) { this._value.set(Math.max(0, Math.min(1, v ?? 0))); }

  pct = computed(() => Math.round(this._value() * 100));
  color = computed(() => {
    const c = this._value();
    return c >= 0.8 ? '#10b981' : c >= 0.6 ? '#f59e0b' : '#ef4444';
  });
}
