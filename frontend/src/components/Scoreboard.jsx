import { useRef, useCallback } from 'react';
import { Skull, CheckCircle2 } from 'lucide-react';
import { getPlayerName } from '../utils/player';
import SuitAvatar from './SuitAvatar';
import { useI18n } from '../i18n';
import { useSessionStore } from '../store/sessionStore';
import { useGameStore } from '../store/gameStore';
import { useQuizStore } from '../store/quizStore';
import { useSetupStore, selectMqttDevices } from '../store/setupStore';
import { PALETTE } from '../utils/setupHelpers';
import { IS_MODERATOR, IS_CONTROL, IS_SCOREBOARD } from '../utils/viewMode';
import { useShallow } from 'zustand/shallow';
import socket from '../services/socket';

export default function Scoreboard() {
  const { t } = useI18n();
  const { seenIds, nameMap, iconMap, scoreboardPos, scoreboardActiveOnly, avatarSize, avatarVariant, avatarImageStyle, scoreboardTopN, scoreboardShowGaps } = useSessionStore(
    useShallow(({ seenIds, nameMap, iconMap, scoreboardPos, scoreboardActiveOnly, avatarSize, avatarVariant, avatarImageStyle, scoreboardTopN, scoreboardShowGaps }) => ({ seenIds, nameMap, iconMap, scoreboardPos, scoreboardActiveOnly, avatarSize, avatarVariant, avatarImageStyle, scoreboardTopN, scoreboardShowGaps }))
  );
  const { scores, gameMode, winner, autoWrongMs, presetsReady, survivorPhase, survivorEliminated, auraState, teamMode, teamAssignments, teamNames, teamColors } = useGameStore(
    useShallow(({ scores, gameMode, winner, autoWrongMs, presetsReady, survivorPhase, survivorEliminated, auraState, teamMode, teamAssignments, teamNames, teamColors }) =>
      ({ scores, gameMode, winner, autoWrongMs, presetsReady, survivorPhase, survivorEliminated, auraState, teamMode, teamAssignments, teamNames, teamColors }))
  );
  const colorMap = useSetupStore(s => s.colorMap);
  const mqttDevices = useSetupStore(selectMqttDevices);
  const buzzCountdown = useGameStore(s => s.buzzCountdown);
  const setupStatus   = useGameStore(useShallow(s =>
    Object.fromEntries(s.setupLog.filter(l => l.name).map(l => [l.name, l.type]))
  ));
  const currentQ = useQuizStore(s => s.getCurrentQ());

  const isMobile = window.innerWidth <= 768;
  const effectiveAvatarSize = isMobile ? Math.min(avatarSize ?? 16, 48) : (avatarSize ?? 16);
  const longPressRef = useRef(null);
  const handleAuraDown = useCallback((id) => {
    if (!IS_MODERATOR) return;
    longPressRef.current = setTimeout(() => { socket.emit('toggleAura', { id }); longPressRef.current = null; }, 600);
  }, []);
  const handleAuraUp = useCallback(() => { clearTimeout(longPressRef.current); longPressRef.current = null; }, []);

  // "Active only" mode: on main display, only show the buzzed player (winner spotlight)
  const isMainDisplay = !IS_CONTROL && !IS_SCOREBOARD;
  const activeOnly = scoreboardActiveOnly && isMainDisplay;

  if (seenIds.length === 0) return null;
  if (activeOnly && !winner) return null;
  if (!IS_MODERATOR && !IS_SCOREBOARD && ['intro', 'rules'].includes(currentQ?.mode)) return null;
  const mqttDeviceIndex = Object.fromEntries(mqttDevices.map(([key], i) => [key, i]));
  const visibleIds = activeOnly ? seenIds.filter(id => id === winner) : seenIds;
  let sorted = visibleIds.map((id) => [id, scores[id] ?? 0]).sort(([, a], [, b]) => b - a);
  // Apply topN filter
  if (scoreboardTopN > 0 && !activeOnly) sorted = sorted.slice(0, scoreboardTopN);
  const maxPts = sorted[0]?.[1] ?? 0;
  const cls = IS_SCOREBOARD ? 'scoreboard' : (scoreboardPos ? `scoreboard scoreboard--${scoreboardPos}` : 'scoreboard');

  // ── Team scoreboard view ──────────────────────────────────────────────
  if (teamMode && teamNames.length > 0) {
    const teamScores = teamNames.map((name, ti) => {
      const members = Object.entries(teamAssignments).filter(([, t]) => t === ti).map(([id]) => id);
      const total = members.reduce((s, id) => s + (scores[id] ?? 0), 0);
      return { name, index: ti, members, total, color: teamColors[ti] };
    }).sort((a, b) => b.total - a.total);

    return (
      <div className={cls}>
        {teamScores.map(team => (
          <div key={team.index} className="score-row score-row--team" style={{ borderLeftColor: `rgb(${(team.color || [100,100,100]).join(',')})` }}>
            <span className="score-name">
              <span className="team-color-dot" style={{ background: `rgb(${(team.color || [100,100,100]).join(',')})` }} />
              {team.name}
              <span className="team-members-count">({team.members.length})</span>
            </span>
            <span className={`score-pts ${team.total < 0 ? 'neg' : ''}`}>{team.total}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cls}>
      {sorted.map(([id, pts]) => {
        const isQuizLike = gameMode === 'quiz' || gameMode === 'hint';
        const isBuzzing = isQuizLike && winner === id;
        const isDimmed  = isQuizLike && !!winner && winner !== id;
        const name = getPlayerName(id, nameMap);
        const colEntry = colorMap[id];
        const deviceIndex = mqttDeviceIndex[id] ?? 0;
        const auraColor = colEntry?.useIndividual ? colEntry.color : PALETTE[deviceIndex % PALETTE.length];
        return (
          <div
            key={id}
            className={[
              'score-row',
              !presetsReady ? 'score-row--loading' : '',
              presetsReady && pts === maxPts && pts > 0 ? 'score-row--leader' : '',
              survivorPhase !== 'idle' && survivorEliminated.includes(id) ? 'score-row-eliminated' : '',
              isBuzzing ? 'score-row--buzzing' : '',
              isDimmed  ? 'score-row--dim'     : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="score-name">
              {survivorPhase !== 'idle' && survivorEliminated.includes(id) && (
                <span className="survivor-skull"><Skull size={14} /> </span>
              )}
              <span
                onPointerDown={() => handleAuraDown(id)}
                onPointerUp={handleAuraUp}
                onPointerLeave={handleAuraUp}
                onContextMenu={IS_MODERATOR ? e => e.preventDefault() : undefined}
              >
                <SuitAvatar aura={!!auraState[id]} auraColor={auraColor} name={name} icon={iconMap?.[id]} size={effectiveAvatarSize} variant={avatarVariant ?? 'outlined'} imageStyle={avatarImageStyle ?? 'rounded'} />
              </span>
              {name}
              {isBuzzing && <span className="score-row-turn-label">{t('score_row_turn')}</span>}
              {isBuzzing && autoWrongMs > 0 && buzzCountdown !== null && (
                <span className="score-row-countdown">{(buzzCountdown / 1000).toFixed(3)}s</span>
              )}
            </span>
            {presetsReady
              ? <>
                  <span className={`score-pts ${pts < 0 ? 'neg' : ''}`}>{pts}</span>
                  {scoreboardShowGaps && sorted.indexOf(sorted.find(s => s[0] === id)) > 0 && (() => {
                    const idx = sorted.findIndex(s => s[0] === id);
                    const gap = sorted[idx - 1][1] - pts;
                    return gap > 0 ? <span className="score-gap">-{gap}</span> : null;
                  })()}
                </>

              : (() => {
                  const st = setupStatus[name];
                  return (st === 'done' || st === 'skipped')
                    ? <span className="pts-status-done"><CheckCircle2 size={16} style={{ color: '#00ff88' }} /></span>
                    : <span className="pts-spinner" aria-label="Loading…" />;
                })()
            }
          </div>
        );
      })}
    </div>
  );
}
