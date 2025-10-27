import type amqp from "amqplib";
import type { Channel } from "amqplib";
import type { SimpleQueueType } from "../routing/routing.js";

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
  handler: (data: T) => void,
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
      handler(content);
      channel.ack(msg);
    }
  });
}
