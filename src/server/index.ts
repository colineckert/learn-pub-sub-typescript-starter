import amqp from "amqplib";

async function main() {
  console.log("Starting Peril server...");

  const connection = "amqp://guest:guest@localhost:5672/";
  amqp.connect(connection);
  console.log("Connection successful!");

  process.on("exit", () => {
    console.log("Shutting down connection...");
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
