import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../../core/theme.service';
import { PORTA_ENVOY } from '../../grpc/grpc.config';
import { PartidaOnlineService } from '../../grpc/partida-online.service';
import { XadrezGrpcService } from '../../grpc/xadrez-grpc.service';

/** Tela de entrada: nome do jogador + ConectarJogador, ou jogar localmente sem servidor. */
@Component({
  selector: 'app-entrada-page',
  templateUrl: './entrada.page.html',
})
export class EntradaPage {
  protected readonly online = inject(PartidaOnlineService);
  protected readonly grpc = inject(XadrezGrpcService);
  protected readonly themes = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly portaEnvoy = PORTA_ENVOY;

  /** Sessão desta aba (sobra depois de um F5 ou de fechar a tela de jogo sem sair). */
  protected readonly salva = signal(this.online.sessaoSalva());
  protected readonly nome = signal(this.salva()?.nome ?? '');
  protected readonly url = signal(this.grpc.url());

  /** Mesma regra do servidor: 3 a 15 caracteres, sem contar espaços nas pontas. */
  protected readonly nomeValido = computed(() => {
    const n = this.nome().trim().length;
    return n >= 3 && n <= 15;
  });
  protected readonly conectando = computed(() => this.online.fase() === 'conectando');

  constructor() {
    this.online.passouPelaEntrada = true;
  }

  protected async conectar(): Promise<void> {
    if (this.conectando() || (!this.salva() && !this.nomeValido())) return;
    this.grpc.definirUrl(this.url());
    this.url.set(this.grpc.url());
    if (await this.online.conectar(this.nome())) void this.router.navigateByUrl('/jogo');
  }

  /** Esquece o id guardado nesta aba: a próxima conexão entra como um jogador novo. */
  protected trocarJogador(): void {
    this.online.esquecerSessao();
    this.salva.set(null);
    this.nome.set('');
    this.online.erro.set(null);
  }

  protected jogarLocal(): void {
    void this.router.navigateByUrl('/jogo');
  }

  protected texto(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
