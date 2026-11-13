import { Board, Color, Piece, PieceType } from '../core/chess-engine';

/**
 * Tradução dos TEXTOS do EstadoResponse (posicaoPecas, turnoAtual, estadoJogo).
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ ATENÇÃO: o formato de `posicaoPecas` AINDA NÃO FOI DEFINIDO pelo servidor        │
 * │ (Etapas 2.2, 3.6 e 11.2 do backend). O que está aqui é uma PROPOSTA provisória.  │
 * │ Quando o formato for combinado com o João, este é o ÚNICO arquivo a ajustar:     │
 * │ reescreva `lerPosicaoPecas` (e `escreverPosicaoPecas`, usado só pelo servidor de │
 * │ teste). O resto do front trabalha com a matriz `Board`.                          │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Proposta: o campo de peças da notação FEN, padrão do xadrez.
 *   - 8 fileiras separadas por "/", da 8ª (topo, lado das pretas) até a 1ª;
 *   - letra maiúscula = peça branca, minúscula = preta:
 *       P peão · N cavalo · B bispo · R torre · Q rainha · K rei
 *   - número = quantidade de casas vazias seguidas.
 * Posição inicial: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
 */

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

/** Texto do servidor -> matriz 8x8 (linha 0 = 8ª fileira). Devolve null se não reconhecer o formato. */
export function lerPosicaoPecas(texto: string): Board | null {
  const fileiras = texto.trim().split(/\s+/)[0].split('/');
  if (fileiras.length !== 8) return null;
  const board: Board = [];
  for (const fileira of fileiras) {
    const linha: (Piece | null)[] = [];
    for (const ch of fileira) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < Number(ch); i++) linha.push(null);
      } else {
        const t = ch.toLowerCase();
        if (!'pnbrqk'.includes(t)) return null;
        linha.push({ t: t as PieceType, c: ch === t ? 'b' : 'w' });
      }
    }
    if (linha.length !== 8) return null;
    board.push(linha);
  }
  return board;
}

/** Caminho inverso de `lerPosicaoPecas`. No projeto, só o servidor de teste usa. */
export function escreverPosicaoPecas(board: Board): string {
  return board.map(linha => {
    let out = '', vazias = 0;
    for (const p of linha) {
      if (!p) { vazias++; continue; }
      if (vazias) { out += vazias; vazias = 0; }
      out += p.c === 'w' ? p.t.toUpperCase() : p.t;
    }
    return out + (vazias || '');
  }).join('/');
}
