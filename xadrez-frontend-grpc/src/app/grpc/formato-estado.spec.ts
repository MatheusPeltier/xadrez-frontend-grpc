import { initialState } from '../core/chess-engine';
import { escreverPosicaoPecas, lerCor, lerEstadoPartida, lerPosicaoPecas } from './formato-estado';

// Texto que o servidor Java (Tabuleiro.getPecasTabuleiro) gera para a posição inicial.
const TIPOS = ['TORRE', 'CAVALO', 'BISPO', 'RAINHA', 'REI', 'BISPO', 'CAVALO', 'TORRE'];
const COLUNAS = 'abcdefgh';
const INICIAL = [
  ...TIPOS.map((t, i) => `${COLUNAS[i]}1,${t},BRANCAS`),
  ...TIPOS.map((_, i) => `${COLUNAS[i]}2,PEAO,BRANCAS`),
  ...TIPOS.map((_, i) => `${COLUNAS[i]}7,PEAO,PRETAS`),
  ...TIPOS.map((t, i) => `${COLUNAS[i]}8,${t},PRETAS`),
].join(';');

describe('formato-estado', () => {
  it('escreve a posição inicial igual ao servidor', () => {
    expect(INICIAL.startsWith('a1,TORRE,BRANCAS;b1,CAVALO,BRANCAS')).toBe(true);
    expect(escreverPosicaoPecas(initialState().b)).toBe(INICIAL);
  });

  it('lê o que o servidor escreve', () => {
    expect(lerPosicaoPecas(INICIAL)).toEqual(initialState().b);
  });

  it('lê peças no lugar certo e o resto vazio', () => {
    const b = lerPosicaoPecas('e1,REI,BRANCAS;e4,PEAO,BRANCAS;d5,RAINHA,PRETAS;e8,REI,PRETAS')!;
    expect(b[0][4]).toEqual({ t: 'k', c: 'b' });   // e8
    expect(b[3][3]).toEqual({ t: 'q', c: 'b' });   // d5
    expect(b[4][4]).toEqual({ t: 'p', c: 'w' });   // e4
    expect(b[7][4]).toEqual({ t: 'k', c: 'w' });   // e1
    expect(b[4][3]).toBeNull();
  });

  it('devolve null para texto em formato desconhecido', () => {
    expect(lerPosicaoPecas('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toBeNull();
    expect(lerPosicaoPecas('e9,PEAO,BRANCAS')).toBeNull();
    expect(lerPosicaoPecas('e2,DAMA,BRANCAS')).toBeNull();
    expect(lerPosicaoPecas('')).toBeNull();
  });

  it('lê cor e estado com os nomes dos enums do servidor', () => {
    expect(lerCor('BRANCAS')).toBe('w');
    expect(lerCor(' pretas ')).toBe('b');
    expect(lerCor('NENHUM')).toBeNull();
    expect(lerEstadoPartida('EM_ANDAMENTO')).toBe('EM_ANDAMENTO');
    expect(lerEstadoPartida('pausada')).toBeNull();
  });
});
