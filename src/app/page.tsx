"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Avatar, RoomSnapshot, ServerEvent } from "@/lib/protocol";
import type { GameAction, PublicGameState } from "@/game-engine/types";
import GameView from "@/components/GameView";
import LobbyView from "./LobbyView";
import GameBox, { BoxFAQ } from "./GameBox";
import "./lobby.css";
import "./landing.css";
import "./lobby-redesign.css";

type Session = { playerId: string; token: string; nickname: string; avatar: Avatar; roomCode?: string; expiresAt: number };
type ChatItem = Extract<ServerEvent, { type: "chat:message" }>;
type ReactionItem = Extract<ServerEvent, { type: "reaction:send" }>;
type ConnState = "offline" | "connecting" | "online";

const sessionKey = "catan:session";
const legacySessionKey = "ilhas-do-vento:session";
const week = 7 * 24 * 60 * 60 * 1000;
const legacyAvatar: Avatar = "fox";

function readSession(): Session | null {
  for (const key of [sessionKey, legacySessionKey]) {
    try {
      const stored = localStorage.getItem(key);
      const value = JSON.parse(stored ?? "null") as Session | null;
      if (value && value.expiresAt > Date.now() && typeof value.playerId === "string" && typeof value.token === "string") {
        if (key !== sessionKey && stored) try { localStorage.setItem(sessionKey, stored); } catch { /* Storage is optional. */ }
        return value;
      }
    } catch { /* Corrupted browser storage */ }
  }
  return null;
}

function makeSession(nickname: string, avatar: Avatar): Session {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return { playerId: crypto.randomUUID(), token: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""), nickname, avatar, expiresAt: Date.now() + week };
}

function saveSession(session: Session) {
  localStorage.setItem(sessionKey, JSON.stringify({ ...session, expiresAt: Date.now() + week }));
}

function initialCode() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("sala")?.toUpperCase() ?? "";
}

