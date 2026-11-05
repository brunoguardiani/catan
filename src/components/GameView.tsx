"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RoomSnapshot, ServerEvent } from "@/lib/protocol";
import { createBoardFrame, createCoastline } from "@/game-engine/board-frame";
import { arrangeTableSeats } from "./table-seats";
import { zoomViewBox } from "./board-camera";
import { remainingPieces } from "./table-status";
import { bagTotal, emptyBag, RESOURCES, type AwardKind, type DevCard, type DevInHand, type GameAction, type GameEvent, type PublicGameState, type Resource, type ResourceBag } from "@/game-engine/types";
import { CardBack, ResourceCard, ResourceStack, TradeCardGroup, colorValue, resourceName } from "./GamePieces";
import BuildIcon from "./BuildIcon";
import BoardNumberToken from "./BoardNumberToken";
import { awardCards, awardKinds } from "./award-cards";
import StartingResults from "./StartingResults";
import PlayerHand from "./PlayerHand";
import HandAnimationController from "./HandAnimationController";
import AudioSettings from "./AudioSettings";
import { audioManager, defaultAudioPreferences, loadAudioPreferences, saveAudioPreferences, type AudioPreferences } from "./AudioManager";
import DiceTray from "./DiceTray";
import Die3D from "./Die3D";
import DiceFlight from "./DiceFlight";
import DicePhysicsDebug from "./DicePhysicsDebug";
import { dicePhysicsConfig } from "./dice-physics-config";
import "./game.css";
import "./game-enhancements.css";
import "./game-base-cards.css";
import "./game-table.css";
import "./game-card-stacks.css";
import "./game-full-table.css";
import "./dice-3d.css";
import "./hands.css";
import "./hand-motion.css";
import "./audio-settings.css";
import "./development-actions.css";

type ChatItem = Extract<ServerEvent, { type: "chat:message" }>;
type ReactionItem = Extract<ServerEvent, { type: "reaction:send" }>;
type Mode = "road" | "settlement" | "city" | null;
type Props = {
  room: RoomSnapshot;
  game: PublicGameState;
  meId: string;
  messages: ChatItem[];
  reaction: ReactionItem | null;
  onAction: (action: GameAction) => void;
  onCommand: (command: Record<string, unknown>) => void;
  onLeave: () => void;
};

const terrainName: Record<string, string> = { wood: "Floresta", brick: "Colina", wool: "Pastagem", wheat: "Campo", ore: "Montanha", desert: "Deserto" };
const cardName: Record<string, string> = { knight: "Cavaleiro", road_building: "Construção de estradas", year_plenty: "Ano de abundância", monopoly: "Monopólio", victory: "Ponto de vitória" };
const devCardKinds: DevCard[] = ["knight", "road_building", "year_plenty", "monopoly", "victory"];
const cardDescription: Record<string, string> = { knight: "Mova o ladrão e conte um cavaleiro para disputar o maior exército.", road_building: "Construa até duas estradas sem pagar recursos, respeitando os espaços válidos.", year_plenty: "Escolha um recurso e receba duas cartas desse tipo do banco.", monopoly: "Escolha um recurso e receba todas as cartas desse tipo dos adversários.", victory: "Use quando seus pontos visíveis somados às suas cartas de ponto de vitória alcançarem o objetivo para vencer." };
const tableReactions = [
  { value: "🤬", label: "Xingar" },
  { value: "🙂", label: "Sorrir" },
  { value: "❤️", label: "Coração" },
  { value: "🤣", label: "Gargalhar" },
] as const;

function AwardHand({ playerId, playerName, game, hiddenAward, hiddenDevCount = 0, onPreview }: { playerId: string; playerName: string; game: PublicGameState; hiddenAward: AwardKind | null; hiddenDevCount?: number; onPreview: (award: AwardKind) => void }) {
  const owned = awardKinds.filter(kind => (kind === "longestRoad" ? game.longestRoadOwner : game.largestArmyOwner) === playerId);
  return <div className={`table-award-hand${owned.length ? " has-awards" : ""}${hiddenDevCount ? " has-development" : ""}`} style={{ "--dev-index": owned.length } as CSSProperties} aria-label={`Cartas de título e desenvolvimento de ${playerName}`}>
    {awardKinds.map(kind => {
      const owner = kind === "longestRoad" ? game.longestRoadOwner : game.largestArmyOwner;
      const card = awardCards[kind];
      const position = owned.includes(kind) ? owned.indexOf(kind) : kind === "longestRoad" ? 0 : owned.length;
      return <span key={kind} className="table-award-slot" data-award-slot={`${playerId}:${kind}`} style={{ "--award-index": position } as CSSProperties}>
        {owner === playerId && <button type="button" className={`table-award-card${hiddenAward === kind ? " in-flight" : ""}`} style={{ backgroundImage: `url('${card.image}')` }} title={`${card.title} · 2 pontos`} aria-label={`${card.title} de ${playerName}, 2 pontos de vitória. Ampliar carta`} onClick={() => onPreview(kind)} />}
      </span>;
    })}
    {hiddenDevCount > 0 && <div data-dev-hand={playerId} className="table-award-development" aria-label={`${hiddenDevCount} cartas de desenvolvimento ocultas de ${playerName}`}><CardBack count={hiddenDevCount} /></div>}
  </div>;
}

function randomKey(event: React.KeyboardEvent<SVGElement>, run: () => void) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(); } }

