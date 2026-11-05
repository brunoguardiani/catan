# Desenvolvimento e verificação local

## Rodar

```bash
npm install
npm run build
npm run dev:local
```

Abra `http://localhost:3000` e escolha **Modo de teste** para testar em uma janela com dois jogadores. Acesse também `http://localhost:3000/teste` diretamente. O painel permite alternar a visão entre A e B, adicionar ou retirar recursos, adicionar desenvolvimento e acionar roubo, troca, recusa premium, soco, dados, descarte e tomada dos títulos. Para testar a revelação de uma carta conquistada, visualize a mesa como o jogador que vai recebê-la antes de apertar o botão. O modo de teste fica disponível apenas no servidor local. Para jogar normalmente, crie uma sala e use de três a seis perfis de navegador diferentes. O servidor local expõe HTTP e WebSocket na porta 3000 e executa o Next internamente na porta 3001, ambas restritas a `127.0.0.1`. Depois de alterar o código, interrompa o servidor, rode `npm run build` e inicie `dev:local` outra vez.

Em um segundo terminal:

```bash
npm test
npm run typecheck
npm run smoke:local
npm run smoke:game
```

## Verificado em 3 de novembro de 2026

- `npm test`: 23 testes passaram, incluindo desempate do primeiro jogador, ordem horária a partir dos assentos da mesa, reinício autorizado pelo anfitrião, geometria, preparação, produção, ladrão, cartas, trocas atômicas, propostas iniciadas por B ou C antes de A, retirada da própria contraproposta, pontos secretos, sessão e WebSocket real.
- `npm run typecheck`: passou após o build. Não execute simultaneamente com `npm run build`, pois o Next recria `.next/types` durante a compilação.
- `npm run build`: compilou e gerou as rotas.
- `npm run smoke:local`: HTTP e dois clientes WebSocket sincronizaram sala, prontidão, chat e reação.
- `npm run smoke:game`: três clientes WebSocket iniciaram o jogo, colocaram seis assentamentos e seis estradas, lançaram dados e reiniciaram a partida com os mesmos assentos e mapa.
- `SMOKE_PLAYERS=5 npm run smoke:game` ou `SMOKE_PLAYERS=6 npm run smoke:game`: verifica a sala ampliada, a preparação, os dados e o reinício com cinco ou seis clientes. Em PowerShell, defina `$env:SMOKE_PLAYERS='6'` antes do comando.
- A nova disputa inicial por dados passou no teste de integração local, antes dos seis posicionamentos.
- O navegador integrado não disponibilizou uma sessão nesta execução; cliques, layout e uma partida completa na interface ainda precisam de inspeção visual.

O `dev:local` usa um pequeno preload para evitar uma falha de `os.userInfo()` do Node/tsx em alguns ambientes Windows isolados. Esse ajuste só define o nome do diretório temporário do tsx; não afeta as regras nem o endpoint de produção.

## Limites antes de publicar

Nenhum deploy foi realizado. A publicação será feita manualmente pelo usuário. O ambiente local mantém todos os jogadores em uma só instância e não representa o roteamento da Vercel. A RAM da Function não sobrevive a reinício ou troca de instância; chat, salas e partidas são temporários. É necessário testar após o deploy manual, em navegadores e dispositivos diferentes, se novos convidados e reconexões alcançam a mesma instância. [Contexto técnico](architecture.md).
