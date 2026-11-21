/**
 * PONTE gRPC-Web -> gRPC (alternativa ao Envoy, sem Docker).
 *
 * O navegador não consegue falar gRPC nativo com o servidor Java. Esta ponte recebe as chamadas
 * gRPC-Web do front na porta 8080 e repassa cada uma, sem mudar nada, como gRPC nativo (HTTP/2)
 * para o servidor Java na porta 50040. A resposta (ou o erro, com o mesmo status) volta igual.
 *
 * Ela NÃO tem regra de jogo nem guarda estado: é só o "tradutor" que o Envoy faria.
 * Não é o backend do trabalho.
 *
 *   npm run ponte                                              # 8080 -> http://127.0.0.1:50040
 *   npm run ponte -- --servidor=http://192.168.0.20:50040      # servidor Java em outra máquina
 *   npm run ponte -- --porta=8081                              # outra porta para o navegador
 *
 * Não rode junto com o Envoy (npm run proxy) nem com o servidor de teste: os três usam a porta 8080.
 */
import http from 'node:http';
import { type ConnectRouter, type HandlerContext, Code, ConnectError, cors, createClient } from '@connectrpc/connect';
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node';
import { XadrezService } from '../../src/app/gen/xadrez_pb';

/** Lê `--nome=valor` da linha de comando (funciona igual no Windows, Mac e Linux). */
const arg = (nome: string) => process.argv.find(a => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const PORTA = Number(arg('porta') ?? 8080);
const SERVIDOR = arg('servidor') ?? 'http://127.0.0.1:50040';

/** Cliente gRPC nativo (HTTP/2, sem TLS) apontando para o servidor Java. */
const java = createClient(XadrezService, createGrpcTransport({ baseUrl: SERVIDOR }));

/** Repassa o prazo e o cancelamento do navegador para a chamada ao Java, e registra no terminal. */
async function repassar<T>(nome: string, ctx: HandlerContext, chamada: (opcoes: { signal: AbortSignal; timeoutMs?: number }) => Promise<T>): Promise<T> {
  const inicio = Date.now();
  try {
    const res = await chamada({ signal: ctx.signal, timeoutMs: ctx.timeoutMs() });
    console.log(`  ${nome} ✓ (${Date.now() - inicio} ms)`);
    return res;
  } catch (e) {
    const err = ConnectError.from(e);
    console.log(`  ${nome} ✗ ${Code[err.code]}: ${err.rawMessage}`);
    throw err;   // mesmo status e mesma mensagem do servidor Java
  }
}

function rotas(router: ConnectRouter): void {
  router.service(XadrezService, {
    conectarJogador: (req, ctx) => repassar('ConectarJogador', ctx, o => java.conectarJogador(req, o)),
    enviarJogada: (req, ctx) => repassar('EnviarJogada', ctx, o => java.enviarJogada(req, o)),
    obterEstadoDoJogo: (req, ctx) => repassar('ObterEstadoDoJogo', ctx, o => java.obterEstadoDoJogo(req, o)),
  });
}

const atender = connectNodeAdapter({ routes: rotas });

http.createServer((req, res) => {
  // CORS: a página vem de http://<host>:4200 e chama a porta 8080
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', cors.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', cors.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', '7200');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  atender(req, res);
}).listen(PORTA, () => {
  console.log(`PONTE gRPC-Web -> gRPC: navegador em http://localhost:${PORTA} -> servidor Java em ${SERVIDOR}`);
  console.log('Deixe esta janela aberta. Ctrl+C para parar.');
});
