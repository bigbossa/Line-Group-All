import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as line from '@line/bot-sdk';
import cors from 'cors';
import path from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = 3000;

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'dummy'
};

// Initialize LINE client
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken
});

// In-memory store for prototype
const groups: Record<string, any> = {};
const messages: Record<string, any[]> = {};

app.use(cors());

// Webhook route MUST be before express.json()
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const source = event.source;
        if (source.type === 'group' || source.type === 'room') {
          const groupId = source.groupId || source.roomId;
          const userId = source.userId;

          if (!groups[groupId]) {
            try {
              const summary = await client.getGroupSummary(groupId);
              groups[groupId] = { id: groupId, name: summary.groupName, pictureUrl: summary.pictureUrl };
            } catch (e) {
              groups[groupId] = { id: groupId, name: `Group ${groupId.substring(0, 5)}` };
            }
          }

          let userName = 'Unknown';
          if (userId) {
            try {
              const profile = await client.getGroupMemberProfile(groupId, userId);
              userName = profile.displayName;
            } catch (e) {
              userName = `User ${userId.substring(0, 5)}`;
            }
          }

          const msgObj = {
            id: event.message.id,
            text: event.message.text,
            sender: userName,
            timestamp: event.timestamp,
            isMe: false
          };

          if (!messages[groupId]) messages[groupId] = [];
          messages[groupId].push(msgObj);

          io.emit('new_message', { groupId, message: msgObj });
          io.emit('group_updated', groups[groupId]);
        }
      }
    }
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.use(express.json());

app.get('/api/config-check', (req, res) => {
  res.json({
    isConfigured: process.env.LINE_CHANNEL_ACCESS_TOKEN !== undefined && process.env.LINE_CHANNEL_ACCESS_TOKEN !== 'dummy'
  });
});

app.get('/api/groups', (req, res) => {
  res.json(Object.values(groups));
});

app.get('/api/messages/:groupId', (req, res) => {
  res.json(messages[req.params.groupId] || []);
});

app.post('/api/send', async (req, res) => {
  const { groupId, text } = req.body;
  if (!groupId || !text) return res.status(400).json({ error: 'Missing fields' });

  try {
    await client.pushMessage({
      to: groupId,
      messages: [{ type: 'text', text }]
    });

    const msgObj = {
      id: Date.now().toString(),
      text,
      sender: 'Me',
      timestamp: Date.now(),
      isMe: true
    };

    if (!messages[groupId]) messages[groupId] = [];
    messages[groupId].push(msgObj);

    io.emit('new_message', { groupId, message: msgObj });
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
