"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COST } from "@/game-engine/rules";
import { RESOURCES, type Resource } from "@/game-engine/types";
import { DiceFace, ResourceCard, colorValue, resourceName } from "@/components/GamePieces";
import BuildIcon from "@/components/BuildIcon";
import BoardNumberToken from "@/components/BoardNumberToken";
import { audioManager, loadAudioPreferences } from "@/components/AudioManager";
import "@/components/game-enhancements.css";
import "@/components/game-base-cards.css";
import "./box.css";

type Topic = "pieces" | "development" | "manual" | "resources" | "awards" | "dice" | "robber" | "numbers";
const topics: { id: Topic; label: string }[] = [
  { id: "pieces", label: "Peças e Construções" }, { id: "development", label: "Cartas de Desenvolvimento" },
  { id: "manual", label: "Manual de Regras" }, { id: "resources", label: "Recursos do Jogo" },
  { id: "awards", label: "Títulos e Conquistas" }, { id: "dice", label: "Dados e Produção" },
  { id: "robber", label: "O Ladrão e a Regra do 7" }, { id: "numbers", label: "Números e Probabilidade" },
];
const resources: { id: Resource; terrain: string; board: string; use: string }[] = [
  { id: "wood", terrain: "Floresta", board: "wood", use: "Estradas e assentamentos" },
  { id: "brick", terrain: "Colinas", board: "brick", use: "Estradas e assentamentos" },
  { id: "wool", terrain: "Pastagens", board: "wool", use: "Assentamentos e desenvolvimento" },
  { id: "wheat", terrain: "Campos", board: "wheat", use: "Assentamentos, cidades e desenvolvimento" },
  { id: "ore", terrain: "Montanhas", board: "ore", use: "Cidades e desenvolvimento" },
];
const development = [
  { id: "knight", name: "Cavaleiro", effect: "Move o ladrão e permite roubar uma carta aleatória de um adversário elegível. Conta para Maior Exército.", detail: "Mover por Cavaleiro não obriga jogadores a descartar cartas.", example: "Afaste o ladrão de um campo que produz trigo para suas casas." },
  { id: "road_building", name: "Construção de estradas", effect: "Construa até duas estradas sem pagar recursos.", detail: "As estradas ainda precisam ocupar arestas válidas e respeitar o limite de peças.", example: "Estenda sua rede até um vértice onde poderá construir uma casa." },
  { id: "year_plenty", name: "Ano de abundância", effect: "Receba duas cartas de um recurso à sua escolha do banco.", detail: "A interface da partida seleciona duas cartas do mesmo tipo; o banco precisa tê-las.", example: "Escolha dois trigos para completar o custo de uma cidade." },
  { id: "monopoly", name: "Monopólio", effect: "Escolha um recurso e receba todas as cartas desse tipo dos adversários.", detail: "Afeta apenas o recurso escolhido.", example: "Escolha madeira antes de ampliar sua rede de estradas." },
  { id: "victory", name: "Ponto de vitória", effect: "Vale um ponto secreto na sua pontuação.", detail: "A carta permanece oculta até o fim da partida.", example: "Esse ponto pode completar a meta de vitória no seu turno." },
] as const;
const pieces = [
  { kind: "road", name: "Estrada", points: "Conexão", limit: "15 peças", rule: "Ocupe uma aresta livre conectada à sua rede. Uma construção adversária pode interromper a rota." },
  { kind: "settlement", name: "Assentamento", points: "1 ponto", limit: "5 peças", rule: "Ocupe um vértice livre ligado à sua estrada. Deixe ao menos um vértice livre entre construções." },
  { kind: "city", name: "Cidade", points: "2 pontos no total", limit: "4 peças", rule: "Substitua um assentamento seu. A cidade produz duas cartas por terreno elegível." },
] as const;
const manualSections = [
  { title: "Apresentação", visual: "overview", lead: "Reúna recursos, amplie sua rede e alcance a meta de pontos da sala durante seu turno.", points: ["O mapa clássico recebe 3–4 pessoas. O ampliado recebe 3–6, com turno em dupla quando há 5 ou 6.", "A ilha é formada por hexágonos, vértices para casas e arestas para estradas.", "Assentamentos, cidades, títulos e cartas secretas contribuem para a vitória."] },
  { title: "Índice", visual: "index", lead: "Escolha um capítulo para consultar a regra desejada.", points: [] },
  { title: "Componentes", visual: "components", lead: "A caixa reúne terrenos, recursos, peças, cartas, dados, fichas e ladrão.", points: ["Cinco recursos: madeira, tijolo, lã, trigo e minério.", "Cada jogador possui estradas, assentamentos e cidades; o baralho inclui cartas de desenvolvimento.", "As fichas numeradas determinam a produção. O ladrão bloqueia um terreno."] },
  { title: "Preparação inicial", visual: "setup", lead: "Antes de construir, os jogadores lançam dois dados para decidir quem começa.", points: ["A maior soma define o primeiro; empatados na maior soma lançam de novo.", "Cada pessoa coloca assentamento e estrada em ordem direta e depois inversa.", "O segundo assentamento inicial fornece recursos dos terrenos adjacentes.", "O anfitrião escolhe mapa, semente e meta no lobby."] },
  { title: "Como funciona um turno", visual: "turn", lead: "Lance, produza, negocie, construa e passe a vez.", points: ["O jogador ativo lança os dados no servidor; a soma ativa terrenos numerados.", "Depois da produção, pode negociar, construir e jogar uma carta permitida.", "No mapa com 5–6 pessoas, o jogador três assentos adiante faz ações extras sem trocas entre jogadores."] },
  { title: "Terrenos e recursos", visual: "resources", lead: "Cada tipo de terreno fornece um recurso próprio.", points: ["Floresta → madeira; colinas → tijolo; pastagem → lã.", "Campos → trigo; montanhas → minério.", "O deserto não produz recursos e começa com o ladrão."] },
  { title: "Produção e dados", visual: "production", lead: "A soma de dois dados ativa os terrenos com a ficha correspondente.", points: ["Um assentamento adjacente recebe uma carta; uma cidade recebe duas.", "O ladrão impede a produção do terreno ocupado.", "Se o banco não puder atender toda a demanda de um recurso, ninguém o recebe naquela produção."] },
  { title: "Estradas", visual: "roads", lead: "Uma estrada custa 1 madeira e 1 tijolo e ocupa uma aresta livre.", points: ["Ela precisa se conectar à sua rede ou estrutura, conforme a fase da partida.", "Peças adversárias podem interromper uma rota.", "Uma rota contínua válida de pelo menos cinco segmentos disputa Maior Estrada.", "Cada jogador dispõe de até 15 estradas."] },
  { title: "Assentamentos e cidades", visual: "buildings", lead: "Casas ocupam vértices; cidades substituem casas suas.", points: ["Assentamento: madeira, tijolo, lã e trigo. Vale 1 ponto.", "Uma casa nova precisa de estrada conectada e de um vértice livre entre construções.", "Cidade: 3 minérios e 2 trigos. Vale 2 pontos no total e produz em dobro.", "Limites por pessoa: 5 assentamentos e 4 cidades."] },
  { title: "Negociação", visual: "trade", lead: "Troque com jogadores ou com o banco durante a fase de ações.", points: ["Jogadores podem propor ao jogador ativo; há aceitação, recusa, retirada e contraproposta.", "O servidor verifica as duas mãos antes de transferir as cartas.", "No turno em dupla de 5–6 pessoas não há trocas entre jogadores."] },
  { title: "Portos", visual: "ports", lead: "Uma construção sua no vértice do porto melhora a troca com o banco.", points: ["Sem porto: 4 cartas iguais por 1 carta diferente.", "Porto geral: 3 cartas iguais por 1.", "Porto específico: 2 cartas do recurso indicado por 1.", "Pontes não são uma peça com custo próprio neste jogo; o termo aparece para alguns caminhos de estrada."] },
  { title: "Regra do 7", visual: "seven", lead: "O 7 interrompe a produção normal.", points: ["Quem tem mais de sete cartas descarta metade, arredondada para baixo: com 9, descarta 4.", "O jogador ativo move o ladrão para outro terreno permitido.", "O terreno ocupado fica bloqueado; se houver alvo elegível, uma carta aleatória pode ser roubada.", "Cavaleiro move o ladrão sem provocar esse descarte."] },
  { title: "Desenvolvimento", visual: "development", lead: "Compre uma carta por 1 minério, 1 lã e 1 trigo.", points: ["Cavaleiro, Construção de Estradas, Ano de Abundância, Monopólio e Ponto de Vitória têm efeitos distintos.", "Uma carta recém-comprada não pode ser jogada no mesmo turno.", "Jogue no máximo uma carta não pontual por turno; pontos permanecem ocultos até o fim."] },
  { title: "Títulos especiais", visual: "awards", lead: "Maior Estrada e Maior Exército valem 2 pontos cada.", points: ["Maior Estrada começa com pelo menos cinco segmentos contínuos válidos.", "Maior Exército começa com três Cavaleiros efetivamente usados.", "O título passa a quem supera o titular; empates preservam o titular."] },
  { title: "Vitória", visual: "victory", lead: "O jogo termina quando o jogador do turno alcança a meta configurada.", points: ["Assentamento vale 1 ponto; cidade vale 2 no total, ao substituir uma casa.", "Cada título vale 2 pontos. Cartas de ponto somam secretamente.", "Metas diferentes de 10 pontos são uma regra da casa escolhida no lobby."] },
  { title: "Regras da casa e limites", visual: "house", lead: "Estas diferenças pertencem a esta versão do jogo.", points: ["Regra da casa — Recusa Premium: ao recusar uma proposta, o destinatário bloqueia novas propostas daquele autor até o fim da jogada.", "Regra da casa — a meta de pontos pode ser alterada pelo anfitrião antes da partida.", "Alguns caminhos são chamados de pontes na interface; seguem as regras e custos de estrada.", "Limite da interface — no Ano de Abundância, a escolha atual oferece duas cartas do mesmo recurso."] },
  { title: "Mapa ampliado", visual: "expanded", lead: "A extensão de 5–6 jogadores está disponível no lobby.", points: ["O mapa cresce para 30 terrenos, dois desertos, 28 fichas e 11 portos.", "Com 5 ou 6 pessoas, existe uma fase de ações em dupla sem trocas entre jogadores.", "Navegadores, Cidades e Cavaleiros, Mercadores e Bárbaros e Exploradores e Piratas ainda não estão disponíveis."] },
];
const extraManualPages: Record<string, { title: string; lead: string; points: string[] }[]> = {
  setup: [{ title: "Primeiras construções", lead: "Cada assentamento inicial vem acompanhado de uma estrada adjacente.", points: ["Na primeira rodada, a ordem segue a mesa; na segunda, a ordem é invertida.", "Não coloque assentamentos em vértices vizinhos de qualquer construção já existente.", "Escolha o segundo assentamento pensando nos recursos que receberá imediatamente e nos números que produzirão depois."] }],
  buildings: [{ title: "Custos e limites", lead: "Planeje o uso das peças antes de investir em uma nova construção.", points: ["Estrada: 1 madeira e 1 tijolo; até 15 por jogador.", "Assentamento: 1 madeira, 1 tijolo, 1 lã e 1 trigo; até 5 por jogador.", "Cidade: substitui um assentamento seu e custa 3 minérios e 2 trigos; até 4 por jogador.", "Ao virar cidade, a construção passa a valer 2 pontos no total, não 2 pontos adicionais."] }],
  trade: [{ title: "Ofertas à mesa", lead: "As propostas são concluídas apenas quando ambas as mãos ainda contêm as cartas prometidas.", points: ["Escolha as cartas que oferece e as que deseja receber; a outra pessoa pode aceitar ou recusar.", "O jogador ativo também recebe propostas dos demais durante sua fase de ações.", "O autor pode retirar sua proposta antes da conclusão. Trocas entre jogadores não acontecem na fase extra da dupla."] }],
  seven: [{ title: "O ladrão em detalhes", lead: "Depois dos descartes, o jogador ativo move o ladrão para outro terreno.", points: ["O novo terreno deixa de produzir enquanto o ladrão permanecer nele.", "Se houver adversários com construções junto ao terreno e cartas na mão, escolha um alvo elegível para roubar uma carta aleatória.", "Uma carta de Cavaleiro também move o ladrão, mas não exige descartes."] }],
  development: [{ title: "Efeitos das cartas", lead: "O baralho clássico contém Cavaleiro, Construção de Estradas, Ano de Abundância, Monopólio e Ponto de Vitória.", points: ["Cavaleiro move o ladrão e conta para Maior Exército.", "Construção de Estradas permite colocar até duas estradas válidas sem custo.", "Ano de Abundância entrega duas cartas do mesmo recurso escolhido nesta interface, se o banco as tiver.", "Monopólio recolhe dos adversários todas as cartas de um recurso escolhido.", "Ponto de Vitória permanece oculto até o fim da partida."] }],
};
const manualPages = manualSections.flatMap(section => [
  { ...section, id: `${section.visual}-1`, chapterId: section.visual },
  ...(extraManualPages[section.visual] ?? []).map((page, extraIndex) => ({ ...page, visual: section.visual, id: `${section.visual}-${extraIndex + 2}`, chapterId: section.visual })),
]);
const faqs = [
  ["Preciso criar uma conta?", "Não. Escolha um apelido para criar ou entrar em uma sala."],
  ["Como crio uma sala?", "Digite um apelido de 2 a 24 caracteres e selecione Criar jogo."],
  ["Como convido meus amigos?", "Compartilhe o link ou o código de seis caracteres exibido na sala."],
  ["Quantos jogadores podem participar?", "O jogo começa com 3 ou 4 no mapa clássico. O mapa ampliado aceita de 3 a 6; com 5 ou 6 há turno em dupla."],
  ["O que acontece se eu apertar F5?", "O navegador tenta reconectar com a sessão salva. A sala precisa continuar disponível no servidor."],
  ["Como consigo recursos?", "Os terrenos com o número lançado produzem para construções vizinhas, se não estiverem bloqueados e houver cartas no banco."],
  ["Como funcionam os dados?", "A soma de dois dados indica os terrenos que produzem naquele turno."],
  ["O que acontece quando sai 7?", "Não há produção. Quem tem mais de sete cartas descarta metade; depois o ladrão se move e pode roubar."],
  ["Como funciona o ladrão?", "Ele bloqueia a produção do terreno ocupado e pode permitir o roubo aleatório de uma carta de um adversário elegível."],
  ["Como faço uma troca?", "Durante a fase de ações, proponha uma troca ao jogador ativo ou use o banco. Portos melhoram a taxa do banco."],
  ["Qual a diferença entre estrada, casa e cidade?", "Estradas conectam a rede; casas valem 1 ponto e produzem 1 carta; cidades substituem casas, valem 2 pontos e produzem 2."],
  ["Como funcionam os portos?", "Uma construção no vértice do porto permite troca 3:1 ou 2:1 para o recurso indicado."],
  ["O que são cartas de desenvolvimento?", "Cartas compradas por minério, lã e trigo que concedem efeitos ou pontos secretos. Uma recém-comprada não é jogada no mesmo turno."],
  ["Como consigo Maior Estrada?", "Tenha pelo menos cinco estradas contínuas válidas e supere os demais jogadores."],
  ["Como consigo Maior Exército?", "Use pelo menos três Cavaleiros e supere os demais jogadores."],
  ["Como ganho a partida?", "Alcance a meta de pontos configurada durante seu turno, somando construções, títulos e cartas de ponto."],
  ["Quais expansões estão disponíveis?", "O mapa ampliado para 5–6 jogadores está disponível. Expansões de cenários ainda não estão no lobby."],
];

