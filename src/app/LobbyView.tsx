"use client";

import { useEffect, useRef, useState } from "react";
import type { Color, PublicPlayer, RoomSnapshot } from "@/lib/protocol";
import type { GameRules } from "@/game-engine/types";
import { CLASSIC_RULES } from "@/game-engine/configuration";
import LobbyMap from "./LobbyMap";
import LobbyMapEditor from "./LobbyMapEditor";

type ChatItem = { id: string; nickname: string; text: string; at: number };
const colors: { id: Color; label: string }[] = [
  { id: "coral", label: "Coral" }, { id: "amber", label: "Âmbar" }, { id: "teal", label: "Verde" },
  { id: "violet", label: "Violeta" }, { id: "blue", label: "Azul" }, { id: "rose", label: "Rosa" },
];
function initials(name: string) { return name.trim().split(/\s+/).map(word => word[0]).slice(0, 2).join("").toUpperCase(); }

export default function LobbyView({ room, me, connection, messages, error, send, onNickname, onLeave }: {
  room: RoomSnapshot; me?: PublicPlayer; connection: string; messages: ChatItem[]; error: string;
  send: (payload: Record<string, unknown>) => boolean; onNickname: (value: string) => boolean; onLeave: () => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me?.nickname ?? "");
  const [chat, setChat] = useState("");
  const [copyState, setCopyState] = useState<"code" | "link" | null>(null);
  const [target, setTarget] = useState(room.victoryTarget);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const customCount = Object.entries(room.rules).filter(([key, value]) => value !== CLASSIC_RULES[key as keyof GameRules]).length + (room.victoryTarget !== 10 ? 1 : 0);
  const desertCount = Object.values(room.boardPreview.hexes).filter(hex => hex.terrain === "desert").length;
  const portCount = Object.values(room.boardPreview.edges).filter(edge => edge.port).length;
  const canStart = room.players.length >= 3 && room.players.every(player => player.ready && player.connected);
  useEffect(() => setTarget(room.victoryTarget), [room.victoryTarget]);
  useEffect(() => {
    if (!colorPickerOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!colorPickerRef.current?.contains(event.target as Node)) setColorPickerOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setColorPickerOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [colorPickerOpen]);
  function update(settings: Record<string, unknown>) {
    return Boolean(me?.host && send({ type: "room:settings", victoryTarget: room.victoryTarget, ...settings }));
  }
  function setMap(generation: "classic" | "random") {
    update({ mapGeneration: generation, ...(generation === "random" ? { mapSeed: crypto.randomUUID() } : {}) });
  }
  function commitTarget() {
    if (target !== room.victoryTarget) update({ victoryTarget: target });
  }
  async function copy(value: "code" | "link") {
    await navigator.clipboard.writeText(value === "code" ? room.code : `${location.origin}/?sala=${room.code}`);
    setCopyState(value); window.setTimeout(() => setCopyState(null), 2000);
  }
  function commitName() {
    if (onNickname(name.trim())) setEditing(false);
  }
  function toggle(label: string, checked: boolean, onToggle: () => void) {
    return <button type="button" className="lobby-setting-toggle" role="switch" aria-checked={checked} disabled={!me?.host} onClick={onToggle}><span>{label}</span><i className={`lobby-toggle ${checked ? "on" : ""}`} /></button>;
  }
  return <section className="lobby-layout lobby-reworked">
    <header className="lobby-top"><div><span className="overline">CATAN · SALA PRIVADA</span><h1>Preparar a <i>partida</i></h1></div><span className={`connection-pill ${connection}`}><span />{connection === "online" ? "Conectado" : "Reconectando"}</span></header>
    <div className="lobby-table">
      <section className="lobby-players" aria-labelledby="players-heading"><header><span className="overline">AO REDOR DA MESA</span><h2 id="players-heading">Jogadores <small>{room.players.length}/{room.capacity}</small></h2></header>
        <div className="lobby-player-list">{room.players.map(player => <div className={`lobby-player ${player.id === me?.id ? "mine" : ""}`} key={player.id} style={{ borderLeftColor: `var(--seat-${player.color})` }}>
          {player.id === me?.id ? <div className="lobby-avatar-picker" ref={colorPickerRef}>
            <button type="button" className={`player-avatar color-${player.color}`} aria-label="Escolher sua cor" aria-expanded={colorPickerOpen} aria-controls="lobby-color-palette" title="Clique para trocar sua cor" onClick={() => setColorPickerOpen(open => !open)}>{initials(player.nickname)}</button>
            {colorPickerOpen && <div className="lobby-color-menu" id="lobby-color-palette" role="group" aria-label="Cores disponíveis"><span>Escolha sua cor</span><div>{colors.map(color => <button type="button" key={color.id} className={`color-swatch color-${color.id} ${me?.color === color.id ? "active" : ""}`} aria-label={color.label} title={color.label} aria-pressed={me?.color === color.id} disabled={room.players.some(seated => seated.color === color.id && seated.id !== me?.id)} onClick={() => { send({ type: "player:color", color: color.id }); setColorPickerOpen(false); }} />)}</div></div>}
          </div> : <span className={`player-avatar color-${player.color}`} aria-hidden="true">{initials(player.nickname)}</span>}
          <div className="lobby-player-info"><div className="lobby-player-name">{player.id === me?.id && editing ? <input autoFocus value={name} maxLength={24} aria-label="Editar seu apelido" onChange={event => setName(event.target.value)} onBlur={commitName} onKeyDown={event => { if (event.key === "Enter") commitName(); if (event.key === "Escape") { setName(player.nickname); setEditing(false); } }} /> : <strong>{player.nickname}</strong>}
            {player.id === me?.id && !editing && <button className="nickname-pencil" aria-label="Editar seu apelido" title="Editar apelido" onClick={() => { setName(player.nickname); setEditing(true); }}>✎</button>}</div>
            <small>{player.host ? "Anfitrião" : player.id === me?.id ? "Seu lugar" : "Convidado"} · {player.connected ? "online" : "offline"}</small></div>
          <span className={`lobby-ready-state ${player.ready ? "ready" : ""}`}>{player.ready ? "Pronto" : "Aguardando"}</span>
          {me?.host && player.id !== me.id && <div className="host-player-actions"><button title="Transferir liderança" aria-label={`Transferir liderança para ${player.nickname}`} onClick={() => send({ type: "room:transferHost", playerId: player.id })}>★</button><button title="Remover jogador" aria-label={`Remover ${player.nickname}`} onClick={() => send({ type: "room:remove", playerId: player.id })}>×</button></div>}
        </div>)}{Array.from({ length: Math.max(0, room.capacity - room.players.length) }, (_, index) => <div className="lobby-player lobby-empty-slot" key={`empty-${index}`} aria-label={`Lugar vazio ${index + 1}`}><span className="lobby-empty-avatar" aria-hidden="true">+</span><span className="lobby-empty-label">Lugar vazio</span></div>)}</div>
        <div className="lobby-player-rules">
          <div className="lobby-rule-section"><h3>Ladrão</h3>{toggle("Apenas terrenos adjacentes", room.rules.adjacentRobber, () => update({ rules: { ...room.rules, adjacentRobber: !room.rules.adjacentRobber } }))}{toggle("Salto entre desertos", room.rules.desertJump, () => update({ rules: { ...room.rules, desertJump: !room.rules.desertJump } }))}</div>
          <div className="lobby-rule-section"><h3>Construções e estradas</h3>{toggle("Através de construções inimigas", room.rules.roadsThroughOpponents, () => update({ rules: { ...room.rules, roadsThroughOpponents: !room.rules.roadsThroughOpponents } }))}</div>
          <div className="lobby-rule-section lobby-victory"><h3>Pontuação para vencer <output>{target}</output></h3><input type="range" min="8" max="20" value={target} disabled={!me?.host} onChange={event => setTarget(Number(event.target.value))} onPointerUp={commitTarget} onKeyUp={commitTarget} onBlur={commitTarget} aria-label="Pontuação para vencer" /></div>
        </div>
      </section>
      <section className="lobby-map-section" aria-labelledby="map-heading"><header><span className="overline">TABULEIRO</span><h2 id="map-heading">O mapa da mesa</h2></header><div className="lobby-board"><LobbyMap board={room.boardPreview} /></div>
        <div className="lobby-map-summary"><span>{room.mapSize === "expanded" ? "5–6 jogadores" : "3–4 jogadores"}</span><span>{room.mapGeneration === "manual" ? "Manual" : room.mapGeneration === "random" ? "Aleatório" : "Clássico"}</span><span>{desertCount} deserto{desertCount !== 1 && "s"}</span><span>{portCount} portos</span><span>{room.victoryTarget} pontos</span></div>
        <p className="lobby-active-rules">{customCount ? [room.rules.adjacentRobber && "Ladrão adjacente", room.rules.desertJump && "Salto entre desertos", room.rules.roadsThroughOpponents && "Estradas atravessam construções inimigas", room.victoryTarget !== 10 && `Vitória com ${room.victoryTarget} pontos`].filter(Boolean).join(" · ") : "Regras clássicas"}</p>
        <div className="lobby-map-controls" aria-label="Tipo de mapa"><button className={room.mapGeneration === "classic" ? "selected" : ""} disabled={!me?.host} onClick={() => setMap("classic")}>Clássico</button><button className={room.mapGeneration === "random" ? "selected" : ""} disabled={!me?.host} onClick={() => setMap("random")}>Aleatório</button><button className={room.mapGeneration === "manual" ? "selected" : ""} disabled={!me?.host} onClick={() => setEditorOpen(true)}>{room.mapGeneration === "manual" ? "Editar mapa" : "Criar mapa"}</button></div>
        {me?.host && room.mapGeneration === "random" && <button className="lobby-reroll" onClick={() => setMap("random")}>↻ Gerar outro mapa</button>}
      </section>
      <section className="lobby-invite lobby-side" aria-labelledby="invite-heading"><header><span className="overline">CONVIDE SUA MESA</span><h2 id="invite-heading">Código da sala</h2></header><div className="lobby-code" aria-label={`Código ${room.code}`}>{room.code}</div><div className="lobby-copy"><button onClick={() => copy("code")}>{copyState === "code" ? "Copiado" : "Copiar código"}</button><button onClick={() => copy("link")}>{copyState === "link" ? "Copiado" : "Copiar link"}</button></div>
        <div className="lobby-rule-section lobby-chat-setting"><h3>Chat</h3>{toggle("Chat da sala", room.chatEnabled, () => update({ chatEnabled: !room.chatEnabled }))}</div>
        <div className="lobby-size-control"><strong>Quantidade de jogadores</strong><div><button className={room.mapSize === "standard" ? "selected" : ""} disabled={!me?.host || room.players.length > 4} onClick={() => update({ mapSize: "standard" })}>1–4</button><button className={room.mapSize === "expanded" ? "selected" : ""} disabled={!me?.host} onClick={() => update({ mapSize: "expanded" })}>5–6</button></div></div>
        <p className="lobby-seat-count">{room.players.length} de {room.capacity} jogadores sentados</p><button className={`ready-button ${me?.ready ? "is-ready" : ""}`} onClick={() => send({ type: "player:ready", ready: !me?.ready })}>{me?.ready ? "✓ Você está pronto" : "Marcar como pronto"}</button>
        {me?.host && <button className="lobby-start" disabled={!canStart} onClick={() => send({ type: "game:start" })}>Iniciar partida <span>→</span></button>}
        {me?.host && !canStart && <small className="lobby-start-help">É preciso ter 3 jogadores ou mais, conectados e prontos.</small>}
      </section>
      <section className="lobby-chat-panel" aria-labelledby="chat-heading"><header><span className="overline">CHAT DA SALA</span><h2 id="chat-heading">Conversa da mesa</h2><small>{messages.length} mensagens</small></header>
        <div className="lobby-chat-messages" role="log" aria-label="Mensagens da sala">{messages.length ? messages.map(item => <p key={item.id}><strong>{item.nickname}</strong> <time>{new Date(item.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time><br />{item.text}</p>) : <p>A conversa começa aqui.</p>}</div>
        <form className="lobby-chat-form" onSubmit={event => { event.preventDefault(); if (send({ type: "chat:message", text: chat.trim() })) setChat(""); }}><input aria-label="Mensagem" maxLength={280} disabled={!room.chatEnabled} value={chat} onChange={event => setChat(event.target.value)} placeholder={room.chatEnabled ? "Escreva uma mensagem..." : "Chat desativado"} /><button disabled={!room.chatEnabled || !chat.trim()}>Enviar</button></form>
      </section>
    </div>
    <div className="lobby-bottom"><button className="leave-button" onClick={onLeave}>← Sair da sala</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {editorOpen && me?.host && <LobbyMapEditor room={room} onClose={() => setEditorOpen(false)} onApply={draft => update({ mapGeneration: "manual", mapDraft: draft })} />}
  </section>;
}
