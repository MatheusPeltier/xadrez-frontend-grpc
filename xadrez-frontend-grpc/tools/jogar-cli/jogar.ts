/**
 * CLIENTE DE TERMINAL para jogar contra o servidor real, sem navegador e sem Envoy
 * (fala gRPC puro por HTTP/2 direto na porta 50040).
 *
 *   npm run jogar -- entrar <nome> <slot>            conecta um jogador (slot = apelido local: a, b...)
 *   npm run jogar -- estado <slot>                   mostra o tabuleiro, a vez e o resultado
 *   npm run jogar -- esperar <slot>                  espera ser a vez do slot (ou o fim da partida) e mostra o estado
 *   npm run jogar -- jogar <slot> <origem> <destino> [rainha|torre|bispo|cavalo]
 *
 * A sessão de cada slot fica em um arquivo na pasta temporária do sistema.
 */
import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { XadrezService } from '../../src/app/gen/xadrez_pb';
import { lerPosicaoPecas } from '../../src/app/grpc/formato-estado';

const url = process.env['XADREZ_URL'] ?? 'http://localhost:50040';
const cliente = createClient(XadrezService, createGrpcTransport({ baseUrl: url }));
const arq = (slot: string) => join(tmpdir(), `xadrez-cli-${slot}.json`);
const GLIFO: Record<string, string> = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };

function desenhar(posicao: string): string {
  const b = lerPosicaoPecas(posicao);
  if (!b) return `(formato desconhecido: ${posicao})`;
  const linhas = b.map((l, i) => `${8 - i}  ` + l.map(p => p ? (p.c === 'w' ? GLIFO[p.t] : GLIFO[p.t].toLowerCase()) : '.').join(' '));
  return linhas.join('\n') + '\n   a b c d e f g h   (MAIÚSCULA = brancas, minúscula = pretas)';
}

async function mostrar(slot: string): Promise<void> {
  const s = JSON.parse(readFileSync(arq(slot), 'utf8'));
  const e = await cliente.obterEstadoDoJogo({ idPartida: s.idPartida });
  console.log(desenhar(e.posicaoPecas));
  console.log(`estado=${e.estadoJogo} vez=${e.turnoAtual} resultado=${e.resultado || '-'} | eu=${s.nome} (${s.cor})`);
}

const [cmd, ...a] = process.argv.slice(2);
async function main(): Promise<void> {
  if (cmd === 'entrar') {
    const [nome, slot] = a;
    const r = await cliente.conectarJogador({ idJogador: '', nomeJogador: nome });
    writeFileSync(arq(slot), JSON.stringify({ idJogador: r.idJogador, idPartida: r.idPartida, nome: r.nomeJogador, cor: r.corPecas }));
    console.log(`conectado: ${r.nomeJogador} joga de ${r.corPecas}`);
  } else if (cmd === 'estado') {
    await mostrar(a[0]);
  } else if (cmd === 'esperar') {
    // fica consultando o servidor até ser a vez deste slot (ou a partida acabar), depois mostra o estado
    const s = JSON.parse(readFileSync(arq(a[0]), 'utf8'));
    for (;;) {
      const e = await cliente.obterEstadoDoJogo({ idPartida: s.idPartida });
      if (e.estadoJogo === 'CONCLUIDA' || e.turnoAtual === s.cor) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    await mostrar(a[0]);
  } else if (cmd === 'jogar') {
    const [slot, origem, destino, promocao = ''] = a;
    const s = JSON.parse(readFileSync(arq(slot), 'utf8'));
    const r = await cliente.enviarJogada({
      idJogador: s.idJogador, idPartida: s.idPartida, posicaoOrigem: origem, posicaoDestino: destino, promocao,
    });
    console.log(`${r.jogadaValida ? 'ACEITA' : 'RECUSADA'}: ${r.mensagemRetorno}`);
    await mostrar(slot);
  } else {
    console.log('comandos: entrar <nome> <slot> | estado <slot> | jogar <slot> <origem> <destino> [promocao]');
  }
}

main().catch(e => {
  console.error('ERRO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