function Token({ value }: { value: number }) {
  return <svg className="box-number-token" viewBox="0 0 50 65" aria-hidden="true"><BoardNumberToken value={value} /></svg>;
}
function Cost({ kind }: { kind: keyof typeof COST }) {
  return <div className="box-cost">{RESOURCES.filter(id => COST[kind][id] > 0).map(id => <ResourceCard key={id} resource={id} count={COST[kind][id]} compact />)}</div>;
}

function ManualIllustration({ kind }: { kind: string }) {
  if (["overview", "setup", "expanded"].includes(kind)) return <div className="manual-illustration manual-terrain-row" aria-label="Terrenos e construções do tabuleiro"><span style={{ backgroundImage: "url(/board/wood.jpg)" }} /><span style={{ backgroundImage: "url(/board/wheat.jpg)" }}><Token value={8} /></span><span style={{ backgroundImage: "url(/board/ore.jpg)" }} /><BuildIcon kind="settlement" /></div>;
  if (["components", "resources"].includes(kind)) return <div className="manual-illustration manual-card-row" aria-label="Cinco cartas de recursos da partida">{RESOURCES.map(id => <ResourceCard key={id} resource={id} compact />)}</div>;
  if (["turn", "production"].includes(kind)) return <div className="manual-illustration manual-production" aria-label="Dados ativam o campo 8, que produz trigo"><DiceFace value={3} /><DiceFace value={5} /><span>→</span><span className="manual-mini-terrain" style={{ backgroundImage: "url(/board/wheat.jpg)" }}><Token value={8} /></span><span>→</span><ResourceCard resource="wheat" compact /></div>;
  if (["roads", "buildings"].includes(kind)) return <div className="manual-illustration manual-road-example" aria-label="Construções separadas por um vértice livre"><span><BuildIcon kind="settlement" /></span><i /><span className="diagram-free-vertex" /><i /><span><BuildIcon kind="city" /></span><small>um vértice livre entre construções</small></div>;
  if (["trade", "ports", "house"].includes(kind)) return <div className="manual-illustration manual-trade-example" aria-label="Exemplo de troca e porto"><ResourceCard resource="wood" count={kind === "ports" ? 2 : 4} compact /><span>→</span><ResourceCard resource="ore" compact /><strong>{kind === "ports" ? "2:1 com porto" : "4:1 com banco"}</strong></div>;
  if (kind === "seven") return <div className="manual-illustration manual-seven" aria-label="Sete nos dados move o ladrão e bloqueia um terreno"><DiceFace value={3} /><DiceFace value={4} /><span>7 →</span><span className="robber-portrait" /></div>;
  if (kind === "development") return <div className="manual-illustration manual-development" aria-label="Cartas de desenvolvimento da partida">{["knight", "road_building", "year_plenty"].map(id => <span key={id} style={{ backgroundImage: `url(/cards/development/${id}.jpg)` }} />)}</div>;
  return <div className="manual-illustration manual-awards" aria-label="Cartas de título e pontos de vitória"><img src="/cards/awards/longest-road.jpg" alt="" loading="lazy" /><img src="/cards/awards/largest-army.jpg" alt="" loading="lazy" /></div>;
}

