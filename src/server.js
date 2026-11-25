import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Op } from 'sequelize';
import sequelize from './config/database.js';
import Session from './models/Session.js';

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
  },
});

const formatSessionResponse = (session) => ({
  sessionId: session.sessionId,
  status: session.status,
  coords:
    session.lat !== null && session.lng !== null
      ? { lat: session.lat, lng: session.lng, accuracy: session.accuracy }
      : null,
  note: session.note,
  expiresAt: session.expiresAt ? new Date(session.expiresAt).getTime() : null,
  updatedAt: session.updatedAt,
});

// Helper untuk menghitung jumlah pemantau (role === 'viewer') di dalam room sesi
const broadcastViewerCount = async (sessionId) => {
  const sockets = await io.in(`session_${sessionId}`).fetchSockets();
  const viewerCount = sockets.filter((s) => s.data.role === 'viewer').length;
  io.to(`session_${sessionId}`).emit('viewer_count', { count: viewerCount });
};

// 1. Socket.IO Connection & Room Handler
io.on('connection', (socket) => {
  socket.on('join_session', async (payload) => {
    const sessionId = typeof payload === 'string' ? payload : payload?.sessionId;
    const role = typeof payload === 'object' ? payload?.role : 'viewer';

    if (!sessionId) return;

    socket.data.sessionId = sessionId;
    socket.data.role = role;
    socket.join(`session_${sessionId}`);

    await broadcastViewerCount(sessionId);
  });

  socket.on('leave_session', async (sessionId) => {
    if (!sessionId) return;
    socket.leave(`session_${sessionId}`);
    await broadcastViewerCount(sessionId);
  });

  // Live Chat dari Pengguna ke Pemantau Publik
  socket.on('send_chat', ({ sessionId, message }) => {
    if (!sessionId || !message?.trim()) return;
    io.to(`session_${sessionId}`).emit('receive_chat', {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: message.trim(),
      sentAt: new Date().toISOString(),
    });
  });

  socket.on('disconnect', async () => {
    if (socket.data.sessionId) {
      await broadcastViewerCount(socket.data.sessionId);
    }
  });
});

// 2. Endpoint GET: Ambil data sesi terakhir
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findByPk(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Sesi belum dimulai atau tidak ditemukan.' });
    }

    return res.json(formatSessionResponse(session));
  } catch (error) {
    console.error('GET Session Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 3. Endpoint POST: Sinkronisasi lokasi GPS, timer, atau perubahan status
app.post('/api/sessions/:sessionId/sync', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, coords, note, expiresAt } = req.body;

    let session = await Session.findByPk(sessionId);

    const updatePayload = {};
    if (status) updatePayload.status = status;
    if (note !== undefined) updatePayload.note = note;
    if (expiresAt !== undefined) {
      updatePayload.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      updatePayload.lat = coords.lat;
      updatePayload.lng = coords.lng;
      updatePayload.accuracy = coords.accuracy || null;
    }

    if (!session) {
      session = await Session.create({
        sessionId,
        status: status || 'IDLE',
        ...updatePayload,
      });
    } else {
      await session.update(updatePayload);
    }

    const formatted = formatSessionResponse(session);
    io.to(`session_${sessionId}`).emit('session_updated', formatted);

    return res.json(formatted);
  } catch (error) {
    console.error('SYNC Session Error:', error);
    return res.status(500).json({ message: 'Gagal menyinkronkan sesi' });
  }
});

// 4. Server-Side Timer Worker (Berjalan tiap 3 detik agar responsif untuk hitungan detik)
setInterval(async () => {
  try {
    const now = new Date();
    const expiredSessions = await Session.findAll({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          [Op.lte]: now,
        },
      },
    });

    for (const session of expiredSessions) {
      await session.update({ status: 'SOS' });
      const formatted = formatSessionResponse(session);
      io.to(`session_${session.sessionId}`).emit('session_updated', formatted);
      console.log(`[ALERT] Sesi ${session.sessionId} melewati batas waktu -> Status SOS!`);
    }
  } catch (error) {
    console.error('Timer Worker Error:', error);
  }
}, 3000);

await sequelize.sync();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SOS Backend berjalan di port ${PORT}`);
});