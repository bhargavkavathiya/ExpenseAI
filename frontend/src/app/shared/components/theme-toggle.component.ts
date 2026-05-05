import { Component, inject } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

// Drop-in toggle button — pairs sun/moon emoji with a soft pill background.
// Two size variants: default (header) and 'sm' (compact, for tighter spots).
//
// Usage:
//   <app-theme-toggle></app-theme-toggle>
//   <app-theme-toggle size="sm"></app-theme-toggle>
//
// All styling lives in styles.scss under .theme-toggle so the button stays
// consistent across the auth page, admin shell, and employee page headers.
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button type="button"
            class="theme-toggle"
            [class.theme-toggle-sm]="size === 'sm'"
            [attr.aria-label]="theme.isLight() ? 'Switch to dark mode' : 'Switch to light mode'"
            [title]="theme.isLight() ? 'Switch to dark' : 'Switch to light'"
            (click)="theme.toggle()">
      <span class="theme-toggle-icon">{{ theme.isLight() ? '🌙' : '☀️' }}</span>
      <span class="theme-toggle-label">{{ theme.isLight() ? 'Dark' : 'Light' }}</span>
    </button>
  `
})
export class ThemeToggleComponent {
  protected theme = inject(ThemeService);
  size: 'sm' | 'default' = 'default';
}
