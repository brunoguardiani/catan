# Catan

Jogo de estratégia multiplayer para partidas privadas, com identidade visual própria. O modo clássico de 3–4 jogadores e a extensão de 5–6 jogadores funcionam localmente com tabuleiro SVG, regras aplicadas no servidor, salas temporárias e comunicação por WebSocket. O projeto ainda não atende a todos os itens do escopo original; veja o [checklist das fases](docs/roadmap.md).

## Rodar localmente

```bash
npm install
npm run build
npm run dev:local
```

Abra [http://localhost:3000](http://localhost:3000). Use janelas ou perfis distintos para cada jogador. O servidor escuta apenas em `127.0.0.1`. `next dev` sozinho não oferece o mesmo endpoint WebSocket; use `dev:local` após o build.

Para verificar:

```bash
npm test
npm run typecheck
npm run smoke:local
npm run smoke:game
```

## Funcionalidades disponíveis

- Entrada por apelido, sem conta; sessão temporária com token aleatório no `localStorage`. O lobby identifica jogadores pelas iniciais.
- Salas privadas para até seis jogadores, convite por código ou link, host, cores, prontidão, chat e reações.
- Reconexão ao assento enquanto a sala estiver na mesma instância em memória.
- Partida clássica: primeiro jogador definido por dados e desempate, preparação em ordem direta e inversa, produção, ladrão, construções, cartas de desenvolvimento, portos, trocas, pontuação e vitória.
- O mapa ampliado tem 30 terrenos, 11 portos e cartas extras. Com cinco ou seis pessoas, o segundo jogador, três assentos à frente, faz ações após o jogador principal, sem trocas entre pessoas.
- O litoral recortado fica dentro de uma moldura azul hexagonal contínua. Os terrenos têm pontas em cima e embaixo, com as ilustrações originais preservadas na vertical. Os portos acompanham a costa, com docas de madeira, imagens dos recursos nos portos 2:1 e uma interrogação nos portos 3:1. As fichas de número mostram de um a cinco pontos conforme as combinações dos dois dados.
- A tela da partida inteira funciona como mesa: tabuleiro, jogadores e mãos ficam no mesmo espaço. Os dados são entregues ao próximo jogador, que os segura, move e solta para lançá-los; o resultado aparece na mesa antes de os dados serem recolhidos. Isso também vale para a disputa inicial. O botão de encerrar o turno fica ao lado do nome do jogador na barra superior. Recursos aparecem em pilhas de cartas individuais que se abrem horizontalmente ao passar o mouse, e desenvolvimento adversário fica oculto. O “+” junto ao jogador abre os ícones de construção e a compra de desenvolvimento; uma carta sai do monte, vai até a mão e aparece ampliada com sua descrição antes de ser guardada. A ajuda fica ao lado do zoom. Reações surgem ao passar sobre o próprio jogador; o chat no canto inferior direito aparece ao receber ou escrever uma mensagem e se oculta três segundos após o envio. O anfitrião pode reiniciar a partida após confirmação.
- No mapa menor, cada jogador ocupa uma borda diferente da mesa. No mapa ampliado, as bordas curtas recebem um jogador e as longas comportam dois; os lugares sem participante ficam vazios. A posição é girada para que cada pessoa se veja na borda inferior, respeitando a ordem horária da partida.
- As cinco cartas de recurso e as cinco de desenvolvimento usam as imagens fornecidas em `cartas base`. O tabuleiro usa as cinco imagens de terreno, o deserto e o ícone do ladrão. O verso fornecido aparece no monte, na animação de compra e na mão dos oponentes. Os recortes visuais ocultam o fundo externo das imagens e preservam os arquivos originais.
- Ofertas montadas ao tocar nas cartas da mesa; qualquer jogador pode propor ao dono da rodada sem esperar uma oferta dele. O painel minimizável mostra uma carta por recurso com a quantidade, é visível a todos e permite aceitação, recusa ou retirada conforme o participante. Trocas com banco e transferências são validadas pelo servidor.
- Os lugares da mesa mostram mãos e mangas ilustradas em SVG 2D, com nome, cor, turno e conexão. Trocas aceitas animam as mãos e as cartas; a Recusa Premium bloqueia novas propostas do remetente ao destinatário até a rodada seguinte. O botão de punho aciona um soco cômico com cooldown. A engrenagem abre volumes independentes, silêncio e preferências visuais, guardados no navegador. Música e ambiente originais são sintetizados localmente após uma interação do usuário.
- O anfitrião escolhe no lobby o mapa para 1–4 ou 5–6 jogadores, além da meta de pontos e da semente. Ambos podem começar com três pessoas; o mapa menor aceita até quatro e o maior, até seis. O turno em dupla só ocorre com cinco ou seis jogadores.

## Limites

As expansões de cenários ainda não estão disponíveis; a extensão de 5–6 jogadores é selecionada pelo anfitrião no lobby. O teste de ponta a ponta com WebSockets percorre o lobby, a preparação e um lançamento de dados; ainda falta verificar uma partida completa com vários navegadores e todas as ações pela interface.

Nenhuma publicação foi feita. O usuário fará o deploy manualmente. Segundo a [documentação da Vercel sobre WebSockets](https://vercel.com/docs/functions/websockets), novas conexões podem alcançar instâncias diferentes e a RAM não é compartilhada; sob as restrições de não usar armazenamento ou serviço adicional, a disponibilidade de uma sala entre instâncias não pode ser garantida. A verificação em produção permanece pendente.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Regras implementadas](docs/game-rules.md)
- [Expansões](docs/expansions.md)
- [Roadmap e checklist](docs/roadmap.md)
- [Desenvolvimento e testes](docs/development.md)
- [Imagens das cartas de desenvolvimento](docs/development-card-art.md)
