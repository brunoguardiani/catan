import { upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { roomHub } from "@/server/room-hub";

export const runtime = "nodejs";
export const maxDuration = 300;

export function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) {
        return new Response("Origin não permitido", { status: 403 });
      }
    } catch {
      return new Response("Origin inválido", { status: 403 });
    }
  }
  return upgradeWebSocket((socket) => {
    socket.on("message", (data: WebSocketData) => roomHub.receive(socket, data.toString()));
    socket.on("close", () => roomHub.disconnect(socket));
    socket.on("error", () => roomHub.disconnect(socket));
  });
}
