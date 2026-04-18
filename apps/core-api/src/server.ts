import { createCoreApiApp } from "./app.js";

const { server, databasePath, env } = await createCoreApiApp({
  seed: true
});

const address = await server.listen({
  host: env.HOST,
  port: env.PORT
});

server.log.info(`Core API listening on ${address} using ${databasePath}`);
