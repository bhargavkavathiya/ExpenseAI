import { Injectable, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';
export interface Toast { id: number; text: string; kind: ToastKind; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private seq = 1;

  push(text: string, kind: ToastKind = 'info', ttlMs = 4200): void {
    const id = this.seq++;
    this._toasts.update(list => [...list, { id, text, kind }]);
    setTimeout(() => this._toasts.update(list => list.filter(t => t.id !== id)), ttlMs);
  }
}
