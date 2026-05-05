import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ExpenseSubmissionResponse,
  ExpenseDecisionResponse,
  ExpenseSummaryDto,
  SubmissionMetadata
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private http = inject(HttpClient);

  submit(file: File, metadata?: SubmissionMetadata): Observable<ExpenseSubmissionResponse> {
    const form = new FormData();
    form.append('receipt', file, file.name);
    if (metadata) {
      if (metadata.category)        form.append('category',        metadata.category);
      if (metadata.paymentMode)     form.append('paymentMode',     metadata.paymentMode);
      if (metadata.purpose)         form.append('purpose',         metadata.purpose);
      if (metadata.city)            form.append('city',            metadata.city);
      if (metadata.claimedAmount  != null) form.append('claimedAmount', String(metadata.claimedAmount));
      if (metadata.claimedDate)     form.append('claimedDate',     metadata.claimedDate);
      if (metadata.claimedMerchant) form.append('claimedMerchant', metadata.claimedMerchant);
      if (metadata.claimedGstin)    form.append('claimedGstin',    metadata.claimedGstin);
      if (metadata.employeeName)    form.append('employeeName',    metadata.employeeName);
      if (metadata.department)      form.append('department',      metadata.department);
    }
    return this.http.post<ExpenseSubmissionResponse>(`${environment.apiBase}/expenses`, form);
  }

  getDecision(refId: string): Observable<ExpenseDecisionResponse> {
    return this.http.get<ExpenseDecisionResponse>(
      `${environment.apiBase}/expenses/${encodeURIComponent(refId)}/decision`);
  }

  recent(limit = 20): Observable<ExpenseSummaryDto[]> {
    return this.http.get<ExpenseSummaryDto[]>(
      `${environment.apiBase}/expenses/recent?limit=${limit}`);
  }
}
