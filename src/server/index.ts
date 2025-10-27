import amqp from "amqplib";
import { getInput, printServerHelp } from "../internal/gamelogic/gamelogic.js";
import { declareAndBind } from "../internal/pubsub/consume.js";

import { publishJSON } from "../internal/pubsub/publish.js";
import {
  ExchangePerilDirect,
  ExchangePerilTopic,
  GameLogSlug,
  PauseKey,
  SimpleQueueType,
} from "../internal/routing/routing.js";

async function main() {
  const rabbitConnString = "amqp://guest:guest@localhost:5672/";
  const conn = await amqp.connect(rabbitConnString);
  console.log("Peril game server connected to RabbitMQ!");

  ["SIGINT", "SIGTERM"].forEach((signal) =>
    process.on(signal, async () => {
      try {
        await conn.close();
        console.log("RabbitMQ connection closed.");
      } catch (err) {
        console.error("Error closing RabbitMQ connection:", err);
      } finally {
        process.exit(0);
      }
    }),
  );

  const publishCh = await conn.createConfirmChannel();

  const [channel, queue] = await declareAndBind(
    conn,
    ExchangePerilTopic,
    "game_logs",
    `${GameLogSlug}.*`,
    SimpleQueueType.Durable,
  );

  printServerHelp();

  while (true) {
    const words = await getInput();
    if (words.length === 0) continue;

    const command = words[0];
    if (command === "pause") {
      console.log("Publishing paused game state");
      try {
        await publishJSON(publishCh, ExchangePerilDirect, PauseKey, {
          isPaused: true,
        });
      } catch (err) {
        console.error("Error publishing pause message:", err);
      }
    } else if (command === "resume") {
      console.log("Publishing resumed game state");
      try {
        await publishJSON(publishCh, ExchangePerilDirect, PauseKey, {
          isPaused: false,
        });
      } catch (err) {
        console.error("Error publishing resume message:", err);
      }
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
