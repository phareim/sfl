import { searchIdeas, listIdeas, getIdea, insertIdea, getIdeaConnections, getIdeaNotes } from '../db/ideas.js';
import { insertConnection } from '../db/connections.js';
import { insertNote } from '../db/notes.js';
import { putJson, getJson, dataKey } from '../lib/r2.js';
import { generateId } from '../lib/nanoid.js';

const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'list_tags',
    description: 'List all tags with usage counts. Call this before capture_idea to find relevant tag IDs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'capture_idea',
    description:
      'Primary capture tool: save a note to SFL. First call list_tags to find 1–3 relevant tags and pass their IDs in tag_ids. If no relevant tag exists, create one first with create_idea (type="tag", title="…").',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Note content' },
        title: { type: 'string', description: 'Optional short title' },
        tag_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of tag ideas to apply (1–3)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'search_ideas',
    description: 'Full-text search across idea titles and summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['q'],
    },
  },
  {
    name: 'list_ideas',
    description: 'List ideas, optionally filtered by type or tag.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Filter by type: note, page, quote, book, tweet, image, tag' },
        tag: { type: 'string', description: 'Filter by tag ID or tag title' },
        limit: { type: 'number', description: 'Max results (default 20)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
      },
    },
  },
  {
    name: 'get_idea',
    description: 'Get full details of an idea including its content, notes, and connections.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Idea ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_idea',
    description: 'Create a new idea of any type (note, page, quote, book, tweet, image, tag).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Idea type' },
        title: { type: 'string', description: 'Title' },
        url: { type: 'string', description: 'URL (for page/tweet types)' },
        summary: { type: 'string', description: 'Short summary' },
        data: { type: 'object', description: 'Type-specific content blob' },
      },
      required: ['type'],
    },
  },
  {
    name: 'tag_idea',
    description: 'Tag an idea by connecting it to a tag idea.',
    inputSchema: {
      type: 'object',
      properties: {
        idea_id: { type: 'string', description: 'ID of the idea to tag' },
        tag_id: { type: 'string', description: 'ID of the tag idea' },
      },
      required: ['idea_id', 'tag_id'],
    },
  },
  {
    name: 'create_connection',
    description: 'Create a labeled connection between two ideas.',
    inputSchema: {
      type: 'object',
      properties: {
        from_id: { type: 'string', description: 'Source idea ID' },
        to_id: { type: 'string', description: 'Target idea ID' },
        label: { type: 'string', description: 'Connection label (optional)' },
      },
      required: ['from_id', 'to_id'],
    },
  },
  {
    name: 'add_note',
    description: 'Add a note to an existing idea.',
    inputSchema: {
      type: 'object',
      properties: {
        idea_id: { type: 'string', description: 'ID of the idea' },
        body: { type: 'string', description: 'Note content' },
      },
      required: ['idea_id', 'body'],
    },
  },
];

async function executeTool(name, args, env) {
  switch (name) {
    case 'list_tags': {
      const { results } = await env.DB
        .prepare(
          `SELECT t.*, COUNT(c.id) as usage_count
           FROM ideas t
           LEFT JOIN connections c ON c.to_id = t.id AND c.label = 'tagged_with'
           WHERE t.type = 'tag'
           GROUP BY t.id
           ORDER BY usage_count DESC, t.title ASC`
        )
        .all();
      return { tags: results };
    }

    case 'capture_idea': {
      const id = generateId();
      const now = Date.now();
      const r2Key = dataKey(id);

      await putJson(env.R2, r2Key, { text: args.content });
      await insertIdea(env.DB, {
        id,
        type: 'note',
        title: args.title ?? null,
        url: null,
        summary: null,
        r2_key: r2Key,
        created_at: now,
        updated_at: now,
      });

      if (args.tag_ids?.length) {
        await Promise.all(
          args.tag_ids.map((tag_id) =>
            insertConnection(env.DB, {
              id: generateId(),
              from_id: id,
              to_id: tag_id,
              label: 'tagged_with',
              created_at: now,
            })
          )
        );
      }

      const idea = await getIdea(env.DB, id);
      return { idea };
    }

    case 'search_ideas': {
      const ideas = await searchIdeas(env.DB, args.q, { limit: args.limit });
      return { ideas };
    }

    case 'list_ideas': {
      return listIdeas(env.DB, {
        type: args.type,
        tag: args.tag,
        limit: args.limit,
        cursor: args.cursor,
      });
    }

    case 'get_idea': {
      const idea = await getIdea(env.DB, args.id);
      if (!idea) return { error: `Idea ${args.id} not found` };

      const [data, connections, notes] = await Promise.all([
        getJson(env.R2, idea.r2_key),
        getIdeaConnections(env.DB, args.id),
        getIdeaNotes(env.DB, args.id),
      ]);

      return { idea, data: data ?? {}, connections, notes };
    }

    case 'create_idea': {
      const id = generateId();
      const now = Date.now();
      const r2Key = dataKey(id);

      await putJson(env.R2, r2Key, args.data ?? {});
      await insertIdea(env.DB, {
        id,
        type: args.type,
        title: args.title ?? null,
        url: args.url ?? null,
        summary: args.summary ?? null,
        r2_key: r2Key,
        created_at: now,
        updated_at: now,
      });

      const idea = await getIdea(env.DB, id);
      return { idea };
    }

    case 'tag_idea': {
      const id = generateId();
      await insertConnection(env.DB, {
        id,
        from_id: args.idea_id,
        to_id: args.tag_id,
        label: 'tagged_with',
        created_at: Date.now(),
      });
      return { tagged: true, idea_id: args.idea_id, tag_id: args.tag_id };
    }

    case 'create_connection': {
      const id = generateId();
      await insertConnection(env.DB, {
        id,
        from_id: args.from_id,
        to_id: args.to_id,
        label: args.label ?? null,
        created_at: Date.now(),
      });
      return { connection: { id, from_id: args.from_id, to_id: args.to_id, label: args.label ?? null } };
    }

    case 'add_note': {
      const id = generateId();
      const now = Date.now();
      await insertNote(env.DB, { id, idea_id: args.idea_id, body: args.body, created_at: now, updated_at: now });
      const note = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
      return { note };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(msg, env) {
  // Notifications have no id — acknowledge with null (caller returns 202)
  if (!('id' in msg)) return null;

  const { id, method, params } = msg;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: 'sfl', version: '1.0.0' },
      capabilities: { tools: {} },
    });
  }

  if (method === 'ping') {
    return rpcResult(id, {});
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params ?? {};
    if (!name) return rpcError(id, -32602, 'Missing tool name');
    try {
      const result = await executeTool(name, args ?? {}, env);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    } catch (err) {
      return rpcResult(id, {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      });
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

export async function handleMcpRequest(c) {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, 'Parse error'), 400);
  }

  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((msg) => handleMessage(msg, c.env)));
    const filtered = responses.filter((r) => r !== null);
    if (filtered.length === 0) return new Response(null, { status: 202 });
    return c.json(filtered);
  }

  const result = await handleMessage(body, c.env);
  if (result === null) return new Response(null, { status: 202 });
  return c.json(result);
}
