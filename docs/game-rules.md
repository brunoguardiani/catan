# Regras implementadas

O modo clássico atende 3–4 jogadores e a extensão atende 5–6, seguindo as [regras oficiais do jogo base](https://www.catan.com/understand-catan/game-rules) e da [extensão de 2025](https://www.catan.com/sites/default/files/2025-03/CN3082%20CATAN%20%E2%80%93%205-6%20Rulebook%202025%20reduced.pdf). O servidor é a autoridade sobre dados, mãos, banco, legalidade das jogadas e vitória.

## Tabuleiro e preparação

- Antes do posicionamento, cada jogador lança dois dados. A maior soma define quem começa; se houver empate no maior resultado, apenas os empatados lançam novamente até restar um vencedor. Os lugares da mesa permanecem fixos. A partir do vencedor, o próximo jogador é o assento seguinte no sentido horário, à sua direita.
- O anfitrião pode reiniciar a partida após confirmação. Os assentos e o mapa são preservados; construções, mãos, pontuação e disputa inicial dos dados voltam ao início.
- Mapa com 19 hexágonos, 54 vértices, 72 arestas, um deserto, ladrão e nove portos. A semente gera o mesmo mapa novamente.
- O anfitrião escolhe o tamanho do mapa no lobby. Uma moldura azul de seis lados envolve o litoral recortado; os portos aparecem junto à costa com sua taxa e recurso.
- Com 5–6 jogadores, o mapa cresce para 30 terrenos, dois desertos, 28 fichas de número e 11 portos. O banco tem 24 cartas por recurso e o baralho de desenvolvimento tem 34 cartas.
- Os pontos nas fichas mostram as combinações possíveis dos dois dados: 2 e 12 têm um ponto; 6 e 8 têm cinco.
- Cada jogador coloca assentamento e estrada na ordem normal, depois na ordem inversa. A segunda colocação fornece recursos dos terrenos adjacentes; assentamentos respeitam a distância mínima.

## Turno e recursos

- O jogador ativo lança dois dados gerados no servidor. Assentamentos produzem uma carta e cidades produzem duas por terreno elegível. O ladrão bloqueia a produção do terreno ocupado. Se o banco não consegue atender toda a demanda de um recurso, ninguém recebe esse recurso naquela produção.
- Com 5–6 jogadores, após a produção e as ações do jogador principal, o jogador três assentos adiante faz uma fase de ações sem negociar com outros jogadores. Ele ainda pode negociar com o banco, construir e jogar uma carta de desenvolvimento. Depois a vez principal passa ao assento seguinte.
- No resultado 7, quem tiver mais de sete cartas descarta metade, arredondada para baixo. Depois o jogador ativo move o ladrão e, se houver alvos com recursos, escolhe de quem roubar uma carta aleatória.

## Configuração da sala

O anfitrião escolhe o tabuleiro padrão de 19 terrenos ou o ampliado de 30 terrenos. O mapa pode usar a distribuição clássica fixa, uma distribuição aleatória reproduzível por seed ou um tabuleiro montado no editor. O editor altera terrenos, fichas, portos costeiros e a posição inicial do ladrão; o servidor valida a geometria, as fichas e os portos antes de aceitar o mapa. A distribuição livre admite desequilíbrio estratégico, mas exige terrenos produtivos, fichas válidas e recursos suficientes para jogar.

O painel lateral mostra a todos três regras da casa: mover o ladrão apenas para terrenos adjacentes, saltar entre desertos e atravessar construções adversárias com estradas. A opção de estradas também vale para o cálculo da Maior Estrada. O anfitrião pode ativar ou desativar o chat e ajustar a pontuação de vitória. O descarte no 7 e a Recusa Premium mantêm seu funcionamento fixo. O ladrão sempre começa em um deserto.

As opções da sala são validadas e divulgadas pelo servidor. Ao iniciar, o jogo recebe uma cópia do tabuleiro aprovado e das regras escolhidas, que não podem ser alterados durante a partida.
- Custos e limites das peças são validados no motor: 15 estradas, cinco assentamentos e quatro cidades por jogador.

## Cartas, trocas e vitória

- Os recursos de cada jogador ficam visíveis sobre a mesa para todos, em pilhas de cartas individuais junto ao seu lugar. Cada toque em uma carta separa uma unidade da pilha para a troca. Cada jogador vê a frente das próprias cartas de desenvolvimento; os demais veem somente o verso e a quantidade.
- O baralho clássico tem 25 cartas. Apenas uma carta de desenvolvimento não pontual pode ser jogada por turno, e uma carta recém-comprada não pode ser jogada nesse turno. Cavaleiro, construção de estradas, ano de abundância e monopólio têm efeitos no motor; pontos de vitória ficam secretos até o fim.
- Trocas com banco usam 4:1, 3:1 ou 2:1 conforme os portos ocupados. Na fase de ações, qualquer jogador pode escolher cartas suas e do jogador ativo para enviar uma proposta, mesmo antes de o jogador ativo fazer uma oferta. O jogador ativo também pode propor a um destinatário. Todos veem o painel minimizável de propostas da rodada, com uma carta e a quantidade para cada recurso. O destinatário pode aceitar ou recusar a oferta recebida; o jogador ativo pode aceitar ou recusar propostas dirigidas a ele, e cada autor pode retirar a sua. O servidor verifica novamente ambas as mãos e conclui uma transferência de forma atômica.
- Maior estrada e maior exército valem dois pontos cada. O jogo termina quando o jogador do turno atinge a meta configurada; a pontuação final, incluindo cartas secretas, é então mostrada.

## Estado da validação

Há testes unitários das regras principais e testes de integração local até o primeiro lançamento de dados. Ainda falta percorrer partidas completas com vários navegadores e confrontar todos os detalhes da edição escolhida. A meta diferente de dez pontos é uma regra da casa, indicada na interface.
