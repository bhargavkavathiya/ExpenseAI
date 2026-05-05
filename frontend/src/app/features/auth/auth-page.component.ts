import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { EmployeeBandDto } from '../../core/models/api.models';
import { environment } from '../../../environments/environment';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle.component';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeToggleComponent],
  template: `
    <div class="auth-bg min-h-screen flex">

      <!-- =============== Left brand panel =============== -->
      <div class="hidden lg:flex w-[44%] flex-col justify-between p-10 relative">
        <div class="relative z-10">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-sapphire via-violet to-teal flex items-center justify-center text-[20px] shadow-glow-blue">
              💼
            </div>
            <div>
              <div class="text-[24px] font-extrabold tracking-tight text-white leading-none">{{ appName }}</div>
              <div class="text-[10px] text-fog uppercase tracking-[0.18em] mt-1.5">{{ buildTag }}</div>
            </div>
          </div>
        </div>

        <div class="relative z-10 space-y-6 max-w-md">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald/15 border border-emerald/25 text-emerald-light text-[10px] font-bold uppercase tracking-[0.12em] mb-4">
              <span class="pulse-dot"></span>
              AI Pipeline · Live
            </div>
            <h1 class="text-[38px] font-extrabold leading-[1.05] tracking-tight text-white">
              Smarter expense audits,<br>
              <span class="bg-gradient-to-r from-sapphire-light via-violet-light to-teal-light bg-clip-text text-transparent">powered by AI</span>
            </h1>
            <p class="text-mist text-[14px] leading-relaxed mt-4">
              Five-stage audit pipeline — Optical Character Recognition, duplicate
              detection, anomaly detection, policy engine, and weighted confidence
              aggregation — with a tamper-evident SHA-256 hash-chained audit log.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2">
            <div class="auth-feature">
              <div class="auth-feature-icon auth-feature-icon-blue">📊</div>
              <div class="text-[10px] text-fog uppercase tracking-wider font-bold">Prompt Version</div>
              <div class="font-mono text-[12px] text-snow mt-0.5 truncate">{{ promptVersion }}</div>
            </div>
            <div class="auth-feature">
              <div class="auth-feature-icon auth-feature-icon-emerald">🔒</div>
              <div class="text-[10px] text-fog uppercase tracking-wider font-bold">Audit Chain</div>
              <div class="font-mono text-[12px] text-snow mt-0.5">SHA-256 · append-only</div>
            </div>
            <div class="auth-feature">
              <div class="auth-feature-icon auth-feature-icon-violet">🧠</div>
              <div class="text-[10px] text-fog uppercase tracking-wider font-bold">AI Modules</div>
              <div class="font-mono text-[12px] text-snow mt-0.5">5-stage pipeline</div>
            </div>
            <div class="auth-feature">
              <div class="auth-feature-icon auth-feature-icon-amber">⚡</div>
              <div class="text-[10px] text-fog uppercase tracking-wider font-bold">Confidence Gate</div>
              <div class="font-mono text-[12px] text-snow mt-0.5">≥ 0.75 auto-approve</div>
            </div>
          </div>
        </div>

        <div class="relative z-10 text-[10px] text-fog font-mono tracking-tight">
          UC10 · Team TransitCoders · Hackathon Sarjan 2026
        </div>
      </div>

      <!-- =============== Right form panel =============== -->
      <div class="flex-1 flex items-center justify-center p-6 overflow-y-auto relative">
        <!-- Theme toggle floats top-right of the form column -->
        <div class="absolute top-4 right-4 z-20">
          <app-theme-toggle></app-theme-toggle>
        </div>
        <div class="w-full max-w-[640px] auth-enter">

          <!-- Mobile-only brand strip -->
          <div class="lg:hidden flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-sapphire via-violet to-teal flex items-center justify-center text-[18px] shadow-glow-blue">💼</div>
            <div>
              <div class="text-[18px] font-extrabold tracking-tight text-white">{{ appName }}</div>
              <div class="text-[9px] text-fog uppercase tracking-[0.16em]">{{ buildTag }}</div>
            </div>
          </div>

          <!-- Tabs -->
          <div class="auth-tabs">
            <div class="auth-tab" [class.tab-active]="tab() === 'login'"    (click)="setTab('login')">Sign in</div>
            <div class="auth-tab" [class.tab-active]="tab() === 'register'" (click)="setTab('register')">Create account</div>
          </div>

          <!-- Glass card -->
          <div class="auth-glass">
            @if (tab() === 'login') {
              <div>
                <div class="mb-5">
                  <div class="text-[20px] font-extrabold text-white tracking-tight">Welcome back</div>
                  <div class="text-[12px] text-fog mt-1">Sign in to submit and track expense claims.</div>
                </div>

                <form (ngSubmit)="login()" class="space-y-3.5">
                  <div>
                    <label class="fl">Email</label>
                    <div class="auth-field">
                      <input class="auth-input" type="email" name="email"
                             [(ngModel)]="email" required
                             placeholder="you@company.com" autocomplete="email">
                      <span class="auth-icon-leading">✉</span>
                    </div>
                  </div>

                  <div>
                    <label class="fl">Password</label>
                    <div class="auth-field">
                      <input class="auth-input has-trail" name="password"
                             [type]="showPassword() ? 'text' : 'password'"
                             [(ngModel)]="password" required
                             placeholder="••••••••" autocomplete="current-password">
                      <span class="auth-icon-leading">🔒</span>
                      <button type="button" class="auth-icon-trailing"
                              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                              (click)="togglePassword()">
                        {{ showPassword() ? '🙈' : '👁' }}
                      </button>
                    </div>
                  </div>

                  @if (error(); as e) {
                    <div class="alert alert-error"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
                  }

                  <button type="submit" class="auth-cta mt-2"
                          [class.is-loading]="loading()"
                          [disabled]="loading()">
                    @if (loading()) {
                      <span>Signing in…</span>
                    } @else {
                      <span>Sign in</span>
                      <span class="auth-cta-arrow">→</span>
                    }
                  </button>
                </form>
              </div>
            } @else {
              <div>
                <div class="flex items-center gap-3 mb-5">
                  <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-violet to-sapphire flex items-center justify-center text-[16px] font-bold shadow-glow-blue">+</div>
                  <div>
                    <div class="text-[18px] font-extrabold text-white tracking-tight">Create your account</div>
                    <div class="text-[11px] text-fog">Fields feed band-based allowance and policy rules.</div>
                  </div>
                </div>

                <form (ngSubmit)="register()" class="space-y-3">
                  <!-- Row: Employee ID + Name -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="fl">Employee ID</label>
                      <div class="auth-field">
                        <input class="auth-input font-mono" name="empId"
                               [(ngModel)]="profile.employeeId" placeholder="EMP1001" maxlength="32">
                        <span class="auth-icon-leading">#</span>
                      </div>
                    </div>
                    <div>
                      <label class="fl">Employee Name</label>
                      <div class="auth-field">
                        <input class="auth-input" name="fullName"
                               [(ngModel)]="profile.fullName" placeholder="Full Name" maxlength="120">
                        <span class="auth-icon-leading">👤</span>
                      </div>
                    </div>
                  </div>

                  <!-- Row: Email + Mobile -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="fl">Email <span class="text-crimson-light">*</span></label>
                      <div class="auth-field">
                        <input class="auth-input" type="email" name="rEmail" [(ngModel)]="email"
                               required placeholder="employee@company.com" autocomplete="email">
                        <span class="auth-icon-leading">✉</span>
                      </div>
                    </div>
                    <div>
                      <label class="fl">Mobile</label>
                      <div class="auth-field">
                        <input class="auth-input" name="mobile" [(ngModel)]="profile.mobile"
                               placeholder="+91 9XXXXXXXXX" maxlength="16">
                        <span class="auth-icon-leading">📱</span>
                      </div>
                    </div>
                  </div>

                  <!-- Row: Department + Manager -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="fl">Department</label>
                      <div class="auth-field">
                        <input class="auth-input" name="dept" list="dept-list"
                               [(ngModel)]="profile.department" placeholder="Finance / IT / Sales" maxlength="80">
                        <span class="auth-icon-leading">🏢</span>
                        <datalist id="dept-list">
                          @for (d of departments; track d) { <option [value]="d"></option> }
                        </datalist>
                      </div>
                    </div>
                    <div>
                      <label class="fl">Manager</label>
                      <div class="auth-field">
                        <input class="auth-input" name="mgr" [(ngModel)]="profile.managerName"
                               placeholder="Manager Name" maxlength="120">
                        <span class="auth-icon-leading">👥</span>
                      </div>
                    </div>
                  </div>

                  <!-- Row: Band + Registration Source -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="fl">Employee Band</label>
                      <div class="auth-field">
                        <select class="auth-input pl-3" name="band"
                                [(ngModel)]="profile.band" [disabled]="loadingBands()">
                          <option value="">{{ loadingBands() ? 'Loading…' : '-- Select Band --' }}</option>
                          @for (b of bands(); track b.code) {
                            <option [value]="b.code">{{ b.code }} · {{ (b.name.split('—')[1] || b.name).trim() }}</option>
                          }
                        </select>
                      </div>
                      @if (bandAllowances(); as a) {
                        <div class="mt-1.5 text-[10px] text-sapphire-light font-mono">
                          meals ₹{{ a.meals_daily | number }} · hotel ₹{{ a.hotel_per_night | number }} · monthly ₹{{ a.monthly_total | number }}
                        </div>
                      }
                    </div>
                    <div>
                      <label class="fl">Registration Source</label>
                      <div class="auth-field">
                        <select class="auth-input pl-3" name="src" [(ngModel)]="profile.registrationSource">
                          <option value="web">Web Portal</option>
                          <option value="mobile">Mobile App</option>
                          <option value="admin">Admin Onboarding</option>
                          <option value="hris">HRIS Import</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <!-- Row: Location + Cost Center -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="fl">Location</label>
                      <div class="auth-field">
                        <select class="auth-input pl-3" name="loc" [(ngModel)]="profile.location">
                          <option value="">-- Select Location --</option>
                          @for (l of locations; track l) { <option [value]="l">{{ l }}</option> }
                        </select>
                      </div>
                    </div>
                    <div>
                      <label class="fl">Cost Center</label>
                      <div class="auth-field">
                        <input class="auth-input font-mono" name="cc"
                               [(ngModel)]="profile.costCenter" placeholder="CC-001" maxlength="40">
                        <span class="auth-icon-leading">¢</span>
                      </div>
                    </div>
                  </div>

                  <!-- Password -->
                  <div>
                    <label class="fl">Password <span class="text-crimson-light">*</span></label>
                    <div class="auth-field max-w-[50%]">
                      <input class="auth-input has-trail" name="rPassword"
                             [type]="showPassword() ? 'text' : 'password'"
                             [(ngModel)]="password" required minlength="8"
                             placeholder="At least 8 characters">
                      <span class="auth-icon-leading">🔒</span>
                      <button type="button" class="auth-icon-trailing"
                              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                              (click)="togglePassword()">
                        {{ showPassword() ? '🙈' : '👁' }}
                      </button>
                    </div>
                  </div>

                  @if (error(); as e) {
                    <div class="alert alert-error"><span class="alert-icon">✕</span><div>{{ e }}</div></div>
                  }

                  <button type="submit" class="auth-cta mt-2"
                          [class.is-loading]="loading()"
                          [disabled]="loading()">
                    @if (loading()) {
                      <span>Creating account…</span>
                    } @else {
                      <span>Create account</span>
                      <span class="auth-cta-arrow">→</span>
                    }
                  </button>
                </form>
              </div>
            }
          </div>

          <div class="text-center text-[10px] text-fog mt-5 font-mono tracking-tight">
            <span class="opacity-60">API</span> · {{ apiBase }}
          </div>
        </div>
      </div>
    </div>
  `
})
export class AuthPageComponent implements OnInit {
  private auth   = inject(AuthService);
  private router = inject(Router);
  private toast  = inject(ToastService);

