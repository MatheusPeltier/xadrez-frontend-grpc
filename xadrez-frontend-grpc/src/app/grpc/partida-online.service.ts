import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, exhaustMap, from, retry, timer } from 'rxjs';
import {
  Color, Move, findKing, hasLegalMove, inCheck, other, squareName,
} from '../core/chess-engine';
import { GameOver, GameService } from '../core/game.service';
import { EstadoResponse } from '../gen/xadrez_pb';
import { escreverCor, lerCor, lerEstadoPartida, lerPosicaoPecas } from './formato-estado';
import { ESPERA_APOS_ERRO_MS, INTERVALO_POLLING_MS } from './grpc.config';
import { mensagemDeErro, nomeDoCodigo } from './grpc-erros';
import { XadrezGrpcService } from './xadrez-grpc.service';

export type FaseOnline = 'desconectado' | 'conectando' | 'aguardando' | 'jogando' | 'concluida';

export interface Sessao { idJogador: string; idPartida: string; nome: string; cor: Color }

/**
 * A sessão fica no sessionStorage, que é POR ABA: duas abas = dois jogadores, e F5 reconecta
 * o mesmo jogador. Com localStorage a segunda aba mandaria o id da primeira e o servidor
 * trataria como reconexão.
 */
const CHAVE = { id: 'idJogador', partida: 'idPartida', nome: 'nomeJogador', cor: 'corPecas' };

/**
 * Partida online: entra (ConectarJogador), consulta o estado a cada segundo (ObterEstadoDoJogo)
 * e envia os lances (EnviarJogada). O tabuleiro em si continua no GameService; este serviço só
 * decide quando ele muda.
 */
@Injectable({ providedIn: 'root' })
export class PartidaOnlineService {
  private readonly grpc = inject(XadrezGrpcService);
  private readonly game = inject(GameService);

  readonly sessao = signal<Sessao | null>(null);
  readonly fase = signal<FaseOnline>('desconectado');
  /** Erro da última tentativa de conexão (tela de entrada). */
  readonly erro = signal<string | null>(null);
  /** Motivo de o último lance não ter valido (recusado pelo servidor ou chamada falhou). */
  readonly lanceRecusado = signal<string | null>(null);
  /** Problema na consulta do estado (ex.: método ainda não implementado no servidor). */
  readonly avisoServidor = signal<string | null>(null);
  readonly enviando = signal(false);
  /** Já chegou alguma resposta de ObterEstadoDoJogo nesta sessão? Antes disso a fase é só um palpite. */
  readonly temEstado = signal(false);

  readonly minhaVez = computed(() => this.fase() === 'jogando' && this.game.turn() === this.sessao()?.cor);

  /** A tela de entrada já apareceu nesta carga da página? Se não, abrir /jogo foi um F5: reconecta sozinho. */
  passouPelaEntrada = false;

  private polling?: Subscription;
  private seq = 0;             // numera as consultas: resposta atrasada não passa por cima de uma mais nova
  private seqAplicada = 0;
  private ultimoResumo = '';

  /** Sessão guardada nesta aba (existe depois de um F5), ou null. */
  sessaoSalva(): { idJogador: string; nome: string } | null {
    try {
      const idJogador = sessionStorage.getItem(CHAVE.id), nome = sessionStorage.getItem(CHAVE.nome);
      return idJogador && nome ? { idJogador, nome } : null;
    } catch { return null; }
  }

  /** Apaga a sessão desta aba: a próxima conexão entra como um jogador novo. */
  esquecerSessao(): void {
    try { for (const k of Object.values(CHAVE)) sessionStorage.removeItem(k); } catch { /* sem armazenamento */ }
  }

