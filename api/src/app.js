import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from './auth.js';
import ideasRouter from './routes/ideas.js';
import connectionsRouter from './routes/connections.js';
import notesRouter, { notesStandalone } from './routes/notes.js';
import mediaRouter, { mediaStandalone } from './routes/media.js';
import tagsRouter from './routes/tags.js';
import graphRouter from './routes/graph.js';
import { handleMcpRequest } from './routes/mcp.js';

const app = new Hono();

// CORS — adjust origin in production
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

// Auth middleware applied to all /api/* routes
app.use('/api/*', bearerAuth());

// Mount routers
app.route('/api/ideas', ideasRouter);

// Notes sub-route under /api/ideas/:id/notes
app.route('/api/ideas/:id/notes', notesRouter);

// Connections
app.route('/api/connections', connectionsRouter);

// Notes standalone (PUT/DELETE)
app.route('/api/notes', notesStandalone);

// Media sub-route under /api/ideas/:id/media
app.route('/api/ideas/:id/media', mediaRouter);

// Media standalone (GET url, DELETE)
app.route('/api/media', mediaStandalone);

// Tags
app.route('/api/tags', tagsRouter);

// Graph
app.route('/api/graph', graphRouter);

// MCP Streamable HTTP endpoint
app.use('/mcp', bearerAuth());
app.post('/mcp', handleMcpRequest);

// Health check (no auth)
app.get('/health', (c) => c.json({ ok: true }));

export default app;
