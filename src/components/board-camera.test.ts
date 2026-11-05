import { describe, expect, it } from "vitest";
import { zoomViewBox } from "./board-camera";

describe("zoom do tabuleiro", () => {
  it("aproxima e afasta mantendo o centro do mapa", () => {
    expect(zoomViewBox("0 0 100 50", 2)).toBe("25 12.5 50 25");
    expect(zoomViewBox("0 0 100 50", 0.5)).toBe("-50 -25 200 100");
  });
});
