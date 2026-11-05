# Arquitetura

## Decisão da Fase 0

Uma aplicação Next.js com App Router oferece a interface e um único endpoint WebSocket em `/api/ws`. `RoomHub` mantém as salas em um `Map` na memória da instância da Function. Cada conexão envia comandos JSON validados por Zod. O servidor responde com snapshots públicos versionados. Tokens de sessão são guardados somente em hash no servidor e nunca entram em eventos públicos ou URLs.

Cada usuário gera UUID e token criptograficamente aleatório no navegador. O `localStorage` guarda a sessão por sete dias de inatividade; ao atualizar a página, o cliente tenta entrar novamente com a credencial. O servidor só recupera um assento se o token corresponder ao hash guardado naquela instância. Reações, chat e alterações de lobby são enviados às conexões que estão na mesma instância. O `RoomHub` processa comandos síncronos em sequência no event loop da instância.

## Limite da infraestrutura

A [documentação da Vercel](https://vercel.com/docs/functions/websockets) informa que uma conexão é fixada à Function que a aceitou, mas novas conexões podem chegar a outra instância. A memória das Functions não é compartilhada. Portanto, sem armazenamento ou coordenação externa, não há garantia de que o convidado encontre a sala ou que uma reconexão recupere a partida. O cliente trata a resposta `room:unavailable` como falha explícita. Isso não resolve a indisponibilidade; torna-a observável.

Pelos limites definidos no pedido, não há mecanismo confiável para cumprir simultaneamente **Vercel apenas + RAM apenas + multiplayer entre conexões independentes com recuperação garantida**. O teste em produção deve medir a frequência do problema, sem tomar resultados pontuais como garantia. A partida termina quando a memória da instância é perdida.

## Modelo de domínio implementado

- `Room`: código, host, jogadores, versão, data e estado de jogo.
- `Player`: identidade temporária, hash do token, avatar, cor, presença e dados privados.
- `GameState`: grafo do tabuleiro, turno, fase, estoque do banco, mãos, cartas e conquistas.
- `Command`: intenção validada do jogador com ID idempotente; nunca contém um estado arbitrário do jogo.
- `Projection`: visão pública e visão privada autorizada por jogador.

O motor clássico está em `src/game-engine` e não depende de React ou WebSocket. `createGame` monta o estado em memória; `applyGameAction` clona, valida e aplica cada comando; `projectGame` envia os recursos de todos os jogadores e revela o conteúdo das cartas de desenvolvimento somente ao dono. O `RoomHub` mantém lobby e jogo na mesma instância, processa comandos em sequência e transmite cada projeção privada. A troca é concluída em uma única aplicação de comando, com nova checagem de recursos.

## Dados na interface

Os cubos são renderizados com CSS 3D; não há biblioteca de renderização 3D nem motor de corpos rígidos. `DiceTray` captura o ponteiro e estima velocidades linear e angular pelos últimos 110 ms do gesto. `dice-physics.ts` simula localmente dois dados com passo fixo de 1/120 s, gravidade, amortecimento e colisões com a mesa, as bordas e entre si. A orientação usa quaternions. `DiceFlight` mostra a trajetória, sombras e impactos sonoros opcionais; os parâmetros ficam em `dice-physics-config.ts`, com painel ajustável apenas em desenvolvimento.

O cliente envia posição, velocidade e orientação do gesto. O servidor usa esses dados somente para a animação compartilhada: ele continua sorteando os valores oficiais e os transmite em `lastRoll`. Durante a estabilização, a orientação visual converge gradualmente para as faces oficiais. A simulação é uma aproximação visual em CSS, sem colisores cúbicos de um motor 3D.

## Mãos, interações e áudio

`PlayerHand` desenha mãos e mangas em SVG 2D. `HandAnimationController` usa eventos discretos do histórico público da partida para animar troca aceita, Recusa Premium e soco na mesa em cada cliente; nenhuma posição de mão é transmitida por quadro. Clientes que reconectam iniciam depois do último evento já recebido e não repetem animações antigas. O motor valida o bloqueio direcional da Recusa Premium por rodada e o cooldown do soco. Os dois efeitos não alteram recursos nem turnos além da troca já concluída pelo motor.

`AudioManager` sintetiza localmente efeitos, cordas dedilhadas, flauta suave, vento e pássaros com Web Audio API, sem arquivos ou serviços externos. `AudioSettings` aplica volumes independentes e preferências visuais imediatamente e as persiste no `localStorage`. O áudio só inicia após um gesto permitido pelo navegador.

O ambiente local usa um proxy HTTP para o `next start` e atende `/api/ws` com `ws` na mesma porta pública. O endpoint destinado à Vercel usa `upgradeWebSocket` de `@vercel/functions`. Nenhum dos dois usa banco de dados. Os testes locais não reproduzem o roteamento entre instâncias da Vercel.
