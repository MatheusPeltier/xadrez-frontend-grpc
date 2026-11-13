import {
  Color, GameState, Move, PieceType,
  applyMove, findKing, generateMoves, inCheck, other,
} from './chess-engine';

export type AiLevel = 'facil' | 'medio' | 'dificil';

export const AI_LEVELS: { id: AiLevel; label: string }[] = [
  { id: 'facil', label: 'IA fácil' },
  { id: 'medio', label: 'IA média' },
  { id: 'dificil', label: 'IA difícil' },
];

/** depth: profundidade máxima (em lances); ms: tempo máximo de busca. */
const LEVELS: Record<AiLevel, { depth: number; ms: number }> = {
  facil: { depth: 0, ms: 0 },        // sem busca: aleatória com prioridades simples
  medio: { depth: 2, ms: 400 },
  dificil: { depth: 4, ms: 900 },
};

const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const WIN = 100000;                  // pontuação de "capturei o rei"
const QUIESCENCE_DEPTH = 4;
const TIMEOUT = Symbol('timeout');

let nodes = 0;
let deadline = Infinity;

/** Material + pequenos bônus de posição, do ponto de vista de `me`. */
function evaluate(S: GameState, me: Color): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = S.b[r][c];
      if (!p) continue;
      let v = VALUE[p.t];
      if (p.t === 'p') v += (p.c === 'w' ? 6 - r : r - 1) * 6;                         // peão avançado
      else if (p.t === 'n' || p.t === 'b') v += (7 - (Math.abs(r - 3.5) + Math.abs(c - 3.5))) * 4; // centro
      score += p.c === me ? v : -v;
    }
  }
  return score;
}

/** Capturas mais valiosas primeiro (MVV-LVA): melhora muito a poda alfa-beta. */
function order(S: GameState, moves: Move[]): Move[] {
  const key = (m: Move) => {
    const attacker = S.b[m.fr][m.fc]!;
    const victim = m.cap ? S.b[m.ep ? m.fr : m.tr][m.tc] : null;
    return (victim ? 10 * VALUE[victim.t] - VALUE[attacker.t] : 0) + (m.promo ? 800 : 0);
  };
  return moves.map(m => ({ m, k: key(m) })).sort((a, b) => b.k - a.k).map(x => x.m);
}

function tick(): void {
  if ((++nodes & 1023) === 0 && performance.now() > deadline) throw TIMEOUT;
}

/** Só capturas, para não avaliar a posição no meio de uma troca (efeito horizonte). */
function quiesce(S: GameState, alpha: number, beta: number, qd: number): number {
  tick();
  const side = S.turn;
  if (!findKing(S, side)) return -WIN;
  if (!findKing(S, other(side))) return WIN;
  const stand = evaluate(S, side);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (qd === 0) return alpha;
  for (const m of order(S, generateMoves(S, side).filter(x => x.cap))) {
    const sc = -quiesce(applyMove(S, m, 'q'), -beta, -alpha, qd - 1);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

/** Negamax com poda alfa-beta; a pontuação é sempre de quem tem a vez. */
function negamax(S: GameState, depth: number, alpha: number, beta: number): number {
  tick();
  const side = S.turn;
  if (!findKing(S, side)) return -WIN - depth;          // meu rei foi capturado
  if (!findKing(S, other(side))) return WIN + depth;    // capturei o rei adversário
  if (depth === 0) return quiesce(S, alpha, beta, QUIESCENCE_DEPTH);
  const moves = order(S, generateMoves(S, side));
  if (!moves.length) return 0;
  let best = -Infinity;
  for (const m of moves) {
    const sc = -negamax(applyMove(S, m, 'q'), depth - 1, -beta, -alpha);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Nível fácil: aleatória, mas captura o rei se puder, evita expor o rei e prefere capturas. */
function randomMove(S: GameState, color: Color, moves: Move[]): Move {
  const kingShot = moves.find(m => S.b[m.tr][m.tc]?.t === 'k');
  if (kingShot) return kingShot;
  const safe = moves.filter(m => !inCheck(applyMove(S, m, 'q'), color));
  const pool0 = safe.length ? safe : moves;
  const caps = pool0.filter(m => m.cap);
  const pool = caps.length && Math.random() < 0.6 ? caps : pool0;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Escolhe a jogada de `color`. Médio/Difícil usam aprofundamento iterativo com limite de tempo:
 * se o tempo acabar no meio de uma profundidade, vale o melhor lance da profundidade anterior.
 */
export function chooseMove(S: GameState, color: Color, level: AiLevel): Move | undefined {
  const moves = generateMoves(S, color);
  if (!moves.length) return undefined;
  const cfg = LEVELS[level];
  if (cfg.depth === 0) return randomMove(S, color, moves);

  // embaralha antes de ordenar: lances de mesmo valor não ficam sempre iguais
  const shuffled = [...moves].sort(() => Math.random() - 0.5);
  let ordered = order(S, shuffled);
  let best = ordered[0];
  const start = performance.now();
  nodes = 0;

  for (let d = 1; d <= cfg.depth; d++) {
    deadline = d === 1 ? Infinity : start + cfg.ms;     // a profundidade 1 sempre termina
    try {
      let alpha = -Infinity, iterBest = ordered[0], iterScore = -Infinity;
      for (const m of ordered) {
        const sc = -negamax(applyMove(S, m, 'q'), d - 1, -Infinity, -alpha);
        if (sc > iterScore) { iterScore = sc; iterBest = m; }
        if (iterScore > alpha) alpha = iterScore;
      }
      best = iterBest;
      ordered = [iterBest, ...ordered.filter(x => x !== iterBest)];
      if (iterScore >= WIN - 50) break;                 // já achou a captura do rei
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
  }
  deadline = Infinity;
  return best;
}
