const { Server } = require('socket.io');
const { verify }  = require('./utils/jwt');
const Appointment = require('./models/Appointment');
const Message     = require('./models/Message');
const ChatReadMarker = require('./models/ChatReadMarker');

function escapeText(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _io;

function getIO() {
  if (!_io) throw new Error('Socket not initialized');
  return _io;
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      socket.user = verify(token);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_chat', async ({ appointmentId }) => {
      try {
        const appt = await Appointment.findById(appointmentId).lean();
        if (!appt) return socket.emit('chat_error', 'Appointment not found');

        const uid = socket.user.id;
        const isParty = String(appt.doctorId) === uid || String(appt.patientId) === uid;
        if (!isParty) return socket.emit('chat_error', 'Forbidden');

        socket.join(`chat:${appointmentId}`);
      } catch (err) {
        console.error('[socket] join_chat error:', err);
        socket.emit('chat_error', 'Server error');
      }
    });

    socket.on('send_message', async ({ appointmentId, type, text, fileUrl, fileName }) => {
      try {
        if (!['text', 'image', 'file'].includes(type)) {
          return socket.emit('chat_error', 'Invalid message type');
        }

        const appt = await Appointment.findById(appointmentId).lean();
        if (!appt) return socket.emit('chat_error', 'Appointment not found');

        const uid = socket.user.id;
        const isParty = String(appt.doctorId) === uid || String(appt.patientId) === uid;
        if (!isParty) return socket.emit('chat_error', 'Forbidden');

        if (appt.status === 'cancelled') {
          return socket.emit('chat_error', 'Appointment is cancelled');
        }

        if (type === 'text') {
          if (!text || !text.trim()) return socket.emit('chat_error', 'Empty message');
          if (text.length > 2000) return socket.emit('chat_error', 'Message too long');
        }

        const msg = await Message.create({
          appointmentId,
          senderId: uid,
          type,
          text: escapeText(text),
          fileUrl: fileUrl || '',
          fileName: fileName || '',
        });

        io.to(`chat:${appointmentId}`).emit('new_message', msg);
      } catch (err) {
        console.error('[socket] send_message error:', err);
        socket.emit('chat_error', 'Failed to send message');
      }
    });

    socket.on('mark_read', async ({ appointmentId }) => {
      try {
        const now = new Date();
        await ChatReadMarker.findOneAndUpdate(
          { appointmentId, userId: socket.user.id },
          { lastReadAt: now },
          { upsert: true, new: true }
        );
        io.to(`chat:${appointmentId}`).emit('read_receipt', {
          appointmentId,
          userId: socket.user.id,
          lastReadAt: now,
        });
      } catch (err) {
        console.error('[socket] mark_read error:', err);
      }
    });
  });

  _io = io;
  return io;
}

module.exports = { initSocket, getIO };
