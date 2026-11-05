import type { PublicGameState, StartingRollRound } from "@/game-engine/types";
import type { RoomSnapshot } from "@/lib/protocol";
import { colorValue } from "./GamePieces";

export default function StartingResults({ game, room, concealLastRoll = false }: { game: PublicGameState; room: RoomSnapshot; concealLastRoll?: boolean }) {
  const name = (id: string) => room.players.find(player => player.id === id)?.nickname ?? "Jogador";
  const pending: StartingRollRound | null = game.phase === "choose_first_player"
    ? { round: game.startingRoll.round, rolls: game.startingRoll.rolls, highest: 0, leaders: [] }
    : null;
  const rounds = [...game.startingRoll.history, ...(pending ? [pending] : [])];
  const concealedRound = concealLastRoll && game.lastRoll?.purpose === "first_player"
    ? [...rounds].reverse().find(round => {
      const dice = round.rolls[game.lastRoll!.playerId];
      return dice && dice[0] === game.lastRoll!.dice[0] && dice[1] === game.lastRoll!.dice[1];
    })?.round
    : null;

  return <section className="game-panel starting-results" aria-label="Resultados dos dados para definir quem começa">
    <span className="overline">QUEM COMEÇA</span>
    <div className="starting-rounds">{rounds.map((round, index) => {
      const completed = index < game.startingRoll.history.length;
      const outcomeVisible = completed && round.round !== concealedRound;
      const tie = outcomeVisible && round.leaders.length > 1;
      return <div className="starting-round" key={round.round}>
        <div className="starting-round-heading"><strong>Rodada {round.round}</strong><span>{!outcomeVisible ? "em andamento" : tie ? "Empate" : "Definido"}</span></div>
        {game.seatOrder.filter(id => round.rolls[id]).map(id => {
          const dice = round.rolls[id];
          const concealed = round.round === concealedRound && id === game.lastRoll?.playerId;
          const leading = outcomeVisible && round.leaders.includes(id);
          return <div className={`starting-result-row${tie && leading ? " tied" : leading ? " winner" : ""}`} key={id}>
            <i style={{ background: colorValue[room.players.find(player => player.id === id)?.color ?? "coral"] }} />
            <span>{name(id)}</span><span className="starting-dice-values">{concealed ? "rolando..." : `${dice[0]} · ${dice[1]}`}</span>
            {tie && leading && <em>empate</em>}{!tie && leading && <em>1º</em>}
          </div>;
        })}
        {!completed && game.seatOrder.filter(id => game.startingRoll.contenders.includes(id) && !round.rolls[id]).map(id => <div className="starting-result-row waiting" key={id}><i style={{ background: colorValue[room.players.find(player => player.id === id)?.color ?? "coral"] }} /><span>{name(id)}</span><small>aguarda lançamento</small></div>)}
      </div>;
    })}</div>
    {game.phase !== "choose_first_player" && <div className="clockwise-order"><strong>Ordem no sentido horário</strong><span>{game.playerOrder.map(name).join(" → ")}</span></div>}
  </section>;
}
