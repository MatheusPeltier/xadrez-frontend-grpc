import {
  Move, applyMove, findMoveBetween, generateMoves, hasLegalMove, inCheck, initialState,
  missingPieces, parseSquare, squareName,
} from './chess-engine';

/** Joga uma sequência como ['e2e4', 'e7e5'] a partir da posição inicial. */
function jogar(lances: string[]) {
  let S = initialState();
  for (const l of lances) {
    const [fr, fc] = parseSquare(l.slice(0, 2))!, [tr, tc] = parseSquare(l.slice(2, 4))!;
    const m = generateMoves(S, S.turn).find(x => x.fr === fr && x.fc === fc && x.tr === tr && x.tc === tc) as Move;
    if (!m) throw new Error(`lance impossível: ${l}`);
    S = applyMove(S, m);
  }
  return S;
}

describe('chess-engine', () => {
  it('tem 20 lances na posição inicial', () => {
    expect(generateMoves(initialState(), 'w')).toHaveLength(20);
  });

  it('converte casas nos dois sentidos', () => {
    expect(parseSquare('e2')).toEqual([6, 4]);
    expect(squareName(6, 4)).toBe('e2');
    expect(parseSquare('i9')).toBeNull();
  });

  it('regras livres: permite deixar o próprio rei em xeque', () => {
    const S = jogar(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(inCheck(S, 'w')).toBe(true);
    expect(generateMoves(S, 'w').some(m => squareName(m.fr, m.fc) === 'a2')).toBe(true);
    expect(hasLegalMove(S, 'w')).toBe(false);            // no xadrez tradicional seria xeque-mate
  });

  it('descobre o lance que leva à posição enviada pelo servidor', () => {
    const antes = jogar(['e2e4', 'd7d5']), depois = jogar(['e2e4', 'd7d5', 'e4d5']);
    const achado = findMoveBetween(antes, depois.b)!;
    expect(squareName(achado.move.fr, achado.move.fc) + squareName(achado.move.tr, achado.move.tc)).toBe('e4d5');
    expect(achado.move.cap).toBe(true);
    expect(findMoveBetween(initialState(), depois.b)).toBeNull();   // 3 lances de distância: não é um lance só
  });

  it('lista as peças capturadas a partir da posição', () => {
    expect(missingPieces(initialState().b)).toEqual([]);
    expect(missingPieces(jogar(['e2e4', 'd7d5', 'e4d5']).b)).toEqual([{ t: 'p', c: 'b' }]);
  });
});
