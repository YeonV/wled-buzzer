import React from 'react';
import Buzzer from './Buzzer';
import SuitAvatar from './SuitAvatar';
import { hasAvatarImage } from '../utils/avatarHelpers';
import { useSessionStore } from '../store/sessionStore';
import { useShallow } from 'zustand/shallow';

export default function BuzzerCard({ device, aliases = [], color = '#cc1515', size = 130 }) {
  const online = !!device.ip;
  const anyAliasBuzz = aliases.some(a => !!a?.buzzing);
  const primaryBuzzing = !!device.buzzing || anyAliasBuzz;
  const { iconMap, avatarVariant, avatarImageStyle } = useSessionStore(useShallow(({ iconMap, avatarVariant, avatarImageStyle }) => ({ iconMap, avatarVariant, avatarImageStyle })));
  const resolvedIcon = device.icon ?? (device.hexId ? iconMap?.[device.hexId] : undefined);

  return (
    <div className="buzzer-cluster">
      <Buzzer variant="perspective" buzzing={primaryBuzzing} online={online} color={color} size={size} />

      <div className="buzzer-cluster__card card-border">
        {/* Unified list: primary + aliases rendered identically */}
        {(() => {
          const rows = [device, ...aliases];
          const allHaveImages = rows.every((r) => {
            if (!r) return false;
            const rIcon = r === device ? resolvedIcon : (r.icon ?? (r.hexId ? iconMap?.[r.hexId] : undefined));
            const rName = r.name || r.wledName || r.hexId || r.ip || '';
            return hasAvatarImage(rIcon, rName);
          });
          return (
            <div className="buzzer-cluster__list">
              {rows.map((r, i) => {
                if (!r) return null;
                const rowName = r.name || r.wledName || r.hexId || r.ip || '???';
                const rowBuzz = !!r.buzzing;
                const rowOnline = !!r.ip;
                const rowIcon = i === 0 ? resolvedIcon : (r.icon ?? (r.hexId ? iconMap?.[r.hexId] : undefined));
                return (
                  <React.Fragment key={r.hexId ?? r.ip ?? rowName}>
                      <div className="buzzer-list-item">
                        {!allHaveImages && <div
                          className={`buzzer-list-icon${rowBuzz ? ' buzzer-list-icon--on' : ''}`}
                          style={{
                            background: rowBuzz ? color : 'transparent',
                            boxShadow: rowBuzz ? `0 0 8px ${color}` : 'none',
                          }}
                        />}
                        <div className="buzzer-list-item__inner">
                          <div className="buzzer-avatar-wrap">
                            <SuitAvatar
                            aura={rowBuzz}
                            auraColor={color}
                            name={rowName}
                            icon={rowIcon}
                            edit={false}
                            size={Math.round(size * 0.4)}
                            variant={avatarVariant ?? 'outlined'}
                            imageStyle={avatarImageStyle ?? 'rounded'}
                          />
                          </div>
                          <span className="buzzer-label">{rowName}</span>
                          <span className="buzzer-status" style={{ color: rowOnline ? 'rgba(100,230,140,0.65)' : 'rgba(230,80,80,0.45)' }}>{rowOnline ? '●' : '○'}</span>
                        </div>
                      </div>
                    {i < rows.length - 1 && (
                      <div className="buzzer-cluster__divider" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