function PlacementDiagram() {
  return <div className="placement-diagrams" aria-label="Exemplos estáticos de posicionamento"><div><strong>Válido</strong><span><BuildIcon kind="settlement" /><i /><span className="diagram-free-vertex" /><i /><BuildIcon kind="settlement" /></span><small>Um vértice livre separa as casas.</small></div><div><strong>Inválido</strong><span><BuildIcon kind="settlement" /><i /><BuildIcon kind="settlement" /></span><small>Duas casas em vértices vizinhos violam a distância mínima.</small></div></div>;
}

function DiceMiniBoard({ total }: { total: number }) {
  const tiles: { id: Resource; number: number }[] = [{ id: "wood", number: 5 }, { id: "brick", number: 6 }, { id: "wheat", number: 8 }, { id: "wool", number: 9 }, { id: "ore", number: 10 }];
  return <div className="dice-mini-board" aria-label={`Minitabuleiro; terrenos com o número ${total} destacados`}>{tiles.map(tile => <span key={tile.id} className={total === tile.number ? "active" : ""} style={{ backgroundImage: `url(/board/${tile.id}.jpg)` }}><Token value={tile.number} /></span>)}</div>;
}

function ProbabilityChart() {
  return <div className="probability-chart" role="img" aria-label="Combinações dos dois dados: 2 a 12 têm respectivamente 1, 2, 3, 4, 5, 6, 5, 4, 3, 2 e 1 combinações; 7 ativa o ladrão">{Array.from({ length: 11 }, (_,index) => index + 2).map(value => { const combinations = value <= 7 ? value - 1 : 13 - value; return <div key={value} className={value === 7 ? "robber-result" : ""}><span className="probability-bar" style={{ height: `${combinations * 15}px` }} /><b>{value}</b><small>{combinations}</small></div>; })}</div>;
}

