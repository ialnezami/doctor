import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import useAuthStore from '../../store/authStore';
import { getMessages, uploadAttachment } from '../../api/chat';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const SOCKET_URL = API_BASE.replace('/api', '');

export default function ChatPage() {
  const { id: appointmentId } = useParams();
  const { token, user }       = useAuthStore();
  const navigate              = useNavigate();
  const location              = useLocation();
  const { t }                 = useTranslation();
  const otherPartyName        = location.state?.otherPartyName || t('chat.appointmentChat');

  const [messages, setMessages]           = useState([]);
  const [text, setText]                   = useState('');
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [oldestId, setOldestId]           = useState(null);
  const [hasMore, setHasMore]             = useState(true);
  const [otherLastRead, setOtherLastRead] = useState(null);
  const [cancelled, setCancelled]         = useState(false);
  const [incomingCall, setIncomingCall]   = useState(null);

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadHistory = useCallback(async (before) => {
    try {
      const res = await getMessages(appointmentId, before);
      const fetched = res.messages || [];
      if (!before) {
        setMessages(fetched);
        setTimeout(scrollToBottom, 50);
      } else {
        setMessages(prev => [...fetched, ...prev]);
      }
      if (fetched.length > 0) setOldestId(fetched[0]._id);
      if (fetched.length < 20) setHasMore(false);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    loadHistory(null);

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_chat', { appointmentId });
      socket.emit('mark_read', { appointmentId });
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(scrollToBottom, 30);
    });

    socket.on('read_receipt', ({ userId, lastReadAt }) => {
      if (userId !== user.id) setOtherLastRead(new Date(lastReadAt));
    });

    socket.on('chat_error', (err) => {
      if (err === 'Appointment is cancelled') setCancelled(true);
    });

    socket.on('video_call_started', ({ callerRole }) => {
      setIncomingCall(callerRole);
    });

    return () => socket.disconnect();
  }, [appointmentId, token]);

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed || !socketRef.current?.connected || cancelled) return;
    socketRef.current.emit('send_message', { appointmentId, type: 'text', text: trimmed });
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const { fileUrl, fileName, type } = await uploadAttachment(appointmentId, form);
      socketRef.current?.emit('send_message', { appointmentId, type, fileUrl, fileName });
    } catch {
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const markRead = () => {
    if (socketRef.current?.connected) socketRef.current.emit('mark_read', { appointmentId });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }} onFocus={markRead}>
      {incomingCall && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:'var(--mint,#0fe3b0)', color:'#000', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 2px 12px rgba(0,0,0,0.3)' }}>
          <span style={{ fontWeight:600, fontSize:14 }}>
            {incomingCall === 'doctor' ? 'Doctor' : 'Patient'} started the video call
          </span>
          <div style={{ display:'flex', gap:10 }}>
            <button
              onClick={() => { setIncomingCall(null); navigate(`/appointments/${appointmentId}/video`, { state: { otherPartyName } }); }}
              style={{ background:'#000', color:'var(--mint,#0fe3b0)', border:'none', borderRadius:6, padding:'6px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}
            >
              Join
            </button>
            <button
              onClick={() => setIncomingCall(null)}
              style={{ background:'rgba(0,0,0,0.15)', color:'#000', border:'none', borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:13 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(6,13,24,0.95)', backdropFilter:'blur(14px)', borderBottom:'1px solid var(--border)', padding:'12px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'var(--mint)', cursor:'pointer', fontSize:14 }}>
          {t('chat.back')}
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:600 }}>{otherPartyName}</div>
          <div style={{ fontSize:11, color:'var(--text3)' }}>{t('chat.appointmentChat')}</div>
        </div>
      </div>

      {cancelled && (
        <div style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', margin:'12px 16px', padding:'10px 16px', borderRadius:8, fontSize:13, color:'var(--rose)' }}>
          {t('chat.cancelled')}
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
        {loading && <p style={{ color:'var(--text3)', fontSize:13, textAlign:'center' }}>{t('chat.loading')}</p>}
        {!loading && hasMore && (
          <div style={{ textAlign:'center', marginBottom:12 }}>
            <button onClick={() => loadHistory(oldestId)} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'5px 14px', color:'var(--text2)', cursor:'pointer', fontSize:12 }}>
              {t('chat.loadEarlier')}
            </button>
          </div>
        )}

        {messages.map((msg, idx) => {
          const senderStr = msg.senderId?._id ? String(msg.senderId._id) : String(msg.senderId ?? '');
          const mine  = senderStr === String(user.id);
          const ts    = new Date(msg.createdAt);
          const isLast = idx === messages.length - 1;
          const seen  = mine && isLast && otherLastRead && otherLastRead > new Date(msg.createdAt);

          return (
            <div key={msg._id} style={{ display:'flex', flexDirection:'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom:6 }}>
              <div style={{
                maxWidth:'82%', padding:'9px 13px', borderRadius:14,
                borderBottomRightRadius: mine ? 4 : 14,
                borderBottomLeftRadius: mine ? 14 : 4,
                background: mine ? 'rgba(15,227,176,0.18)' : 'var(--bg3)',
                border: mine ? '1px solid rgba(15,227,176,0.3)' : '1px solid var(--border)',
              }}>
                {msg.type === 'text'  && <span style={{ fontSize:14, color:'var(--text)', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{msg.text}</span>}
                {msg.type === 'image' && <span style={{ fontSize:13, color:'var(--text2)' }}>📷 {msg.fileName}</span>}
                {msg.type === 'file'  && <span style={{ fontSize:13, color:'var(--text2)' }}>📎 {msg.fileName}</span>}
                <div style={{ fontSize:10, color:'var(--text3)', textAlign:'right', marginTop:4 }}>
                  {ts.getHours()}:{String(ts.getMinutes()).padStart(2,'0')}
                </div>
              </div>
              {seen && <span style={{ fontSize:10, color:'var(--text3)', marginTop:2, marginRight:4 }}>{t('chat.seen')}</span>}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px', background:'var(--bg2)', display:'flex', alignItems:'flex-end', gap:10 }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={cancelled || uploading}
          title={t('chat.attachFile')}
          style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', cursor:'pointer', color:'var(--text2)', fontSize:16, opacity:(cancelled || uploading) ? 0.4 : 1 }}
        >
          {uploading ? '⏳' : '📎'}
        </button>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={cancelled}
          placeholder={cancelled ? t('chat.readOnly') : t('chat.messagePlaceholder')}
          maxLength={2000}
          rows={1}
          style={{ flex:1, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'9px 13px', color:'var(--text)', fontSize:14, resize:'none', outline:'none', maxHeight:120, overflowY:'auto', opacity:cancelled ? 0.5 : 1 }}
        />
        <button
          onClick={sendText}
          disabled={!text.trim() || cancelled}
          style={{ background:'var(--mint)', border:'none', borderRadius:10, padding:'9px 18px', color:'#000', fontWeight:700, fontSize:13, cursor:'pointer', opacity:(!text.trim() || cancelled) ? 0.4 : 1, whiteSpace:'nowrap' }}
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