export default function GameView({ room, game, meId, messages, reaction, onAction, onCommand, onLeave }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [discard, setDiscard] = useState<ResourceBag>(emptyBag());
  const [tradeGive, setTradeGive] = useState<ResourceBag>(emptyBag());
  const [tradeWant, setTradeWant] = useState<ResourceBag>(emptyBag());
  const [target, setTarget] = useState("");
  const [bankGive, setBankGive] = useState<Resource>("wood");
  const [bankReceive, setBankReceive] = useState<Resource>("ore");
  const [devChoice, setDevChoice] = useState<{ cardId: string; kind: "monopoly" | "year_plenty" } | null>(null);
  const [monopolyFlights, setMonopolyFlights] = useState<{ id: string; resource: Resource; count: number; x: number; y: number; dx: number; dy: number }[]>([]);
  const [zoom, setZoom] = useState(1.06);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [helpOpen, setHelpOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [piecesOpen, setPiecesOpen] = useState(false);
  const [buildMenuOpen, setBuildMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [chatFlash, setChatFlash] = useState(false);
  const [devReveal, setDevReveal] = useState<DevInHand | null>(null);
  const [devFlight, setDevFlight] = useState<{ card: DevInHand | null; fromX: number; fromY: number; toX: number; toY: number; leaving: boolean } | null>(null);
  const [diceStage, setDiceStage] = useState<"rolling" | "reveal" | "docking" | "docked">("docked");
  const [preferences, setPreferences] = useState<AudioPreferences>(defaultAudioPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [handEvent, setHandEvent] = useState<GameEvent | null>(null);
  const [punchCooling, setPunchCooling] = useState(false);
  const [diceDock, setDiceDock] = useState<{ rollId: string; left: number; top: number; landX: number; landY: number } | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [awardPreview, setAwardPreview] = useState<{ kind: AwardKind; collectible: boolean } | null>(null);
  const [awardCollectFlight, setAwardCollectFlight] = useState<{ kind: AwardKind; fromX: number; fromY: number; toX: number; toY: number; width: number; height: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const devDeckRef = useRef<HTMLDivElement | null>(null);
  const devHandRef = useRef<HTMLDivElement | null>(null);
  const dragged = useRef(false);
  const seenRoll = useRef(game.lastRoll?.id ?? null);
  const seenGameEvent = useRef(game.events.at(-1)?.id ?? null);
  const lastRollId = game.lastRoll?.id ?? null;
  const visibleDiceStage = lastRollId && seenRoll.current !== lastRollId ? "rolling" : diceStage;
  const seenOffer = useRef<string | null>(null);
  const seenCounters = useRef<Set<string>>(new Set());
  const seenChat = useRef(messages.at(-1)?.id ?? null);
  const chatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awardCollectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const punchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monopolyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenDev = useRef(new Set(game.myDev.map(card => card.id)));
  const seenDevCounts = useRef({ ...game.devCounts });
  const lastMessageId = messages.at(-1)?.id ?? null;
  const me = room.players.find(player => player.id === meId)!;
  const expandedMap = Object.keys(game.board.hexes).length > 19;
  const tableSeats = arrangeTableSeats(game.seatOrder, meId, expandedMap);
  const activeHandIds = new Set<string>();
  if (handEvent?.effect?.kind === "table_punch") activeHandIds.add(handEvent.effect.playerId);
  else if (handEvent?.effect?.kind === "trade_accepted" || handEvent?.effect?.kind === "premium_refused") {
    activeHandIds.add(handEvent.effect.from);
    activeHandIds.add(handEvent.effect.to);
  }
  else if (handEvent?.effect?.kind === "award_transferred") activeHandIds.add(handEvent.effect.to);
  const playerColors = useMemo(() => Object.fromEntries(room.players.map(player => [player.id, player.color])), [room.players]);
  const diceSeat = tableSeats.find(seat => seat.id === game.lastRoll?.playerId)?.position ?? "self";
  const startingDice: Record<string, [number, number]> = {};
  for (const round of game.startingRoll.history) Object.assign(startingDice, round.rolls);
  Object.assign(startingDice, game.startingRoll.rolls);
  const myTurn = game.currentPlayerId === meId;
  const victoryCardCount = game.myDev.filter(card => card.kind === "victory").length;
  const canClaimVictory = myTurn && ["before_roll", "actions"].includes(game.phase) && (game.scores[meId] ?? 0) + victoryCardCount >= game.victoryTarget;
  const visibleDevCards = game.myDev.filter(card => card.id !== devReveal?.id && card.id !== devFlight?.card?.id);
  const devGroups = devCardKinds.flatMap(kind => {
    const cards = visibleDevCards.filter(card => card.kind === kind);
    if (!cards.length) return [];
    const playable = kind === "victory" ? cards[0] : cards.find(card => card.boughtTurn !== game.turn);
    return [{ kind, count: cards.length, cardId: playable?.id ?? null }];
  });
  const shownScores = game.phase === "finished" && game.finalScores ? game.finalScores : game.scores;
  const rankedPlayers = [...room.players].sort((a, b) => (shownScores[b.id] ?? 0) - (shownScores[a.id] ?? 0) || game.seatOrder.indexOf(a.id) - game.seatOrder.indexOf(b.id));
  const canPunch = Boolean(game.board.hexes[game.robberHex]?.vertices.some(vertexId => game.structures[vertexId]?.owner === meId));
  const diceTurn = game.phase === "choose_first_player" || game.phase === "before_roll";
  const showDiceTray = diceTurn && (!lastRollId || visibleDiceStage === "docked");
  const showBoardDice = Boolean(game.lastRoll && (visibleDiceStage !== "docked" || !diceTurn || game.lastRoll.playerId === game.currentPlayerId));
  const diceStyle = diceDock && diceDock.rollId === lastRollId ? {
    left: diceDock.left, top: diceDock.top,
    transform: "translate(-50%, -50%) scale(.93)",
    "--dock-offset-x": `${diceDock.landX - diceDock.left}px`,
    "--dock-offset-y": `${diceDock.landY - diceDock.top}px`,
  } as CSSProperties : undefined;
  const myDiscard = game.discardRequired[meId] ?? 0;
  const discardTotal = RESOURCES.reduce((sum, resource) => sum + discard[resource], 0);
  const canUseBoard = myTurn && ["setup_settlement", "setup_road", "move_robber", "before_roll", "actions"].includes(game.phase);
  const coastEdges = Object.values(game.board.edges).filter(edge => edge.hexes.length === 1);
  const frame = createBoardFrame(game.board);
  const coast = createCoastline(game.board);
  const framePoints = frame.points.map(point => `${point.x},${point.y}`).join(" ");
  const framePath = `M ${frame.points.map(point => `${point.x} ${point.y}`).join(" L ")} Z ${coast.path}`;
  const viewBox = frame.viewBox;
  const cameraViewBox = zoomViewBox(viewBox, zoom);

  function clickVertex(id: string) {
    if (!canUseBoard || dragged.current) return;
    if (game.phase === "setup_settlement" && game.legal.vertices.includes(id)) onAction({ type: "setup:settlement", vertexId: id });
    if (game.phase === "actions" && mode === "settlement" && game.legal.vertices.includes(id)) { onAction({ type: "build:settlement", vertexId: id }); setMode(null); }
    if (game.phase === "actions" && mode === "city" && game.structures[id]?.owner === meId && game.structures[id]?.kind === "settlement") { onAction({ type: "build:city", vertexId: id }); setMode(null); }
  }
  function clickEdge(id: string) {
    if (!canUseBoard || dragged.current) return;
    if (game.phase === "setup_road" && game.legal.edges.includes(id)) onAction({ type: "setup:road", edgeId: id });
    if (game.phase === "before_roll" && game.freeRoads > 0 && game.legal.edges.includes(id)) onAction({ type: "build:road", edgeId: id });
    if (game.phase === "actions" && (mode === "road" || game.freeRoads > 0) && game.legal.edges.includes(id)) { onAction({ type: "build:road", edgeId: id }); if (game.freeRoads <= 1) setMode(null); }
  }
  function clickHex(id: string) {
    if (!dragged.current && myTurn && game.phase === "move_robber" && game.legal.hexes.includes(id)) onAction({ type: "robber:move", hexId: id });
  }
  function playDev(cardId: string, kind: string) {
    if (kind === "monopoly" || kind === "year_plenty") { setDevChoice({ cardId, kind }); return; }
    onAction({ type: "dev:play", cardId });
  }
  function chooseDevResource(resource: Resource) {
    if (!devChoice) return;
    onAction({ type: "dev:play", cardId: devChoice.cardId, ...(devChoice.kind === "monopoly" ? { resource } : { resources: [resource, resource] as [Resource, Resource] }) });
    setDevChoice(null);
  }
  const playerName = (id: string) => room.players.find(player => player.id === id)?.nickname ?? "Jogador";
  const rate = game.board.vertices && Object.entries(game.structures).some(([id, building]) => building.owner === meId && game.board.vertices[id]?.port === bankGive)
    ? 2 : Object.entries(game.structures).some(([id, building]) => building.owner === meId && game.board.vertices[id]?.port === "any") ? 3 : 4;
  const incomingOffer = game.pendingTrade && game.pendingTrade.from !== meId && (!game.pendingTrade.to || game.pendingTrade.to === meId) && !game.tradeDeclines.includes(meId) ? game.pendingTrade : null;
  const incomingCounters = useMemo(() => myTurn ? game.counterOffers.filter(offer => offer.to === meId) : [], [game.counterOffers, meId, myTurn]);
  const tradeTarget = myTurn ? target : game.currentPlayerId;
  const blockedTarget = Boolean(tradeTarget && game.tradeBlocks.some(block => block.from === meId && block.to === tradeTarget && block.turn === game.turn));
  const canComposeTrade = game.phase === "actions" && !game.pairedTurn;
  const canOfferSelected = Boolean(tradeTarget) && !blockedTarget && bagTotal(tradeGive) > 0 && bagTotal(tradeWant) > 0
    && RESOURCES.every(resource => tradeGive[resource] <= game.myResources[resource]
      && tradeWant[resource] <= (game.playerResources[tradeTarget]?.[resource] ?? 0)
      && !(tradeGive[resource] > 0 && tradeWant[resource] > 0));

  function selectTableCard(playerId: string, resource: Resource) {
    if (!canComposeTrade) return;
    if (playerId === meId) {
      if (tradeWant[resource] > 0 || tradeGive[resource] >= game.myResources[resource]) return;
      setTradeGive(current => ({ ...current, [resource]: current[resource] + 1 }));
    } else {
      if (tradeGive[resource] > 0 || (!myTurn && game.currentPlayerId !== playerId)) return;
      if (myTurn && target !== playerId) {
        setTarget(playerId);
        setTradeWant({ ...emptyBag(), [resource]: 1 });
      } else {
        if (tradeWant[resource] >= (game.playerResources[playerId]?.[resource] ?? 0)) return;
        setTradeWant(current => ({ ...current, [resource]: current[resource] + 1 }));
      }
    }
  }

  function selectDiscardCard(resource: Resource) {
    setDiscard(current => {
      if (bagTotal(current) >= myDiscard || current[resource] >= game.myResources[resource]) return current;
      return { ...current, [resource]: current[resource] + 1 };
    });
  }

  function clearTradeSelection() { setTradeGive(emptyBag()); setTradeWant(emptyBag()); }
  function closeDevReveal() {
    if (!devReveal) return;
    const rect = devHandRef.current?.getBoundingClientRect();
    const toX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const toY = rect ? rect.top + rect.height / 2 : window.innerHeight - 80;
    setDevFlight({ card: devReveal, fromX: window.innerWidth / 2, fromY: window.innerHeight / 2, toX, toY, leaving: true });
    setDevReveal(null);
    if (devTimer.current) clearTimeout(devTimer.current);
    devTimer.current = setTimeout(() => { setDevFlight(null); devTimer.current = null; }, 700);
  }
  function closeAwardPreview() {
    if (!awardPreview) return;
    const { kind, collectible } = awardPreview;
    const owner = kind === "longestRoad" ? game.longestRoadOwner : game.largestArmyOwner;
    if (collectible && owner === meId && !preferences.reduceMotion) {
      const card = document.querySelector<HTMLElement>(".award-preview-image")?.getBoundingClientRect();
      const slot = [...(tableRef.current?.querySelectorAll<HTMLElement>("[data-award-slot]") ?? [])]
        .find(item => item.dataset.awardSlot === `${meId}:${kind}`)?.getBoundingClientRect();
      if (card && slot) {
        setAwardCollectFlight({ kind, fromX: card.left + card.width / 2, fromY: card.top + card.height / 2, toX: slot.left + slot.width / 2, toY: slot.top + slot.height / 2, width: card.width, height: card.height, scale: slot.width / card.width });
        if (awardCollectTimer.current) clearTimeout(awardCollectTimer.current);
        awardCollectTimer.current = setTimeout(() => { setAwardCollectFlight(null); awardCollectTimer.current = null; }, 700);
      }
    }
    setAwardPreview(null);
  }
  function flashChat() {
    if (chatTimer.current) clearTimeout(chatTimer.current);
    setChatFlash(true);
    chatTimer.current = setTimeout(() => { setChatFlash(false); chatTimer.current = null; }, 3000);
  }
  function updatePreferences(next: AudioPreferences) {
    setPreferences(next);
    saveAudioPreferences(next);
    audioManager.setPreferences(next);
  }
  function punchTable() {
    if (punchCooling || !canPunch) return;
    onAction({ type: "social:punch" });
    setPunchCooling(true);
    if (punchTimer.current) clearTimeout(punchTimer.current);
    punchTimer.current = setTimeout(() => { setPunchCooling(false); punchTimer.current = null; }, 8000);
  }

  useEffect(() => {
    if (!lastRollId || seenRoll.current === lastRollId) return;
    seenRoll.current = lastRollId;
    setDiceStage("rolling");
  }, [lastRollId]);

  useEffect(() => { const saved = loadAudioPreferences(); setPreferences(saved); audioManager.setPreferences(saved); }, []);

  useEffect(() => {
    const unlock = () => { void audioManager.unlock(); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);
  useEffect(() => () => { void audioManager.suspend(); }, []);

  const finishHandEvent = useCallback(() => {
    if (handEvent?.effect?.kind === "award_transferred" && handEvent.effect.to === meId) setAwardPreview({ kind: handEvent.effect.award, collectible: true });
    setHandEvent(null);
  }, [handEvent, meId]);
  useEffect(() => { if (preferences.reduceMotion && handEvent) finishHandEvent(); }, [preferences.reduceMotion, handEvent, finishHandEvent]);
  useEffect(() => {
    const latest = game.events.at(-1);
    if (!latest || latest.id === seenGameEvent.current) return;
    const previous = game.events.findIndex(item => item.id === seenGameEvent.current);
    const fresh = game.events.slice(previous < 0 ? -1 : previous + 1);
    seenGameEvent.current = latest.id;
    for (const item of fresh) {
      const effect = item.effect;
      if (!effect) continue;
      if (effect.kind === "cue") {
        if (effect.cue === "turn" && effect.playerId !== meId) continue;
        if (effect.cue === "offer" && effect.playerId === meId) continue;
        if (effect.cue === "dice") { if (effect.playerId !== meId) audioManager.play("diceThrow"); }
        else audioManager.play(effect.cue);
        if (effect.cue === "victory") audioManager.play("fireworks", .35);
        if ((effect.cue === "longestRoad" || effect.cue === "largestArmy") && effect.playerId === meId) setAwardPreview({ kind: effect.cue, collectible: true });
      } else if (effect.kind === "trade_accepted") {
        if (!preferences.reduceMotion) setHandEvent(item);
        else audioManager.play("trade");
      } else if (effect.kind === "monopoly") {
        audioManager.play("cardGrab", .55);
        if (monopolyTimer.current) clearTimeout(monopolyTimer.current);
        const table = tableRef.current;
        const target = [...(table?.querySelectorAll<HTMLElement>("[data-player-seat]") ?? [])].find(seat => seat.dataset.playerSeat === effect.playerId)?.getBoundingClientRect();
        if (table && target && !preferences.reduceMotion) {
          const bounds = table.getBoundingClientRect();
          const destination = { x: target.left + target.width / 2 - bounds.left, y: target.top + target.height / 2 - bounds.top };
          const flights = Object.entries(effect.taken).flatMap(([id, count]) => {
            if (count <= 0) return [];
            const source = [...table.querySelectorAll<HTMLElement>("[data-player-seat]")].find(seat => seat.dataset.playerSeat === id)?.getBoundingClientRect();
            if (!source) return [];
            const x = source.left + source.width / 2 - bounds.left, y = source.top + source.height / 2 - bounds.top;
            return [{ id, resource: effect.resource, count, x, y, dx: destination.x - x, dy: destination.y - y }];
          });
          setMonopolyFlights(flights);
          monopolyTimer.current = setTimeout(() => { setMonopolyFlights([]); monopolyTimer.current = null; }, 1150);
        }
      } else if (effect.kind === "award_transferred") {
        if (!preferences.reduceMotion) setHandEvent(item);
        else { audioManager.play(effect.award); if (effect.to === meId) setAwardPreview({ kind: effect.award, collectible: true }); }
      } else if (effect.kind === "premium_refused" || effect.kind === "table_punch") {
        const visible = preferences.comicReactions || (effect.kind === "table_punch" ? effect.playerId === meId : effect.from === meId || effect.to === meId);
        if (visible && !preferences.reduceMotion) setHandEvent(item);
        else if (visible) audioManager.play(effect.kind === "table_punch" ? "punch" : "slap");
      }
    }
  }, [game.events, meId, preferences.reduceMotion, preferences.comicReactions]);

  useEffect(() => {
    if (handEvent?.effect?.kind !== "table_punch" || !preferences.tableShake || preferences.reduceMotion) return;
    const board = tableRef.current?.querySelector<HTMLElement>(".board-wrap");
    if (!board) return;
    board.classList.remove("table-shake");
    void board.offsetWidth;
    board.classList.add("table-shake");
    return () => board.classList.remove("table-shake");
  }, [handEvent?.id, preferences.tableShake, preferences.reduceMotion]);

  useEffect(() => {
    if (diceStage !== "reveal") return;
    const timer = setTimeout(() => setDiceStage("docking"), dicePhysicsConfig.resultHoldMs);
    return () => clearTimeout(timer);
  }, [diceStage, lastRollId]);

  useEffect(() => {
    if (diceStage !== "docking") return;
    const timer = setTimeout(() => setDiceStage("docked"), dicePhysicsConfig.returnMs);
    return () => clearTimeout(timer);
  }, [diceStage, lastRollId]);

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table || !game.lastRoll) return;
    const slot = [...table.querySelectorAll<HTMLElement>("[data-seat-dice]")].find(item => item.dataset.seatDice === game.lastRoll?.playerId);
    const board = table.querySelector<HTMLElement>(".board-wrap");
    if (!slot || !board) return;
    const measure = () => {
      const boardRect = board.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      const sourceX = (slotRect.left + slotRect.width / 2 - boardRect.left) / boardRect.width;
      const sourceY = (slotRect.top + slotRect.height / 2 - boardRect.top) / boardRect.height;
      setDiceDock(current => current && current.rollId === game.lastRoll!.id
        ? { ...current, left: slotRect.left + slotRect.width / 2 - boardRect.left, top: slotRect.top + slotRect.height / 2 - boardRect.top }
        : { rollId: game.lastRoll!.id, left: slotRect.left + slotRect.width / 2 - boardRect.left, top: slotRect.top + slotRect.height / 2 - boardRect.top, landX: sourceX * boardRect.width, landY: sourceY * boardRect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [lastRollId, game.phase, meId]);

  useEffect(() => {
    if (!game.pendingTrade && game.counterOffers.length === 0 && game.tradeBlocks.length === 0) { setProposalsOpen(false); return; }
    if (incomingOffer && seenOffer.current !== incomingOffer.id) {
      seenOffer.current = incomingOffer.id;
      setProposalsOpen(true);
      setContextOpen(true);
    }
    if (incomingCounters.some(offer => !seenCounters.current.has(offer.id))) { setProposalsOpen(true); setContextOpen(true); }
    for (const offer of incomingCounters) seenCounters.current.add(offer.id);
  }, [game.pendingTrade, game.counterOffers, game.tradeBlocks, incomingOffer, incomingCounters]);

  useEffect(() => { if (proposalsOpen) setContextOpen(true); }, [proposalsOpen]);

  useEffect(() => {
    const newCard = game.myDev.find(card => !seenDev.current.has(card.id));
    for (const card of game.myDev) seenDev.current.add(card.id);
    if (!newCard) return;
    const deck = devDeckRef.current?.getBoundingClientRect();
    const hand = devHandRef.current?.getBoundingClientRect();
    if (!deck || !hand) { setDevReveal(newCard); return; }
    setDevFlight({ card: newCard, fromX: deck.left + deck.width / 2, fromY: deck.top + deck.height / 2, toX: hand.left + hand.width / 2, toY: hand.top + hand.height / 2, leaving: false });
    if (devTimer.current) clearTimeout(devTimer.current);
    devTimer.current = setTimeout(() => { setDevFlight(null); setDevReveal(newCard); devTimer.current = null; }, 850);
  }, [game.myDev]);

  useEffect(() => {
    for (const [id, count] of Object.entries(game.devCounts)) {
      const previous = seenDevCounts.current[id] ?? count;
      seenDevCounts.current[id] = count;
      if (id === meId || count <= previous) continue;
      const deck = devDeckRef.current?.getBoundingClientRect();
      const hand = [...(tableRef.current?.querySelectorAll<HTMLElement>("[data-dev-hand]") ?? [])].find(element => element.dataset.devHand === id)?.getBoundingClientRect();
      if (!deck || !hand) continue;
      setDevFlight({ card: null, fromX: deck.left + deck.width / 2, fromY: deck.top + deck.height / 2, toX: hand.left + hand.width / 2, toY: hand.top + hand.height / 2, leaving: false });
      if (devTimer.current) clearTimeout(devTimer.current);
      devTimer.current = setTimeout(() => { setDevFlight(null); devTimer.current = null; }, 850);
      break;
    }
  }, [game.devCounts, meId]);

  useEffect(() => () => { if (devTimer.current) clearTimeout(devTimer.current); }, []);
  useEffect(() => () => { if (awardCollectTimer.current) clearTimeout(awardCollectTimer.current); }, []);

  useEffect(() => {
    if (!devReveal) return;
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeDevReveal(); };
    window.addEventListener("keydown", closeEscape);
    return () => window.removeEventListener("keydown", closeEscape);
  }, [devReveal]);

  useEffect(() => {
    if (!awardPreview) return;
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeAwardPreview(); };
    window.addEventListener("keydown", closeEscape);
    return () => window.removeEventListener("keydown", closeEscape);
  }, [awardPreview]);

  useEffect(() => {
    if (!buildMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".table-build-menu, .table-build-trigger")) setBuildMenuOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setBuildMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [buildMenuOpen]);

  useEffect(() => {
    if (!devChoice) return;
    if (!myTurn || !["before_roll", "actions"].includes(game.phase) || !game.myDev.some(card => card.id === devChoice.cardId)) { setDevChoice(null); return; }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDevChoice(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [devChoice, myTurn, game.phase, game.myDev]);

  useEffect(() => {
    if (!myTurn || game.phase !== "actions") setBuildMenuOpen(false);
  }, [myTurn, game.phase]);

  useEffect(() => {
    if (!contextOpen && !proposalsOpen && !pointsOpen && !piecesOpen && !helpOpen && !settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setContextOpen(false); setProposalsOpen(false); setPointsOpen(false); setPiecesOpen(false); setHelpOpen(false); setSettingsOpen(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [contextOpen, proposalsOpen, pointsOpen, piecesOpen, helpOpen, settingsOpen]);

  useEffect(() => {
    if (lastMessageId && lastMessageId !== seenChat.current) { seenChat.current = lastMessageId; flashChat(); }
  }, [lastMessageId]);

  useEffect(() => () => { if (chatTimer.current) clearTimeout(chatTimer.current); }, []);
  useEffect(() => () => { if (punchTimer.current) clearTimeout(punchTimer.current); }, []);
  useEffect(() => () => { if (monopolyTimer.current) clearTimeout(monopolyTimer.current); }, []);

  useEffect(() => {
    if (!restartOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setRestartOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [restartOpen]);

  return <section className="game-shell">
    <div className="game-topline">
      <div><span className="overline">SALA {room.code} · RODADA {game.round} {game.victoryTarget !== 10 ? `· REGRA DA CASA: ${game.victoryTarget} PONTOS` : ""}</span><h1>Catan</h1></div>
      <AudioSettings open={settingsOpen} preferences={preferences} canRestart={me.host} onToggle={() => { setSettingsOpen(value => !value); setPointsOpen(false); setPiecesOpen(false); setProposalsOpen(false); }} onChange={updatePreferences} onRestart={() => { setSettingsOpen(false); setRestartOpen(true); }} onLeave={onLeave} />
    </div>

    <div className="game-layout">
      <div className="game-main"><div className={`table-stage${game.seatOrder.length >= 5 ? " six-seats" : " edge-seats"}${expandedMap ? " expanded-map" : " standard-paired"}${preferences.reduceMotion ? " reduce-motion" : ""}`} aria-label="Mesa da partida" ref={tableRef}>
        <div className="board-wrap" onPointerDown={event => { if (!(event.target as Element).closest(".board-svg")) return; drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; dragged.current = false; }} onPointerMove={event => { if (!drag.current) return; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 5 && !dragged.current) { dragged.current = true; event.currentTarget.setPointerCapture(event.pointerId); } if (dragged.current) setPan({ x: drag.current.panX + dx, y: drag.current.panY + dy }); }} onPointerUp={() => { drag.current = null; setTimeout(() => { dragged.current = false; }, 0); }} onPointerCancel={() => { drag.current = null; dragged.current = false; }} onWheel={event => { if (event.ctrlKey) setZoom(value => Math.max(0.8, Math.min(2.2, value - event.deltaY * 0.002))); }}><div className="board-zoom"><button aria-label="Aproximar tabuleiro" onClick={() => setZoom(value => Math.min(2.2, value + 0.2))}>+</button><button aria-label="Afastar tabuleiro" onClick={() => setZoom(value => Math.max(0.8, value - 0.2))}>−</button><button aria-label="Centralizar tabuleiro" onClick={() => { setZoom(1.06); setPan({ x: 0, y: 0 }); }}>⌖</button><button aria-label="Ajuda para construir e comprar cartas" aria-expanded={helpOpen} onClick={() => setHelpOpen(value => !value)}>?</button></div><DicePhysicsDebug />
          {helpOpen && <div className="table-help" role="dialog" aria-label="Como construir"><button className="table-help-close" aria-label="Fechar ajuda" onClick={() => setHelpOpen(false)}>×</button><strong>Construções e cartas</strong><p><BuildIcon kind="settlement" /> Casa: selecione o ícone e toque em um terreno livre. <b>1 madeira, 1 tijolo, 1 lã, 1 trigo.</b></p><p><BuildIcon kind="city" /> Cidade: selecione o ícone e toque em uma casa sua. <b>3 minérios, 2 trigos.</b></p><p><BuildIcon kind="road" /> Ponte/estrada: selecione o ícone e toque em um caminho disponível. <b>1 madeira, 1 tijolo.</b></p><p><span className="table-help-card">✦</span> Desenvolvimento: abra o + junto ao seu jogador e escolha a carta. <b>1 minério, 1 lã, 1 trigo.</b></p></div>}
          <svg className="board-svg" viewBox={cameraViewBox} style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }} role="img" aria-label="Tabuleiro hexagonal interativo">
            <defs><filter id="piece-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.5" /></filter><linearGradient id="frame-water" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3f83c4" /><stop offset="0.52" stopColor="#448ecb" /><stop offset="1" stopColor="#236eaf" /></linearGradient><pattern id="frame-ripples" width="54" height="42" patternUnits="userSpaceOnUse"><path d="M4 14c9-4 18-4 27 0M23 35c8-3 16-3 24 0" fill="none" stroke="#d8e8f4" strokeWidth="2" opacity=".12" /></pattern></defs>
            <path d={framePath} fillRule="evenodd" className="map-water" />
            <path d={framePath} fillRule="evenodd" className="map-water-ripples" />
            <polygon points={framePoints} className="map-outer-edge" />
            <path d={coast.path} className="map-shore-sand" />
            <path d={coast.path} className="map-shore-foam" />
            {Object.values(game.board.hexes).map(hex => {
              const points = Array.from({ length: 6 }, (_, corner) => { const angle = (Math.PI / 180) * (60 * corner - 90); return `${hex.x + 67 * Math.cos(angle)},${hex.y + 67 * Math.sin(angle)}`; }).join(" ");
              const innerPoints = Array.from({ length: 6 }, (_, corner) => { const angle = (Math.PI / 180) * (60 * corner - 90); return `${hex.x + 54 * Math.cos(angle)},${hex.y + 54 * Math.sin(angle)}`; }).join(" ");
              const movable = myTurn && game.phase === "move_robber" && game.legal.hexes.includes(hex.id);
              return <g key={hex.id} onClick={() => clickHex(hex.id)} onKeyDown={event => randomKey(event, () => clickHex(hex.id))} tabIndex={movable ? 0 : undefined} role={movable ? "button" : undefined} aria-label={movable ? `Mover ladrão para ${terrainName[hex.terrain]}` : undefined} className={movable ? "hex-action" : ""}>
                <defs><clipPath id={`hex-mask-${hex.id}`} clipPathUnits="userSpaceOnUse"><polygon points={innerPoints} /></clipPath></defs>
                <polygon points={points} className="hex-tile-border" />
                <image href={`/board/${hex.terrain}.jpg`} x={hex.x - (hex.terrain === "desert" ? 122 : 183)} y={hex.y - (hex.terrain === "desert" ? 112 : 156)} width={hex.terrain === "desert" ? 244 : 366} height={hex.terrain === "desert" ? 224 : 312} preserveAspectRatio="none" clipPath={`url(#hex-mask-${hex.id})`} className="hex-art" />
                <polygon points={innerPoints} className="hex-tile-inner-line" />
                <polygon points={points} className={`hex hex-${hex.terrain} hex-painted`} />
                {hex.number && <BoardNumberToken value={hex.number} x={hex.x} y={hex.y} />}
                {game.robberHex === hex.id && <><defs><clipPath id={`robber-mask-${hex.id}`} clipPathUnits="userSpaceOnUse"><circle cx={hex.x + 27} cy={hex.y - 20} r="17" /></clipPath></defs><image href="/board/robber.jpg" x={hex.x + 0.5} y={hex.y - 41.5} width="53" height="43" preserveAspectRatio="none" clipPath={`url(#robber-mask-${hex.id})`} className="robber-art" /><circle cx={hex.x + 27} cy={hex.y - 20} r="17" className="robber-ring" /></>}
              </g>;
            })}
            {coastEdges.filter(edge => edge.port).map((edge, index) => {
              const land = game.board.hexes[edge.hexes[0]];
              const a = game.board.vertices[edge.a], b = game.board.vertices[edge.b];
              const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
              const port = edge.port!;
              const distance = Math.hypot(midX - land.x, midY - land.y);
              const ux = (midX - land.x) / distance, uy = (midY - land.y) / distance;
              const x = midX + ux * 31, y = midY + uy * 31;
              const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
              const tx = (b.x - a.x) / edgeLength, ty = (b.y - a.y) / edgeLength;
              const artFile = port === "any" ? null : ({ wood: "madeira", brick: "argila", wool: "ovelha", wheat: "trigo", ore: "pedra" } as Record<Resource, string>)[port];
              const artScale = 22 / 320, ore = port === "ore";
              const clipId = `port-art-${index}`;
              return <g key={`port-${edge.id}`} className="harbor" role="img" aria-label={`Porto ${port === "any" ? "geral, troca 3 por 1" : `${resourceName[port]}, troca 2 por 1`}`}>
                {[a, b].map((vertex, dock) => {
                  const endX = x + (dock === 0 ? -9 : 9) * tx;
                  const endY = y + (dock === 0 ? -9 : 9) * ty;
                  return <g key={dock}><line x1={vertex.x} y1={vertex.y} x2={endX} y2={endY} className="harbor-dock-shadow" /><line x1={vertex.x} y1={vertex.y} x2={endX} y2={endY} className="harbor-dock" /></g>;
                })}
                <rect x={x - 15} y={y - 21} width="30" height="41" rx="4" className="harbor-token" />
                {artFile ? <><defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={x - 11} y={y - 17} width="22" height="22" rx="2" /></clipPath></defs><image href={`/cards/base/${artFile}.jpg`} x={x - 11 - (ore ? 530 : 390) * artScale} y={y - 17 - (ore ? 180 : 320) * artScale} width={(ore ? 1376 : 1094) * artScale} height={(ore ? 768 : 976) * artScale} preserveAspectRatio="none" clipPath={`url(#${clipId})`} className="harbor-card-art" /></> : <text x={x} y={y - 4} textAnchor="middle" className="harbor-question">?</text>}
                <text x={x} y={y + 16} textAnchor="middle" className="harbor-ratio">{port === "any" ? "3:1" : "2:1"}</text>
              </g>;
            })}
            {Object.values(game.board.edges).map(edge => {
              const a = game.board.vertices[edge.a]; const b = game.board.vertices[edge.b];
              const owner = game.roads[edge.id];
              const available = canUseBoard && ((game.phase === "setup_road") || (game.phase === "before_roll" && game.freeRoads > 0) || (game.phase === "actions" && (mode === "road" || game.freeRoads > 0))) && game.legal.edges.includes(edge.id);
              return <g key={edge.id} onClick={() => clickEdge(edge.id)} onKeyDown={event => randomKey(event, () => clickEdge(edge.id))} tabIndex={available ? 0 : undefined} role={available ? "button" : undefined} aria-label={available ? "Construir estrada" : undefined} className={available ? "edge-action" : ""}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-hit" />
                {edge.port && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="port-edge" />}
                {available && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="edge-available" />}
                {owner && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorValue[room.players.find(p => p.id === owner)?.color ?? "coral"]} className="built-road" />}
              </g>;
            })}
            {Object.values(game.board.vertices).map(vertex => {
              const structure = game.structures[vertex.id];
              const available = canUseBoard && ((game.phase === "setup_settlement") || (game.phase === "actions" && mode === "settlement")) && game.legal.vertices.includes(vertex.id);
              const city = canUseBoard && game.phase === "actions" && mode === "city" && structure?.owner === meId && structure.kind === "settlement";
              const owner = room.players.find(p => p.id === structure?.owner);
              return <g key={vertex.id} onClick={() => clickVertex(vertex.id)} onKeyDown={event => randomKey(event, () => clickVertex(vertex.id))} tabIndex={available || city ? 0 : undefined} role={available || city ? "button" : undefined} aria-label={available ? "Construir assentamento" : city ? "Melhorar para cidade" : undefined} className={available || city ? "vertex-action" : ""}>
                {available && <circle cx={vertex.x} cy={vertex.y} r="11" className="vertex-available" />}
                {city && <circle cx={vertex.x} cy={vertex.y} r="13" className="vertex-city" />}
                {structure && <><circle cx={vertex.x} cy={vertex.y} r={structure.kind === "city" ? 12 : 9} fill={colorValue[owner?.color ?? "coral"]} className="structure" /><text x={vertex.x} y={vertex.y + 5} textAnchor="middle" className="structure-icon">{structure.kind === "city" ? "♜" : "⌂"}</text></>}
              </g>;
            })}
          </svg>
          {showBoardDice && game.lastRoll && <>
            {(visibleDiceStage === "rolling" || visibleDiceStage === "reveal") && <DiceFlight key={game.lastRoll.id} rollId={game.lastRoll.id} values={game.lastRoll.dice} throwData={game.lastRoll.throw ?? { x: .5, y: .5, vx: 0, vy: 0 }} soundEnabled reducedMotion={preferences.reduceMotion} onSettled={position => {
              setDiceDock(current => current && current.rollId === game.lastRoll!.id ? { ...current, landX: position.x, landY: position.y } : current);
              setDiceStage("reveal");
            }} />}
            {(visibleDiceStage === "docking" || visibleDiceStage === "docked") && <div className={`board-dice ${visibleDiceStage} dock-${diceSeat}`} style={diceStyle} aria-hidden="true">
              <span className="dice-pair"><Die3D value={game.lastRoll.dice[0]} /><Die3D value={game.lastRoll.dice[1]} /></span>
            </div>}
            <span className="sr-only" role="status" aria-live="polite">{visibleDiceStage === "rolling" ? "Dados rolando" : `${playerName(game.lastRoll.playerId)} tirou ${game.lastRoll.dice[0]} e ${game.lastRoll.dice[1]}`}</span>
          </>}
          <div className="board-legend"><span>♣ Madeira</span><span>◆ Tijolo</span><span>✿ Lã</span><span>✾ Trigo</span><span>▲ Minério</span></div>
        </div>
        <div className="table-hands-layer" aria-hidden="true">{tableSeats.map(({ id, position }) =>
          <div key={`resting-hands-${id}`} className={`table-resting-hands seat-${position}${room.players.find(player => player.id === id)?.connected ? "" : " disconnected"}${activeHandIds.has(id) ? " hand-in-action" : ""}`}>
            <span className="table-resting-hand left" />
            <span className="table-resting-hand right"><span className="table-hand-origin" data-resting-hands-player={id} data-hand-seat={position} /><span className="table-hand-origin punch" data-punch-hands-player={id} data-hand-seat={position} /></span>
          </div>
        )}</div>
        <HandAnimationController event={handEvent} tableRef={tableRef} colors={playerColors} roundOwnerId={game.mainPlayerId} onDone={finishHandEvent} />
        {tableSeats.map(({ id, position }) => {
          const player = room.players.find(item => item.id === id)!;
          const own = id === meId;
          const resources = game.playerResources[id] ?? emptyBag();
          const visibleResources = RESOURCES.filter(resource => resources[resource] > 0);
          const hasDiceTray = showDiceTray && id === game.currentPlayerId;
          const recordedDice = game.phase === "choose_first_player" && Boolean(startingDice[id]) && !hasDiceTray && (game.lastRoll?.playerId !== id || visibleDiceStage === "docked");
          const hiddenAward = handEvent?.effect?.kind === "award_transferred" && handEvent.effect.to === id ? handEvent.effect.award
            : own && awardPreview?.collectible ? awardPreview.kind : own ? awardCollectFlight?.kind ?? null : null;
          const awardHand = <AwardHand playerId={id} playerName={player.nickname} game={game} hiddenAward={hiddenAward} hiddenDevCount={own ? 0 : game.devCounts[id]} onPreview={kind => setAwardPreview({ kind, collectible: false })} />;
          return <section key={id} data-player-seat={id} className={`table-player seat-${position}${id === game.currentPlayerId ? " active" : ""}`} aria-label={`Lugar de ${player.nickname}`}>{game.phase === "discard" && game.discardRequired[id] > 0 && <span className="table-discard-wait" role="status">Esperando descarte...</span>}
            <div className="table-player-heading"><span className={`table-orb-anchor${buildMenuOpen && own ? " build-open" : ""}`}><PlayerHand playerId={id} color={player.color} name={`${player.nickname}${own ? " · você" : ""}`} position={position} active={id === game.currentPlayerId} connected={player.connected} self={own} />{reaction?.playerId === id && (preferences.comicReactions || own) && <span key={reaction.id} className={`table-reaction${reaction.reaction === "🤬" ? " angry" : ""}`} role="status" aria-label={`${player.nickname} reagiu ${reaction.reaction}`}><span className="reaction-face">{reaction.reaction}</span>{reaction.reaction === "🤬" && <strong>##$@#$!</strong>}</span>}{own && room.reactionsEnabled && <><button className="reaction-orb-trigger" aria-label="Mostrar reações" aria-expanded={reactionPickerOpen} onClick={() => setReactionPickerOpen(value => !value)} /><span className={`table-reaction-picker${reactionPickerOpen ? " open" : ""}`} aria-label="Reações da mesa">{tableReactions.map(item => <button key={item.value} title={item.label} aria-label={item.label} onClick={() => { onCommand({ type: "reaction:send", reaction: item.value }); setReactionPickerOpen(false); }}>{item.value}</button>)}</span></>}{own && myTurn && game.phase === "actions" && <><button className="table-build-trigger" aria-label="Abrir construções e desenvolvimento" aria-expanded={buildMenuOpen} onClick={() => { setBuildMenuOpen(value => !value); setReactionPickerOpen(false); }}>+</button>{buildMenuOpen && <div className="table-build-menu" role="menu" aria-label="Construir e comprar carta">{([ ["road", "Ponte ou estrada"], ["settlement", "Casa"], ["city", "Cidade"] ] as const).map(([kind, label]) => <button key={kind} role="menuitem" className={mode === kind ? "chosen" : ""} onClick={() => { setMode(mode === kind ? null : kind); setBuildMenuOpen(false); }}><BuildIcon kind={kind} /><span>{label}</span></button>)}<button role="menuitem" onClick={() => { onAction({ type: "dev:buy" }); setBuildMenuOpen(false); }}><span className="table-menu-dev-icon">✦</span><span>Pegar desenvolvimento</span></button></div>}</>}</span>{own && canPunch && <button type="button" className="table-punch-trigger table-player-punch" aria-label="Socar a mesa" title={punchCooling ? "Aguarde para socar novamente" : "Socar a mesa"} disabled={punchCooling} onClick={punchTable}>✊</button>}{!player.connected && <span className="table-player-status">offline</span>}</div>
            <div className="table-player-cards"><div className="table-resources" aria-label={`Recursos de ${player.nickname}`}>{visibleResources.length ? visibleResources.map(resource => <ResourceStack key={resource} resource={resource} count={resources[resource]} selected={own && game.phase === "discard" ? discard[resource] : own ? tradeGive[resource] : tradeTarget === id ? tradeWant[resource] : 0} onTake={own && game.phase === "discard" && myDiscard > 0 ? () => selectDiscardCard(resource) : canComposeTrade && (own || myTurn || game.currentPlayerId === id) ? () => selectTableCard(id, resource) : undefined} />) : <span className="table-empty-cards">Sem recursos</span>}</div>
              {awardHand}
              {own && <div ref={devHandRef} data-dev-hand={id} className="table-development own-development" aria-label="Suas cartas de desenvolvimento">{devGroups.map(group => <button key={group.kind} className="development-face" title={group.kind === "victory" && !canClaimVictory ? `Use ao alcançar ${game.victoryTarget} pontos somando suas cartas de ponto de vitória` : !group.cardId ? "Disponível no próximo turno" : `${cardName[group.kind]} · ${group.count} ${group.count === 1 ? "carta" : "cartas"}`} aria-label={`${cardName[group.kind]}, ${group.count} ${group.count === 1 ? "carta" : "cartas"}`} disabled={!myTurn || !["before_roll", "actions"].includes(game.phase) || !group.cardId || (group.kind === "victory" && !canClaimVictory)} onClick={() => { if (group.cardId) playDev(group.cardId, group.kind); }}><span className="development-art" style={{ backgroundImage: `url('/cards/development/${group.kind}.jpg')` }} aria-hidden="true" /><span className="development-count" aria-hidden="true">×{group.count}</span><strong>{cardName[group.kind]}</strong></button>)}</div>}
            </div>
            <div className={`seat-dice-slot${hasDiceTray || recordedDice ? " visible" : ""}${hasDiceTray ? " interactive-dice" : ""}`} data-seat-dice={id} role={recordedDice ? "status" : undefined} aria-label={recordedDice ? `${player.nickname} tirou ${startingDice[id][0]} e ${startingDice[id][1]}` : undefined}>{hasDiceTray ? <DiceTray key={`${id}:${lastRollId ?? "first"}`} fromPlayerId={game.lastRoll?.playerId !== id ? game.lastRoll?.playerId ?? null : null} active={own} onRoll={throwData => onAction({ type: game.phase === "choose_first_player" ? "start:roll" : "turn:roll", throw: throwData })} /> : recordedDice && <><Die3D value={startingDice[id][0]} /><Die3D value={startingDice[id][1]} /></>}</div>
          </section>;
        })}
        <div className="table-action-dock" aria-label="Comandos da partida">
          {myTurn && ["setup_settlement", "setup_road", "move_robber"].includes(game.phase) && <span className="table-phase-hint">{game.phase === "setup_settlement" ? "Escolha um lugar para a casa" : game.phase === "setup_road" ? "Escolha o caminho da ponte" : "Escolha o novo lugar do ladrão"}</span>}
          {myTurn && game.freeRoads > 0 && ["before_roll", "actions"].includes(game.phase) && <span className="table-phase-hint" role="status">Escolha no tabuleiro {game.freeRoads === 1 ? "uma ponte grátis" : `${game.freeRoads} pontes grátis`}. Os caminhos possíveis estão destacados.</span>}
        </div>
        {monopolyFlights.length > 0 && <div className="table-monopoly-flights" aria-hidden="true">{monopolyFlights.map(flight => <div key={flight.id} className="table-monopoly-flight" style={{ left: flight.x, top: flight.y, "--flight-x": `${flight.dx}px`, "--flight-y": `${flight.dy}px`, "--flight-mid-x": `${flight.dx * .5}px`, "--flight-mid-y": `${flight.dy * .35 - 45}px` } as CSSProperties}><ResourceCard resource={flight.resource} count={flight.count} compact /></div>)}</div>}
        {myTurn && game.phase === "actions" && <button type="button" className="table-end-turn" onClick={() => { onAction({ type: "turn:end" }); setMode(null); clearTradeSelection(); }}>{game.pairedTurn ? "Encerrar ação em dupla →" : "Encerrar turno →"}</button>}
        <div className="table-dev-deck" ref={devDeckRef} role="img" aria-label="Monte de cartas de desenvolvimento" />
        {game.phase === "choose_first_player" && <div className="table-starting-results"><StartingResults game={game} room={room} concealLastRoll={visibleDiceStage === "rolling"} /></div>}
        {game.phase === "discard" && myDiscard > 0 && <div className="table-trade-composer table-discard-composer" role="region" aria-label="Selecionar cartas para descarte">
          <div className="table-trade-heading"><strong>Descarte {myDiscard} {myDiscard === 1 ? "carta" : "cartas"}</strong><span>{discardTotal}/{myDiscard}</span></div>
          <p>Selecione as cartas na sua mão. Toque em uma carta abaixo para devolvê-la.</p>
          <div className="trade-selection-cards table-discard-cards" aria-label="Cartas selecionadas para descarte">
            {RESOURCES.flatMap(resource => Array.from({ length: discard[resource] }, (_, index) => <ResourceCard key={`${resource}-${index}`} resource={resource} compact ariaLabel={`Devolver ${resourceName[resource]} à mão`} onClick={() => setDiscard(current => ({ ...current, [resource]: Math.max(0, current[resource] - 1) }))} />))}
            {discardTotal === 0 && <small>Nenhuma carta selecionada.</small>}
          </div>
          <button className="table-make-offer" disabled={discardTotal !== myDiscard} onClick={() => { onAction({ type: "robber:discard", resources: discard }); setDiscard(emptyBag()); }}>Confirmar descarte</button>
        </div>}
        {game.phase === "choose_victim" && myTurn && <div className="table-special-panel"><strong>Escolha de quem roubar</strong>{game.robberVictims.map(id => <button key={id} onClick={() => onAction({ type: "robber:steal", victimId: id })}>{playerName(id)}</button>)}</div>}
        {game.phase === "actions" && (bagTotal(tradeGive) > 0 || bagTotal(tradeWant) > 0) && <div className="table-trade-composer" role="region" aria-label="Montar proposta"><div className="table-trade-heading"><strong>Montar proposta {tradeTarget ? `com ${playerName(tradeTarget)}` : ""}</strong><button onClick={clearTradeSelection}>Limpar</button></div><div className="table-trade-sides"><div><span>Você oferece</span><div className="trade-selection-cards">{RESOURCES.flatMap(resource => Array.from({ length: tradeGive[resource] }, (_, index) => <ResourceCard key={`${resource}-${index}`} resource={resource} compact ariaLabel={`Retirar ${resourceName[resource]} da oferta`} onClick={() => setTradeGive(current => ({ ...current, [resource]: Math.max(0, current[resource] - 1) }))} />))}</div></div><div><span>Você pede</span><div className="trade-selection-cards">{RESOURCES.flatMap(resource => Array.from({ length: tradeWant[resource] }, (_, index) => <ResourceCard key={`${resource}-${index}`} resource={resource} compact ariaLabel={`Retirar ${resourceName[resource]} do pedido`} onClick={() => setTradeWant(current => ({ ...current, [resource]: Math.max(0, current[resource] - 1) }))} />))}</div></div></div>{blockedTarget && <small className="premium-blocked">Recusa Premium: você poderá propor a este jogador na próxima jogada.</small>}{canOfferSelected && <button className="table-make-offer" disabled={myTurn && Boolean(game.pendingTrade)} onClick={() => { onAction({ type: "trade:offer", to: tradeTarget, give: tradeGive, want: tradeWant }); clearTradeSelection(); setProposalsOpen(true); }}>Fazer proposta</button>}{myTurn && game.pendingTrade && <small>Retire a oferta atual para enviar outra.</small>}</div>}
        <div className={`table-context-menu${contextOpen ? " open" : ""}`} aria-label="Informações da partida">
          <button type="button" className="table-context-handle" aria-expanded={contextOpen} aria-controls="table-context-content" aria-label={contextOpen ? "Recolher informações da partida" : "Expandir informações da partida"} onClick={() => setContextOpen(value => !value)}><span className="table-context-handle-arrow" aria-hidden="true">{contextOpen ? "›" : "‹"}</span><span>Informações</span>{!contextOpen && (game.pendingTrade || game.counterOffers.length > 0) && <b className="table-context-handle-notice" aria-hidden="true">!</b>}</button>
          <div id="table-context-content" className="table-context-content" hidden={!contextOpen}>
          <section className="table-context-section">
            <button type="button" className="table-context-toggle" aria-expanded={pointsOpen} aria-controls="table-points-list" onClick={() => setPointsOpen(value => !value)}><span>Pontos</span><span className="table-context-arrow" aria-hidden="true" /></button>
            {pointsOpen && <ol id="table-points-list" className="table-overview-list">{rankedPlayers.map((player, index) => <li key={player.id}><span className="table-overview-player"><i style={{ backgroundColor: colorValue[player.color] }} />{index === 0 && <span role="img" aria-label="Primeiro lugar">👑</span>}<strong>{player.nickname}</strong></span><b>{shownScores[player.id] ?? 0} PV</b></li>)}</ol>}
          </section>
          <section className="table-context-section">
            <button type="button" className="table-context-toggle" aria-expanded={piecesOpen} aria-controls="table-pieces-list" onClick={() => setPiecesOpen(value => !value)}><span>Construções pendentes</span><span className="table-context-arrow" aria-hidden="true" /></button>
            {piecesOpen && <ul id="table-pieces-list" className="table-overview-list table-pieces-list">{room.players.map(player => { const pieces = remainingPieces(game, player.id); return <li key={player.id}><span className="table-overview-player"><i style={{ backgroundColor: colorValue[player.color] }} /><strong>{player.nickname}</strong></span><span className="table-pieces-counts"><span aria-label={`${pieces.settlement} casas disponíveis`} title="Casas disponíveis"><BuildIcon kind="settlement" />×{pieces.settlement}</span><span aria-label={`${pieces.city} cidades disponíveis`} title="Cidades disponíveis"><BuildIcon kind="city" />×{pieces.city}</span><span aria-label={`${pieces.road} pontes ou estradas disponíveis`} title="Pontes e estradas disponíveis"><BuildIcon kind="road" />×{pieces.road}</span></span></li>; })}</ul>}
          </section>
          <section className="table-context-section">
            <button type="button" className="table-context-toggle" aria-expanded={proposalsOpen} onClick={() => setProposalsOpen(value => !value)}><span>Propostas da rodada</span><span className="table-context-count">{(game.pendingTrade ? 1 : 0) + game.counterOffers.length + game.tradeBlocks.length}</span><span className="table-context-arrow" aria-hidden="true" /></button>
        {proposalsOpen && <section className="table-proposals" aria-label="Propostas da rodada"><header><strong>Propostas da rodada</strong><button aria-label="Minimizar propostas" onClick={() => setProposalsOpen(false)}>−</button></header><div className="table-proposals-list">{!game.pendingTrade && game.counterOffers.length === 0 && game.tradeBlocks.length === 0 && <p className="table-no-proposals">Nenhuma proposta ainda. Escolha cartas na mesa para negociar.</p>}{game.pendingTrade && <article className="table-proposal"><strong>{playerName(game.pendingTrade.from)} propõe {game.pendingTrade.to ? `a ${playerName(game.pendingTrade.to)}` : "à mesa"}</strong><div className="trade-inbox-cards"><div><small>{playerName(game.pendingTrade.from)} oferece</small><TradeCardGroup cards={game.pendingTrade.give} /></div><div><small>Em troca de</small><TradeCardGroup cards={game.pendingTrade.want} /></div></div><p className="trade-inbox-summary">{RESOURCES.filter(resource => game.pendingTrade!.give[resource]).map(resource => `${game.pendingTrade!.give[resource]} ${resourceName[resource]}`).join(", ")} por {RESOURCES.filter(resource => game.pendingTrade!.want[resource]).map(resource => `${game.pendingTrade!.want[resource]} ${resourceName[resource]}`).join(", ")}.</p><div className="table-proposal-actions">{game.pendingTrade.from === meId && <button onClick={() => onAction({ type: "trade:cancel", offerId: game.pendingTrade!.id })}>Retirar</button>}{incomingOffer && <><button className="accept" onClick={() => { onAction({ type: "trade:accept", offerId: incomingOffer.id }); clearTradeSelection(); }}>Aceitar</button><button onClick={() => { onAction({ type: "trade:decline", offerId: incomingOffer.id }); clearTradeSelection(); }}>Recusar</button><button className="premium-refuse" onClick={() => { onAction({ type: "trade:premium_refuse", offerId: incomingOffer.id }); clearTradeSelection(); }}>Recusa Premium</button><button onClick={() => setProposalsOpen(false)}>Montar contraproposta</button></>}</div></article>}{game.counterOffers.map(offer => <article className="table-proposal" key={offer.id}><strong>{playerName(offer.from)} propõe a {playerName(offer.to ?? game.currentPlayerId)}</strong><div className="trade-inbox-cards"><div><small>{playerName(offer.from)} oferece</small><TradeCardGroup cards={offer.give} /></div><div><small>Em troca de</small><TradeCardGroup cards={offer.want} /></div></div><p className="trade-inbox-summary">{RESOURCES.filter(resource => offer.give[resource]).map(resource => `${offer.give[resource]} ${resourceName[resource]}`).join(", ")} por {RESOURCES.filter(resource => offer.want[resource]).map(resource => `${offer.want[resource]} ${resourceName[resource]}`).join(", ")}.</p><div className="table-proposal-actions">{myTurn && <><button className="accept" onClick={() => onAction({ type: "trade:accept", offerId: offer.id })}>Aceitar</button><button onClick={() => onAction({ type: "trade:decline", offerId: offer.id })}>Recusar</button><button className="premium-refuse" onClick={() => onAction({ type: "trade:premium_refuse", offerId: offer.id })}>Recusa Premium</button></>}{offer.from === meId && <button onClick={() => onAction({ type: "trade:cancel", offerId: offer.id })}>Retirar</button>}</div></article>)}{game.tradeBlocks.map(block => <p className="premium-blocked" key={`${block.from}:${block.to}`}>{playerName(block.to)} bloqueou propostas de {playerName(block.from)} até o fim desta jogada.</p>)}</div>{myTurn && game.phase === "actions" && <div className="table-bank-trade"><strong>Banco e portos</strong><select aria-label="Recurso entregue ao banco" value={bankGive} onChange={event => setBankGive(event.target.value as Resource)}>{RESOURCES.map(resource => <option key={resource} value={resource}>{resourceName[resource]}</option>)}</select><span>{rate}:1 →</span><select aria-label="Recurso recebido do banco" value={bankReceive} onChange={event => setBankReceive(event.target.value as Resource)}>{RESOURCES.map(resource => <option key={resource} value={resource}>{resourceName[resource]}</option>)}</select><button onClick={() => onAction({ type: "trade:bank", give: bankGive, receive: bankReceive })}>Trocar</button></div>}</section>}
          </section>
          </div>
        </div>
        {room.chatEnabled && <div className={`table-chat${chatFlash || chatDraft ? " visible" : ""}`} aria-label="Chat da mesa" onClick={() => { if (!chatFlash) flashChat(); }}><div className="table-chat-messages" role="log" aria-live="polite">{messages.slice(-5).map(item => <p key={item.id}><b>{item.nickname}:</b> {item.text}</p>)}</div><form onSubmit={event => { event.preventDefault(); if (chatDraft.trim()) { onCommand({ type: "chat:message", text: chatDraft.trim() }); setChatDraft(""); flashChat(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); } }}><input value={chatDraft} onChange={event => setChatDraft(event.target.value)} maxLength={280} placeholder="Mensagem para a mesa..." aria-label="Mensagem para a mesa" /><button aria-label="Enviar mensagem">➤</button></form></div>}
      </div>
      </div>
    </div>
    {devFlight && <div className={`dev-flight${devFlight.leaving ? " leaving" : ""}`} style={{ left: devFlight.fromX, top: devFlight.fromY, "--fly-x": `${devFlight.toX - devFlight.fromX}px`, "--fly-y": `${devFlight.toY - devFlight.fromY}px` } as CSSProperties} aria-hidden="true">{devFlight.card && <span className="development-art" style={{ backgroundImage: `url('/cards/development/${devFlight.card.kind}.jpg')` }} />}</div>}
    {devReveal && <div className="dev-reveal-backdrop" onClick={closeDevReveal}><div className="dev-reveal-card" role="dialog" aria-modal="true" aria-label={`Carta de desenvolvimento: ${cardName[devReveal.kind]}`} onClick={event => event.stopPropagation()}><span className="overline">NOVA CARTA DE DESENVOLVIMENTO</span><div className="dev-reveal-image" role="img" aria-label={`Ilustração de ${cardName[devReveal.kind]}`} style={{ backgroundImage: `url('/cards/development/${devReveal.kind}.jpg')` }} /><h2>{cardName[devReveal.kind]}</h2><p>{cardDescription[devReveal.kind]}</p><small>Clique fora da carta para guardá-la na sua mão.</small></div></div>}
    {awardCollectFlight && <div className="award-collect-flight" aria-hidden="true" style={{ left: awardCollectFlight.fromX, top: awardCollectFlight.fromY, width: awardCollectFlight.width, height: awardCollectFlight.height, backgroundImage: `url('${awardCards[awardCollectFlight.kind].image}')`, "--collect-x": `${awardCollectFlight.toX - awardCollectFlight.fromX}px`, "--collect-y": `${awardCollectFlight.toY - awardCollectFlight.fromY}px`, "--collect-scale": awardCollectFlight.scale } as CSSProperties} />}
    {awardPreview && <div className="dev-reveal-backdrop" onClick={closeAwardPreview}><div className="dev-reveal-card award-preview-card" role="dialog" aria-modal="true" aria-label={`Carta ${awardCards[awardPreview.kind].title}`} onClick={event => event.stopPropagation()}><button type="button" className="award-preview-close" aria-label={awardPreview.collectible ? "Guardar carta" : "Fechar carta"} onClick={closeAwardPreview}>×</button>{awardPreview.collectible && <span className="overline">CARTA CONQUISTADA</span>}<div className="award-preview-image" role="img" aria-label={awardCards[awardPreview.kind].title} style={{ backgroundImage: `url('${awardCards[awardPreview.kind].image}')` }} />{awardPreview.collectible && <small>Clique fora da carta para guardá-la junto à sua mão.</small>}</div></div>}
    {devChoice && <div className="dev-choice-backdrop" role="presentation" onClick={() => setDevChoice(null)}><div className="dev-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="dev-choice-title" onClick={event => event.stopPropagation()}><button type="button" className="dev-choice-close" aria-label="Cancelar escolha" onClick={() => setDevChoice(null)}>×</button><span className="overline">{cardName[devChoice.kind]}</span><h2 id="dev-choice-title">Escolha um recurso</h2><p>{devChoice.kind === "monopoly" ? "Todas as cartas desse recurso dos outros jogadores virão para você." : "Você receberá duas cartas desse recurso do banco."}</p><div className="dev-choice-grid">{RESOURCES.map(resource => <ResourceCard key={resource} resource={resource} count={devChoice.kind === "year_plenty" ? 2 : undefined} disabled={devChoice.kind === "year_plenty" && game.bank[resource] < 2} onClick={() => chooseDevResource(resource)} ariaLabel={`${resourceName[resource]}${devChoice.kind === "year_plenty" ? `, receber duas cartas${game.bank[resource] < 2 ? ", indisponível no banco" : ""}` : ", tomar dos outros jogadores"}`} />)}</div>{devChoice.kind === "year_plenty" && RESOURCES.some(resource => game.bank[resource] < 2) && <small>Recursos sem duas cartas no banco não podem ser escolhidos.</small>}</div></div>}
    {game.phase === "finished" && handEvent?.effect?.kind !== "award_transferred" && !awardPreview?.collectible && !awardCollectFlight && <div className={`game-victory${preferences.reduceMotion ? " reduce-motion" : ""}`}><div className="victory-fireworks" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -.31}s` }} />)}</div><div className="victory-ranking"><span className="overline">FIM DE PARTIDA</span><h2>Classificação final</h2><ol>{rankedPlayers.map((player, index) => <li key={player.id} className={player.id === game.winner ? "winner" : ""}><span className="victory-rank">{index + 1}º</span><span className="victory-name">{player.id === game.winner && <span className="victory-crown" aria-label="Vencedor">♛</span>}{player.nickname}</span><strong>{shownScores[player.id] ?? 0} pontos</strong></li>)}</ol>{me.host && <div className="victory-controls"><button onClick={() => setRestartOpen(true)}>↺ Reiniciar partida</button><button onClick={() => onCommand({ type: "game:rematch" })}>Voltar ao lobby</button></div>}</div></div>}
    {restartOpen && <div className="restart-modal-backdrop" onClick={() => setRestartOpen(false)}><div className="restart-modal" role="dialog" aria-modal="true" aria-labelledby="restart-title" onClick={event => event.stopPropagation()}>
      <span className="overline">CONFIRMAÇÃO</span><h2 id="restart-title">Reiniciar a partida?</h2><p>O progresso atual será apagado. Os mesmos jogadores e o mesmo mapa começarão de novo pela disputa inicial dos dados.</p>
      <div className="restart-modal-actions"><button autoFocus onClick={() => setRestartOpen(false)}>Cancelar</button><button className="confirm" onClick={() => { onCommand({ type: "game:restart" }); setRestartOpen(false); setMode(null); clearTradeSelection(); }}>Sim, reiniciar</button></div>
    </div></div>}
  </section>;
}
