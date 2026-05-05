import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { EmployeeBandDto, EmployeeProfileDto, LoginResponse, UserDto } from '../models/api.models';

const STORAGE_KEY = 'eiq.auth.v1';

interface StoredAuth {
  accessToken: string;
  expiresAt: string;
  user: UserDto;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private _auth = signal<StoredAuth | null>(this.loadFromStorage());

  readonly auth = this._auth.asReadonly();
  readonly user = computed(() => this._auth()?.user ?? null);
  readonly isLoggedIn = computed(() => !!this._auth() && !this.isExpired());
  readonly roles = computed(() => this._auth()?.user.roles ?? []);
  readonly isAdmin      = computed(() => this.roles().includes('admin'));
  readonly isCompliance = computed(() => this.roles().includes('compliance') || this.isAdmin());
  readonly isAnalyst    = computed(() => this.roles().includes('analyst') || this.isCompliance());

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/login`, { email, password })
      .pipe(tap(r => this.persist(r)));
  }

  register(email: string, password: string, profile?: Partial<EmployeeProfileDto>): Observable<LoginResponse> {
    const body: any = { email, password };
    if (profile) body.profile = profile;
    return this.http.post<LoginResponse>(`${environment.apiBase}/auth/register`, body)
      .pipe(tap(r => this.persist(r)));
  }

  me(): Observable<UserDto> {
    return this.http.get<UserDto>(`${environment.apiBase}/auth/me`);
  }

  employeeBands(): Observable<EmployeeBandDto[]> {
    return this.http.get<EmployeeBandDto[]>(`${environment.apiBase}/employee-bands`);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._auth.set(null);
    this.router.navigate(['/login']);
  }

  token(): string | null {
    const a = this._auth();
    return a && !this.isExpired() ? a.accessToken : null;
  }

  private persist(r: LoginResponse): void {
    const stored: StoredAuth = {
      accessToken: r.accessToken,
      expiresAt: r.expiresAt,
      user: r.user
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    this._auth.set(stored);
  }

  private loadFromStorage(): StoredAuth | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredAuth;
      if (Date.parse(parsed.expiresAt) <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private isExpired(): boolean {
    const a = this._auth();
    return !a || Date.parse(a.expiresAt) <= Date.now();
  }
}
