# Fases e checklist

As fases avançam sem aprovação intermediária. A publicação ficou fora deste ciclo por instrução do usuário. Marquei apenas o que foi implementado e verificado localmente.

## Fase 0 — Viabilidade multiplayer

Provar criação de salas e sincronização em tempo real dentro de uma instância.

- [x] Next.js, endpoint WebSocket, salas em RAM e códigos de convite.
- [x] Dois clientes locais sincronizam entrada, prontidão e chat.
- [x] Recuperação de assento com token validada localmente.
- [ ] Validar distribuição entre instâncias e perda de processo na Vercel. **Sem hospedagem por instrução do usuário.**

## Fase 1 — Fundação visual

Dar ao jogo identidade própria e acesso simples sem conta.

- [x] Tela inicial, identidade visual, apelidos, avatares e sessão local.
- [x] Layout responsivo básico e preferências de movimento reduzido do sistema.
- [ ] Configurações de áudio e interface; inspeção visual em navegador.

## Fase 2 — Salas

Permitir que amigos se encontrem e se preparem para jogar.

- [x] Criar/entrar por código ou link; host, transferência, remoção, cores e prontidão.
- [x] Nome, meta de pontos, semente, chat e reações configuráveis.
- [x] Reconexão local preserva o assento enquanto a instância existir.
- [ ] Validar F5 e recuperação em vários dispositivos na Vercel.

## Fase 3 — Jogo clássico

Aplicar as regras no servidor e sincronizar o tabuleiro.

- [x] Tabuleiro de 19 hexágonos, preparação em duas voltas, dados e recursos.
- [x] Ladrão, descartes, construções, cartas, portos, prêmios e vitória.
- [x] Estado privado por jogador; dados rolados no servidor.
- [ ] Percorrer uma partida completa em vários navegadores e revisar todas as regras da edição escolhida.

## Fase 4 — Negociações e social

Permitir trocas seguras e comunicação durante a partida.

- [x] Trocas com jogadores e banco, recusa, contraproposta e conclusão atômica.
- [x] Chat, reações e registro temporário de ações.
- [ ] Polir a janela de negociações, histórico detalhado e animações.

## Fase 5 — Expansões

Cada expansão precisa de motor próprio e validação antes de aparecer no lobby.

- [x] Extensão de 5–6 jogadores com tabuleiro ampliado, portos e turnos em dupla.
- [ ] Navegadores, Cidades e Cavaleiros, Mercadores e Bárbaros, Exploradores e Piratas.
- [x] Expansões incompletas não podem ser selecionadas.

## Fase 6 — Personalização

Isolar regras da casa da partida clássica.

- [x] Meta de vitória alternativa e semente compartilhável de mapa.
- [x] Identificação visual da meta alternativa.
- [ ] Temporizador, cartas especiais com efeitos no motor e cenários personalizados.

## Fase 7 — Refinamento

Melhorar uso, segurança e confiança antes de publicar.

- [x] Zoom e arraste no tabuleiro, foco visível, movimento reduzido e validação Zod.
- [x] Testes unitários e integração local de HTTP e WebSocket.
- [ ] Revisão visual em navegadores, áudio, desempenho com seis jogadores e partida completa de ponta a ponta.
- [ ] Validação de produção. **O deploy será manual pelo usuário.**
