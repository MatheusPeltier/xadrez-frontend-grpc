import {
  Component, ElementRef, Injector, afterNextRender, computed, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GLYPH, Piece, applyMove, inCheck } from '../core/chess-engine';
import { GameService, MoveEvent } from '../core/game.service';
import { Move } from '../core/chess-engine';

interface SquareVm {
  idx: number; dark: boolean; piece: Piece | null;
  last: boolean; sel: boolean; chk: boolean; risk: boolean;
  hint: 'mv' | 'cap' | null; rank: number | null; file: string | null;
}

/**
 * Tabuleiro: desenha o estado do GameService e anima os lances.
 * O visual vem do CSS global (src/styles.css), que muda conforme o tema.
 */
@Component({
  selector: 'app-board',
  template: `
    <div id="board" aria-label="Tabuleiro de xadrez">
      @for (sq of squares(); track sq.idx) {
        <div class="sq" [class.l]="!sq.dark" [class.d]="sq.dark" [class.last]="sq.last" [class.sel]="sq.sel"
             [class.chk]="sq.chk" [class.mv]="sq.hint === 'mv'" [class.cap]="sq.hint === 'cap'"
             [class.risk]="sq.risk" [attr.data-i]="sq.idx" (click)="game.click(sq.idx)">
          @if (sq.piece; as p) { <span [class]="p.c">{{ glyph[p.t] }}</span> }
          @if (sq.rank) { <i class="co r">{{ sq.rank }}</i> }
          @if (sq.file) { <i class="co f">{{ sq.file }}</i> }
        </div>
      }
    </div>`,
})
export class BoardComponent {
  protected readonly game = inject(GameService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly glyph = GLYPH;

  protected readonly squares = computed<SquareVm[]>(() => {
    const S = this.game.state(), flip = this.game.flipped(), sel = this.game.selected();
    const last = this.game.last(), hints = this.game.selectedMoves(), chk = this.game.checkSquares();
    const out: SquareVm[] = [];
    for (let i = 0; i < 64; i++) {
      let r = i >> 3, c = i & 7;
      if (flip) { r = 7 - r; c = 7 - c; }
      const idx = r * 8 + c, piece = S.b[r][c], m = hints.find(x => x.tr * 8 + x.tc === idx);
      out.push({
        idx, dark: (r + c) % 2 === 1, piece,
        last: !!last && (idx === last.from || idx === last.to),
        sel: idx === sel, chk: chk.includes(idx),
        hint: m ? (piece || m.ep ? 'cap' : 'mv') : null,
        risk: !!m && inCheck(applyMove(S, m, 'q'), S.turn),   // ⚠ jogada que deixa o próprio rei exposto
        rank: i % 8 === 0 ? 8 - r : null,
        file: i >= 56 ? 'abcdefgh'[c] : null,
      });
    }
    return out;
  });

  constructor() {
    this.game.moves$.pipe(takeUntilDestroyed()).subscribe(ev => this.onMove(ev));
    this.game.undo$.pipe(takeUntilDestroyed()).subscribe(evs => this.onUndo(evs));
  }

  private onMove(ev: MoveEvent): void {
    if (ev.victim) this.fly(ev);                                   // ainda com o DOM antigo
    afterNextRender(() => this.slide(ev.move), { injector: this.injector });
  }

  /** Desfazer: as peças voltam deslizando e a peça capturada retorna da bandeja à sua casa. */
  private onUndo(evs: MoveEvent[]): void {
    const starts = evs.map(ev => {                       // posição na bandeja, medida antes de redesenhar
      if (!ev.victim) return null;
      const id = ev.victim.c === 'b' ? 'capM' : 'capI';
      return document.querySelector<HTMLElement>(`#${id} [data-h="${ev.historyIdx}"]`)?.getBoundingClientRect() ?? null;
    });
    afterNextRender(() => evs.forEach((ev, i) => {
      this.slide(ev.move, true);
      const start = starts[i];
      if (start) this.unfly(ev, start);
    }), { injector: this.injector });
  }

  private square(idx: number): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`[data-i="${idx}"]`);
  }

  /** Desliza a peça da origem ao destino, levantando-a no meio do caminho. */
  private slide(m: Move, reverse = false): void {
    const one = (fr: number, fc: number, tr: number, tc: number) => {
      const sq = this.square(tr * 8 + tc), sp = sq?.querySelector('span');
      if (!sq || !sp) return;
      const k = this.game.flipped() ? -1 : 1, s = sq.offsetWidth;
      const dx = (fc - tc) * k * s, dy = (fr - tr) * k * s;
      sq.style.zIndex = '5';
      const anim = sp.animate([
        { translate: `${dx}px ${dy}px 0px`, scale: '1', offset: 0 },
        { translate: `${dx / 2}px ${dy / 2}px ${s * 0.6}px`, scale: '1.12', offset: 0.5 },
        { translate: '0px 0px 0px', scale: '1', offset: 1 },
      ], { duration: 420, easing: 'ease-in-out' });
      anim.onfinish = anim.oncancel = () => { sq.style.zIndex = ''; };
    };
    if (reverse) one(m.tr, m.tc, m.fr, m.fc); else one(m.fr, m.fc, m.tr, m.tc);
    if (m.castle) {
      const row = m.tr, [a, b] = m.castle === 'k' ? [7, 5] : [0, 3];
      if (reverse) one(row, b, row, a); else one(row, a, row, b);
    }
  }

  /** Desfazer uma captura: a peça sai da bandeja, voa (erguida) e pousa na casa de origem. */
  private unfly(ev: MoveEvent, start: DOMRect): void {
    const v = ev.victim!, sq = this.square(ev.victimIdx), sp = sq?.querySelector('span');
    const p = this.game.state().b[ev.victimIdx >> 3][ev.victimIdx & 7];
    if (!sq || !sp || !p || p.t !== v.t || p.c !== v.c) return;
    sp.style.visibility = 'hidden';                        // some até o clone pousar
    const r = sp.getBoundingClientRect(), fs = parseFloat(getComputedStyle(sq).fontSize);
    const sx = start.left + start.width / 2, sy = start.top + start.height / 2;
    const dx = r.left + r.width / 2 - sx, dy = r.top + r.height / 2 - sy;

    const clone = document.createElement('div');
    clone.className = `fly ${v.c}`;
    clone.textContent = GLYPH[v.t];
    clone.style.cssText = `left:${sx - fs / 2}px;top:${sy - fs / 2}px;width:${fs}px;height:${fs}px;line-height:${fs}px;font-size:${fs}px`;
    document.body.appendChild(clone);

    const anim = clone.animate([
      { transform: `translate(0,0) scale(${23 / fs}) rotate(300deg)`, opacity: 0.95, offset: 0 },
      { transform: `translate(${dx}px,${dy - 46}px) scale(1.5) rotate(-10deg)`, opacity: 1, offset: 0.72 },
      { transform: `translate(${dx}px,${dy}px) scale(1) rotate(0deg)`, opacity: 1, offset: 1 },
    ], { duration: 900, delay: 120, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
    anim.onfinish = anim.oncancel = () => { clone.remove(); sp.style.visibility = ''; };
  }

  /** A peça capturada é erguida do tabuleiro e voa até a bandeja do canto da tela. */
  private fly(ev: MoveEvent): void {
    const victim = ev.victim!, sq = this.square(ev.victimIdx), sp = sq?.querySelector('span');
    const dest = document.getElementById(victim.c === 'b' ? 'capM' : 'capI');
    const done = () => this.game.releaseHold(ev.historyIdx);
    if (!sq || !sp || !dest) { done(); return; }

    const r = sp.getBoundingClientRect(), t = dest.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(sq).fontSize);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = t.left + Math.min(t.width - 12, 12 + dest.children.length * 13) - cx, dy = t.top + 14 - cy;

    const clone = document.createElement('div');
    clone.className = `fly ${victim.c}`;
    clone.textContent = GLYPH[victim.t];
    clone.style.cssText = `left:${cx - fs / 2}px;top:${cy - fs / 2}px;width:${fs}px;height:${fs}px;line-height:${fs}px;font-size:${fs}px`;
    document.body.appendChild(clone);

    // `delay`: a peça fica parada até a atacante chegar à casa
    const anim = clone.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: 'translate(0,-46px) scale(1.5) rotate(-10deg)', opacity: 1, offset: 0.28 },
      { transform: `translate(${dx}px,${dy}px) scale(${23 / fs}) rotate(300deg)`, opacity: 0.95, offset: 1 },
    ], { duration: 1000, delay: 320, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
    anim.onfinish = () => { clone.remove(); done(); };
  }
}
