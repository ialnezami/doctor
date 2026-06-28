import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Daily from '@daily-co/daily-js';
import useAuthStore from '../../store/authStore';
import { getVideoToken } from '../../api/video';
import client from '../../api/client';

export default function VideoCallPage() {
  const { id: appointmentId } = useParams();
  const navigate              = useNavigate();
  const location              = useLocation();
  const { user }              = useAuthStore();
  const { t }                 = useTranslation();
  const isDoctor              = user?.role === 'doctor';
  const otherPartyName        = location.state?.otherPartyName || t('chat.appointmentChat');

  const [loading, setLoading]               = useState(true);
  const [waiting, setWaiting]               = useState(true);
  const [notesPanelOpen, setNotesPanelOpen] = useState(true);
  const [noteText, setNoteText]             = useState('');
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');

  const videoRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    let frame;

    getVideoToken(appointmentId)
      .then(({ data }) => {
        const { roomUrl, token } = data;
        frame = Daily.createFrame(videoRef.current, {
          showLeaveButton: true,
          showFullscreenButton: true,
          iframeStyle: { width:'100%', height:'100%', border:'none' },
        });
        frameRef.current = frame;

        frame.on('participant-joined', () => setWaiting(false));
        frame.on('left-meeting', () => navigate(-1));

        return frame.join({ url: roomUrl, token });
      })
      .then(() => setLoading(false))
      .catch(() => {
        alert(t('video.connectionError'));
        navigate(-1);
      });

    return () => {
      if (frameRef.current) {
        frameRef.current.leave().catch(() => {});
        frameRef.current.destroy();
        frameRef.current = null;
      }
    };
  }, [appointmentId]);

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await client.post(`/appointments/${appointmentId}/notes`, {
        content: noteText.trim(),
        visibility: 'private',
      });
      setNoteText('');
      setSaveMsg(t('video.noteSaved'));
      setTimeout(() => setSaveMsg(''), 2000);
    } catch {
      setSaveMsg(t('video.noteFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display:'flex', height:'100vh', background:'#000', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', background:'rgba(0,0,0,0.85)', borderBottom:'1px solid rgba(255,255,255,0.1)', flexShrink:0 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background:'rgba(244,63,94,0.15)', border:'1px solid rgba(244,63,94,0.35)', borderRadius:6, padding:'5px 12px', color:'#f43f5e', cursor:'pointer', fontSize:13, fontWeight:700 }}
        >
          {t('video.endCall')}
        </button>
        <span style={{ color:'#fff', fontSize:15, fontWeight:600, flex:1 }}>{otherPartyName}</span>
        {isDoctor && (
          <button
            onClick={() => setNotesPanelOpen(o => !o)}
            style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:6, padding:'5px 12px', color:'#fff', cursor:'pointer', fontSize:12 }}
          >
            {notesPanelOpen ? t('video.hideNotes') : t('video.showNotes')}
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Video area */}
        <div style={{ flex:1, position:'relative' }}>
          {loading && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#111', zIndex:5 }}>
              <div style={{ textAlign:'center', color:'#aaa' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
                <div>{t('video.connecting')}</div>
              </div>
            </div>
          )}

          {waiting && !loading && (
            <div style={{ position:'absolute', top:0, left:0, right:0, zIndex:4, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'rgba(0,0,0,0.7)' }}>
              <span style={{ color:'#fff', fontSize:13 }}>{t('video.waiting', { name: otherPartyName })}</span>
              <button onClick={() => setWaiting(false)} style={{ background:'none', border:'none', color:'var(--mint,#0fe3b0)', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {t('video.connected')}
              </button>
            </div>
          )}

          <div ref={videoRef} style={{ width:'100%', height:'100%' }} />
        </div>

        {/* Notes panel — doctor only */}
        {isDoctor && notesPanelOpen && (
          <div style={{ width:320, borderLeft:'1px solid rgba(255,255,255,0.1)', background:'var(--bg2,#0d1a2b)', display:'flex', flexDirection:'column', padding:16, gap:10 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text,#e2e8f0)' }}>{t('video.privateNote')}</div>
            <div style={{ fontSize:11, color:'var(--text3,#64748b)' }}>{t('video.noteDesc')}</div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={t('video.notePlaceholder')}
              maxLength={2000}
              style={{ flex:1, minHeight:200, background:'var(--bg3,#1e293b)', border:'1px solid var(--border,#2d3748)', borderRadius:8, padding:12, color:'var(--text,#e2e8f0)', fontSize:13, resize:'vertical', outline:'none' }}
            />
            {saveMsg && (
              <div style={{ fontSize:12, color: saveMsg === t('video.noteFailed') ? '#f43f5e' : 'var(--mint,#0fe3b0)' }}>{saveMsg}</div>
            )}
            <button
              onClick={saveNote}
              disabled={!noteText.trim() || saving}
              style={{ padding:'10px 0', background:'var(--mint,#0fe3b0)', border:'none', borderRadius:8, color:'#000', fontWeight:700, fontSize:14, cursor:'pointer', opacity:(!noteText.trim() || saving) ? 0.4 : 1 }}
            >
              {saving ? t('video.saving') : t('video.saveNote')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
