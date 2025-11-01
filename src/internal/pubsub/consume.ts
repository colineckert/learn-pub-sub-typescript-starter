import type amqp from "amqplib";
import type { Channel } from "amqplib";
import { AckType, SimpleQueueType } from "../routing/routing.js";

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
  });

  await channel.bindQueue(aq.queue, exchange, key);

  return [channel, aq];
}

export async function subscribeJSON<T>(
  conn: amqp.ChannelModel,
  exchange: string,
  queueName: string,
  key: string,
  queueType: SimpleQueueType, // an enum to represent "durable" or "transient"
  handler: (data: T) => AckType,
): Promise<void> {
  const [channel, aq] = await declareAndBind(
    conn,
    exchange,
    queueName,
    key,
    queueType,
  );

  await channel.consume(aq.queue, (msg) => {
    if (msg) {
      const content = JSON.parse(msg.content.toString());
      const ackType = handler(content);
      if (ackType === AckType.Ack) {
        console.log("Acknowledge message");
        channel.ack(msg);
      } else if (ackType === AckType.NackRequeue) {
        console.log("Nack and requeue message");
        channel.nack(msg, false, true);
      } else {
        console.log("Nack and discard message");
        channel.nack(msg, false, false);
      }
    }
  });
}
