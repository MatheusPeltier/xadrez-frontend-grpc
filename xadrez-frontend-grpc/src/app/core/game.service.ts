import { Injectable, computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AiLevel, chooseMove } from './chess-ai';
import {
  Board, Color, GameState, Move, Piece, PieceType,
  applyMove, boardsEqual, findKing, findMoveBetween, generateMoves, inCheck, inferCastling,
  initialState, missingPieces, notation, other, squareName, victimOf,
} from './chess-engine';

export interface HistoryEntry { before: GameState; san: string; captured: Piece | null; move: Move }
export interface GameOver { winner: Color | null; reason: string; title?: string }
export interface TrayItem { piece: Piece; index: number }

/** Emitido ANTES do estado mudar, para o tabuleiro poder animar a partir do DOM atual. */
export interface MoveEvent { move: Move; victim: Piece | null; victimIdx: number; historyIdx: number }

/**
 * Ponte com o servidor. Quem preenche é o PartidaOnlineService ao entrar numa partida online;
 * enquanto ela existir, o clique não mexe no tabuleiro: o lance vai para o servidor e a posição
 * só muda quando o estado do servidor chegar (syncFromServer).
 */
export interface RemoteLink {
  myColor: Color;
  canMove(): boolean;
  submit(move: Move): void;
}

const AI_DELAY = 1500;
const LOG_MAX = 200;
const LOCAL_NAMES: Record<Color, string> = { w: 'Matheus', b: 'IA' };
const LOCAL_LOG = 'Partida local iniciada (sem servidor)';

@Injectable({ providedIn: 'root' })
export class GameService {
  readonly mode = signal<'local' | 'online'>('local');
  readonly names = signal<Record<Color, string>>(LOCAL_NAMES);

  readonly state = signal<GameState>(initialState());
  readonly history = signal<HistoryEntry[]>([]);
  readonly selected = signal<number | null>(null);
  readonly last = signal<{ from: number; to: number } | null>(null);
  readonly over = signal<GameOver | null>(null);
  readonly endDismissed = signal(false);
  readonly vsAi = signal(false);
  readonly aiLevel = signal<AiLevel>('medio');
  readonly flipped = signal(false);
  readonly pendingPromo = signal<Move | null>(null);
  readonly holdIdx = signal(-1);     // captura "em voo": ainda não aparece na bandeja
  readonly landedIdx = signal(-1);   // última captura que pousou (animação "pop")
  readonly log = signal<string[]>([LOCAL_LOG]);
  /** Peças já capturadas quando a posição foi carregada do servidor (sem histórico de lances). */
  private readonly baseCaptured = signal<Piece[]>([]);

  readonly moves$ = new Subject<MoveEvent>();
  /** Jogadas desfeitas (da mais recente para a mais antiga); emitido antes de o estado mudar. */
  readonly undo$ = new Subject<MoveEvent[]>();
  private aiTimer?: ReturnType<typeof setTimeout>;
  private readonly remote = signal<RemoteLink | null>(null);

  readonly turn = computed(() => this.state().turn);
  readonly myColor = computed(() => this.remote()?.myColor ?? null);

  readonly selectedMoves = computed(() => {
    const sel = this.selected();
    return sel === null ? [] : generateMoves(this.state(), this.turn()).filter(m => m.fr * 8 + m.fc === sel);
  });

  readonly checkSquares = computed(() => {
    const S = this.state(), out: number[] = [];
    for (const col of ['w', 'b'] as Color[]) {
      const k = findKing(S, col);
      if (k && inCheck(S, col)) out.push(k[0] * 8 + k[1]);
    }
    return out;
  });

  readonly status = computed(() => {
    const o = this.over(), names = this.names();
    if (o) return o.title ?? (o.winner ? `${names[o.winner]} venceu — ${o.reason}.` : `Empate — ${o.reason}.`);
    const t = this.turn();
    return `Vez de ${names[t]} ${t === 'w' ? '(brancas)' : '(pretas)'}`;
  });

  readonly alerts = computed(() => {
    if (this.over()) return [];
    const S = this.state(), out: string[] = [], mover = other(S.turn), names = this.names();
    if (this.history().length && inCheck(S, mover)) out.push(`⚠ ${names[mover]} deixou o próprio rei em perigo!`);
    if (inCheck(S, S.turn)) out.push(`⚠ XEQUE! O rei de ${names[S.turn]} está sob ataque.`);
    return out;
  });

