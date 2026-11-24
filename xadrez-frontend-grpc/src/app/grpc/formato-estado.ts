import { Board, Color, Piece, PieceType } from '../core/chess-engine';

/**
 * Tradução dos TEXTOS do EstadoResponse (posicaoPecas, turnoAtual, estadoJogo).
 *
 * Formato de `posicaoPecas` definido pelo servidor (Tabuleiro.getPecasTabuleiro): uma lista de
 * "casa,TIPO,COR" separada por ";". Casa vazia não entra.
 *   Exemplo: "a1,TORRE,BRANCAS;b1,CAVALO,BRANCAS;e8,REI,PRETAS"
 *   TIPO: PEAO, TORRE, CAVALO, BISPO, RAINHA, REI · COR: BRANCAS, PRETAS
 * Este é o ÚNICO arquivo que conhece esse formato; o resto do front trabalha com a matriz `Board`
 * (linha 0 = 8ª fileira, coluna 0 = coluna "a").
 */

/** Nome da peça de promoção no formato do servidor (RAINHA, TORRE, BISPO, CAVALO). */
export function escreverPromocao(tipo: PieceType): string {
  return NOMES_TIPO[tipo];
}

export type EstadoPartida = 'AGUARDANDO' | 'EM_ANDAMENTO' | 'CONCLUIDA';

/** "BRANCAS" / "PRETAS" (nomes do enum CorPecas do servidor) -> cor usada no front. */
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

const TIPOS: Record<string, PieceType> = {
  PEAO: 'p', TORRE: 'r', CAVALO: 'n', BISPO: 'b', RAINHA: 'q', REI: 'k',
};
const NOMES_TIPO: Record<PieceType, string> = {
  p: 'PEAO', r: 'TORRE', n: 'CAVALO', b: 'BISPO', q: 'RAINHA', k: 'REI',
};

/** Texto do servidor -> matriz 8x8 (linha 0 = 8ª fileira). Devolve null se não reconhecer o formato. */
export function lerPosicaoPecas(texto: string): Board | null {
  const board: Board = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  const t = texto.trim();
  if (!t) return board;
  for (const item of t.split(';')) {
    const partes = item.trim().split(',');
    if (partes.length !== 3) return null;
    const casa = /^([a-h])([1-8])$/.exec(partes[0].trim().toLowerCase());
    const tipo = TIPOS[partes[1].trim().toUpperCase()];
    const cor = lerCor(partes[2]);
    if (!casa || !tipo || !cor) return null;
    const col = casa[1].charCodeAt(0) - 97;
    const lin = 8 - Number(casa[2]);
    if (board[lin][col]) return null;
    board[lin][col] = { t: tipo, c: cor };
  }
  return board;
}

/** Caminho inverso de `lerPosicaoPecas`. No projeto, só o servidor de teste usa. */
export function escreverPosicaoPecas(board: Board): string {
  const itens: string[] = [];
  for (let l = 7; l >= 0; l--) {
    for (let c = 0; c < 8; c++) {
      const p = board[l][c];
      if (p) itens.push(`${String.fromCharCode(97 + c)}${8 - l},${NOMES_TIPO[p.t]},${escreverCor(p.c)}`);
    }
  }
  return itens.join(';');
}
