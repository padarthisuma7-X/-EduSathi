/**
 * Service entry point.
 *
 * Keeps startup concerns out of `app.ts` so the Express app stays testable
 * without binding a port, and so the shutdown behaviour below is impossible to
 * forget in a test.
 */

import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();

const { app, adapter, store } = createApp({ config });

const server = app.listen(config.port, () => {
  const capabilities = adapter.capabilities();
  console.log(
    [
      `Sahaj Shiksha API listening on http://localhost:${config.port}`,
      `  environment : ${config.nodeEnv}`,
      `  AI provider : ${adapter.id}${config.forceOfflineMode ? ' (forced offline)' : ''}`,
      `  capabilities: ${capabilities.join(', ') || 'none'}`,
      `  store       : ${JSON.stringify(store.stats())}`,
      '',
      '  Health check: GET /api/health',
      '  Lesson text is never logged. See docs/ARCHITECTURE.md for the data position.',
    ].join('\n'),
  );
});

/**
 * Graceful shutdown.
 *
 * `server.close()` stops accepting connections and waits for in-flight requests,
 * so a sync batch that is halfway through is not cut off — which, for a device
 * that has been offline for a week, is the difference between a clean upload and
 * a queue that retries forever. The timer is the escape hatch for a hung socket.
 */
const SHUTDOWN_GRACE_MS = 10_000;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received: finishing in-flight requests.`);
    const forceExit = setTimeout(() => {
      console.warn('Shutdown grace period elapsed; exiting.');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    server.close(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
}
