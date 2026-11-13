import { Code, ConnectError } from '@connectrpc/connect';

/**
 * Traduz qualquer falha de chamada gRPC em um texto para mostrar ao jogador.
 * Toda falha chega como ConnectError: `code` é o status gRPC e `rawMessage` o texto do servidor.
 */
export function mensagemDeErro(e: unknown): string {
  const err = ConnectError.from(e);
  // o navegador nem chegou no servidor (Envoy parado, endereço errado, CORS bloqueado)
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(err.rawMessage)) {
    return 'Não deu para falar com o servidor. Confira se o Envoy está no ar (porta 8080) e o endereço.';
  }
  switch (err.code) {
    case Code.InvalidArgument:    return err.rawMessage;                           // ex.: nome inválido
    case Code.FailedPrecondition: return err.rawMessage || 'A partida já tem 2 jogadores.';
    case Code.NotFound:           return err.rawMessage || 'Partida não encontrada no servidor.';
    case Code.PermissionDenied:   return err.rawMessage || 'O servidor não reconheceu este jogador.';
    case Code.Unimplemented:      return 'O servidor ainda não tem esse método.';
    case Code.DeadlineExceeded:   return 'O servidor não respondeu a tempo.';
    case Code.Unavailable:        return 'Servidor fora do ar (o Envoy respondeu, mas não alcançou o servidor Java).';
    default:                      return err.rawMessage || 'Erro inesperado ao falar com o servidor.';
  }
}

/** Nome do status gRPC (ex.: "UNIMPLEMENTED"), para o painel de chamadas. */
export function nomeDoCodigo(e: unknown): string {
  return Code[ConnectError.from(e).code].replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}
