import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { config } from './server/config.ts';
import { initializeDatabase } from './server/db.ts';
import adminRoutes from './server/routes/admin.ts';
import analyticsRoutes from './server/routes/analytics.ts';
import authRoutes from './server/routes/auth.ts';
import billingRoutes from './server/routes/billing.ts';
import businessRoutes from './server/routes/businesses.ts';
import chatbotRoutes from './server/routes/chatbots.ts';
import conversationRoutes from './server/routes/conversations.ts';
import dashboardRoutes from './server/routes/dashboard.ts';
import domainRoutes from './server/routes/domains.ts';
import knowledgeRoutes from './server/routes/knowledge.ts';
import settingsRoutes from './server/routes/settings.ts';
import ticketRoutes from './server/routes/tickets.ts';
import userRoutes from './server/routes/users.ts';
import widgetRoutes from './server/routes/widget.ts';
import { WIDGET_SCRIPT_SOURCE } from './server/widgetScript.ts';

async function startServer() {
  initializeDatabase();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: 'ChatPilot.API',
        phase: 'Phase 6',
        status: 'Healthy',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Standalone embeddable widget script (cross-domain loadable via <script src="...">)
  app.get('/widget.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(WIDGET_SCRIPT_SOURCE);
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/businesses', businessRoutes);
  app.use('/api/v1/chatbots/:chatbotId/domains', domainRoutes);
  app.use('/api/v1/chatbots/:chatbotId/sources', knowledgeRoutes);
  app.use('/api/v1/chatbots', chatbotRoutes);
  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1', analyticsRoutes);
  app.use('/api/v1', billingRoutes);
  app.use('/api/v1', ticketRoutes);
  app.use('/api/v1/admin', settingsRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/widget', widgetRoutes);

  // Unknown API routes return clean JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, message: 'API endpoint not found.' });
  });

  // Global API error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API Error]', err);
    res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
  });

  if (config.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`ChatPilot AI server listening on http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ChatPilot AI server:', err);
  process.exit(1);
});
