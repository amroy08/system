import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { api } from '../api';

const TAG_COLORS = {
  Student: '#0f2248', Teacher: '#0ea5e9', Parent: '#ec4899', User: '#64748b',
  Receipt: '#16a34a', Asset: '#d97706', Book: '#7c3aed', Exam: '#dc2626', 'Salary Slip': '#0d9488',
};

export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); setSel(0); }
  }, [open]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q } });
        setResults(data);
        setSel(0);
      } catch { setResults([]); }
      setLoading(false);
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  const go = useCallback((item) => {
    if (!item) return;
    onClose();
    navigate(item.route);
  }, [navigate, onClose]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); }
    else if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk">
        <div className="cmdk-input">
          <Search size={17} />
          <input
            autoFocus
            placeholder="Search students, teachers, receipts, books, assets…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="cmdk-list">
          {q.length < 2 && <div className="cmdk-item muted">Type at least 2 characters to search everything…</div>}
          {q.length >= 2 && !loading && results.length === 0 && (
            <div className="cmdk-item muted">No results for “{q}”</div>
          )}
          {results.map((r, i) => (
            <div key={i} className={`cmdk-item ${i === sel ? 'sel' : ''}`}
              onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <span className="tag" style={{ background: TAG_COLORS[r.type] || 'var(--primary)' }}>{r.type}</span>
              <div>
                <b>{r.title}</b>
                <div className="small muted">{r.subtitle}</div>
              </div>
              {i === sel && <CornerDownLeft size={14} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span>
          <span><span className="kbd">Enter</span> open</span>
          <span><span className="kbd">Ctrl</span> + <span className="kbd">K</span> toggle</span>
        </div>
      </div>
    </div>
  );
}
