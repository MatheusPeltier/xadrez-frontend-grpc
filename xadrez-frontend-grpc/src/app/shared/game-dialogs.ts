import { Component, computed, inject, output } from '@angular/core';
import { GLYPH, PieceType } from '../core/chess-engine';
import { GameService } from '../core/game.service';

/** Diálogo de promoção do peão (modo local) e janela de fim de partida. */
@Component({
  selector: 'app-game-dialogs',
  template: `
    <div id="promo" [style.display]="game.pendingPromo() ? 'flex' : 'none'">
      <div>
        @for (t of promoTypes; track t) {
          <button type="button" [class]="game.turn()" (click)="game.choosePromo(t)">{{ glyph[t] }}</button>
        }
      </div>
    </div>
    <div id="end" [style.display]="endVisible() ? 'flex' : 'none'">
      <div>
        <h2 id="endT">{{ title() }}</h2>
        <p id="endS">{{ game.over()?.reason }}</p>
        @if (game.mode() === 'local') {
          <button type="button" (click)="game.newGame()">Nova partida</button>
        } @else {
          <button type="button" (click)="sair.emit()">Sair da partida</button>
        }
        <button type="button" (click)="game.dismissEnd()">Ver tabuleiro</button>
      </div>
    </div>`,
})
export class GameDialogsComponent {
  protected readonly game = inject(GameService);
  /** Online: o jogador pediu para sair da partida pela janela de fim de jogo. */
  readonly sair = output<void>();
  protected readonly glyph = GLYPH;
  protected readonly promoTypes: PieceType[] = ['q', 'r', 'b', 'n'];
  protected readonly endVisible = computed(() => !!this.game.over() && !this.game.endDismissed());
  protected readonly title = computed(() => {
    const o = this.game.over();
    if (!o) return '';
    return o.title ?? (o.winner ? `${this.game.names()[o.winner]} venceu!` : 'Empate');
  });
}
