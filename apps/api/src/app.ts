import cors from 'cors';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';

import type { AiAdapter } from '@sahaj/shared/ai';

import { createAiAdapter, type CreateAiAdapterDeps } from './ai';
import type { AppConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestContext } from './middleware/request-context';
import { createHealthRouter } from './routes/health';
import { createNlpRouter } from './routes/nlp';
import { createProgressRouter } from './routes/progress';
import { createSyncRouter } from './routes/sync';
import { createMemoryStore, type SyncStore } from './store/memory-store';

/**
 * Application factory.
 *
 * A factory rather than a module that starts listening, because tests need many
 * isolated apps in one process, and because the same app runs in a long-lived
 * school server and in a serverless container.
 */
export interface AppDependencies {
  config: AppConfig;
  adapter?: AiAdapter;
  store?: SyncStore;
  /** Adapter construction overrides, used by tests to inject a fake fetch. */
  adapterDeps?: CreateAiAdapterDeps;
}

export interface CreatedApp {
  app: Express;
  adapter: AiAdapter;
  store: SyncStore;
}

/** Everything except the audio upload stays well under this. */
const DEFAULT_JSON_LIMIT = '256kb';
const TRANSCRIBE_PATH = '/api/nlp/transcribe';

export function createApp(dependencies: AppDependencies): CreatedApp {
  const { config } = dependencies;
  const adapter = dependencies.adapter ?? createAiAdapter(config, dependencies.adapterDeps ?? {});
  const store = dependencies.store ?? createMemoryStore();

  const app = express();
  // Behind a school proxy the real client IP and protocol arrive in headers.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here costs nothing and stops
      // an error page from being used to run anything in a browser.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin: config.corsAllowedOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      // No cookies: authentication will be a bearer token held by the PWA, which
      // avoids CSRF entirely for a client that must work offline.
      credentials: false,
      maxAge: 600,
    }),
  );

  app.use(requestContext());

  /**
   * Body parsing is scoped, not global.
   *
   * Audio uploads are base64 JSON and can legitimately reach ~11 MB, while every
   * other endpoint should reject anything over 256 KB. Parsing globally with the
   * large limit would let any caller send an 11 MB body to any route, so the
   * small parser skips the one path that needs the big one and that route
   * installs its own parser (see `routes/nlp.ts`).
   */
  const defaultJsonParser = express.json({ limit: DEFAULT_JSON_LIMIT });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === TRANSCRIBE_PATH) {
      next();
      return;
    }
    defaultJsonParser(req, res, next);
  });

  app.use('/api', createHealthRouter({ config, adapter, store }));
  app.use('/api/nlp', createNlpRouter({ adapter }));
  app.use('/api/sync', createSyncRouter({ store }));
  app.use('/api/progress', createProgressRouter({ store }));

  app.use(notFoundHandler());
  app.use(errorHandler({ isProduction: config.nodeEnv === 'production' }));

  return { app, adapter, store };
}