  /** Bandejas: `byWhite` = peças pretas capturadas pelas brancas; `byBlack` = o contrário. */
  readonly captured = computed(() => {
    const byWhite: TrayItem[] = [], byBlack: TrayItem[] = [], hold = this.holdIdx();
    this.baseCaptured().forEach((piece, i) => (piece.c === 'b' ? byWhite : byBlack).push({ piece, index: -1000 - i }));
    this.history().forEach((h, i) => {
      if (!h.captured || i === hold) return;
      (h.captured.c === 'b' ? byWhite : byBlack).push({ piece: h.captured, index: i });
    });
    return { byWhite, byBlack };
  });

  readonly moveRows = computed(() => {
    const h = this.history(), rows: [string, string][] = [];
    for (let i = 0; i < h.length; i += 2) rows.push([h[i].san, h[i + 1]?.san ?? '']);
    return rows;
  });

  // ---------- ações do jogador ----------
  click(idx: number): void {
    if (this.over() || this.pendingPromo()) return;
    const remote = this.remote();
    if (remote ? !remote.canMove() : this.vsAi() && this.turn() === 'b') return;
    const S = this.state(), r = idx >> 3, c = idx & 7, sel = this.selected();
    if (sel !== null) {
      const m = generateMoves(S, S.turn).find(x => x.fr * 8 + x.fc === sel && x.tr === r && x.tc === c);
      if (m) {
        // online: quem valida é o servidor (o .proto ainda não tem campo de promoção: Etapa 8.1)
        if (remote) { remote.submit(m); return; }
        if (m.promo) { this.pendingPromo.set(m); return; }
        this.play(m);
        return;
      }
    }
    const p = S.b[r][c];
    this.selected.set(p && p.c === S.turn ? idx : null);
  }

  choosePromo(t: PieceType): void {
    const m = this.pendingPromo();
    if (!m) return;
    this.pendingPromo.set(null);
    this.play(m, t);
  }

  /**
   * Aplica um lance no tabuleiro local, com animação e histórico.
   * `fromServer`: o lance veio do estado do servidor; fim de jogo e IA não são decididos aqui.
   */
  play(m: Move, promo: PieceType = 'q', fromServer = false): void {
    const S = this.state(), victim = victimOf(S, m), san = notation(S, m, promo), hi = this.history().length;
    if (!fromServer && S.turn === 'w') {
      this.addLog(`[simulado] EnviarJogada(${squareName(m.fr, m.fc)}→${squareName(m.tr, m.tc)}) ✓ ${san}`);
    }

    this.moves$.next({ move: m, victim, victimIdx: m.ep ? m.fr * 8 + m.tc : m.tr * 8 + m.tc, historyIdx: hi });

    const next = applyMove(S, m, promo);
    this.history.update(h => [...h, { before: S, san, captured: victim, move: m }]);
    this.state.set(next);
    this.last.set({ from: m.fr * 8 + m.fc, to: m.tr * 8 + m.tc });
    this.selected.set(null);
    if (victim) this.holdIdx.set(hi);
    if (fromServer) return;

    let over: GameOver | null = null;
    if (!findKing(next, 'w')) over = { winner: 'b', reason: 'Rei capturado' };
    else if (!findKing(next, 'b')) over = { winner: 'w', reason: 'Rei capturado' };
    else if (!generateMoves(next, next.turn).length) over = { winner: null, reason: 'Sem jogadas disponíveis' };
    this.over.set(over);

    if (this.vsAi() && !over && next.turn === 'b') this.scheduleAi(AI_DELAY);
  }

  newGame(): void {
    if (this.remote()) return;                  // online: a partida é do servidor
    this.reset();
    this.log.set([LOCAL_LOG]);
  }

  undo(): void {
    if (this.remote()) return;                  // online: não existe "desfazer" no contrato
    this.clearAi();
    const h = [...this.history()];
    let S = this.state();
    const total = h.length, events: MoveEvent[] = [];
    for (let i = 0; i < (this.vsAi() ? 2 : 1) && h.length; i++) {
      const e = h.pop()!, m = e.move;
      S = e.before;
      events.push({ move: m, victim: e.captured, victimIdx: m.ep ? m.fr * 8 + m.tc : m.tr * 8 + m.tc, historyIdx: total - 1 - i });
    }
    if (events.length) this.undo$.next(events);   // antes de mudar o estado: o tabuleiro mede as bandejas
    this.history.set(h); this.state.set(S);
    this.selected.set(null); this.last.set(null); this.over.set(null);
    this.endDismissed.set(false); this.holdIdx.set(-1);
  }

