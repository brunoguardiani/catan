"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomSnapshot } from "@/lib/protocol";
import type { MapDraft, Port, Terrain } from "@/game-engine/types";
import { baseBoard, boardToDraft, defaultRandomOptions, mapIssues } from "@/game-engine/configuration";
import LobbyMap from "./LobbyMap";

const terrains: { id: Terrain; label: string }[] = [
  { id: "wood", label: "Floresta" }, { id: "brick", label: "Colinas" }, { id: "wool", label: "Pastagem" },
  { id: "wheat", label: "Campos" }, { id: "ore", label: "Montanhas" }, { id: "desert", label: "Deserto" },
];
const ports: { id: Port; label: string }[] = [
  { id: "any", label: "3:1" }, { id: "wood", label: "Madeira 2:1" }, { id: "brick", label: "Tijolo 2:1" },
  { id: "wool", label: "Lã 2:1" }, { id: "wheat", label: "Trigo 2:1" }, { id: "ore", label: "Minério 2:1" },
];
type Tool = { kind: "terrain"; value: Terrain } | { kind: "number"; value: number | null } | { kind: "port"; value: Port | null } | { kind: "robber" };

export default function LobbyMapEditor({ room, onClose, onApply }: {
  room: RoomSnapshot; onClose: () => void; onApply: (draft: MapDraft) => boolean;
}) {
  const [draft, setDraft] = useState<MapDraft>(() => room.mapDraft ? structuredClone(room.mapDraft) : boardToDraft(room.boardPreview, room.randomOptions.desertCount !== defaultRandomOptions(room.mapSize).desertCount));
  const [history, setHistory] = useState<MapDraft[]>([]);
  const [future, setFuture] = useState<MapDraft[]>([]);
  const [tool, setTool] = useState<Tool>({ kind: "terrain", value: "wood" });
  const [error, setError] = useState("");
  const [validated, setValidated] = useState(false);
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const issues = useMemo(() => mapIssues(room.mapSize, draft), [room.mapSize, draft]);
  const board = useMemo(() => previewDraft(room.mapSize, draft), [room.mapSize, draft]);
  const unassignedTiles = useMemo(() => {
    const assigned = new Set(draft.tiles.map(tile => tile.id));
    return new Set(Object.keys(board.hexes).filter(id => !assigned.has(id)));
  }, [board, draft.tiles]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')];
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown); };
  }, []);

  function changeDraft(next: MapDraft) {
    setHistory(items => [...items.slice(-49), structuredClone(draft)]);
    setFuture([]); setDraft(next); setError(""); setValidated(false);
  }
  function tileClick(id: string) {
    const selected = draft.tiles.find(tile => tile.id === id);
    if (tool.kind === "port") return;
    if (tool.kind === "robber") {
      if (selected?.terrain !== "desert") { setError("O ladrão deve começar em um deserto."); return; }
      changeDraft({ ...draft, robberHex: id }); return;
    }
    if (!selected && tool.kind === "number") { setError("Escolha um terreno antes de colocar a ficha."); return; }
    const tiles = draft.tiles.map(tile => {
      if (tile.id !== id) return tile;
      if (tool.kind === "terrain") return { ...tile, terrain: tool.value, number: tool.value === "desert" ? null : tile.number };
      return tile.terrain === "desert" ? tile : { ...tile, number: tool.value };
    });
    if (!selected && tool.kind === "terrain") tiles.push({ id, terrain: tool.value, number: null });
    const robberHex = tiles.find(tile => tile.id === draft.robberHex)?.terrain === "desert" ? draft.robberHex : (tiles.find(tile => tile.terrain === "desert")?.id ?? "");
    changeDraft({ ...draft, tiles, robberHex });
  }
  function portClick(edgeId: string) {
    if (tool.kind !== "port") return;
    changeDraft({ ...draft, ports: [...draft.ports.filter(port => port.edgeId !== edgeId), ...(tool.value ? [{ edgeId, type: tool.value }] : [])] });
  }
  function undo() { if (!history.length) return; setFuture(items => [structuredClone(draft), ...items]); setDraft(history.at(-1)!); setHistory(items => items.slice(0, -1)); setValidated(false); }
  function redo() { if (!future.length) return; setHistory(items => [...items, structuredClone(draft)]); setDraft(future[0]); setFuture(items => items.slice(1)); setValidated(false); }
  function startFromScratch() {
    changeDraft({ tiles: [], ports: [], robberHex: "", freeDistribution: true });
    setTool({ kind: "terrain", value: "wood" });
  }
  function distributeNumbers() {
    const generated = Object.values(baseBoard(room.mapSize, "random", crypto.randomUUID()).hexes).map(hex => hex.number).filter((number): number is number => number !== null);
    const land = draft.tiles.filter(tile => tile.terrain !== "desert");
    const tiles = draft.tiles.map(tile => tile.terrain === "desert" ? { ...tile, number: null } : { ...tile, number: generated[land.findIndex(item => item.id === tile.id) % generated.length] });
    changeDraft({ ...draft, tiles, freeDistribution: land.length !== generated.length || draft.freeDistribution });
  }
  function apply() {
    setValidated(true);
    if (issues.errors.length) { setError("Corrija os erros do mapa antes de aplicar."); return; }
    if (!onApply(draft)) { setError("Sem conexão com a sala. Tente novamente."); return; }
    onClose();
  }

  return <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog map-editor-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Editar mapa">
      <header className="settings-header"><div><span className="overline">MAPA DA SALA {room.code}</span><h2>Editar mapa</h2></div><button aria-label="Fechar editor" onClick={onClose}>×</button></header>
      <div className="settings-body settings-editor">
        <div className="settings-editor-board"><div className="editor-map-toolbar"><strong>Visualização do mapa</strong><div className="editor-map-zoom"><button type="button" aria-label="Diminuir zoom" disabled={zoom <= 0.75} onClick={() => setZoom(value => Math.max(0.75, value - 0.25))}>−</button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))}>+</button></div></div><div className="editor-map-viewport"><div className="editor-map-canvas" style={{ width: `${zoom * 100}%` }}><LobbyMap board={board} editable portMode={tool.kind === "port"} unassignedTiles={unassignedTiles} onTile={tileClick} onPort={portClick} /></div></div><p>Escolha uma ferramenta e clique no mapa. O ladrão começa em um deserto.</p><div className="settings-editor-actions"><button disabled={!history.length} onClick={undo}>Desfazer</button><button disabled={!future.length} onClick={redo}>Refazer</button><button onClick={() => { if (window.confirm("Restaurar o mapa inicial?")) changeDraft(boardToDraft(baseBoard(room.mapSize, "classic", ""))); }}>Restaurar</button><button onClick={() => changeDraft(boardToDraft(baseBoard(room.mapSize, "random", crypto.randomUUID(), room.randomOptions), room.randomOptions.desertCount !== defaultRandomOptions(room.mapSize).desertCount))}>Embaralhar</button><button className="editor-start-empty" onClick={startFromScratch}>Começar do zero</button></div></div>
        <aside className="settings-editor-tools">
          <h3>Terrenos</h3><div className="tool-grid">{terrains.map(item => <button key={item.id} className={tool.kind === "terrain" && tool.value === item.id ? "selected" : ""} onClick={() => setTool({ kind: "terrain", value: item.id })}>{item.label}</button>)}</div>
          <h3>Fichas</h3><div className="tool-grid">{[2,3,4,5,6,8,9,10,11,12,null].map(value => <button key={value ?? "none"} className={tool.kind === "number" && tool.value === value ? "selected" : ""} onClick={() => setTool({ kind: "number", value })}>{value ?? "Remover"}</button>)}<button onClick={distributeNumbers}>Distribuir fichas</button></div>
          <h3>Portos</h3><div className="tool-grid">{ports.map(item => <button key={item.id} className={tool.kind === "port" && tool.value === item.id ? "selected" : ""} onClick={() => setTool({ kind: "port", value: item.id })}>{item.label}</button>)}<button onClick={() => setTool({ kind: "port", value: null })}>Remover</button></div>
          <h3>Ladrão</h3><button className={tool.kind === "robber" ? "selected" : ""} onClick={() => setTool({ kind: "robber" })}>Escolher deserto inicial</button>
          <button type="button" role="switch" aria-checked={draft.freeDistribution} className="editor-free-switch" onClick={() => changeDraft({ ...draft, freeDistribution: !draft.freeDistribution })}><span>Distribuição livre<small>Permite repetir terrenos, fichas e portos.</small></span><i className={`lobby-toggle ${draft.freeDistribution ? "on" : ""}`} /></button>
          <div className="settings-validation"><button onClick={() => setValidated(true)}>Validar mapa</button><strong>{unassignedTiles.size && !validated ? `${draft.tiles.length}/${Object.keys(board.hexes).length} terrenos definidos` : issues.errors.length ? `${issues.errors.length} erro(s)` : validated ? "Mapa validado" : "Mapa jogável"}</strong>{(validated || !unassignedTiles.size) && issues.errors.map(item => <p className="error" key={item}>{item}</p>)}{issues.warnings.map(item => <p key={item}>{item}</p>)}</div>
        </aside>
      </div>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <footer className="settings-footer"><button onClick={onClose}>Cancelar</button><button className="settings-apply" onClick={apply}>Aplicar mapa</button></footer>
    </section>
  </div>;
}

function previewDraft(size: RoomSnapshot["mapSize"], draft: MapDraft) {
  const board = baseBoard(size, "classic", "");
  for (const tile of draft.tiles) if (board.hexes[tile.id]) { board.hexes[tile.id].terrain = tile.terrain; board.hexes[tile.id].number = tile.number; }
  for (const edge of Object.values(board.edges)) delete edge.port;
  for (const vertex of Object.values(board.vertices)) delete vertex.port;
  for (const port of draft.ports) {
    const edge = board.edges[port.edgeId];
    if (!edge || edge.hexes.length !== 1) continue;
    edge.port = port.type; board.vertices[edge.a].port = port.type; board.vertices[edge.b].port = port.type;
  }
  board.robberHex = draft.robberHex;
  return board;
}
