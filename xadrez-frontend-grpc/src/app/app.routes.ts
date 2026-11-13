import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Xadrez – Entrar',
    loadComponent: () => import('./pages/entrada/entrada.page').then(m => m.EntradaPage),
  },
  {
    path: 'jogo',
    title: 'Xadrez – Partida',
    loadComponent: () => import('./pages/jogo/jogo.page').then(m => m.JogoPage),
  },
  { path: '**', redirectTo: '' },
];
