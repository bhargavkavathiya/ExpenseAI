import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { GstinVerifyResponse } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class GstinService {
  private http = inject(HttpClient);

  // Client-side format check mirrors the server regex — lets the UI give
  // instant "keep typing" feedback without a round-trip per keystroke.
  static readonly FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  isWellFormed(gstin: string): boolean {
    return GstinService.FORMAT.test((gstin || '').toUpperCase());
  }

  verify(gstin: string): Observable<GstinVerifyResponse> {
    return this.http.get<GstinVerifyResponse>(
      `${environment.apiBase}/gstin/${encodeURIComponent(gstin.trim().toUpperCase())}`);
  }
}
