import { Hono } from 'hono';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import ventasRoutes from './routes/ventas.js';
import comprasRoutes from './routes/compras.js';
import contratosRoutes from './routes/contratos.js';
import agentRoutes from './routes/agent.js';
import prospectoRoutes from './routes/prospecto.js';
import routerRoutes from './routes/router.js';
import { handleQueueMessage } from './services/queue.js';

const app = new Hono();

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    message: 'SII RCV API - Sistema de Integración Tributaria con IA',
    version: '1.0.0',
    status: 'active'
  });
});

// Public routes (no authentication required)
app.route('/api', authRoutes);

// Protected routes (authentication required)
app.use('/api/ventas/*', authMiddleware);
app.use('/api/compras/*', authMiddleware);
app.use('/api/contratos/*', authMiddleware);
app.use('/api/ask', authMiddleware);

app.route('/api/ventas', ventasRoutes);
app.route('/api/compras', comprasRoutes);
app.route('/api/contratos', contratosRoutes);

// Agent routes (WhatsApp service - requires API key)
app.route('/api/agent', agentRoutes);

// Router routes (identifica cliente vs prospecto)
app.route('/api/router', routerRoutes);

// Prospecto routes (usuarios no registrados)
app.route('/api/prospecto', prospectoRoutes);

export default {
  // Handle HTTP requests
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  // Handle scheduled cron triggers
  async scheduled(event, env, ctx) {
    console.log('Cron trigger fired at:', new Date(event.scheduledTime).toISOString());

    try {
      // Get all verified contributors
      const stmt = env.DB.prepare('SELECT rut FROM contributors WHERE verified = 1');
      const { results } = await stmt.all();

      // Queue update tasks for each contributor
      for (const user of results) {
        const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const previousPeriod = new Date(new Date().setMonth(new Date().getMonth() - 1))
          .toISOString().slice(0, 7);

        // Queue messages for updating ventas and compras
        await env.SII_QUEUE.send({
          type: 'update_ventas',
          rut: user.rut,
          periodo: currentPeriod
        });

        await env.SII_QUEUE.send({
          type: 'update_compras',
          rut: user.rut,
          periodo: currentPeriod
        });
      }

      console.log(`Queued updates for ${results.length} contributors`);
    } catch (error) {
      console.error('Error in cron job:', error);
    }
  },

  // Handle queue messages
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        await handleQueueMessage(message.body, env);
        message.ack();
      } catch (error) {
        console.error('Error processing queue message:', error);
        message.retry();
      }
    }
  }
};
