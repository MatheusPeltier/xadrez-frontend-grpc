/**
 * SERVIDOR DE TESTE — NÃO é o backend do trabalho.
 *
 * Serve para desenvolver e testar o frontend enquanto o servidor Java (xadrezServerRpc) não
 * responde EnviarJogada nem ObterEstadoDoJogo. Fala gRPC-Web direto com o navegador, na mesma
 * porta do Envoy (8080), então o front não precisa de nenhuma mudança para usá-lo.
 *
 *   npm run servidor-teste              # regras livres (pode deixar o rei em xeque)
 *   npm run servidor-teste -- --estrito # recusa lance que deixa o próprio rei em xeque (Etapa 7.1)
 *
 * Imita o que o servidor real faz/planeja: uma única partida em memória, primeiro a entrar joga
 * de brancas, reconexão pelo idJogador e os mesmos status de erro. O texto de `posicaoPecas`
 * segue a proposta PROVISÓRIA de src/app/grpc/formato-estado.ts.
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { Code, ConnectError, type ConnectRouter, cors } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import {
  type Color, type GameState,
  applyMove, findKing, generateMoves, hasLegalMove, inCheck, initialState, other, parseSquare,
} from '../../src/app/core/chess-engine';
import { XadrezService } from '../../src/app/gen/xadrez_pb';
import { escreverCor, escreverPosicaoPecas } from '../../src/app/grpc/formato-estado';

const PORTA = Number(process.env['PORT'] ?? 8080);
const ESTRITO = process.argv.includes('--estrito');

interface Jogador { id: string; nome: string }
type Estado = 'AGUARDANDO' | 'EM_ANDAMENTO' | 'CONCLUIDA';

const partida = {
  id: randomUUID(),
  jogadores: new Map<Color, Jogador>(),
  estado: 'AGUARDANDO' as Estado,
  jogo: initialState() as GameState,
};

function corDoJogador(id: string): Color | null {
  for (const [cor, j] of partida.jogadores) if (j.id === id) return cor;
  return null;
}

function rotas(router: ConnectRouter): void {
  router.service(XadrezService, {
    conectarJogador(req) {
      const id = req.idJogador.trim(), nome = req.nomeJogador.trim();

      const corAntiga = corDoJogador(id);
      if (id && corAntiga) {                                   // reconexão: o nome enviado é ignorado
        const j = partida.jogadores.get(corAntiga)!;
        return { idJogador: j.id, idPartida: partida.id, nomeJogador: j.nome, corPecas: escreverCor(corAntiga) };
      }
      const repetido = [...partida.jogadores.values()].some(j => j.nome.toLowerCase() === nome.toLowerCase());
      if (nome.length < 3 || nome.length > 15 || repetido) {
        throw new ConnectError(
          'Nome inválido: use de 3 a 15 caracteres e um nome que ninguém na partida esteja usando.',
          Code.InvalidArgument,
        );
      }
      if (partida.jogadores.size >= 2) {
        throw new ConnectError('Jogo está cheio! Tente novamente mais tarde.', Code.FailedPrecondition);
      }
      const cor: Color = partida.jogadores.has('w') ? 'b' : 'w';   // quem entra primeiro joga de brancas
      const jogador = { id: randomUUID(), nome };
      partida.jogadores.set(cor, jogador);
      if (partida.jogadores.size === 2) partida.estado = 'EM_ANDAMENTO';
      console.log(`+ ${nome} entrou de ${escreverCor(cor)} (${partida.estado})`);
      return { idJogador: jogador.id, idPartida: partida.id, nomeJogador: nome, corPecas: escreverCor(cor) };
    },

    enviarJogada(req) {
      if (req.idPartida !== partida.id) throw new ConnectError('Partida não encontrada.', Code.NotFound);
      const cor = corDoJogador(req.idJogador);
      if (!cor) throw new ConnectError('Jogador não pertence a esta partida.', Code.PermissionDenied);

      const recusa = (mensagemRetorno: string) => ({ jogadaValida: false, mensagemRetorno });
      if (partida.estado === 'AGUARDANDO') return recusa('A partida ainda não começou: falta o adversário.');
      if (partida.estado === 'CONCLUIDA') return recusa('A partida já terminou.');
      const S = partida.jogo;
      if (S.turn !== cor) return recusa('Não é a sua vez.');

      const de = parseSquare(req.posicaoOrigem), para = parseSquare(req.posicaoDestino);
      if (!de || !para) return recusa('Posição inválida: use o formato "e2".');
      const lance = generateMoves(S, cor).find(m => m.fr === de[0] && m.fc === de[1] && m.tr === para[0] && m.tc === para[1]);
      if (!lance) return recusa(`Lance ilegal: ${req.posicaoOrigem} → ${req.posicaoDestino}.`);
      const depois = applyMove(S, lance, 'q');                    // sem campo de promoção no .proto: vira rainha
      if (ESTRITO && inCheck(depois, cor)) return recusa('Esse lance deixa o seu rei em xeque.');

      partida.jogo = depois;
      const reiCapturado = !findKing(depois, other(cor));
      const semSaida = ESTRITO && !hasLegalMove(depois, depois.turn);
      if (reiCapturado || semSaida) partida.estado = 'CONCLUIDA';
      console.log(`  ${escreverCor(cor)}: ${req.posicaoOrigem} → ${req.posicaoDestino}${partida.estado === 'CONCLUIDA' ? ' (fim)' : ''}`);
      return { jogadaValida: true, mensagemRetorno: 'Jogada realizada.' };
    },

    obterEstadoDoJogo(req) {
      if (req.idPartida !== partida.id) throw new ConnectError('Partida não encontrada.', Code.NotFound);
      return {
        posicaoPecas: escreverPosicaoPecas(partida.jogo.b),
        turnoAtual: escreverCor(partida.jogo.turn),
        estadoJogo: partida.estado,
      };
    },
  });
}

const atender = connectNodeAdapter({ routes: rotas });

http.createServer((req, res) => {
  // CORS: a página vem de http://localhost:4200 e chama outra porta
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', cors.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '7200');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  atender(req, res);
}).listen(PORTA, () => {
  console.log(`SERVIDOR DE TESTE (não é o backend do trabalho) em http://localhost:${PORTA}`);
  console.log(`Regras: ${ESTRITO ? 'estritas (não pode deixar o rei em xeque)' : 'livres'} · partida ${partida.id}`);
  console.log('Para uma partida nova, pare (Ctrl+C) e rode de novo.');
});