  toggleFlip(): void { this.flipped.update(f => !f); }
  dismissEnd(): void { this.endDismissed.set(true); }
  setAiLevel(level: AiLevel): void { this.aiLevel.set(level); }

  setVsAi(on: boolean): void {
    if (this.remote()) return;
    this.vsAi.set(on);
    if (on && this.turn() === 'b' && !this.over()) this.scheduleAi(1000);
    if (!on) this.clearAi();
  }

  /** Chamado pelo tabuleiro quando a peça capturada termina de voar até a bandeja. */
  releaseHold(historyIdx: number): void {
    if (this.holdIdx() === historyIdx) this.holdIdx.set(-1);
    this.landedIdx.set(historyIdx);
  }

  addLog(line: string): void {
    this.log.update(l => [...l, line].slice(-LOG_MAX));
  }

  // ---------- modo online (chamado pelo PartidaOnlineService) ----------
  enterOnline(link: RemoteLink, names: Record<Color, string>): void {
    this.reset();
    this.remote.set(link);
    this.vsAi.set(false);
    this.names.set(names);
    this.flipped.set(link.myColor === 'b');     // quem joga de pretas vê o tabuleiro girado
    this.mode.set('online');
    this.log.set([]);
  }

  leaveOnline(): void {
    this.remote.set(null);
    this.mode.set('local');
    this.names.set(LOCAL_NAMES);
    this.flipped.set(false);
    this.reset();
    this.log.set([LOCAL_LOG]);
  }

  setOver(over: GameOver): void {
    this.over.set(over);
    this.selected.set(null);
  }

  /**
   * Recebe a posição que o servidor devolveu em ObterEstadoDoJogo.
   * - igual à local: só confere de quem é a vez;
   * - a 1 lance de distância: aplica esse lance (com animação, histórico e bandeja);
   * - qualquer outra coisa (ex.: F5 no meio da partida): carrega a posição inteira.
   */
  syncFromServer(board: Board, turn: Color | null): 'igual' | 'lance' | 'posicao' {
    const S = this.state();
    if (boardsEqual(S.b, board)) {
      this.syncTurn(turn);
      return 'igual';
    }
    const found = findMoveBetween(S, board);
    if (found) {
      if (found.move.fr * 8 + found.move.fc !== this.selected()) this.selected.set(null);
      // garante que o lance é aplicado para a cor que realmente moveu
      const mover = S.b[found.move.fr][found.move.fc]!.c;
      if (S.turn !== mover) this.state.set({ ...S, turn: mover });
      this.play(found.move, found.promo, true);
      this.syncTurn(turn);
      return 'lance';
    }
    this.state.set({ b: board, turn: turn ?? S.turn, cast: inferCastling(board), ep: null });
    this.history.set([]); this.baseCaptured.set(missingPieces(board));
    this.selected.set(null); this.last.set(null); this.holdIdx.set(-1); this.landedIdx.set(-1);
    return 'posicao';
  }

  syncTurn(turn: Color | null): void {
    const S = this.state();
    if (turn && turn !== S.turn) this.state.set({ ...S, turn });
  }

  // ---------- IA local (só no modo local; online o adversário vem do servidor) ----------
  private scheduleAi(ms: number): void {
    this.clearAi();
    this.aiTimer = setTimeout(() => this.aiMove(), ms);
  }
  private clearAi(): void { if (this.aiTimer) clearTimeout(this.aiTimer); }

  private aiMove(): void {
    if (this.over() || this.remote()) return;
    const S = this.state();
    const m = chooseMove(S, 'b', this.aiLevel());
    if (!m) return;
    this.addLog(`[simulado] ObterEstadoDoJogo → adversário jogou ${notation(S, m, 'q')}`);
    this.play(m, 'q');
  }

  private reset(): void {
    this.clearAi();
    this.state.set(initialState());
    this.history.set([]); this.baseCaptured.set([]);
    this.selected.set(null); this.last.set(null); this.over.set(null); this.pendingPromo.set(null);
    this.endDismissed.set(false); this.holdIdx.set(-1); this.landedIdx.set(-1);
  }
}
