"use client";

import { useEffect, useRef, useState } from "react";
import GameView from "@/components/GameView";
import { resourceName } from "@/components/GamePieces";
import { awardCards } from "@/components/award-cards";
import { RESOURCES, type AwardKind, type DevCard, type GameAction, type PublicGameState, type Resource } from "@/game-engine/types";
import type { TestCommand } from "@/game-engine/test-mode";
import type { RoomSnapshot } from "@/lib/protocol";
import "../lobby.css";
import "./test-lab.css";

type Snapshot = { sessionId: string; viewerId: string; room: RoomSnapshot; game: PublicGameState };
const players = [{ id: "test-a", name: "Jogador A" }, { id: "test-b", name: "Jogador B" }] as const;
const development: { id: DevCard; name: string }[] = [
  { id: "knight", name: "Cavaleiro" }, { id: "road_building", name: "Construção de estradas" },
  { id: "year_plenty", name: "Ano de abundância" }, { id: "monopoly", name: "Monopólio" },
  { id: "victory", name: "Ponto de vitória" },
];

export default function TestLab() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cardPlayer, setCardPlayer] = useState("test-a");
  const [resource, setResource] = useState<Resource>("wood");
  const [amount, setAmount] = useState(1);
  const [devCard, setDevCard] = useState<DevCard>("knight");
  const [from, setFrom] = useState("test-a");
  const [to, setTo] = useState("test-b");
  const [give, setGive] = useState<Resource>("wood");
  const [want, setWant] = useState<Resource>("brick");
  const sessionRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  async function send(command: TestCommand | { type: "reset" }, viewerId = snapshot?.viewerId ?? "test-a", close = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/test-game", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionRef.current, viewerId, command }),
      });
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível executar o teste.");
      sessionRef.current = data.sessionId;
      setSnapshot(data);
      if (close) setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha no modo de teste.");
      setOpen(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => { void send({ type: "reset" }); }, []);

  if (!snapshot) return <main className="test-loading"><strong>Preparando mesa de teste...</strong>{error && <p role="alert">{error}</p>}<a href="/">Voltar ao jogo</a></main>;

  const viewer = snapshot.viewerId;
  const count = snapshot.game.playerResources[cardPlayer]?.[resource] ?? 0;
  const playerName = (id: string) => players.find(player => player.id === id)?.name ?? id;
  const run = (command: TestCommand, close = false) => { void send(command, viewer, close); };
  const gameAction = (action: GameAction) => { void send({ type: "gameAction", actor: viewer, action }, viewer); };

  return <main className="site-shell in-game test-lab">
    <GameView key={viewer} room={snapshot.room} game={snapshot.game} meId={viewer} messages={[]} reaction={null} onAction={gameAction}
      onCommand={payload => { if (payload.type === "game:restart" || payload.type === "game:rematch") void send({ type: "reset" }, viewer); }}
      onLeave={() => { window.location.href = "/"; }} />
    <button type="button" className={`test-lab-toggle${error ? " has-error" : ""}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>🧪 Teste {open ? "×" : "☰"}</button>
    {open && <aside className="test-lab-panel" aria-label="Ferramentas de teste">
      <header><strong>Modo de teste</strong><small>Meta: {snapshot.game.victoryTarget} pontos</small></header>
      {error && <p className="test-lab-error" role="alert">{error}</p>}
      <label>Ver mesa como <select value={viewer} disabled={busy} onChange={event => { void send({ type: "view" }, event.target.value); }}>
        {players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
      </select></label>
      <button type="button" disabled={busy} onClick={() => run({ type: "setTurn", playerId: viewer })}>Dar a vez a {playerName(viewer)}</button>

      <section><h2>Cartas na mão</h2>
        <label>Jogador <select value={cardPlayer} onChange={event => setCardPlayer(event.target.value)}>{players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label>Recurso <select value={resource} onChange={event => setResource(event.target.value as Resource)}>{RESOURCES.map(kind => <option key={kind} value={kind}>{resourceName[kind]}</option>)}</select></label>
        <label>Quantidade <input type="number" min="1" max="100" value={amount} onChange={event => setAmount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
        <p>{playerName(cardPlayer)} tem <b>{count}</b> carta{count === 1 ? "" : "s"} de {resourceName[resource].toLowerCase()}.</p>
        <div className="test-lab-buttons"><button type="button" disabled={busy} onClick={() => run({ type: "cards", playerId: cardPlayer, resource, amount })}>+ Adicionar</button><button type="button" disabled={busy} onClick={() => run({ type: "cards", playerId: cardPlayer, resource, amount: -amount })}>− Retirar</button></div>
        <label>Desenvolvimento <select value={devCard} onChange={event => setDevCard(event.target.value as DevCard)}>{development.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={() => run({ type: "development", playerId: cardPlayer, card: devCard })}>Adicionar carta de desenvolvimento</button>
      </section>

      <section><h2>Animações e roubo</h2>
        <label>De <select value={from} onChange={event => { setFrom(event.target.value); setTo(event.target.value === "test-a" ? "test-b" : "test-a"); }}>{players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label>Para <select value={to} onChange={event => { setTo(event.target.value); setFrom(event.target.value === "test-a" ? "test-b" : "test-a"); }}>{players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label>Recurso enviado <select value={give} onChange={event => setGive(event.target.value as Resource)}>{RESOURCES.map(kind => <option key={kind} value={kind}>{resourceName[kind]}</option>)}</select></label>
        <label>Recurso recebido <select value={want} onChange={event => setWant(event.target.value as Resource)}>{RESOURCES.map(kind => <option key={kind} value={kind}>{resourceName[kind]}</option>)}</select></label>
        <div className="test-lab-buttons"><button type="button" disabled={busy} onClick={() => run({ type: "steal", from, to, resource: give, amount }, true)}>Roubar recurso</button><button type="button" disabled={busy} onClick={() => run({ type: "tradeAccepted", from, to, give, want, amount }, true)}>Troca aceita</button></div>
        <div className="test-lab-buttons"><button type="button" disabled={busy} onClick={() => run({ type: "premiumRefused", from, to, resource: give, amount }, true)}>Recusa Premium</button><button type="button" disabled={busy} onClick={() => run({ type: "punch", playerId: viewer }, true)}>Soco na mesa</button></div>
      </section>

      <section><h2>Cartas de título</h2><p>Escolha quem recebe. Para testar uma tomada, entregue primeiro ao outro jogador.</p>
        {(["longestRoad", "largestArmy"] as AwardKind[]).map(kind => <div className="test-lab-award" key={kind}><strong>{awardCards[kind].title}</strong><small>Com {playerName((kind === "longestRoad" ? snapshot.game.longestRoadOwner : snapshot.game.largestArmyOwner) ?? "ninguém")}</small><button type="button" disabled={busy} onClick={() => run({ type: "award", award: kind, to: viewer }, true)}>Dar / tomar para {playerName(viewer)}</button></div>)}
      </section>

      <section><h2>Dados e descarte</h2><div className="test-lab-buttons"><button type="button" disabled={busy} onClick={() => run({ type: "dice", playerId: viewer, dice: [3, 4] }, true)}>Lançar 7</button><button type="button" disabled={busy} onClick={() => run({ type: "dice", playerId: viewer, dice: [2, 5] }, true)}>Lançar 2 + 5</button></div><button type="button" disabled={busy} onClick={() => run({ type: "forceDiscard", playerId: viewer }, true)}>Forçar descarte após 7</button></section>
      <footer><button type="button" disabled={busy} onClick={() => { void send({ type: "reset" }, "test-a"); }}>Reiniciar teste</button><a href="/">Voltar ao jogo normal</a></footer>
    </aside>}
  </main>;
}
