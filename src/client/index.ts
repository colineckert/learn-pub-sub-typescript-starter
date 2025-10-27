import amqp from "amqplib";
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
import { commandMove } from "../internal/gamelogic/move.js";
import { handlePause } from "../internal/gamelogic/pause.js";
import { commandSpawn } from "../internal/gamelogic/spawn.js";
import { declareAndBind, subscribeJSON } from "../internal/pubsub/consume.js";
import {
  ExchangePerilDirect,
  PauseKey,
  SimpleQueueType,
} from "../internal/routing/routing.js";

function handlerPause(gs: GameState): (ps: PlayingState) => void {
  return (ps: PlayingState) => {
    handlePause(gs, ps);
    process.stdout.write("> ");
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

  const [_, aq] = await declareAndBind(
    conn,
    ExchangePerilDirect,
    `pause.${username}`,
    PauseKey,
    SimpleQueueType.Transient,
  );

  const gameState = new GameState(username);
  const pauseHandler = handlerPause(gameState);

  await subscribeJSON(
    conn,
    ExchangePerilDirect,
    aq.queue,
    PauseKey,
    SimpleQueueType.Transient,
    pauseHandler,
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
        commandMove(gameState, words);
        console.log("Move command executed successfully");
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
