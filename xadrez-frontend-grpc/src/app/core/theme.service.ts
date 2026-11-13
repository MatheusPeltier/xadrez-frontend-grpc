import { Injectable, effect, signal } from '@angular/core';

export const THEMES = [
  { id: 'castelo', label: 'Castelo ⚜' }, { id: 'classico', label: 'Clássico' },
  { id: 'madeira', label: 'Madeira' }, { id: 'oceano', label: 'Oceano' },
  { id: 'neon', label: 'Neon' }, { id: 'marmore', label: 'Mármore' },
  { id: 'pergaminho', label: 'Pergaminho' }, { id: 'minimal', label: 'Minimal' },
];

const KEY = 'xadrez.tema';

/** Tema visual: grava `data-style` no <body>; o CSS global (styles.css) faz o resto. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;
  readonly theme = signal(load());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.body.dataset['style'] = t;
      try { localStorage.setItem(KEY, t); } catch { /* sem armazenamento: só não lembra o tema */ }
    });
  }
}

function load(): string {
  try {
    const t = localStorage.getItem(KEY);
    if (t && THEMES.some(x => x.id === t)) return t;
  } catch { /* ignora */ }
  return 'castelo';
}
