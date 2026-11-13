import { initialState } from '../core/chess-engine';
import { escreverPosicaoPecas, lerCor, lerEstadoPartida, lerPosicaoPecas } from './formato-estado';

// Se o formato de posicaoPecas mudar (quando o servidor definir o dele), ajuste estes exemplos junto.
const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

describe('formato-estado', () => {
  it('escreve a posição inicial no formato combinado', () => {
    expect(escreverPosicaoPecas(initialState().b)).toBe(INICIAL);
  });

  it('lê o que escreve', () => {
    expect(lerPosicaoPecas(INICIAL)).toEqual(initialState().b);
  });

  it('lê casas vazias e peças no lugar certo', () => {
    const b = lerPosicaoPecas('4k3/8/8/3q4/4P3/8/8/4K3')!;
    expect(b[0][4]).toEqual({ t: 'k', c: 'b' });   // e8
    expect(b[3][3]).toEqual({ t: 'q', c: 'b' });   // d5
    expect(b[4][4]).toEqual({ t: 'p', c: 'w' });   // e4
    expect(b[7][4]).toEqual({ t: 'k', c: 'w' });   // e1
    expect(b[4][3]).toBeNull();
  });

  it('devolve null para texto em formato desconhecido', () => {
    expect(lerPosicaoPecas('e2=PEAO_BRANCAS;e7=PEAO_PRETAS')).toBeNull();
    expect(lerPosicaoPecas('rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR')).toBeNull();
    expect(lerPosicaoPecas('')).toBeNull();
  });

  it('lê cor e estado com os nomes dos enums do servidor', () => {
    expect(lerCor('BRANCAS')).toBe('w');
    expect(lerCor(' pretas ')).toBe('b');
    expect(lerCor('AZUL')).toBeNull();
    expect(lerEstadoPartida('EM_ANDAMENTO')).toBe('EM_ANDAMENTO');
    expect(lerEstadoPartida('pausada')).toBeNull();
  });
});
