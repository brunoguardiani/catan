import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { baseBoard, CLASSIC_RULES, defaultRandomOptions } from "@/game-engine/configuration";
import type { RoomSnapshot } from "@/lib/protocol";
import LobbyView from "./LobbyView";

const room: RoomSnapshot = {
  code: "ABC234", version: 1, status: "lobby", capacity: 4, createdAt: 0,
  victoryTarget: 10, chatEnabled: true, reactionsEnabled: true, mapSeed: "test",
  mapSize: "standard", mapGeneration: "classic", randomOptions: defaultRandomOptions("standard"),
  mapDraft: null, boardPreview: baseBoard("standard", "classic", ""), rules: CLASSIC_RULES,
  players: [
    { id: "host", nickname: "Ana", avatar: "fox", color: "coral", connected: true, ready: false, host: true },
    { id: "guest", nickname: "Bia", avatar: "owl", color: "teal", connected: true, ready: false, host: false },
  ],
};

it("mostra mapa e regras aos convidados sem permitir alterações", () => {
  const html = renderToStaticMarkup(<LobbyView room={room} me={room.players[1]} connection="online" messages={[]} error="" send={() => true} onNickname={() => true} onLeave={() => {}} />);
  expect(html).toContain("CATAN · SALA PRIVADA");
  expect(html).not.toContain("Ilhas do Vento");
  expect(html).toContain("O mapa da mesa");
  expect(html).toContain("Apenas terrenos adjacentes");
  expect(html).toContain("Através de construções inimigas");
  expect((html.match(/role="switch"/g) ?? [])).toHaveLength(4);
  expect((html.match(/aria-label="Escolher sua cor"/g) ?? [])).toHaveLength(1);
  expect(html).toContain('class="lobby-player-list"');
  expect((html.match(/class="lobby-player lobby-empty-slot"/g) ?? [])).toHaveLength(2);
  expect(html).not.toContain("lugares disponíveis");
  expect(html.indexOf("<h3>Ladrão</h3>")).toBeLessThan(html.indexOf("O mapa da mesa"));
  expect(html.indexOf("Código da sala")).toBeLessThan(html.indexOf('class="lobby-chat-panel"'));
  expect(html).toContain('role="log"');
  expect(html).not.toContain('<details class="lobby-chat"');
  expect(html).not.toContain("Configurar partida");
  expect(html).not.toContain("Recusa Premium");
});

it("coloca chat e modalidade antes dos controles de início", () => {
  const html = renderToStaticMarkup(<LobbyView room={room} me={room.players[0]} connection="online" messages={[]} error="" send={() => true} onNickname={() => true} onLeave={() => {}} />);
  expect(html.indexOf("<h3>Chat</h3>")).toBeLessThan(html.indexOf("Quantidade de jogadores"));
  expect(html.indexOf("Quantidade de jogadores")).toBeLessThan(html.indexOf("Marcar como pronto"));
  expect(html.indexOf("Quantidade de jogadores")).toBeLessThan(html.indexOf("Iniciar partida"));
  expect(html).toContain("Criar mapa");
});
