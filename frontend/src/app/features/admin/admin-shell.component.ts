import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle.component';

interface NavLink { path: string; label: string; icon: string; roles?: string[]; }

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ThemeToggleComponent],
  template: `
    <div class="flex min-h-screen">
      <!-- ===================== Sidebar ===================== -->
      <aside class="w-[240px] min-h-screen bg-ink-1 border-r border-line fixed left-0 top-0 flex flex-col z-40 overflow-hidden">
        <div class="brand-glow"></div>

        <!-- Brand block -->
        <div class="relative px-4 pt-5 pb-4 border-b border-line">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-sapphire via-violet to-teal flex items-center justify-center text-[18px] shadow-glow-blue">
              💼
            </div>
            <div class="min-w-0">
              <div class="text-[16px] font-extrabold text-snow tracking-tight leading-none">{{ appName }}</div>
              <div class="text-[9px] text-fog uppercase tracking-[0.18em] mt-1">{{ buildTag }}</div>
            </div>
          </div>

          <div class="mt-3.5 flex items-center gap-2 px-2.5 py-1.5 bg-ink-3 border border-line rounded-lg">
            <span class="dot dot-green"></span>
            <span class="text-[11px] font-semibold text-mist flex-1 truncate">{{ roleLabel() }}</span>
          </div>
        </div>

        <!-- Nav -->
        <nav class="relative flex-1 overflow-y-auto py-3 space-y-0.5">
          <div class="text-[9px] font-bold text-ink-5 uppercase tracking-[0.18em] px-4 mb-1">Operations</div>
          @for (l of visibleLinks(); track l.path) {
            <a [routerLink]="l.path" routerLinkActive="nav-active" class="nav-link">
              <span class="nav-icon">{{ l.icon }}</span>
              <span class="flex-1">{{ l.label }}</span>
              <span class="nav-arrow">›</span>
            </a>
          }

          <div class="text-[9px] font-bold text-ink-5 uppercase tracking-[0.18em] px-4 mt-5 mb-1">Workspace</div>
          <a routerLink="/submit" routerLinkActive="nav-active" class="nav-link">
            <span class="nav-icon">📱</span>
            <span class="flex-1">Submit Claim</span>
            <span class="nav-arrow">›</span>
          </a>
          <a routerLink="/my-claims" routerLinkActive="nav-active" class="nav-link">
            <span class="nav-icon">📋</span>
            <span class="flex-1">My Claims</span>
            <span class="nav-arrow">›</span>
          </a>
        </nav>

        <!-- User card + theme toggle -->
        <div class="relative p-3 border-t border-line">
          <div class="flex justify-center mb-2">
            <app-theme-toggle size="sm"></app-theme-toggle>
          </div>
          <div class="flex items-center gap-2.5 p-2 rounded-lg bg-ink-3/60 border border-line/60">
            <div class="avatar-grad w-9 h-9 text-[13px]" [ngClass]="avatarPalette()">
              {{ initials() }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-[11.5px] text-snow font-semibold truncate">{{ auth.user()?.email }}</div>
              <button class="text-[10px] text-sapphire-light hover:text-sapphire-light/80 transition flex items-center gap-1 mt-0.5"
                      (click)="auth.logout()">
                <span>Sign out</span>
                <span class="text-[8px]">→</span>
              </button>
            </div>
          </div>
          <div class="text-[9px] font-mono text-line-2 mt-2.5 text-center tracking-tight">{{ promptVersion }}</div>
        </div>
      </aside>

      <!-- ===================== Main ===================== -->
      <main class="ml-[240px] flex-1 min-h-screen">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AdminShellComponent {
  auth = inject(AuthService);
  appName = environment.appName;
  buildTag = environment.buildTag;
  promptVersion = environment.promptVersion;

  private links: NavLink[] = [
    { path: 'dashboard',    label: 'Dashboard',        icon: '📊' },
    { path: 'review-queue', label: 'Review Queue',     icon: '📋' },
    { path: 'thresholds',   label: 'Thresholds',       icon: '🎯', roles: ['compliance', 'admin'] },
    { path: 'allowances',   label: 'Band Allowances',  icon: '💳', roles: ['compliance', 'admin'] },
    { path: 'audit-logs',   label: 'Audit Logs',       icon: '📝', roles: ['compliance', 'admin'] },
    { path: 'integrations', label: 'Integrations',     icon: '🔌' }
  ];

  visibleLinks = () => {
    const roles = this.auth.roles();
    return this.links.filter(l => !l.roles || l.roles.some(r => roles.includes(r)));
  };

  roleLabel = () => {
    const r = this.auth.roles();
    if (r.includes('admin'))      return 'Administrator';
    if (r.includes('compliance')) return 'Compliance Officer';
    if (r.includes('analyst'))    return 'Financial Analyst';
    return 'Customer';
  };

  initials = computed(() => {
    const email = this.auth.user()?.email || '';
    const namePart = email.split('@')[0] || '';
    const segments = namePart.split(/[._-]/).filter(Boolean);
    if (segments.length >= 2) return (segments[0][0] + segments[1][0]).toUpperCase();
    return (namePart.slice(0, 2) || '??').toUpperCase();
  });

  // Stable per-user gradient — derived from email so the same user always
  // gets the same avatar colour. Six classes defined in styles.scss
  // (.avatar-grad-0 through .avatar-grad-5) keep this CSS-driven.
  avatarPalette = computed(() => {
    const email = this.auth.user()?.email || '';
    const hash = Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0);
    return `avatar-grad-${hash % 6}`;
  });
}