function RobberSequence() {
  return <ol className="robber-sequence"><li><span><DiceFace value={3} /><DiceFace value={4} /></span><b>1. Saiu 7</b></li><li><span><ResourceCard resource="wood" count={9} compact /> → 4</span><b>2. Descarte</b></li><li><span className="robber-sequence-art" /><b>3. Mova</b></li><li><span className="robber-sequence-tile" style={{ backgroundImage: "url(/board/wheat.jpg)" }} /><b>4. Bloqueie e roube</b></li></ol>;
}

function AwardDiagram() {
  return <div className="award-diagrams"><div><strong>5 segmentos contínuos</strong><span>{Array.from({ length: 5 }, (_,index) => <BuildIcon key={index} kind="road" />)}</span><small>Rota válida para disputar Maior Estrada.</small></div><div><strong>3 Cavaleiros usados</strong><span>{Array.from({ length: 3 }, (_,index) => <span key={index} className="award-knight" style={{ backgroundImage: "url(/cards/development/knight.jpg)" }} />)}</span><small>Mínimo para disputar Maior Exército.</small></div></div>;
}

export default function GameBox() {
  const [topic, setTopic] = useState<Topic | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource>("wood");
  const [selectedDev, setSelectedDev] = useState(0);
  const [manualPage, setManualPage] = useState(0);
  const [turningPage, setTurningPage] = useState<{ from: number; to: number; direction: "forward" | "backward"; mobile: boolean } | null>(null);
  const [dice, setDice] = useState<[number, number]>([3, 5]);
  const [cards, setCards] = useState(8);
  const [robberTerrain, setRobberTerrain] = useState<Resource>("wheat");
  const [selectedNumber, setSelectedNumber] = useState(8);
  const [rolling, setRolling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [bookPhase, setBookPhase] = useState<"measure" | "closed" | "travel" | "ready" | "shutting" | "returning">("measure");
  const bookPhaseRef = useRef(bookPhase);
  const modalRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const boxBookRef = useRef<HTMLDivElement>(null);
  const bookTimerRef = useRef<number | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const turnTimerRef = useRef<number | null>(null);
  const manualPageRef = useRef(0);
  const turningRef = useRef(false);
  const current = resources.find(item => item.id === selectedResource)!;
  const total = dice[0] + dice[1];
  useLayoutEffect(() => { bookPhaseRef.current = bookPhase; }, [bookPhase]);

  function open(next: Topic) {
    triggerRef.current = document.activeElement as HTMLElement;
    setClosing(false);
    if (next === "manual") {
      bookPhaseRef.current = "measure";
      setBookPhase("measure");
      audioManager.setPreferences(loadAudioPreferences());
      void audioManager.unlock(false).then(() => audioManager.play("bookOpen"));
    }
    setTopic(next);
  }
  function close() {
    if (closeTimerRef.current !== null) return;
    if (topic === "manual") {
      if (bookPhaseRef.current === "shutting" || bookPhaseRef.current === "returning") return;
      if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
      turnTimerRef.current = null;
      turningRef.current = false;
      setTurningPage(null);
      if (bookTimerRef.current !== null) window.clearTimeout(bookTimerRef.current);
      bookPhaseRef.current = "shutting";
      setBookPhase("shutting");
      audioManager.play("bookClose");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      bookTimerRef.current = window.setTimeout(() => {
        setBookPhase("returning");
        setClosing(true);
        bookTimerRef.current = window.setTimeout(() => {
          setTopic(null); setClosing(false); setBookPhase("measure");
          triggerRef.current?.focus(); bookTimerRef.current = null;
        }, reduced ? 30 : 560);
      }, reduced ? 30 : 410);
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => { setTopic(null); setClosing(false); triggerRef.current?.focus(); closeTimerRef.current = null; }, 170);
  }
  useEffect(() => () => { if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current); if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current); if (bookTimerRef.current !== null) window.clearTimeout(bookTimerRef.current); }, []);
  useLayoutEffect(() => {
    if (topic !== "manual" || !bookRef.current || !boxBookRef.current || bookPhase !== "measure") return;
    const source = boxBookRef.current.getBoundingClientRect();
    const destination = bookRef.current.getBoundingClientRect();
    bookRef.current.style.setProperty("--book-dx", `${source.left - destination.left}px`);
    bookRef.current.style.setProperty("--book-dy", `${source.top - destination.top}px`);
    bookRef.current.style.setProperty("--book-sx", String(source.width / destination.width));
    bookRef.current.style.setProperty("--book-sy", String(source.height / destination.height));
    setBookPhase("closed");
  }, [topic, bookPhase]);
  useEffect(() => {
    if (topic !== "manual" || bookPhase !== "closed") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => setBookPhase("travel"));
    bookTimerRef.current = window.setTimeout(() => { setBookPhase("ready"); bookTimerRef.current = null; }, reduced ? 30 : 570);
    return () => window.cancelAnimationFrame(frame);
  }, [topic, bookPhase]);
  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 650px)");
    function alignDesktopSpread() {
      if (mobileQuery.matches || turningRef.current || manualPageRef.current % 2 === 0) return;
      const firstPage = manualPageRef.current - 1;
      manualPageRef.current = firstPage;
      setManualPage(firstPage);
    }
    mobileQuery.addEventListener("change", alignDesktopSpread);
    return () => mobileQuery.removeEventListener("change", alignDesktopSpread);
  }, []);
  useEffect(() => {
    if (!topic) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (topic === "manual" && event.key === "ArrowLeft") { event.preventDefault(); goToManualPage(manualPageRef.current - manualStep()); }
      if (topic === "manual" && event.key === "ArrowRight") { event.preventDefault(); goToManualPage(manualPageRef.current + manualStep()); }
      if (event.key !== "Tab" || !modalRef.current) return;
      const nodes = [...modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex]:not([tabindex="-1"])')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; };
  }, [topic]);
  function roll() {
    if (rolling) return;
    setRolling(true);
    window.setTimeout(() => { setDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]); setRolling(false); }, 330);
  }
  function manualStep() {
    return window.matchMedia("(max-width: 650px)").matches ? 1 : 2;
  }
  function finishManualTurn(target: number) {
    if (!turningRef.current) return;
    if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = null;
    const aligned = manualStep() === 2 ? target - target % 2 : target;
    manualPageRef.current = aligned;
    setManualPage(aligned);
    setTurningPage(null);
    turningRef.current = false;
  }
  function goToManualPage(index: number) {
    if (bookPhaseRef.current !== "ready") return;
    const current = manualPageRef.current;
    const mobile = manualStep() === 1;
    const target = mobile ? index : index - index % 2;
    if (target < 0 || target >= manualPages.length || target === current || turningRef.current) return;
    const direction = target < current ? "backward" : "forward";
    turningRef.current = true;
    setTurningPage({ from: current, to: target, direction, mobile });
    audioManager.play("pageTurn");
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    turnTimerRef.current = window.setTimeout(() => finishManualTurn(target), duration);
  }
  function renderManualPage(index: number, inactive = false) {
    const page = manualPages[index];
    if (!page) return <div className="book-page book-page-empty" aria-hidden="true" />;
    return <section key={index} className={`book-page ${index === 1 ? "book-index-page" : ""}`} aria-label={`Página ${index + 1}: ${page.title}`} aria-hidden={inactive || undefined} inert={inactive}>
      {index !== 1 && <button className="book-index-return" onClick={() => goToManualPage(1)}>← Voltar para o índice</button>}
      <div className="book-page-content">
        <small>CATAN · {String(index + 1).padStart(2, "0")}</small>
        <h3>{page.title}</h3>
        <p>{page.lead}</p>
        {index === 1 ? <nav className="book-index" aria-label="Capítulos do manual"><ol>{manualSections.slice(2).map(chapter => {
          const chapterPage = manualPages.findIndex(item => item.chapterId === chapter.visual);
          return <li key={chapter.visual}><button onClick={() => goToManualPage(chapterPage)}><span>{String(chapterPage + 1).padStart(2, "0")}</span>{chapter.title}</button></li>;
        })}</ol></nav> : <>{page.id === "buildings-2" ? <div className="book-cost-table" aria-label="Tabela de custos das construções">{(["road", "settlement", "city", "development"] as const).map(kind => <div key={kind}><strong>{({ road: "Estrada", settlement: "Assentamento", city: "Cidade", development: "Carta" } as const)[kind]}</strong><Cost kind={kind} /></div>)}</div> : <ManualIllustration kind={page.visual} />}<ul>{page.points.map(point => <li key={point}>{point}</li>)}</ul></>}
      </div>
      <span className="book-page-number">{index + 1}</span>
    </section>;
  }

  const leftPage = turningPage
    ? turningPage.mobile || turningPage.direction === "backward" ? turningPage.to : turningPage.from
    : manualPage;
  const rightPage = turningPage
    ? turningPage.mobile || turningPage.direction === "forward" ? turningPage.to + 1 : turningPage.from + 1
    : manualPage + 1;
  const turnFront = turningPage
    ? turningPage.mobile || turningPage.direction === "backward" ? turningPage.from : turningPage.from + 1
    : 0;
  const turnBack = turningPage
    ? turningPage.mobile || turningPage.direction === "forward" ? turningPage.to : turningPage.to + 1
    : 0;

  return <>
    <div className="game-box" aria-label="Caixa do jogo Catan aberta">
      <div className="box-lid" aria-hidden="true"><span>CATAN</span><i /></div>
      <div className="box-rim"><span>CATAN</span><small>TOQUE NAS PEÇAS PARA CONHECER O JOGO</small></div>
      <div className="box-tray">
        <div className={`box-compartment box-manual ${topic === "manual" ? "book-is-away" : ""}`}><div className="box-book" ref={boxBookRef}><span className="book-spine" /><span className="book-cover"><small>GUIA DE REGRAS</small><strong>CATAN</strong><i>✦</i></span></div><button className="box-open" data-tooltip="Manual de Regras" data-hint="Clique para abrir o manual" onClick={() => open("manual")} aria-label="Abrir manual de regras"><span>Manual de regras</span></button></div>
        <div className="box-compartment box-pieces"><div className="box-piece-set">{(["road","settlement","city","road","settlement"] as const).map((kind,index) => <span className={`box-piece piece-${kind}`} style={{ color: colorValue[["coral","amber","teal","blue","rose"][index]] }} key={`${kind}-${index}`}><BuildIcon kind={kind} /></span>)}</div><button className="box-open" data-tooltip="Peças dos jogadores" data-hint="Clique para saber mais" onClick={() => open("pieces")} aria-label="Conhecer as peças dos jogadores"><span>Peças dos jogadores</span></button></div>
        <div className="box-compartment box-development"><div className="box-stack"><span /><span /><span className="box-card-art" /></div><button className="box-open" data-tooltip="Cartas de desenvolvimento" data-hint="Clique para saber mais" onClick={() => open("development")} aria-label="Conhecer as cartas de desenvolvimento"><span>Desenvolvimento</span></button></div>
        <div className="box-compartment box-awards"><div className="box-award-cards"><img src="/cards/awards/longest-road.jpg" alt="" loading="lazy" /><img src="/cards/awards/largest-army.jpg" alt="" loading="lazy" /></div><button className="box-open" data-tooltip="Cartas de título" data-hint="Clique para saber mais" onClick={() => open("awards")} aria-label="Conhecer as cartas de título"><span>Cartas de título</span></button></div>
        <div className="box-compartment box-resources"><div className="box-resource-cards">{RESOURCES.map((id,index) => <span key={id} style={{ rotate: `${(index-2)*-4}deg` }}><ResourceCard resource={id} compact /></span>)}</div><button className="box-open" data-tooltip="Cartas de recursos" data-hint="Clique para saber mais" onClick={() => open("resources")} aria-label="Conhecer os cinco recursos"><span>Cartas de recursos</span></button></div>
        <div className="box-compartment box-dice"><div className="box-dice-pair"><DiceFace value={3} /><DiceFace value={5} /></div><button className="box-open" data-tooltip="Dados" data-hint="Clique para saber mais" onClick={() => open("dice")} aria-label="Conhecer os dados e a produção"><span>Dados</span></button></div>
        <div className="box-compartment box-robber"><span className="box-robber-art" role="img" aria-label="Arte do ladrão usada no tabuleiro" /><button className="box-open" data-tooltip="Ladrão" data-hint="Clique para saber mais" onClick={() => open("robber")} aria-label="Conhecer a regra do ladrão"><span>Ladrão</span></button></div>
        <div className="box-compartment box-numbers"><div className="box-number-row">{[5,6,8,9,10,11].map(value => <Token key={value} value={value} />)}</div><button className="box-open" data-tooltip="Fichas de números" data-hint="Clique para saber mais" onClick={() => open("numbers")} aria-label="Conhecer as fichas numeradas"><span>Fichas numeradas</span></button></div>
      </div>
    </div>

    {topic && createPortal(<div className={`box-backdrop ${closing ? "leaving" : ""}`} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div className={`box-dialog ${topic === "manual" ? "manual-dialog" : ""}`} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="box-dialog-title">{topic !== "manual" && <header className="box-dialog-header"><div><small>CATAN · COMPONENTES</small><h2 id="box-dialog-title">{topics.find(item => item.id === topic)?.label}</h2></div><button ref={closeRef} className="box-close" onClick={close} aria-label="Fechar">×</button></header>}
      {topic === "pieces" && <div className="box-modal-grid pieces-detail">{pieces.map((piece,index) => <article key={piece.kind}><span className="piece-detail-icon" style={{ color: colorValue[["coral","amber","teal"][index]] }}><BuildIcon kind={piece.kind} /></span><h3>{piece.name}</h3><p><b>{piece.points}</b> · limite de {piece.limit}</p><Cost kind={piece.kind} /><p>{piece.rule}</p></article>)}<PlacementDiagram /><p className="box-wide-note">No tabuleiro, estradas ocupam arestas e casas ocupam vértices. O jogo também chama alguns caminhos de “pontes”, mas não há uma peça ou custo separado para pontes.</p></div>}
      {topic === "development" && <div className="dev-detail"><div className="dev-picker" role="group" aria-label="Selecionar carta de desenvolvimento">{development.map((card,index) => <button key={card.id} className={selectedDev === index ? "selected" : ""} aria-pressed={selectedDev === index} onClick={() => setSelectedDev(index)}><span className="dev-card-image" style={{ backgroundImage: `url(/cards/development/${card.id}.jpg)` }} /><span>{card.name}</span></button>)}</div><article className="dev-description"><h3>{development[selectedDev].name}</h3><p>{development[selectedDev].effect}</p><p>{development[selectedDev].detail}</p><p><b>Exemplo:</b> {development[selectedDev].example}</p><p className="box-rule-note">Cartas não pontuais recém-compradas não podem ser usadas no mesmo turno. Jogue no máximo uma por turno.</p><div className="box-cost-line"><strong>Custo da compra</strong><Cost kind="development" /></div></article></div>}
      {topic === "manual" && <div className="manual-book" ref={bookRef} data-phase={bookPhase}>
        <h2 id="box-dialog-title" className="book-dialog-title">Manual de Regras</h2>
        <button ref={closeRef} className="book-close" onClick={close} aria-label="Fechar manual">×</button>
        <div className="manual-cover" aria-hidden="true"><span className="book-spine" /><span className="book-cover"><small>GUIA DE REGRAS</small><strong>CATAN</strong><i>✦</i></span></div>
        <div className="manual-spread" data-turning={turningPage?.direction} onPointerDown={event => {
          if (event.pointerType !== "touch" || (event.target as HTMLElement).closest("button, a, input")) return;
          swipeRef.current = { x: event.clientX, y: event.clientY };
        }} onPointerUp={event => {
          const start = swipeRef.current;
          swipeRef.current = null;
          if (!start || Math.abs(event.clientY - start.y) > 85 || Math.abs(event.clientX - start.x) < 55) return;
          goToManualPage(manualPageRef.current + (event.clientX < start.x ? manualStep() : -manualStep()));
        }} onPointerCancel={() => { swipeRef.current = null; }}>
          {renderManualPage(leftPage, !!turningPage)}
          {renderManualPage(rightPage, !!turningPage)}
          {turningPage && <div className={`book-turn-sheet ${turningPage.direction}`} aria-hidden="true" inert onAnimationEnd={event => {
            if (event.target === event.currentTarget && event.animationName.startsWith("page-flip")) finishManualTurn(turningPage.to);
          }}>
            <div className="book-turn-face book-turn-front">{renderManualPage(turnFront, true)}</div>
            <div className="book-turn-face book-turn-back">{renderManualPage(turnBack, true)}</div>
          </div>}
          <button className="book-nav book-nav-prev" aria-label="Página anterior" disabled={manualPage === 0 || !!turningPage} onClick={() => goToManualPage(manualPage - manualStep())}>‹</button>
          <button className="book-nav book-nav-next" aria-label="Próxima página" disabled={manualPage + manualStep() >= manualPages.length || !!turningPage} onClick={() => goToManualPage(manualPage + manualStep())}>›</button>
          <button className="book-corner book-corner-prev" aria-label="Virar a página para trás" disabled={manualPage === 0 || !!turningPage} onClick={() => goToManualPage(manualPage - manualStep())} />
          <button className="book-corner book-corner-next" aria-label="Virar a página para frente" disabled={manualPage + manualStep() >= manualPages.length || !!turningPage} onClick={() => goToManualPage(manualPage + manualStep())} />
        </div>
        <span className="book-position" aria-live="polite">{manualStep() === 1 ? `Página ${manualPage + 1}` : `Páginas ${manualPage + 1}–${Math.min(manualPage + 2, manualPages.length)}`} de {manualPages.length}</span>
      </div>}
      {topic === "resources" && <div className="resource-detail"><div className="resource-picker" role="group" aria-label="Selecionar recurso">{RESOURCES.map(id => <ResourceCard key={id} resource={id} compact selected={selectedResource === id} onClick={() => setSelectedResource(id)} />)}</div><div className="resource-story"><div className="box-terrain" style={{ backgroundImage: `url(/board/${current.board}.jpg)` }} role="img" aria-label={`Terreno de ${current.terrain}`} /><div><h3>{resourceName[current.id]}</h3><p><b>Origem:</b> {current.terrain}.</p><p><b>Usado em:</b> {current.use.toLowerCase()}.</p><p>Um assentamento adjacente recebe uma carta quando o número desse terreno sai nos dados. Uma cidade recebe duas, se houver cartas no banco.</p></div></div><div className="resource-cost-table"><h3>Custos de construção</h3>{(["road","settlement","city","development"] as const).map(kind => <div key={kind}><b>{({road:"Estrada",settlement:"Assentamento",city:"Cidade",development:"Desenvolvimento"} as const)[kind]}</b><Cost kind={kind} /></div>)}</div></div>}
      {topic === "awards" && <div className="award-detail"><article><img src="/cards/awards/longest-road.jpg" alt="Carta A Estrada Mais Longa" loading="lazy" /><div><h3>Maior Estrada</h3><p>Uma rota contínua válida de pelo menos cinco segmentos. Vale 2 pontos de vitória e pode passar para quem superar o titular. Uma construção adversária pode interromper o caminho.</p></div></article><article><img src="/cards/awards/largest-army.jpg" alt="Carta Maior Exército" loading="lazy" /><div><h3>Maior Exército</h3><p>Use pelo menos três Cavaleiros. Vale 2 pontos e pode ser transferido quando outro jogador superar a quantidade usada pelo titular.</p></div></article><AwardDiagram /></div>}
      {topic === "dice" && <div className="dice-detail"><div className={`large-dice ${rolling ? "rolling" : ""}`}><DiceFace value={dice[0]} /><DiceFace value={dice[1]} /></div><button className="box-action" onClick={roll} disabled={rolling}>Lançar dados</button><p role="status">{total === 7 ? "Resultado 7: não há produção normal. Consulte o ladrão na caixa." : `Resultado ${total}: terrenos com a ficha ${total} produzem para construções adjacentes. Assentamentos recebem 1 carta; cidades, 2.`}</p><DiceMiniBoard total={total} /><p className="dice-production" role="status">{total === 7 ? "Nenhum terreno produz: o ladrão entra em ação." : [5,6,8,9,10].includes(total) ? `No exemplo, a ficha ${total} está destacada. Uma casa adjacente recebe 1 carta; uma cidade, 2.` : `Nenhuma ficha deste minitabuleiro mostra ${total}.`}</p></div>}
      {topic === "robber" && <div className="robber-detail"><span className="robber-portrait" role="img" aria-label="Ladrão ilustrado no tabuleiro" /><div><h3>Quando a soma é 7</h3><RobberSequence /><p>Ninguém produz. Jogadores com mais de sete cartas de recursos descartam metade, arredondada para baixo. Depois, o jogador ativo move o ladrão e pode roubar uma carta aleatória de um adversário elegível.</p><label htmlFor="box-card-count">Cartas na mão: <b>{cards}</b></label><input id="box-card-count" type="range" min="0" max="15" value={cards} onChange={event => setCards(Number(event.target.value))} /><p role="status">{cards > 7 ? `Descarte ${Math.floor(cards/2)} cartas.` : "Sem descarte."}</p><p>Mova o ladrão neste exemplo:</p><div className="robber-terrain-list">{resources.slice(0,3).map(item => <button key={item.id} aria-pressed={robberTerrain === item.id} onClick={() => setRobberTerrain(item.id)} style={{ backgroundImage: `url(/board/${item.board}.jpg)` }} aria-label={`Mover ladrão para ${item.terrain}`} />)}</div><p>{resources.find(item => item.id === robberTerrain)?.terrain} bloqueada. Casas vizinhas não recebem esse recurso. Uma carta de Cavaleiro também move o ladrão, mas não aciona descartes.</p></div></div>}
      {topic === "numbers" && <div className="number-detail"><p>As fichas numeradas indicam a soma que faz cada terreno produzir. Os pontos mostram quantas combinações dos dois dados chegam àquela soma. O 7 é a soma mais provável (6 combinações), mas aciona o ladrão em vez de produzir.</p><div className="number-picker">{[2,3,4,5,6,8,9,10,11,12].map(value => <button key={value} aria-pressed={selectedNumber === value} aria-label={`Selecionar ficha ${value}`} onClick={() => setSelectedNumber(value)}><Token value={value} /></button>)}</div><ProbabilityChart /><p role="status">O número <b>{selectedNumber}</b> pode sair de <b>{selectedNumber <= 7 ? selectedNumber-1 : 13-selectedNumber}</b> combinações dos dados. {selectedNumber === 6 || selectedNumber === 8 ? "É um dos resultados mais frequentes." : "O 7 não aparece em fichas: ele ativa o ladrão."}</p></div>}
    </div></div>, document.body)}
  </>;
}

export function BoxFAQ() {
  return <section className="box-faq" id="faq"><div><small>DÚVIDAS FREQUENTES</small><h2>Perguntas da mesa</h2></div><div className="box-faq-grid">{faqs.map(([question,answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>;
}
