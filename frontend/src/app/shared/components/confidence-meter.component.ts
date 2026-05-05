import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confidence-meter',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative inline-flex items-center justify-center"
         [style.width.px]="sz()" [style.height.px]="sz()">
      <svg class="absolute top-0 left-0 -rotate-90" [attr.width]="sz()" [attr.height]="sz()" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="none" stroke="#1e2a3a" stroke-width="5"/>
        <circle cx="32" cy="32" r="26" fill="none"
                [attr.stroke]="color()" stroke-width="5" stroke-linecap="round"
                [attr.stroke-dasharray]="dashArray()"/>
      </svg>
      <span class="font-mono font-bold z-10"
            [style.font-size.px]="sz() > 60 ? 14 : 11"
            [style.color]="color()">{{ pct() }}%</span>
    </div>
  `
})
export class ConfidenceMeterComponent {
  private _value = signal(0);
  private _size = signal(68);
  @Input() set value(v: number | null | undefined) { this._value.set(Math.max(0, Math.min(1, v ?? 0))); }
  @Input() set size(v: number) { this._size.set(v); }

  sz = computed(() => this._size());
  pct = computed(() => Math.round(this._value() * 100));
  color = computed(() => {
    const c = this._value();
    return c >= 0.8 ? '#10b981' : c >= 0.6 ? '#f59e0b' : '#ef4444';
  });
  dashArray = computed(() => {
    const r = 26, circ = 2 * Math.PI * r;
    const fill = circ * this._value();
    return `${fill.toFixed(1)} ${circ.toFixed(1)}`;
  });
}
