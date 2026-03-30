import { Zap, Timer, Hourglass, Bomb, BarChart2, FolderOpen, Save, Trash2, X, ArrowLeft, Link2, Ruler, Lightbulb } from 'lucide-react';
import { useRef } from 'react';
import { getPlayerName } from '../../../utils/player';
import { MODE_LABELS } from '../../../utils/questions';
import { fetchResultsList, fetchResultFile } from '../../../services/api';
import RankBadge from '../../RankBadge';
import { useI18n } from '../../../i18n';
import { useSessionStore } from '../../../store/sessionStore';
import { useAudioStore } from '../../../store/audioStore';
import { IS_CONTROL, BACKEND_URL } from '../../../utils/viewMode';
import { useCinematicScroll } from '../../../hooks/useCinematicScroll';
import socket from '../../../services/socket';
import { useShallow } from 'zustand/shallow';

function RoundList({ rounds, nameMap }) {
  const { t } = useI18n();
  if (rounds.length === 0) {
    return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '2rem 0' }}>{t('history_empty')}</p>;
  }
  return (
    <div className="round-history-list">
      {[...rounds].reverse().map(r => (
        <div key={r.roundNum} className="round-history-entry">
          <div className="round-history-header">
            <span className="round-num">#{r.roundNum}</span>
            <span className="round-mode">{MODE_LABELS[r.mode] ?? r.mode}</span>
            <span className="round-time">{new Date(r.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="round-history-awards">
            {(r.awards ?? []).length === 0 && <div className="round-history-nobody">{t('history_nobody')}</div>}
            {(r.awards ?? []).map((a, i) => {
              let timing = null;
              if (r.mode === 'quiz' && a.verdict != null)
                timing = <span className="round-timing">{a.verdict === 'correct' ? '✅' : '❌'}</span>;
              else if (r.mode === 'reflex' && a.ms != null)
                timing = <span className="round-timing"><Zap size={11} /> {a.ms}ms</span>;
              else if (r.mode === 'precision' && a.error != null)
                timing = <span className={`round-timing ${a.error <= 50 ? 'timing-hot' : a.error <= 150 ? 'timing-warm' : ''}`}>{t('off_ms', a.error)}</span>;
              else if (r.mode === 'timer' && a.ms != null)
                timing = <span className="round-timing"><Timer size={11} /> {(a.ms / 1000).toFixed(2)}s</span>;
              else if (r.mode === 'itimer')
                timing = r.scoringType === 'amount' && a.amount != null
                  ? <span className="round-timing"><Hourglass size={11} /> {a.amount}</span>
                  : a.ms != null ? <span className="round-timing"><Hourglass size={11} /> {(a.ms / 1000).toFixed(2)}s</span> : null;
              else if (r.mode === 'bomb' && a.remaining != null)
                timing = <span className={`round-timing ${a.remaining <= 500 ? 'timing-hot' : a.remaining <= 1500 ? 'timing-warm' : ''}`}><Bomb size={11} /> {(a.remaining / 1000).toFixed(3)}{t('s_left')}</span>;
              else if (r.mode === 'hint' && a.verdict != null)
                timing = <span className="round-timing"><Lightbulb size={11} /> {a.verdict === 'correct' ? '✅' : '🔒'}</span>;
              else if (r.mode === 'chain' && a.type != null)
                timing = <span className="round-timing"><Link2 size={11} /> {a.type === 'trap' ? '🔴' : `🟢 ${a.ms}ms`}</span>;
              else if (r.mode === 'estimate' && a.distance != null)
                timing = <span className="round-timing"><Ruler size={11} /> {a.value} (±{a.distance})</span>;
              const nm = { ...nameMap };
              return (
                <div key={a.id} className="round-history-award">
                  <span><RankBadge i={i} /> {getPlayerName(a.id, nm)}</span>
                  <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    {timing}
                    <span className={a.pts < 0 ? 'pts-neg' : a.pts > 0 ? 'pts-pos' : 'pts-zero'}>{a.pts >= 0 ? '+' : ''}{a.pts} pts</span>
                  </span>
                </div>
              );
            })}
            {(r.falseStarts ?? []).map(id => (
              <div key={id} className="round-history-false"><Zap size={11} /> {getPlayerName(id, nameMap)}: {t('false_start')}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RoundHistoryScreen() {
  const { t } = useI18n();
  const { roundHistory, nameMap, loadedPastGame, pastFiles, saveMsg } = useSessionStore(
    useShallow(({ roundHistory, nameMap, loadedPastGame, pastFiles, saveMsg }) =>
      ({ roundHistory, nameMap, loadedPastGame, pastFiles, saveMsg }))
  );
  const { championPlaying, stopChampion } = useAudioStore(useShallow(({ championPlaying, stopChampion }) => ({ championPlaying, stopChampion })));
  const isControl = IS_CONTROL;
  const backendUrl = BACKEND_URL;
  const onSetLoadedPastGame = (v) => useSessionStore.setState({ loadedPastGame: v });
  const onSetPastFiles = (v) => useSessionStore.setState({ pastFiles: v });
  const scrollRef = useRef(null);
  useCinematicScroll(!IS_CONTROL, scrollRef);
  return (
    <div className="fullscreen state-idle" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div ref={scrollRef} className={`settings-panel stats-panel${!isControl ? ' stats-panel--display' : ''}`}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {loadedPastGame && (
              <button className="btn btn--ghost" onClick={() => { onSetLoadedPastGame(null); onSetPastFiles(null); }}>
                <ArrowLeft size={14} /> {t('back')}
              </button>
            )}
            <h2 style={{ margin: 0 }}>
              {loadedPastGame ? <><FolderOpen size={18} /> {loadedPastGame.filename}</> : <><BarChart2 size={18} /> {t('round_history')}</>}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isControl && championPlaying && (
              <button className="btn btn--error" onClick={stopChampion}>{t('stop_champion')}</button>
            )}
            {isControl && (
              <button className="btn btn--ghost" onClick={() => socket.emit('setStatsOpen', { open: false })}>
                <X size={14} /> {t('close')}
              </button>
            )}
          </div>
        </div>

        {/* ── Past-game file picker ── */}
        {isControl && !loadedPastGame && pastFiles === null && (
          <div style={{ marginBottom: '1rem' }}>
            <button className="btn btn--accent" onClick={async () => {
              onSetPastFiles(await fetchResultsList(backendUrl));
            }}><FolderOpen size={15} /> {t('load_past_game')}</button>
          </div>
        )}
        {isControl && !loadedPastGame && pastFiles !== null && (
          <div className="past-files-list">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>{t('saved_games', pastFiles.length)}</span>
              <button className="btn btn--ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => onSetPastFiles(null)}><X size={12} /></button>
            </div>
            {pastFiles.length === 0
              ? <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}>{t('no_saved_files')}</p>
              : pastFiles.map(f => (
                <button key={f.filename} className="btn btn--ghost" onClick={async () => {
                  const data = await fetchResultFile(backendUrl, f.filename);
                  if (!data) return;
                  onSetLoadedPastGame({ ...data, filename: f.filename });
                  onSetPastFiles(null);
                }}>
                  <span className="past-file-name">{f.filename.replace(/^results_/, '').replace('.json', '').replace(/_/g, ' ')}</span>
                  <span className="past-file-meta">{(f.sizeBytes / 1024).toFixed(1)} KB</span>
                </button>
              ))
            }
          </div>
        )}

        {/* ── Rounds ── */}
        {loadedPastGame
          ? <RoundList rounds={loadedPastGame.rounds ?? []} nameMap={{ ...nameMap, ...(loadedPastGame.displayNames ?? {}) }} />
          : <RoundList rounds={roundHistory} nameMap={nameMap} />
        }

        {/* ── Bottom actions (current session only) ── */}
        {isControl && !loadedPastGame && roundHistory.length > 0 && (
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--success" onClick={() => socket.emit('saveRoundHistory')}><Save size={15} /> {t('save_to_file')}</button>
            <button className="btn btn--error" onClick={() => { if (window.confirm(t('clear_history_confirm'))) socket.emit('clearRoundHistory'); }}><Trash2 size={15} /> {t('clear_history')}</button>
            {saveMsg && <span style={{ fontSize: '0.85rem', color: saveMsg.startsWith('Error') ? '#ff7d7d' : '#7dffb0' }}>{saveMsg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