  /**
   * ConectarJogador. Manda o id salvo (vazio na 1ª vez): se o servidor reconhecer, é reconexão
   * e ele devolve o nome e a cor que já estavam registrados.
   */
  async conectar(nome: string): Promise<boolean> {
    this.pararPolling();
    this.erro.set(null);
    this.fase.set('conectando');
    const salvo = this.sessaoSalva();
    try {
      const res = await this.grpc.conectar(nome.trim(), salvo?.idJogador ?? '');
      const cor = lerCor(res.corPecas);
      if (!cor) throw new Error(`O servidor devolveu uma cor que o front não conhece: "${res.corPecas}".`);

      const sessao: Sessao = { idJogador: res.idJogador, idPartida: res.idPartida, nome: res.nomeJogador, cor };
      this.salvar(sessao, res.corPecas);
      this.sessao.set(sessao);
      this.lanceRecusado.set(null); this.avisoServidor.set(null); this.temEstado.set(false); this.ultimoResumo = '';

      const nomes: Record<Color, string> = { w: 'Adversário', b: 'Adversário' };
      nomes[cor] = sessao.nome;
      this.game.enterOnline(
        { myColor: cor, canMove: () => this.minhaVez() && !this.enviando(), submit: m => void this.enviar(m) },
        nomes,
      );
      this.game.addLog(`ConectarJogador("${nome.trim()}") ✓ ${sessao.nome} joga de ${res.corPecas}`);
      this.fase.set('aguardando');
      this.iniciarPolling();
      return true;
    } catch (e) {
      this.erro.set(mensagemDeErro(e));
      this.fase.set('desconectado');
      return false;
    }
  }

  /**
   * Sai da tela da partida e volta ao modo local. A aba continua lembrando o jogador (o servidor
   * também guarda a vaga dele), então dá para reconectar; `esquecerSessao` é que apaga de vez.
   */
  sair(): void {
    this.pararPolling();
    this.sessao.set(null);
    this.fase.set('desconectado');
    this.erro.set(null); this.lanceRecusado.set(null); this.avisoServidor.set(null);
    this.game.leaveOnline();
  }

  /** EnviarJogada. O tabuleiro não muda aqui: muda quando o servidor devolver a nova posição. */
  private async enviar(m: Move): Promise<void> {
    const s = this.sessao();
    if (!s || this.enviando()) return;
    const origem = squareName(m.fr, m.fc), destino = squareName(m.tr, m.tc);
    this.enviando.set(true);
    this.lanceRecusado.set(null);
    try {
      const res = await this.grpc.enviarJogada(s.idJogador, s.idPartida, origem, destino);
      if (res.jogadaValida) {
        this.game.addLog(`EnviarJogada(${origem}→${destino}) ✓ ${res.mensagemRetorno}`.trim());
        await this.consultarEstado().catch(() => { /* o polling tenta de novo e mostra o erro */ });
      } else {
        const motivo = res.mensagemRetorno || 'O servidor recusou a jogada.';
        this.lanceRecusado.set(motivo);
        this.game.addLog(`EnviarJogada(${origem}→${destino}) ✗ ${motivo}`);
      }
    } catch (e) {
      this.lanceRecusado.set(mensagemDeErro(e));
      this.game.addLog(`EnviarJogada(${origem}→${destino}) ✗ ${nomeDoCodigo(e)}: ${mensagemDeErro(e)}`);
    } finally {
      this.enviando.set(false);
      this.game.selected.set(null);
    }
  }

  // ---------- polling de ObterEstadoDoJogo ----------
  private iniciarPolling(): void {
    this.pararPolling();
    this.polling = timer(0, INTERVALO_POLLING_MS).pipe(
      // exhaustMap: enquanto uma consulta não volta, não dispara outra por cima
      exhaustMap(() => from(this.consultarEstado())),
      // erro (ex.: UNIMPLEMENTED, servidor fora do ar): avisa, espera e tenta de novo
      retry({ delay: e => { this.registrarErroDeConsulta(e); return timer(ESPERA_APOS_ERRO_MS); } }),
    ).subscribe();
  }

  private pararPolling(): void {
    this.polling?.unsubscribe();
    this.polling = undefined;
  }

