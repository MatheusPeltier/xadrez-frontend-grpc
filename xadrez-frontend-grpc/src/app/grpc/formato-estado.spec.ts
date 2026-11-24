import { initialState } from '../core/chess-engine';
import { escreverPosicaoPecas, lerCor, lerEstadoPartida, lerPosicaoPecas } from './formato-estado';

const REIS = 'e1,REI,BRANCAS;e8,REI,PRETAS';

describe('formato-estado', () => {
  it('lê a posição inicial enviada pelo servidor', () => {
    const texto = escreverPosicaoPecas(initialState().b);
    expect(texto.startsWith('a1,TORRE,BRANCAS;b1,CAVALO,BRANCAS')).toBe(true);
    expect(lerPosicaoPecas(texto)).toEqual(initialState().b);
  });

  it('coloca cada peça na casa certa', () => {
    const b = lerPosicaoPecas('e8,REI,PRETAS;d5,RAINHA,PRETAS;e4,PEAO,BRANCAS;e1,REI,BRANCAS')!;
    expect(b[0][4]).toEqual({ t: 'k', c: 'b' });   // e8
    expect(b[3][3]).toEqual({ t: 'q', c: 'b' });   // d5
    expect(b[4][4]).toEqual({ t: 'p', c: 'w' });   // e4
    expect(b[7][4]).toEqual({ t: 'k', c: 'w' });   // e1
    expect(b[4][3]).toBeNull();
  });

  it('aceita texto vazio como tabuleiro vazio', () => {
    expect(lerPosicaoPecas('')!.flat().every(c => c === null)).toBe(true);
  });

  it('devolve null para texto em formato desconhecido', () => {
    expect(lerPosicaoPecas('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toBeNull();
    expect(lerPosicaoPecas(REIS + ';i9,PEAO,BRANCAS')).toBeNull();
    expect(lerPosicaoPecas('e2,DRAGAO,BRANCAS')).toBeNull();
    expect(lerPosicaoPecas('e2,PEAO,AZUL')).toBeNull();
    expect(lerPosicaoPecas('e2,PEAO,BRANCAS;e2,PEAO,PRETAS')).toBeNull();
  });

  it('lê cor e estado com os nomes dos enums do servidor', () => {
    expect(lerCor('BRANCAS')).toBe('w');
    expect(lerCor(' pretas ')).toBe('b');
    expect(lerCor('AZUL')).toBeNull();
    expect(lerEstadoPartida('EM_ANDAMENTO')).toBe('EM_ANDAMENTO');
    expect(lerEstadoPartida('pausada')).toBeNull();
  });
});
