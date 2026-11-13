import { Injectable, signal } from '@angular/core';
import { type Client, createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { XadrezService } from '../gen/xadrez_pb';
import {
  TIMEOUT_CONECTAR_MS, TIMEOUT_ESTADO_MS, TIMEOUT_JOGADA_MS, urlPadraoDoServidor,
} from './grpc.config';

const CHAVE_URL = 'xadrez.urlServidor';

/**
 * Cliente gRPC-Web do XadrezService: um método para cada procedimento remoto do xadrez.proto.
 * Só faz as chamadas; quem guarda a sessão e interpreta as respostas é o PartidaOnlineService.
 */
@Injectable({ providedIn: 'root' })
export class XadrezGrpcService {
  /** Endereço do Envoy em uso. */
  readonly url = signal(lerUrlSalva() ?? urlPadraoDoServidor());
  private client: Client<typeof XadrezService> = criarCliente(this.url());

  /** Troca o endereço do Envoy (ex.: 'http://192.168.0.10:8080'). Vazio volta ao padrão. */
  definirUrl(url: string): void {
    const limpa = url.trim().replace(/\/+$/, '') || urlPadraoDoServidor();
    this.url.set(limpa);
    this.client = criarCliente(limpa);
    try { localStorage.setItem(CHAVE_URL, limpa); } catch { /* armazenamento indisponível: segue sem lembrar */ }
  }

  /** ConectarJogador: `idJogador` vazio na 1ª vez; com o id salvo, o servidor trata como reconexão. */
  conectar(nomeJogador: string, idJogador = '') {
    return this.client.conectarJogador({ idJogador, nomeJogador }, { timeoutMs: TIMEOUT_CONECTAR_MS });
  }

  /** EnviarJogada: posições em texto, como "e2" e "e4". */
  enviarJogada(idJogador: string, idPartida: string, origem: string, destino: string) {
    return this.client.enviarJogada(
      { idJogador, idPartida, posicaoOrigem: origem, posicaoDestino: destino },
      { timeoutMs: TIMEOUT_JOGADA_MS },
    );
  }

  /** ObterEstadoDoJogo: peças, turno e estado da partida, tudo em texto. */
  obterEstado(idPartida: string) {
    return this.client.obterEstadoDoJogo({ idPartida }, { timeoutMs: TIMEOUT_ESTADO_MS });
  }
}

function criarCliente(baseUrl: string): Client<typeof XadrezService> {
  return createClient(XadrezService, createGrpcWebTransport({ baseUrl }));
}

function lerUrlSalva(): string | null {
  try { return localStorage.getItem(CHAVE_URL); } catch { return null; }
}
