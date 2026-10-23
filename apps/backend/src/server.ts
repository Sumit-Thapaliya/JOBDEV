import { createServer } from 'node:http';

import { database } from './config/database.js';
import { env } from './config/env.js';
import { seedTestAccounts } from './database/seed.js';

const start = async () => {
  try {
    await database.connect();
    await seedTestAccounts();
  } catch (err) {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  }

  const { app } = await import('./app.js');
  const { attachChatGateway } = await import('./modules/message/message.gateway.js');

  /* The chat socket needs the raw HTTP server, so the Express app is mounted
     onto one instead of calling `app.listen` directly. */
  const server = createServer(app);
  attachChatGateway(server);
  server.listen(env.PORT, () => {
    console.log(`API running on http://localhost:${env.PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);
    server.close(() => {
      void database.disconnect().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
};

void start();
