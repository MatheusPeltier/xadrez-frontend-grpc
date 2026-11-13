# xadrez-frontend-grpc

Frontend em Angular 21 + TypeScript do xadrez multiplayer. Ele conversa via **gRPC-Web** (por um proxy Envoy) com o
servidor Java [`xadrezServerRpc`](https://github.com/joaoMarcosDeFreitas/xadrezServerRpc) e também tem um modo
local, sem servidor, com IA.

O projeto fica na pasta [`xadrez-frontend-grpc/`](xadrez-frontend-grpc/). Instruções completas de instalação,
execução, arquitetura e testes: **[xadrez-frontend-grpc/README.md](xadrez-frontend-grpc/README.md)**.

Início rápido:

```bash
cd xadrez-frontend-grpc
npm install
npm start       # http://localhost:4200
```
