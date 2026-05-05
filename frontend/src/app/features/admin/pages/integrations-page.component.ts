import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AdminService } from '../../../core/services/admin.service';
import { IntegrationDto } from '../../../core/models/api.models';

@Component({
  selector: 'app-integrations-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="sticky top-0 z-30 h-[52px] bg-ink-1 border-b border-line flex items-center px-7">
      <div>
        <div class="text-[15px] font-bold text-snow">External Integrations</div>
        <div class="text-[11px] text-fog">OpenAI GPT-4o Vision · Goods and Services Tax Identification Number (GSTIN) lookup</div>
      </div>
      <div class="flex-1"></div>
      <button class="btn btn-ghost btn-sm" (click)="load()">🔄 Refresh</button>
    </header>

    <div class="page p-7">
      @if (items().length === 0) {
        <div class="card text-center p-10 text-fog text-[12px]">No integrations registered.</div>
      } @else {
        <div class="grid md:grid-cols-2 gap-4">
          @for (i of items(); track i.name) {
            <div class="card">
              <div class="flex items-start gap-4">
                <div class="text-[34px]">{{ i.name === 'openai' ? '🤖' : '🇮🇳' }}</div>
                <div class="flex-1">
                  <div class="text-[16px] font-bold text-snow uppercase">{{ i.name }}</div>
                  <div class="text-[11px] text-fog mt-0.5">{{ i.name === 'openai' ? 'OpenAI GPT-4o (Vision + text)' : 'Goods and Services Tax Identification Number lookup' }}</div>
                  <div class="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <div class="text-fog uppercase text-[9px] tracking-wider">Health</div>
                      <div class="badge mt-1" [class]="healthClass(i.health)">{{ i.health }}</div>
                    </div>
                    <div>
                      <div class="text-fog uppercase text-[9px] tracking-wider">Circuit</div>
                      <div class="font-mono mt-1 text-mist">{{ i.circuitState }}</div>
                    </div>
                    <div>
                      <div class="text-fog uppercase text-[9px] tracking-wider">Last check</div>
                      <div class="font-mono mt-1 text-mist">{{ i.lastChecked ? (i.lastChecked | date:'short') : '—' }}</div>
                    </div>
                    <div>
                      <div class="text-fog uppercase text-[9px] tracking-wider">Last error</div>
                      <div class="font-mono mt-1 text-crimson-light truncate">{{ i.lastError || '—' }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `
})
export class IntegrationsPageComponent {
  private admin = inject(AdminService);
  items = signal<IntegrationDto[]>([]);

  ngOnInit() { this.load(); }

  load() {
    this.admin.integrations().subscribe(r => this.items.set(r));
  }

  healthClass(h: string) {
    return { up: 'b-green', degraded: 'b-amber', down: 'b-red', unknown: 'b-muted' }[h] || 'b-muted';
  }
}