export default function Home() {
  const [nickname, setNickname] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [game, setGame] = useState<PublicGameState | null>(null);
  const [connection, setConnection] = useState<ConnState>("offline");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [activeReaction, setActiveReaction] = useState<ReactionItem | null>(null);
  const [error, setError] = useState("");
  const [showTestLink, setShowTestLink] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef(1000);
  const desiredRef = useRef<{ action: "create" | "join"; code?: string; session: Session } | null>(null);
  const intentionalRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    setShowTestLink(location.hostname === "localhost" || location.hostname === "127.0.0.1");
    const stored = readSession();
    if (stored) { setSession(stored); setNickname(stored.nickname); }
    const code = initialCode();
    if (code) setInviteCode(code);
    return () => { intentionalRef.current = true; socketRef.current?.close(); if (retryRef.current) clearTimeout(retryRef.current); if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, []);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify({ ...payload, commandId: crypto.randomUUID() }));
    return true;
  }, []);

  const connect = useCallback((target: { action: "create" | "join"; code?: string; session: Session }) => {
    desiredRef.current = target;
    intentionalRef.current = false;
    if (retryRef.current) clearTimeout(retryRef.current);
    socketRef.current?.close();
    setError("");
    setConnection("connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);
    socketRef.current = ws;
    ws.onopen = () => {
      reconnectRef.current = 1000;
      const current = desiredRef.current;
      if (!current) return;
      ws.send(JSON.stringify({
        type: current.action === "create" ? "room:create" : "room:join",
        commandId: crypto.randomUUID(), playerId: current.session.playerId,
        token: current.session.token, nickname: current.session.nickname, avatar: current.session.avatar,
        ...(current.action === "join" ? { code: current.code } : {}),
      }));
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "connection:heartbeat", commandId: crypto.randomUUID() }));
      }, 20000);
    };
    ws.onmessage = (event) => {
      let data: ServerEvent;
      try { data = JSON.parse(event.data) as ServerEvent; } catch { return; }
      if (data.type === "room:joined") {
        joinedRef.current = true;
        const current = desiredRef.current;
        if (current) {
          const updated = { ...current.session, roomCode: data.room.code };
          saveSession(updated);
          setSession(updated);
          desiredRef.current = { action: "join", code: data.room.code, session: updated };
          history.replaceState(null, "", `/?sala=${data.room.code}`);
        }
        setRoom(data.room);
        setConnection("online");
      } else if (data.type === "room:state") {
        setRoom(current => !current || data.room.version >= current.version ? data.room : current);
        if (data.room.status === "lobby") setGame(null);
      } else if (data.type === "game:state") {
        setGame(data.game);
        setError("");
      } else if (data.type === "room:unavailable") {
        setRoom(null);
        setGame(null);
        setError(`Sala ${data.code} não encontrada nesta instância. Ela pode ter expirado ou estar em outra instância da Vercel.`);
        const stored = readSession();
        if (stored?.roomCode === data.code) { const updated = { ...stored, roomCode: undefined }; saveSession(updated); setSession(updated); }
        setConnection("offline");
        desiredRef.current = null;
        intentionalRef.current = true;
        ws.close();
      } else if (data.type === "room:removed") {
        setRoom(null);
        setGame(null);
        setError("Você foi removido desta sala.");
        setConnection("offline");
        desiredRef.current = null;
        intentionalRef.current = true;
        const stored = readSession();
        if (stored) { const updated = { ...stored, roomCode: undefined }; saveSession(updated); setSession(updated); }
        history.replaceState(null, "", "/");
        ws.close();
      } else if (data.type === "room:error") {
        setError(data.message);
        if (!joinedRef.current) { desiredRef.current = null; intentionalRef.current = true; ws.close(); setConnection("offline"); }
      } else if (data.type === "chat:message") {
        setMessages(items => [...items.slice(-99), data]);
      } else if (data.type === "reaction:send") {
        setActiveReaction(data);
        setTimeout(() => setActiveReaction(current => current?.id === data.id ? null : current), 3500);
      }
    };
    ws.onclose = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (socketRef.current !== ws) return;
      setConnection("offline");
      if (intentionalRef.current || !desiredRef.current) return;
      retryRef.current = setTimeout(() => connect(desiredRef.current!), reconnectRef.current);
      reconnectRef.current = Math.min(reconnectRef.current * 2, 30000);
    };
    ws.onerror = () => setError("A conexão WebSocket falhou. Verifique se o ambiente aceita WebSockets da Vercel.");
  }, []);

  useEffect(() => {
    const stored = readSession();
    if (!stored?.roomCode) return;
    const code = initialCode() || stored.roomCode;
    if (/^[A-HJ-NP-Z2-9]{6}$/.test(code)) connect({ action: "join", code, session: stored });
  }, [connect]);

  function enter(action: "create" | "join", code?: string) {
    joinedRef.current = false;
    const name = nickname.trim();
    if (name.length < 2 || name.length > 24) { setError("Escolha um apelido de 2 a 24 caracteres."); return; }
    const normalized = code?.trim().toUpperCase();
    if (action === "join" && !/^[A-HJ-NP-Z2-9]{6}$/.test(normalized ?? "")) { setError("Digite um código de 6 caracteres válido."); return; }
    const current = session && session.expiresAt > Date.now() ? { ...session, nickname: name } : makeSession(name, legacyAvatar);
    saveSession(current);
    setSession(current);
    connect({ action, code: normalized, session: current });
  }

  function leave() {
    send({ type: "room:leave" });
    intentionalRef.current = true;
    joinedRef.current = false;
    desiredRef.current = null;
    socketRef.current?.close();
    setRoom(null);
    setGame(null);
    setMessages([]);
    setConnection("offline");
    if (session) { const updated = { ...session, roomCode: room?.status === "lobby" ? undefined : session.roomCode }; saveSession(updated); setSession(updated); }
    history.replaceState(null, "", "/");
  }

  function updateProfile(value: string) {
    const name = value.trim();
    if (name.length < 2 || name.length > 24) { setError("Escolha um apelido de 2 a 24 caracteres."); return false; }
    if (!send({ type: "player:profile", nickname: name, avatar: session?.avatar ?? legacyAvatar })) return false;
    setNickname(name);
    setError("");
    if (session) { const updated = { ...session, nickname: name }; saveSession(updated); setSession(updated); }
    return true;
  }

  const me = room?.players.find(player => player.id === session?.playerId);
  const currentCode = inviteCode || initialCode();
  const sendAction = (action: GameAction) => send({ type: "game:command", action });
  const inGame = Boolean(room && room.status !== "lobby" && game && session);

  return <main className={`site-shell${inGame ? " in-game" : ""}${!room ? " landing-home" : ""}`}>
    {!inGame && <><div className="ambient ambient-one" /><div className="ambient ambient-two" /></>}
    {!inGame && <header className="topbar">
      <a className="brand" href="/" aria-label="Catan, início"><span className="brand-mark">C</span><span>CATAN</span></a>
      {!room && <nav className="landing-nav" aria-label="Navegação principal"><a href="#jogar">Jogar</a><a href="#faq">Perguntas frequentes</a></nav>}
    </header>}

    {!room ? <section className="box-layout" id="jogar">
      <div className="entry-card">
        <div className="card-heading"><div><span className="overline">ENTRAR NA PARTIDA</span><h2>Sente-se à mesa</h2></div></div>
        <label htmlFor="nickname">Seu apelido</label><input id="nickname" maxLength={24} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Como vamos chamar você?" autoComplete="nickname" />
        <button className="primary-button" disabled={connection === "connecting"} onClick={() => enter("create")}>{connection === "connecting" ? "Conectando..." : "Criar jogo"}<span>→</span></button>
        {showTestLink && <a className="continue-button" href="/teste">🧪 Abrir modo de teste · 2 jogadores</a>}
        <div className="divider"><span>OU ENTRE COM UM CONVITE</span></div>
        <div className="join-row"><input aria-label="Código da sala" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="CÓDIGO" maxLength={6} /><button disabled={connection === "connecting"} onClick={() => enter("join", currentCode)}>Entrar no jogo →</button></div>
        {session?.roomCode && <button className="continue-button" onClick={() => enter("join", session.roomCode)}>↺ Continuar sala {session.roomCode}</button>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="card-footnote">Sem cadastro. Sua sessão fica salva neste navegador por 7 dias de inatividade.</p>
      </div>
      <GameBox />
    </section> : room.status !== "lobby" && game && session ? <><GameView room={room} game={game} meId={session.playerId} messages={messages} reaction={activeReaction} onAction={sendAction} onCommand={payload => { send(payload); }} onLeave={leave} />{error && <p className="game-error-toast" role="alert">{error}</p>}</> : <LobbyView room={room} me={me} connection={connection} messages={messages} error={error} send={send} onNickname={updateProfile} onLeave={leave} />}

    {!room && <BoxFAQ />}
    {!inGame && <footer><span>CATAN</span><span>Uma aventura criada para jogar junto.</span><span>LOCAL · 2026</span></footer>}
  </main>;
}
