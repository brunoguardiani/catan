import { describe, expect, it } from "vitest";
import { arrangeTableSeats } from "./table-seats";

describe("lugares na mesa", () => {
  it("distribui até quatro jogadores nas duas bordas longas, sem lugar central", () => {
    const seats = ["ana", "bia", "caio", "davi"];
    expect(arrangeTableSeats(seats, "ana", false).map(seat => seat.position)).toEqual(["self", "upper-left", "upper-right", "bottom-right"]);
    expect(arrangeTableSeats(seats.slice(0, 3), "ana", false).map(seat => seat.position)).toEqual(["self", "upper-left", "upper-right"]);
    expect(arrangeTableSeats(seats.slice(0, 2), "ana", false).map(seat => seat.position)).toEqual(["self", "upper-right"]);
    expect(arrangeTableSeats(seats.slice(0, 1), "ana", false).map(seat => seat.position)).toEqual(["self"]);
    expect(arrangeTableSeats(seats, "caio", false).find(seat => seat.id === "caio")?.position).toBe("self");
  });

  it("distribui seis pessoas nas bordas longas e curtas em ordem horária para cada observador", () => {
    const seats = ["ana", "bia", "caio", "davi", "eva", "fê"];
    expect(arrangeTableSeats(seats, "ana", true).map(seat => seat.position)).toEqual(["self", "left", "upper-left", "upper-right", "right", "bottom-right"]);
    const fromDavi = arrangeTableSeats(seats, "davi", true);
    expect(fromDavi.find(seat => seat.id === "davi")?.position).toBe("self");
    expect(fromDavi.find(seat => seat.id === "eva")?.position).toBe("left");
    expect(fromDavi.find(seat => seat.id === "caio")?.position).toBe("bottom-right");
  });

  it("deixa lugares vagos no mapa maior com menos de seis pessoas", () => {
    expect(arrangeTableSeats(["ana", "bia", "caio"], "ana", true).map(seat => seat.position)).toEqual(["self", "upper-left", "upper-right"]);
    expect(arrangeTableSeats(["ana", "bia", "caio", "davi"], "ana", true).map(seat => seat.position)).toEqual(["self", "upper-left", "upper-right", "bottom-right"]);
    expect(arrangeTableSeats(["ana", "bia", "caio", "davi", "eva"], "ana", true).map(seat => seat.position)).toEqual(["self", "left", "upper-left", "upper-right", "right"]);
  });
});
