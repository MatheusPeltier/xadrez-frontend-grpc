export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type CastKey = 'wk' | 'wq' | 'bk' | 'bq';

export interface Piece { t: PieceType; c: Color }
export type Board = (Piece | null)[][];

export interface GameState {
  b: Board;
  turn: Color;
  cast: Record<CastKey, boolean>;
  ep: [number, number] | null;
}

export interface Move {
  fr: number; fc: number; tr: number; tc: number;
  cap?: boolean; ep?: boolean; promo?: boolean; dbl?: boolean; castle?: 'k' | 'q';
}

export const GLYPH: Record<PieceType, string> = {
  p: '♟\uFE0E', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
};

const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const squareName = (r: number, c: number) => 'abcdefgh'[c] + (8 - r);

export function initialState(): GameState {
  const b: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { t: back[c], c: 'b' };
    b[1][c] = { t: 'p', c: 'b' };
    b[6][c] = { t: 'p', c: 'w' };
    b[7][c] = { t: back[c], c: 'w' };
  }
  return { b, turn: 'w', cast: { wk: true, wq: true, bk: true, bq: true }, ep: null };
}

/**
 * Jogadas "livres": cada peça só respeita o próprio movimento. Nada impede o
 * jogador de deixar (ou colocar) o próprio rei em xeque — o jogo acaba quando
 * um rei é capturado.
 */
export function generateMoves(S: GameState, col: Color): Move[] {
  const out: Move[] = [];
  const B = S.b;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = B[r][c];
      if (!p || p.c !== col) continue;
      const add = (tr: number, tc: number, x: Partial<Move> = {}) => out.push({ fr: r, fc: c, tr, tc, ...x });

      if (p.t === 'p') {
        const d = col === 'w' ? -1 : 1, start = col === 'w' ? 6 : 1, lastRow = col === 'w' ? 0 : 7;
        const promo = (tr: number): Partial<Move> => (tr === lastRow ? { promo: true } : {});
        if (inside(r + d, c) && !B[r + d][c]) {
          add(r + d, c, promo(r + d));
          if (r === start && !B[r + 2 * d][c]) add(r + 2 * d, c, { dbl: true });
        }
        for (const dc of [-1, 1]) {
          const tr = r + d, tc = c + dc;
          if (!inside(tr, tc)) continue;
          const q = B[tr][tc];
          if (q && q.c !== col) add(tr, tc, { cap: true, ...promo(tr) });
          else if (!q && S.ep && S.ep[0] === tr && S.ep[1] === tc) add(tr, tc, { cap: true, ep: true });
        }
      } else if (p.t === 'n' || p.t === 'k') {
        for (const [dr, dc] of p.t === 'n' ? KNIGHT : KING) {
          const tr = r + dr, tc = c + dc;
          if (!inside(tr, tc)) continue;
          const q = B[tr][tc];
          if (!q) add(tr, tc);
          else if (q.c !== col) add(tr, tc, { cap: true });
        }
        const row = col === 'w' ? 7 : 0;
        if (p.t === 'k' && r === row && c === 4) {
          const rookAt = (cc: number) => B[row][cc]?.t === 'r';
          if (S.cast[`${col}k` as CastKey] && !B[row][5] && !B[row][6] && rookAt(7)) add(row, 6, { castle: 'k' });
          if (S.cast[`${col}q` as CastKey] && !B[row][1] && !B[row][2] && !B[row][3] && rookAt(0)) add(row, 2, { castle: 'q' });
        }
      } else {
        const dirs = p.t === 'r' ? KING.slice(0, 4) : p.t === 'b' ? KING.slice(4) : KING;
        for (const [dr, dc] of dirs) {
          let tr = r + dr, tc = c + dc;
          while (inside(tr, tc)) {
            const q = B[tr][tc];
            if (!q) add(tr, tc);
            else { if (q.c !== col) add(tr, tc, { cap: true }); break; }
            tr += dr; tc += dc;
          }
        }
      }
    }
  }
  return out;
}

export function applyMove(S: GameState, m: Move, promo: PieceType = 'q'): GameState {
  const T: GameState = { b: S.b.map(row => row.slice()), turn: S.turn, cast: { ...S.cast }, ep: S.ep };
  const B = T.b, p = B[m.fr][m.fc]!;
  B[m.fr][m.fc] = null;
  if (m.ep) B[m.fr][m.tc] = null;
  B[m.tr][m.tc] = m.promo ? { t: promo, c: p.c } : p;
  if (m.castle) {
    const row = m.tr;
    if (m.castle === 'k') { B[row][5] = B[row][7]; B[row][7] = null; }
    else { B[row][3] = B[row][0]; B[row][0] = null; }
  }
  if (p.t === 'k') { T.cast[`${p.c}k` as CastKey] = false; T.cast[`${p.c}q` as CastKey] = false; }
  const corner = (r: number, c: number) => {
    if (r === 7 && c === 0) T.cast.wq = false;
    if (r === 7 && c === 7) T.cast.wk = false;
    if (r === 0 && c === 0) T.cast.bq = false;
    if (r === 0 && c === 7) T.cast.bk = false;
  };
  corner(m.fr, m.fc); corner(m.tr, m.tc);
  T.ep = m.dbl ? [(m.fr + m.tr) / 2, m.fc] : null;
  T.turn = other(p.c);
  return T;
}