  tab = signal<'login' | 'register'>('login');
  email = '';
  password = '';
  loading = signal(false);
  error   = signal<string | null>(null);
  showPassword = signal(false);

  profile: {
    employeeId: string;
    fullName: string;
    mobile: string;
    department: string;
    managerName: string;
    band: string;
    registrationSource: 'web' | 'mobile' | 'admin' | 'hris' | '';
    location: string;
    costCenter: string;
  } = {
    employeeId: '', fullName: '', mobile: '', department: '',
    managerName: '', band: '', registrationSource: 'web',
    location: '', costCenter: ''
  };

  appName = environment.appName;
  buildTag = environment.buildTag;
  promptVersion = environment.promptVersion;
  apiBase = environment.apiBase;

  departments = ['Sales', 'Engineering', 'Marketing', 'Finance', 'HR', 'Operations', 'IT', 'Legal', 'Procurement'];
  locations   = ['Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Gurgaon', 'Hyderabad', 'Chennai', 'Kolkata', 'Goa', 'Remote'];

  bands        = signal<EmployeeBandDto[]>([]);
  loadingBands = signal(true);

  ngOnInit() {
    this.auth.employeeBands().subscribe({
      next: bs => { this.bands.set(bs); this.loadingBands.set(false); },
      error: () => { this.loadingBands.set(false); /* leave dropdown empty; not fatal */ }
    });
  }

