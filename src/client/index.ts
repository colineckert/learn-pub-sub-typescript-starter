import amqp from "amqplib";
import type { ArmyMove } from "../internal/gamelogic/gamedata.js";
import {
  clientWelcome,
  commandStatus,
  getInput,
  printClientHelp,
} from "../internal/gamelogic/gamelogic.js";
import {
  GameState,
  type PlayingState,
} from "../internal/gamelogic/gamestate.js";
import {
  commandMove,
  handleMove,
  MoveOutcome,
} from "../internal/gamelogic/move.js";
import { handlePause } from "../internal/gamelogic/pause.js";
import { commandSpawn } from "../internal/gamelogic/spawn.js";
import { subscribeJSON } from "../internal/pubsub/consume.js";
import { publishJSON } from "../internal/pubsub/publish.js";
import {
  AckType,
  ArmyMovesPrefix,
  ExchangePerilDirect,
  ExchangePerilTopic,
  PauseKey,
  SimpleQueueType,
} from "../internal/routing/routing.js";

function handlerPause(gs: GameState): (ps: PlayingState) => AckType {
  return (ps: PlayingState) => {
    handlePause(gs, ps);
    process.stdout.write("> ");

    return AckType.Ack;
  };
}

function handlerMove(gs: GameState): (move: ArmyMove) => AckType {
  return (move: ArmyMove) => {
    const moveOutcome = handleMove(gs, move);
    process.stdout.write("> ");

    if (
      moveOutcome === MoveOutcome.Safe ||
      moveOutcome === MoveOutcome.MakeWar
    ) {
      return AckType.Ack;
    }
    return AckType.NackDiscard;
  };
}

async function main() {
  const rabbitConnString = "amqp://guest:guest@localhost:5672/";
  const conn = await amqp.connect(rabbitConnString);
  console.log("Starting Peril client...");

  ["SIGINT", "SIGTERM"].forEach((signal) =>
    process.on(signal, async () => {
      try {
        await conn.close();
        console.log("RabbitMQ client connection closed.");
      } catch (err) {
        console.error("Error closing RabbitMQ client connection:", err);
      } finally {
        process.exit(0);
      }
    }),
  );

  const username = await clientWelcome();
  const gameState = new GameState(username);
  const publishConfirmChannel = await conn.createConfirmChannel();

  await subscribeJSON(
    conn,
    ExchangePerilDirect,
    `${PauseKey}.${username}`,
    PauseKey,
    SimpleQueueType.Transient,
    handlerPause(gameState),
  );
  await subscribeJSON(
    conn,
    ExchangePerilTopic,
    `${ArmyMovesPrefix}.${username}`,
    `${ArmyMovesPrefix}.*`,
    SimpleQueueType.Transient,
    handlerMove(gameState),
  );

  while (true) {
    const words = await getInput();
    if (words.length === 0) continue;

    const command = words[0];
    if (command === "spawn") {
      console.log("Executing spawn command");
      try {
        commandSpawn(gameState, words);
      } catch (err) {
        console.error("Error executing spawn command:", err);
      }
    } else if (command === "move") {
      console.log("Executing move command");
      try {
        const move = commandMove(gameState, words);
        console.log("Move command executed successfully");
        await publishJSON(
          publishConfirmChannel,
          ExchangePerilTopic,
          `${ArmyMovesPrefix}.${username}`,
          move,
        );
        console.log("Move command published");
      } catch (err) {
        console.error("Error executing move command:", err);
      }
    } else if (command === "status") {
      console.log("Current Game State:");
      commandStatus(gameState);
    } else if (command === "help") {
      printClientHelp();
    } else if (command === "spam") {
      console.log("Spamming not allowed yet!");
    } else if (command === "quit") {
      console.log("Goodbye!");
      process.exit(0);
    } else {
      console.log("Unknown command");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
