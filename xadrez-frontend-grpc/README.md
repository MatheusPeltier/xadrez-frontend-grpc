# Xadrez – Frontend Angular com gRPC-Web

Frontend do xadrez multiplayer (Angular 21 + TypeScript), feito a partir da demo e pronto para falar com o
servidor Java [`xadrezServerRpc`](https://github.com/joaoMarcosDeFreitas/xadrezServerRpc) via **gRPC-Web**.

- **Online:** entra na partida (`ConectarJogador`), consulta o estado a cada segundo (`ObterEstadoDoJogo`) e envia
  os lances (`EnviarJogada`). O servidor é quem valida; o tabuleiro só muda quando o estado dele chega.
- **Local:** o jogo da demo, sem servidor: regras livres, IA com 3 níveis, desfazer, animações, bandejas e 8 temas.

**Sumário:** [Rodar](#rodar) · [Comandos](#comandos) · [O que funciona hoje](#o-que-funciona-hoje-com-o-servidor-java) ·
[A combinar com o João](#a-combinar-com-o-joão) · [Quando o `.proto` mudar](#quando-o-proto-mudar) ·
[Estrutura](#estrutura) · [Testes](#testes) · [Problemas comuns](#problemas-comuns)

## Rodar

Requisitos: Node 20.19+, 22.12+ ou 24+. Docker só se for usar o Envoy (a ponte em Node não precisa).

```bash
npm install     # se der erro de dependências: npm install --legacy-peer-deps
npm start       # http://localhost:4200
```

Na tela de entrada dá para **jogar local** direto. Para o modo online, escolha um dos dois caminhos:

### A. Com o servidor Java (o backend de verdade)

```
navegador :4200 ──gRPC-Web──▶ ponte ou Envoy :8080 ──gRPC──▶ servidor Java :50040
```

1. **Servidor:** rode a classe `Main` do `xadrezServerRpc` pela IDE. Ele imprime "Servidor rodando na porta 50040".
2. **Proxy:** `npm run ponte`, numa janela de terminal separada. É uma ponte em Node, sem Docker
   (`tools/ponte/ponte.ts`). Alternativa: `npm run proxy`, que sobe o Envoy no Docker (precisa do Docker aberto;
   a configuração está em `infra/envoy.yaml`).
3. **Front:** `npm start` e abra `http://localhost:4200` em **duas abas**, uma por jogador.

O navegador não consegue chamar o servidor Java direto, por isso a ponte (ou o Envoy) fica no meio. Nada muda no Java.

Ponte, Envoy e servidor de teste usam a mesma porta 8080: **rode só um por vez**.

**Em duas máquinas:** rode `npx ng serve --host 0.0.0.0`, abra `http://<IP>:4200` na outra máquina e libere as
portas 4200, 8080 e 50040 no firewall. O front já aponta para `http://<mesmo IP>:8080`; se o proxy estiver em outra
máquina, troque em "Endereço do servidor" na tela de entrada. Se o Java estiver em outra máquina que a ponte, use
`npm run ponte -- --servidor=http://<IP do Java>:50040`.

### B. Com o servidor de teste (para desenvolver o front sem o Java)

```bash
npm run servidor-teste              # regras livres
npm run servidor-teste -- --estrito # recusa lance que deixa o próprio rei em xeque
```

Ele ocupa a porta 8080 no lugar da ponte ou do Envoy, então não rode os dois juntos. Abra duas abas e entre com nomes
diferentes. Para uma partida nova, pare com Ctrl+C e rode de novo.

> **O servidor de teste não é o backend do trabalho.** É um dublê em Node (`tools/servidor-teste/`) que imita o
> contrato para o front poder ser testado. Como o enunciado proíbe IA no backend, não entregue essa pasta como
> servidor: ela pode ser apagada sem afetar o front.
>
> **A ponte também não é o backend do trabalho.** Ela não tem regra de jogo nem guarda estado: só repassa as
> chamadas, como o Envoy. O `envoy.yaml` e a ponte são infraestrutura; vale confirmar com o professor se eles
> contam como backend.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Servidor de desenvolvimento em `http://localhost:4200`, recarrega ao salvar |
| `npm run build` | Build de produção em `dist/` |
| `npm run watch` | Build de desenvolvimento refeito a cada mudança |
| `npm test -- --watch=false` | Roda os testes uma vez (Vitest) |
| `npm run ponte` | Ponte gRPC-Web → gRPC em Node, sem Docker (porta 8080 → 50040) |
| `npm run proxy` | Sobe o Envoy no Docker (porta 8080 → 50040) |
| `npm run servidor-teste` | Dublê do servidor na porta 8080 (`-- --estrito` para recusar lance que deixa o rei em xeque) |
| `npm run gen` | Recria `src/app/gen/xadrez_pb.ts` a partir de `proto/xadrez.proto` |

## O que funciona hoje com o servidor Java

Testado com a branch `desenvolvimento` (commit `ea22a65`, de 19 nov. 2026). **Os 3 métodos funcionam.**

| Chamada | No front |
|---|---|
| `ConectarJogador` | Entra, mostra nome e cor, reconecta com F5; nome inválido e jogo cheio mostram o texto do servidor |
| `ObterEstadoDoJogo` | Lê o formato `casa,TIPO,COR` (ex.: `a1,TORRE,BRANCAS;b1,CAVALO,BRANCAS;...`) e atualiza o tabuleiro |
| `EnviarJogada` | Manda origem e destino; lance recusado mostra o texto do servidor |

- **Regras no modo online:** o front só oferece os lances que o servidor aceita: sem roque, sem en passant e sem
  deixar o próprio rei em xeque. O modo local continua com regras livres.
- **Fim de jogo:** o servidor ainda não marca `CONCLUIDA` no xeque-mate, então o front reconhece sozinho que não há
  lance válido e mostra o fim da partida (xeque-mate ou afogamento).
- **Promoção:** o servidor mantém o peão como peão ao chegar na última fileira.

## A combinar com o João

1. **Formato de `posicaoPecas`.** Definido pelo servidor (`Tabuleiro.getPecasTabuleiro`): só as casas ocupadas,
   como `casa,TIPO,COR` separadas por `;`, de a1 a h8, e texto vazio antes do 2º jogador. Se mudar, o único arquivo
   a ajustar é `src/app/grpc/formato-estado.ts` (e os exemplos de `formato-estado.spec.ts`). `turnoAtual` e
   `estadoJogo` são lidos com os nomes dos enums do servidor (`BRANCAS`/`PRETAS`/`NENHUM`,
   `AGUARDANDO`/`EM_ANDAMENTO`/`CONCLUIDA`).
2. **Regras livres x regras do servidor.** Online, o front segue as regras que o servidor aceita hoje (sem roque,
   sem en passant, sem deixar o rei em xeque). Isso é controlado por `SEGUIR_REGRAS_DO_SERVIDOR` em
   `src/app/grpc/grpc.config.ts`: se o servidor passar a aceitar regras livres, mude para `false`.
3. **Promoção (8.1) e resultado da partida (7.5).** Vão virar campos novos no `.proto`. Hoje o front manda só
   origem e destino, e deduz o vencedor pelo tabuleiro (`resultadoFinal` em `partida-online.service.ts`).
4. **Nome do adversário.** O `.proto` não devolve, então aparece "Adversário".

## Quando o `.proto` mudar

```bash
# copie src/main/proto/xadrez.proto do servidor para proto/xadrez.proto e rode:
npm run gen     # recria src/app/gen/xadrez_pb.ts (nunca edite esse arquivo à mão)
```

## Estrutura

```
proto/xadrez.proto               cópia idêntica do contrato do servidor
buf.gen.yaml                     configuração do gerador de TypeScript
infra/envoy.yaml                 proxy gRPC-Web (porta 8080 -> 50040)
infra/docker-compose.yml         sobe o Envoy
tools/ponte/                     ponte gRPC-Web -> gRPC sem Docker (alternativa ao Envoy)
tools/servidor-teste/            dublê do servidor para testes (opcional)
src/styles.css                   visual do jogo e os 8 temas
src/app/
├── gen/xadrez_pb.ts             código gerado do .proto
├── grpc/
│   ├── grpc.config.ts           endereço do proxy, timeouts, polling e regras do servidor
│   ├── xadrez-grpc.service.ts   cliente Connect-ES: conectar, enviarJogada, obterEstado
│   ├── grpc-erros.ts            status gRPC -> mensagem para o jogador
│   ├── formato-estado.ts        textos do servidor <-> tabuleiro (formato casa,TIPO,COR)
│   └── partida-online.service.ts  sessão, polling, envio de lances e fim de jogo
├── core/
│   ├── chess-engine.ts          regras, geração de lances e comparação de posições
│   ├── chess-ai.ts              IA do modo local (minimax com poda alfa-beta)
│   ├── game.service.ts          estado do tabuleiro (signals), modo local e sincronização com o servidor
│   └── theme.service.ts         tema visual
├── shared/                      tabuleiro com animações, bandejas e diálogos
└── pages/
    ├── entrada/                 nome do jogador, endereço do servidor, conectar
    └── jogo/                    tabuleiro, painel lateral e estado da conexão
```

### Como o modo online funciona

- **Sessão por aba:** `idJogador`, `idPartida`, nome e cor ficam no `sessionStorage`. Duas abas são dois jogadores;
  F5 reconecta o mesmo. "Sair da partida" volta à tela de entrada sem esquecer o jogador (o servidor também guarda
  a vaga dele), então dá para reconectar; "Entrar como outro jogador" é que apaga a sessão da aba.
- **Polling:** `ObterEstadoDoJogo` a cada 1 s. Em caso de erro, o front avisa, espera 2 s e tenta de novo.
- **Lance do adversário:** o servidor só manda a posição final. O front compara com a posição local, descobre qual
  lance foi (`findMoveBetween`) e o aplica com animação, histórico e bandeja. Se a diferença for maior que um lance
  (F5 no meio da partida, por exemplo), carrega a posição inteira.
- **Meu lance:** o clique vira texto (`e2`, `e4`) e vai em `EnviarJogada` com timeout de 5 s. O tabuleiro só muda
  quando o servidor confirma e devolve a nova posição.
- **Quem joga de pretas** vê o tabuleiro girado.

## Testes

```bash
npm test -- --watch=false   # formato do estado e motor de xadrez
```

## Problemas comuns

- **"Não deu para falar com o servidor"**: nem a ponte, nem o Envoy, nem o servidor de teste está na porta 8080, ou
  o endereço está errado.
- **"Servidor fora do ar"**: o proxy (ponte ou Envoy) está no ar, mas o servidor Java não está rodando na 50040.
- **"Jogo está cheio"**: o servidor guarda uma única partida em memória. Para outra, reinicie o servidor.
- **Erro de módulo opcional no `npm install`** (rollup, esbuild ou buf): apague `node_modules` e
  `package-lock.json` e instale de novo.
- **Porta 50040 diferente:** se mudar no `Main`, rode a ponte com `-- --servidor=http://127.0.0.1:<porta>` (ou
  mude o `port_value` em `infra/envoy.yaml`, se usar o Envoy).