  setTab(t: 'login' | 'register') {
    this.tab.set(t);
    this.error.set(null);
  }

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  bandAllowances() {
    const code = this.profile.band;
    if (!code) return null;
    const found = this.bands().find(b => b.code === code);
    return found?.allowances as { meals_daily: number; hotel_per_night: number; monthly_total: number } | undefined;
  }

  login() {
    this.error.set(null);
    this.loading.set(true);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: r => {
        this.loading.set(false);
        this.toast.push(`Welcome, ${r.user.email}`, 'success');
        this.afterAuth(r.user.roles);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(err.error?.detail || 'Invalid credentials.');
      }
    });
  }

  register() {
    this.error.set(null);
    this.loading.set(true);

    const clean = {
      employeeId:         this.profile.employeeId?.trim()   || null,
      fullName:           this.profile.fullName?.trim()     || null,
      mobile:             this.profile.mobile?.trim()       || null,
      department:         this.profile.department?.trim()   || null,
      managerName:        this.profile.managerName?.trim()  || null,
      band:               this.profile.band                 || null,
      registrationSource: this.profile.registrationSource   || 'web',
      location:           this.profile.location             || null,
      costCenter:         this.profile.costCenter?.trim()   || null
    };

    this.auth.register(this.email.trim(), this.password, clean).subscribe({
      next: r => {
        this.loading.set(false);
        this.toast.push(`Account created for ${r.user.email}`, 'success');
        this.afterAuth(r.user.roles);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        const body: any = err.error;
        const firstValidationMsg = body?.errors
          ? Object.values<any>(body.errors)[0]?.[0]
          : null;
        const msg = body?.detail || firstValidationMsg || 'Registration failed.';
        this.error.set(msg);
      }
    });
  }

  private afterAuth(roles: string[]) {
    if (roles.some(r => ['analyst','compliance','admin'].includes(r))) {
      this.router.navigate(['/admin/dashboard']);
    } else {
      this.router.navigate(['/submit']);
    }
  }
}
