/**
 * Configuração da conexão com o servidor.
 *
 * O navegador NÃO fala com o servidor Java direto (porta 50040): ele fala gRPC-Web com um
 * proxy na porta 8080 (a ponte em Node, `npm run ponte`, ou o Envoy, `npm run proxy`), e o
 * proxy repassa como gRPC nativo. Por isso o endereço aqui é sempre o do proxy.
 */
export const PORTA_ENVOY = 8080;

/**
 * Endereço padrão do proxy: a mesma máquina que serviu a página.
 * - Abrindo http://localhost:4200      -> http://localhost:8080
 * - Abrindo http://192.168.0.10:4200   -> http://192.168.0.10:8080 (teste em duas máquinas)
 * Dá para trocar na tela de entrada, em "Endereço do servidor".
 */
export function urlPadraoDoServidor(): string {
  const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
  return `http://${host}:${PORTA_ENVOY}`;
}

/** Tempo máximo de espera por resposta. Sem isso, uma chamada que o servidor não responde fica aberta para sempre. */
export const TIMEOUT_CONECTAR_MS = 5000;
export const TIMEOUT_JOGADA_MS = 5000;
export const TIMEOUT_ESTADO_MS = 3000;

/** O servidor não avisa nada sozinho (não há streaming): o front consulta o estado neste intervalo. */
export const INTERVALO_POLLING_MS = 1000;
/** Depois de um erro na consulta, espera isto antes de tentar de novo. */
export const ESPERA_APOS_ERRO_MS = 2000;

/**
 * Modo online: o front só oferece os lances que o servidor Java aceita hoje (sem roque, sem
 * en passant e sem deixar o próprio rei em xeque) e reconhece sozinho o xeque-mate, que o
 * servidor ainda não encerra. Mude para false se o servidor passar a aceitar regras livres.
 */
export const SEGUIR_REGRAS_DO_SERVIDOR = true;