export function findKing(S: GameState, col: Color): [number, number] | null {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = S.b[r][c];
      if (p && p.t === 'k' && p.c === col) return [r, c];
    }
  return null;
}

export function inCheck(S: GameState, col: Color): boolean {
  const k = findKing(S, col);
  if (!k) return false;
  return generateMoves(S, other(col)).some(m => m.tr === k[0] && m.tc === k[1]);
}

/** Peça que seria capturada por este lance (inclui en passant). */
export function victimOf(S: GameState, m: Move): Piece | null {
  return m.cap ? S.b[m.ep ? m.fr : m.tr][m.tc] : null;
}

export function notation(S: GameState, m: Move, promo: PieceType = 'q'): string {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const p = S.b[m.fr][m.fc]!;
  const head = p.t === 'p' ? (m.cap ? 'abcdefgh'[m.fc] : '') : p.t.toUpperCase();
  return head + (m.cap ? 'x' : '') + squareName(m.tr, m.tc) + (m.promo ? '=' + promo.toUpperCase() : '');
}

// ---------------------------------------------------------------------------
// Apoio ao modo online: comparar e reconstruir posições vindas do servidor
// ---------------------------------------------------------------------------

/** "e2" -> [linha, coluna] da matriz (linha 0 = 8ª fileira). Devolve null se o texto for inválido. */
export function parseSquare(txt: string): [number, number] | null {
  const m = /^([a-h])([1-8])$/i.exec(txt.trim());
  return m ? [8 - Number(m[2]), m[1].toLowerCase().charCodeAt(0) - 97] : null;
}

export function boardsEqual(a: Board, b: Board): boolean {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = a[r][c], q = b[r][c];
      if (!p !== !q || (p && q && (p.t !== q.t || p.c !== q.c))) return false;
    }
  return true;
}

/** Existe algum lance de `col` que não deixa o próprio rei em xeque? (xadrez tradicional) */
export function hasLegalMove(S: GameState, col: Color): boolean {
  return generateMoves(S, col).some(m => !inCheck(applyMove(S, m, 'q'), col));
}

/** Direitos de roque deduzidos da posição: rei e torre nas casas iniciais. */
export function inferCastling(b: Board): Record<CastKey, boolean> {
  const at = (r: number, c: number, t: PieceType, col: Color) => b[r][c]?.t === t && b[r][c]?.c === col;
  return {
    wk: at(7, 4, 'k', 'w') && at(7, 7, 'r', 'w'), wq: at(7, 4, 'k', 'w') && at(7, 0, 'r', 'w'),
    bk: at(0, 4, 'k', 'b') && at(0, 7, 'r', 'b'), bq: at(0, 4, 'k', 'b') && at(0, 0, 'r', 'b'),
  };
}

/**
 * Descobre qual lance leva da posição `S` ao tabuleiro `target` (o que o servidor devolveu).
 * É assim que o lance do adversário ganha animação: o servidor só manda a posição final.
 */
export function findMoveBetween(S: GameState, target: Board): { move: Move; promo: PieceType } | null {
  for (const col of [S.turn, other(S.turn)]) {
    for (const move of generateMoves(S, col)) {
      for (const promo of (move.promo ? ['q', 'r', 'b', 'n'] : ['q']) as PieceType[]) {
        if (boardsEqual(applyMove(S, move, promo).b, target)) return { move, promo };
      }
    }
  }
  return null;
}

/** Peças que faltam em relação ao jogo completo (usado ao carregar uma partida já em andamento). */
export function missingPieces(b: Board): Piece[] {
  const start: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const out: Piece[] = [];
  for (const col of ['w', 'b'] as Color[]) {
    const have: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    for (const row of b) for (const p of row) if (p && p.c === col) have[p.t]++;
    // peça "a mais" (ex.: 2ª dama) veio de promoção: desconta um peão que parecia capturado
    let promoted = 0;
    for (const t of ['q', 'r', 'b', 'n'] as PieceType[]) promoted += Math.max(0, have[t] - start[t]);
    for (const t of ['q', 'r', 'b', 'n', 'p', 'k'] as PieceType[]) {
      let n = Math.max(0, start[t] - have[t]);
      if (t === 'p') n = Math.max(0, n - promoted);
      for (let i = 0; i < n; i++) out.push({ t, c: col });
    }
  }
  return out;
}
