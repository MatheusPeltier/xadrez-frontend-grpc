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

Requisitos: Node 20.19+, 22.12+ ou 24+. Docker só para falar com o servidor Java.

```bash
npm install     # se der erro de dependências: npm install --legacy-peer-deps
npm start       # http://localhost:4200
```

Na tela de entrada dá para **jogar local** direto. Para o modo online, escolha um dos dois caminhos:

### A. Com o servidor Java (o backend de verdade)

```
navegador :4200 ──gRPC-Web──▶ Envoy :8080 ──gRPC──▶ servidor Java :50040
```

1. **Servidor:** rode a classe `Main` do `xadrezServerRpc` pela IDE. Ele imprime "Servidor rodando na porta 50040".
2. **Proxy:** `npm run proxy` (precisa do Docker aberto). É o mesmo que
   `docker compose -f infra/docker-compose.yml up`; a configuração está em `infra/envoy.yaml`.
3. **Front:** `npm start` e abra `http://localhost:4200` em **duas abas**, uma por jogador.

O navegador não consegue chamar o servidor Java direto, por isso o Envoy fica no meio. Nada muda no Java.

**Em duas máquinas:** rode `npx ng serve --host 0.0.0.0`, abra `http://<IP>:4200` na outra máquina e libere as
portas 4200, 8080 e 50040 no firewall. O front já aponta para `http://<mesmo IP>:8080`; se o Envoy estiver em outra
máquina, troque em "Endereço do servidor" na tela de entrada.

### B. Com o servidor de teste (para desenvolver o front sem o Java)

```bash
npm run servidor-teste              # regras livres
npm run servidor-teste -- --estrito # recusa lance que deixa o próprio rei em xeque
```

Ele ocupa a porta 8080 no lugar do Envoy, então não rode os dois juntos. Abra duas abas e entre com nomes
diferentes. Para uma partida nova, pare com Ctrl+C e rode de novo.

> **O servidor de teste não é o backend do trabalho.** É um dublê em Node (`tools/servidor-teste/`) que imita o
> contrato para o front poder ser testado. Como o enunciado proíbe IA no backend, não entregue essa pasta como
> servidor: ela pode ser apagada sem afetar o front. O `envoy.yaml` é configuração de infraestrutura; vale
> confirmar com o professor se ele conta como backend.

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Servidor de desenvolvimento em `http://localhost:4200`, recarrega ao salvar |
| `npm run build` | Build de produção em `dist/` |
| `npm run watch` | Build de desenvolvimento refeito a cada mudança |
| `npm test -- --watch=false` | Roda os testes uma vez (Vitest) |
| `npm run proxy` | Sobe o Envoy no Docker (porta 8080 → 50040) |
| `npm run servidor-teste` | Dublê do servidor na porta 8080 (`-- --estrito` para recusar lance que deixa o rei em xeque) |
| `npm run gen` | Recria `src/app/gen/xadrez_pb.ts` a partir de `proto/xadrez.proto` |

## O que funciona hoje com o servidor Java

Testado com a branch `desenvolvimento` (commit `c2a84be`, de 4 nov. 2026):

| Chamada | No servidor | No front |
|---|---|---|
| `ConectarJogador` | Pronto | Entra, mostra nome e cor, reconecta com F5; nome inválido e jogo cheio mostram o texto do servidor |
| `ObterEstadoDoJogo` | Só no `.proto` (Etapa 4) | Aviso "O servidor ainda não tem esse método", tentando de novo a cada 2 s |
| `EnviarJogada` | Método vazio (Etapa 6) | "O servidor não respondeu a tempo" depois de 5 s |

Ou seja: **conectar já funciona de ponta a ponta; jogar depende das Etapas 4 e 6 do servidor.** Enquanto isso, o
fluxo completo (lances, capturas, recusa, fim de jogo, reconexão) roda com o servidor de teste.

## A combinar com o João

1. **Formato de `posicaoPecas`.** O servidor ainda não definiu (Etapas 2.2, 3.6 e 11.2). O front usa uma proposta
   provisória: o campo de peças do FEN, por exemplo `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR`. Se o formato
   for outro, o único arquivo a mudar é `src/app/grpc/formato-estado.ts` (e os exemplos de `formato-estado.spec.ts`).
   `turnoAtual` e `estadoJogo` são lidos com os nomes dos enums do servidor (`BRANCAS`/`PRETAS`,
   `AGUARDANDO`/`EM_ANDAMENTO`/`CONCLUIDA`).
2. **Regras livres x Etapa 7.1.** O front deixa tentar qualquer lance e mostra os alertas de xeque, mas online quem
   decide é o servidor. Se ele proibir deixar o rei em xeque, o lance volta como "Jogada não aceita".
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
tools/servidor-teste/            dublê do servidor para testes (opcional)
src/styles.css                   visual do jogo e os 8 temas
src/app/
├── gen/xadrez_pb.ts             código gerado do .proto
├── grpc/
│   ├── grpc.config.ts           endereço do Envoy, timeouts e intervalo do polling
│   ├── xadrez-grpc.service.ts   cliente Connect-ES: conectar, enviarJogada, obterEstado
│   ├── grpc-erros.ts            status gRPC -> mensagem para o jogador
│   ├── formato-estado.ts        textos do servidor <-> tabuleiro (o formato provisório mora aqui)
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

- **"Não deu para falar com o servidor"**: o Envoy (ou o servidor de teste) não está na porta 8080, ou o endereço
  está errado.
- **"Servidor fora do ar"**: o Envoy respondeu, mas não alcançou o Java na porta 50040.
- **"Jogo está cheio"**: o servidor guarda uma única partida em memória. Para outra, reinicie o servidor.
- **Erro de módulo opcional no `npm install`** (rollup, esbuild ou buf): apague `node_modules` e
  `package-lock.json` e instale de novo.
- **Porta 50040 diferente:** se mudar no `Main`, mude também o `port_value` em `infra/envoy.yaml`.
