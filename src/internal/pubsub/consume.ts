import type amqp from "amqplib";
import type { Channel } from "amqplib";
import {
  ExchangePerilDeadLetter,
  SimpleQueueType,
} from "../routing/routing.js";

export enum AckType {
  Ack,
  NackRequeue,
  NackDiscard,
}

export async function declareAndBind(
  conn: amqp.ChannelModel,
  exchange: string,
  queueName: string,
  key: string,
  queueType: SimpleQueueType,
): Promise<[Channel, amqp.Replies.AssertQueue]> {
  const channel = await conn.createChannel();
  const aq = await channel.assertQueue(queueName, {
    durable: queueType === "durable",
    autoDelete: queueType === "transient",
    exclusive: queueType === "transient",
    arguments: {
      "x-dead-letter-exchange": ExchangePerilDeadLetter,
    },
  });

  await channel.bindQueue(aq.queue, exchange, key);

  return [channel, aq];
}

export async function subscribeJSON<T>(
  conn: amqp.ChannelModel,
  exchange: string,
  queueName: string,
  key: string,
  queueType: SimpleQueueType,
  handler: (data: T) => Promise<AckType> | AckType,
): Promise<void> {
  const [ch, queue] = await declareAndBind(
    conn,
    exchange,
    queueName,
    key,
    queueType,
  );

  await ch.consume(queue.queue, async (msg: amqp.ConsumeMessage | null) => {
    if (!msg) return;

    let data: T;
    try {
      data = JSON.parse(msg.content.toString());
    } catch (err) {
      console.error("Could not unmarshal message:", err);
      return;
    }

    try {
      const result = await handler(data);
      switch (result) {
        case AckType.Ack:
          ch.ack(msg);
          console.log("Ack");
          break;
        case AckType.NackDiscard:
          ch.nack(msg, false, false);
          console.log("NackDiscard");
          break;
        case AckType.NackRequeue:
          ch.nack(msg, false, true);
          console.log("NackRequeue");
          break;
        default:
          const unreachable: never = result;
          console.error("Unexpected ack type:", unreachable);
          return;
      }
    } catch (err) {
      console.error("Error handling message:", err);
      ch.nack(msg, false, false);
      return;
    }
  });
}