  private async consultarEstado(): Promise<void> {
    const s = this.sessao();
    if (!s) return;
    const n = ++this.seq;
    const res = await this.grpc.obterEstado(s.idPartida);
    if (n < this.seqAplicada || this.sessao() !== s) return;      // chegou atrasada ou a sessão mudou
    this.seqAplicada = n;
    this.temEstado.set(true);
    this.aplicarEstado(res);
  }

  private aplicarEstado(res: EstadoResponse): void {
    const estado = lerEstadoPartida(res.estadoJogo), turno = lerCor(res.turnoAtual);
    let aviso: string | null = null;

    if (res.posicaoPecas.trim()) {
      const board = lerPosicaoPecas(res.posicaoPecas);
      if (board) this.game.syncFromServer(board, turno);
      else aviso = `O servidor respondeu, mas "posicaoPecas" veio num formato que o front ainda não lê ` +
                   `("${abreviar(res.posicaoPecas)}"). Ajuste src/app/grpc/formato-estado.ts.`;
    } else {
      this.game.syncTurn(turno);                                   // sem peças no texto: mantém o tabuleiro
    }
    if (!estado) aviso ??= `"estadoJogo" veio com um valor desconhecido: "${abreviar(res.estadoJogo)}".`;
    this.avisoServidor.set(aviso);

    const resumo = `${res.estadoJogo}|${res.turnoAtual}|${res.posicaoPecas}`;
    if (resumo !== this.ultimoResumo) {
      this.ultimoResumo = resumo;
      this.lanceRecusado.set(null);
      this.game.addLog(`ObterEstadoDoJogo → ${res.estadoJogo || '?'} · vez: ${res.turnoAtual || '?'}`);
    }

    if (estado === 'AGUARDANDO') this.fase.set('aguardando');
    else if (estado === 'EM_ANDAMENTO') this.fase.set('jogando');
    else if (estado === 'CONCLUIDA' && this.fase() !== 'concluida') {
      this.fase.set('concluida');
      this.game.setOver(this.resultadoFinal());
      this.pararPolling();                                         // estado final: não muda mais
    }
  }

  /**
   * O .proto ainda não traz o resultado da partida (Etapa 7.5 do servidor), então o front
   * deduz pelo tabuleiro. Quando o campo novo existir, basta ler dele aqui.
   */
  private resultadoFinal(): GameOver {
    const S = this.game.state();
    for (const cor of ['w', 'b'] as Color[]) {
      if (!findKing(S, cor)) return { winner: other(cor), reason: 'Rei capturado' };
    }
    if (!hasLegalMove(S, S.turn)) {
      return inCheck(S, S.turn)
        ? { winner: other(S.turn), reason: 'Xeque-mate' }
        : { winner: null, reason: 'Afogamento' };
    }
    return {
      winner: null, title: 'Partida concluída',
      reason: 'O servidor encerrou a partida. O resultado ainda não vem no .proto.',
    };
  }

  private registrarErroDeConsulta(e: unknown): void {
    const texto = `ObterEstadoDoJogo: ${mensagemDeErro(e)}`;
    if (this.avisoServidor() !== texto) {
      this.game.addLog(`ObterEstadoDoJogo ✗ ${nomeDoCodigo(e)}: ${mensagemDeErro(e)}`);
    }
    this.avisoServidor.set(texto);
  }

  private salvar(s: Sessao, corTexto: string): void {
    try {
      sessionStorage.setItem(CHAVE.id, s.idJogador);
      sessionStorage.setItem(CHAVE.partida, s.idPartida);
      sessionStorage.setItem(CHAVE.nome, s.nome);
      sessionStorage.setItem(CHAVE.cor, corTexto || escreverCor(s.cor));
    } catch { /* sem armazenamento: funciona, mas F5 vira um jogador novo */ }
  }
}

function abreviar(texto: string): string {
  return texto.length > 40 ? texto.slice(0, 40) + '…' : texto;
}
