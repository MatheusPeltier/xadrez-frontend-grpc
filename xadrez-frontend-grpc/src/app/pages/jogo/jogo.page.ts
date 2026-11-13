import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AI_LEVELS, AiLevel } from '../../core/chess-ai';
import { GameService } from '../../core/game.service';
import { ThemeService } from '../../core/theme.service';
import { PartidaOnlineService } from '../../grpc/partida-online.service';
import { XadrezGrpcService } from '../../grpc/xadrez-grpc.service';
import { BoardComponent } from '../../shared/board';
import { CapturedTrayComponent } from '../../shared/captured-tray';
import { GameDialogsComponent } from '../../shared/game-dialogs';

/** Tela de jogo: tabuleiro, painel lateral e, no modo online, o estado da conexão. */
@Component({
  selector: 'app-jogo-page',
  imports: [RouterLink, BoardComponent, CapturedTrayComponent, GameDialogsComponent],
  templateUrl: './jogo.page.html',
})
export class JogoPage {
  protected readonly game = inject(GameService);
  protected readonly online = inject(PartidaOnlineService);
  protected readonly grpc = inject(XadrezGrpcService);
  protected readonly themes = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly levels = AI_LEVELS;

  protected readonly isOnline = computed(() => this.game.mode() === 'online');

  /** Texto de status: no modo online depende também da fase da conexão. */
  protected readonly status = computed(() => {
    if (!this.isOnline() || this.game.over()) return this.game.status();
    if (!this.online.temEstado()) return 'Conectado. Esperando o servidor informar o estado da partida…';
    const cor = this.game.turn() === 'w' ? '(brancas)' : '(pretas)';
    switch (this.online.fase()) {
      case 'aguardando': return 'Aguardando o adversário entrar…';
      case 'jogando':
        if (this.online.enviando()) return 'Enviando a jogada ao servidor…';
        return this.online.minhaVez() ? `Sua vez ${cor}` : `Vez do adversário ${cor}`;
      default: return this.game.status();
    }
  });

  protected readonly faseTexto = computed(() => {
    if (!this.online.temEstado()) return 'Sem informação do servidor ainda';
    switch (this.online.fase()) {
      case 'aguardando': return 'Aguardando adversário';
      case 'jogando': return 'Em andamento';
      case 'concluida': return 'Concluída';
      default: return 'Conectando';
    }
  });

  constructor() {
    // F5 na tela de jogo: o estado em memória some, mas a aba ainda guarda o id do jogador.
    if (!this.isOnline() && !this.online.passouPelaEntrada && this.online.sessaoSalva()) void this.reconectar();
  }

  private async reconectar(): Promise<void> {
    const salva = this.online.sessaoSalva();
    if (salva && !(await this.online.conectar(salva.nome))) void this.router.navigateByUrl('/');
  }

  protected sair(): void {
    this.online.sair();
    void this.router.navigateByUrl('/');
  }

  protected onAi(e: Event): void {
    this.game.setVsAi((e.target as HTMLInputElement).checked);
  }

  protected onLevel(e: Event): void {
    this.game.setAiLevel((e.target as HTMLSelectElement).value as AiLevel);
  }
}
