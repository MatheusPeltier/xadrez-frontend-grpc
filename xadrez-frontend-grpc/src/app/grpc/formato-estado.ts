import { Board, Color, Piece, PieceType } from '../core/chess-engine';

/**
 * Tradução dos TEXTOS do EstadoResponse (posicaoPecas, turnoAtual, estadoJogo).
 *
 * Formato definido pelo servidor Java (Tabuleiro.getPecasTabuleiro, commit ea22a65):
 *   - só as casas ocupadas, cada uma como `casa,TIPO,COR`, separadas por ";";
 *   - ordem a1, b1 ... h1, a2 ... h8;
 *   - TIPO: PEAO, TORRE, CAVALO, BISPO, RAINHA, REI · COR: BRANCAS, PRETAS;
 *   - texto vazio enquanto a partida não começou (tabuleiro ainda vazio no servidor).
 * Exemplo: "a1,TORRE,BRANCAS;b1,CAVALO,BRANCAS;...;h8,TORRE,PRETAS"
 *
 * `turnoAtual`: BRANCAS, PRETAS ou NENHUM (antes de começar).
 * `estadoJogo`: AGUARDANDO, EM_ANDAMENTO ou CONCLUIDA.
 */

export type EstadoPartida = 'AGUARDANDO' | 'EM_ANDAMENTO' | 'CONCLUIDA';

const TIPO: Record<string, PieceType> = { PEAO: 'p', CAVALO: 'n', BISPO: 'b', TORRE: 'r', RAINHA: 'q', REI: 'k' };
const NOME: Record<PieceType, string> = { p: 'PEAO', n: 'CAVALO', b: 'BISPO', r: 'TORRE', q: 'RAINHA', k: 'REI' };

/** "BRANCAS" / "PRETAS" (nomes do enum CorPecas do servidor) -> cor usada no front. "NENHUM" vira null. */
export function lerCor(texto: string): Color | null {
  const t = texto.trim().toUpperCase();
  return t === 'BRANCAS' ? 'w' : t === 'PRETAS' ? 'b' : null;
}

export function escreverCor(cor: Color): string {
  return cor === 'w' ? 'BRANCAS' : 'PRETAS';
}

/** Nomes do enum EstadoDaPartida do servidor. */
export function lerEstadoPartida(texto: string): EstadoPartida | null {
  const t = texto.trim().toUpperCase();
  return t === 'AGUARDANDO' || t === 'EM_ANDAMENTO' || t === 'CONCLUIDA' ? t : null;
}

/** Texto do servidor -> matriz 8x8 (linha 0 = 8ª fileira). Devolve null se não reconhecer o formato. */
export function lerPosicaoPecas(texto: string): Board | null {
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (const item of texto.trim().split(';')) {
    const [casa, tipo, cor] = item.split(',').map(s => s.trim().toUpperCase());
    const m = /^([A-H])([1-8])$/.exec(casa ?? '');
    const t = TIPO[tipo ?? ''], c = lerCor(cor ?? '');
    if (!m || !t || !c) return null;
    board[8 - Number(m[2])][m[1].charCodeAt(0) - 65] = { t, c };
  }
  return board;
}

/** Caminho inverso de `lerPosicaoPecas`, na mesma ordem do servidor. No projeto, só o servidor de teste usa. */
export function escreverPosicaoPecas(board: Board): string {
  const partes: string[] = [];
  for (let linha = 7; linha >= 0; linha--)
    for (let coluna = 0; coluna < 8; coluna++) {
      const p = board[linha][coluna];
      if (p) partes.push(`${'abcdefgh'[coluna]}${8 - linha},${NOME[p.t]},${escreverCor(p.c)}`);
    }
  return partes.join(';');
}
