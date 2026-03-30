import { getPlayerName } from '../utils/player';
import SuitAvatar from './SuitAvatar';
import Buzzer from './Buzzer';
import { useSessionStore } from '../store/sessionStore';
import { useGameStore } from '../store/gameStore';
import { useSetupStore, selectMqttDevices } from '../store/setupStore';
import { PALETTE } from '../utils/setupHelpers';
import { useShallow } from 'zustand/shallow';

export default function ScoreboardBlade() {
  const { seenIds, nameMap, iconMap, avatarVariant, avatarImageStyle } = useSessionStore(
    useShallow(({ seenIds, nameMap, iconMap, avatarVariant, avatarImageStyle }) =>
      ({ seenIds, nameMap, iconMap, avatarVariant, avatarImageStyle }))
  );
  const { scores, winner, gameMode, auraState, teamMode, teamAssignments, teamNames, teamColors } = useGameStore(
    useShallow(({ scores, winner, gameMode, auraState, teamMode, teamAssignments, teamNames, teamColors }) =>
      ({ scores, winner, gameMode, auraState, teamMode, teamAssignments, teamNames, teamColors }))
  );
  const colorMap = useSetupStore(s => s.colorMap);
  const mqttDevices = useSetupStore(selectMqttDevices);

  if (seenIds.length === 0) return null;

  const mqttDeviceIndex = Object.fromEntries(mqttDevices.map(([key], i) => [key, i]));
  const sorted = seenIds.map(id => [id, scores[id] ?? 0]).sort(([, a], [, b]) => b - a);
  const maxPts = sorted[0]?.[1] ?? 0;

  // ── Team view ──────────────────────────────────────────────────────────
  if (teamMode && teamNames.length > 0) {
    const isQuizLike = gameMode === 'quiz' || gameMode === 'hint';
    const winnerTeamIdx = winner ? teamAssignments[winner] : null;
    const teamScores = teamNames.map((tName, ti) => {
      const members = Object.entries(teamAssignments).filter(([, t]) => t === ti).map(([id]) => id);
      const total = members.reduce((s, id) => s + (scores[id] ?? 0), 0);
      return { name: tName, index: ti, members, total, color: teamColors[ti] };
    }).sort((a, b) => b.total - a.total);
    const maxTeamPts = teamScores[0]?.total ?? 0;

    return (
      <div className="sb-blade sb-blade--teams">
        {teamScores.map(team => {
          const teamColor = team.color || [100, 100, 100];
          const rgb = `rgb(${teamColor.join(',')})`;
          const isBuzzing = isQuizLike && winnerTeamIdx === team.index;
          const isDimmed = isQuizLike && winner && winnerTeamIdx !== team.index;
          const isLeader = team.total === maxTeamPts && team.total > 0;

          return (
            <div key={team.index} className={`sb-blade__card sb-blade__card--team${isLeader ? ' sb-blade__card--leader' : ''}${isBuzzing ? ' sb-blade__card--buzzing' : ''}${isDimmed ? ' sb-blade__card--dim' : ''}`}>
              {/* Team member avatars */}
              <div className="sb-blade__team-avatars">
                {team.members.map(id => {
                  const mName = getPlayerName(id, nameMap);
                  const colEntry = colorMap[id];
                  const dIdx = mqttDeviceIndex[id] ?? 0;
                  const mColor = colEntry?.useIndividual ? colEntry.color : PALETTE[dIdx % PALETTE.length];
                  return (
                    <SuitAvatar
                      key={id}
                      aura={!!auraState[id]}
                      auraColor={mColor}
                      name={mName}
                      icon={iconMap?.[id]}
                      size={80}
                      variant={avatarVariant ?? 'outlined'}
                      imageStyle={avatarImageStyle ?? 'rounded'}
                    />
                  );
                })}
              </div>
              {/* Team footer with buzzer + name + score */}
              <div className="sb-blade__footer sb-blade__footer--team" style={{ borderColor: `${rgb}40` }}>
                <Buzzer variant="perspective" buzzing={isBuzzing} online color={teamColor} size={80} />
                <div className="sb-blade__meta">
                  <span className="sb-blade__name">
                    <span className="team-color-dot" style={{ background: rgb, width: '1.2rem', height: '1.2rem' }} />
                    {team.name}
                  </span>
                  <span className={`sb-blade__pts${team.total < 0 ? ' neg' : ''}`}>{team.total}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="sb-blade">
      {sorted.map(([id, pts]) => {
        const name = getPlayerName(id, nameMap);
        const colEntry = colorMap[id];
        const deviceIndex = mqttDeviceIndex[id] ?? 0;
        const color = colEntry?.useIndividual ? colEntry.color : PALETTE[deviceIndex % PALETTE.length];
        const isQuizLike = gameMode === 'quiz' || gameMode === 'hint';
        const isBuzzing = isQuizLike && winner === id;
        const isDimmed  = isQuizLike && !!winner && winner !== id;
        const hasAura = !!auraState[id];
        const isLeader = pts === maxPts && pts > 0;

        return (
          <div key={id} className={`sb-blade__card${isLeader ? ' sb-blade__card--leader' : ''}${isBuzzing ? ' sb-blade__card--buzzing' : ''}${isDimmed ? ' sb-blade__card--dim' : ''}`}>
            <div className="sb-blade__avatar">
              <SuitAvatar
                aura={hasAura}
                auraColor={color}
                name={name}
                icon={iconMap?.[id]}
                size={320}
                variant={avatarVariant ?? 'outlined'}
                imageStyle={avatarImageStyle ?? 'rounded'}
              />
            </div>
            <div className="sb-blade__footer">
              <Buzzer variant="perspective" buzzing={isBuzzing} online color={color} size={80} />
              <div className="sb-blade__meta">
                <span className="sb-blade__name">{name}</span>
                <span className={`sb-blade__pts${pts < 0 ? ' neg' : ''}`}>{pts}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
