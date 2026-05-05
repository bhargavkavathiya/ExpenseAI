import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AuditLogRow, AuditVerifyResponse, DashboardResponse, EmployeeBandWithAllowancesDto,
  ExpenseDecisionResponse, IntegrationDto, PolicyRuleDto, ReviewQueueItemDto,
  ThresholdDto, UpdateAllBandAllowancesRequest
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/admin`;

  // dashboard
  dashboard(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`${this.base}/dashboard`);
  }

  // review queue
  reviewQueue(status?: 'pending' | 'approved' | 'rejected', limit = 50, offset = 0)
    : Observable<ReviewQueueItemDto[]> {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    q.set('limit', String(limit));
    q.set('offset', String(offset));
    return this.http.get<ReviewQueueItemDto[]>(`${this.base}/review-queue?${q}`);
  }

  approve(id: string, note?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/review-queue/${id}/approve`, { note: note ?? null });
  }

  reject(id: string, note?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/review-queue/${id}/reject`, { note: note ?? null });
  }

  // Admin-scoped lookups used by the review drawer — these bypass the per-user
  // ownership check so reviewers can inspect any claim.
  getExpense(refId: string): Observable<ExpenseDecisionResponse> {
    return this.http.get<ExpenseDecisionResponse>(
      `${this.base}/expenses/${encodeURIComponent(refId)}`);
  }

  expenseReceiptUrl(refId: string): string {
    return `${this.base}/expenses/${encodeURIComponent(refId)}/receipt`;
  }

  // Fetched as a blob so the HttpInterceptor can attach the JWT — a plain
  // <img src> would skip the Authorization header. The caller turns the blob
  // into an object URL for the <img> tag.
  getExpenseReceiptBlob(refId: string): Observable<Blob> {
    return this.http.get(this.expenseReceiptUrl(refId), { responseType: 'blob' });
  }

  // thresholds
  thresholds(): Observable<ThresholdDto[]> {
    return this.http.get<ThresholdDto[]>(`${this.base}/thresholds`);
  }

  updateThreshold(key: string, value: number): Observable<{ key: string; value: number }> {
    return this.http.put<{ key: string; value: number }>(
      `${this.base}/thresholds/${encodeURIComponent(key)}`, { value });
  }

  // policy rules
  policyRules(): Observable<PolicyRuleDto[]> {
    return this.http.get<PolicyRuleDto[]>(`${this.base}/policy-rules`);
  }

  // audit logs
  auditLogs(opts: {
    from?: string; to?: string; module?: string; userId?: string;
    limit?: number; offset?: number;
  } = {}): Observable<AuditLogRow[]> {
    const q = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => v != null && q.set(k, String(v)));
    return this.http.get<AuditLogRow[]>(`${this.base}/audit-logs?${q}`);
  }

  verifyChain(): Observable<AuditVerifyResponse> {
    return this.http.get<AuditVerifyResponse>(`${this.base}/audit-logs/verify-chain`);
  }

  exportCsvUrl(from?: string, to?: string): string {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to)   q.set('to',   to);
    return `${this.base}/audit-logs/export?${q}`;
  }

  integrations(): Observable<IntegrationDto[]> {
    return this.http.get<IntegrationDto[]>(`${this.base}/integrations`);
  }

  // ---------- employee-band allowances ----------
  employeeBands(): Observable<EmployeeBandWithAllowancesDto[]> {
    return this.http.get<EmployeeBandWithAllowancesDto[]>(`${this.base}/employee-bands`);
  }

  updateBands(req: UpdateAllBandAllowancesRequest): Observable<EmployeeBandWithAllowancesDto[]> {
    return this.http.put<EmployeeBandWithAllowancesDto[]>(`${this.base}/employee-bands`, req);
  }

  resetBands(): Observable<EmployeeBandWithAllowancesDto[]> {
    return this.http.post<EmployeeBandWithAllowancesDto[]>(`${this.base}/employee-bands/reset`, {});
  }
}
