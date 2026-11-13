import { Component, input } from '@angular/core';
import { GLYPH } from '../core/chess-engine';
import { TrayItem } from '../core/game.service';

/** Bandeja de peças capturadas (canto da tela). */
@Component({
  selector: 'app-captured-tray',
  template: `
    <div class="tray">
      <div class="tl">{{ label() }}</div>
      <div class="grave" [id]="graveId()">
        @for (it of items(); track it.index) {
          <span [class]="it.piece.c + (it.index === landed() ? ' pop' : '')" [attr.data-h]="it.index">{{ glyph[it.piece.t] }}</span>
        }
      </div>
    </div>`,
})
export class CapturedTrayComponent {
  readonly label = input.required<string>();
  readonly graveId = input.required<string>();
  readonly items = input.required<TrayItem[]>();
  readonly landed = input(-1);
  protected readonly glyph = GLYPH;
}
