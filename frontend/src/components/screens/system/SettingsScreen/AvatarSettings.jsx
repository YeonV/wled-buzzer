import React from 'react';
import { useI18n } from '../../../../i18n';
import { useSessionStore } from '../../../../store/sessionStore';
import { useShallow } from 'zustand/shallow';
import socket from '../../../../services/socket';
import { SCOREBOARD_POSITIONS } from '../../../../utils/config';

export default function AvatarSettings() {
  const { t } = useI18n();
  const { scoreboardPos, scoreboardActiveOnly, scoreboardVariant, avatarSize, avatarVariant, avatarImageStyle, setAvatarSize, setAvatarVariant, setAvatarImageStyle } = useSessionStore(
    useShallow(({ scoreboardPos, scoreboardActiveOnly, scoreboardVariant, avatarSize, avatarVariant, avatarImageStyle, setAvatarSize, setAvatarVariant, setAvatarImageStyle }) => ({ scoreboardPos, scoreboardActiveOnly, scoreboardVariant, avatarSize, avatarVariant, avatarImageStyle, setAvatarSize, setAvatarVariant, setAvatarImageStyle }))
  );

  const onScoreboardPosChange = (p) => {
    useSessionStore.setState({ scoreboardPos: p });
    sessionStorage.setItem('buzzer-scoreboard-pos', p);
    socket.emit('setScoreboardPos', { pos: p });
  };
  const onScoreboardVariantChange = (v) => {
    useSessionStore.setState({ scoreboardVariant: v });
    sessionStorage.setItem('buzzer-scoreboard-variant', v);
    socket.emit('setScoreboardVariant', { variant: v });
  };
  const onActiveOnlyChange = (v) => {
    useSessionStore.setState({ scoreboardActiveOnly: v });
    sessionStorage.setItem('buzzer-scoreboard-active-only', String(v));
    socket.emit('setScoreboardActiveOnly', { active: v });
  };
  const onAvatarSizeChange = (size) => {
    const s = Math.max(8, Math.min(128, size || 28));
    setAvatarSize(s);
    socket.emit('setAvatarSettings', { size: s, variant: avatarVariant, imageStyle: avatarImageStyle });
  };
  const onAvatarVariantChange = (v) => {
    const variant = v === 'filled' ? 'filled' : 'outlined';
    setAvatarVariant(variant);
    socket.emit('setAvatarSettings', { size: avatarSize, variant, imageStyle: avatarImageStyle });
  };
  const onAvatarImageStyleChange = (v) => {
    const style = v === 'plain' ? 'plain' : (v === 'circle' ? 'circle' : 'rounded');
    setAvatarImageStyle(style);
    socket.emit('setAvatarSettings', { size: avatarSize, variant: avatarVariant, imageStyle: style });
  };

  return (
    <div className="settings-selects-row">
      <div className="outlined-select">
        <select value={scoreboardPos} onChange={e => onScoreboardPosChange(e.target.value)}>
          {SCOREBOARD_POSITIONS.map(({ value, labelKey }) => (
            <option key={value} value={value}>{t(labelKey)}</option>
          ))}
        </select>
        <label>{t('scoreboard_label')}</label>
      </div>

      <div className="outlined-frame" title={t('scoreboard_active_only_hint')}>
        <label>Compact</label>
        <div style={{ position: 'relative', width: 28, height: 16 }}>
          <label className="setup-color-toggle" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={scoreboardActiveOnly} onChange={e => onActiveOnlyChange(e.target.checked)} />
            <span className="setup-color-toggle__track" />
          </label>
        </div>
      </div>

      <div className="outlined-select">
        <select value={scoreboardVariant} onChange={e => onScoreboardVariantChange(e.target.value)}>
          <option value="default">{t('scoreboard_variant_default')}</option>
          <option value="blade">{t('scoreboard_variant_blade')}</option>
        </select>
        <label>{t('scoreboard_variant_label')}</label>
      </div>

      <div className="outlined-input">
        <input
          type="number"
          min="8"
          max="128"
          value={avatarSize}
          onChange={(e) => onAvatarSizeChange(Number(e.target.value) || 28)}
        />
        <label>{t('avatar_size')}</label>
      </div>

      <div className="outlined-select">
        <select value={avatarVariant} onChange={e => onAvatarVariantChange(e.target.value)}>
          <option value="outlined">{t('avatar_variant_outlined') || 'Outlined'}</option>
          <option value="filled">{t('avatar_variant_filled') || 'Filled'}</option>
        </select>
        <label>{t('avatar_variant')}</label>
      </div>

      <div className="outlined-select">
        <select value={avatarImageStyle} onChange={e => onAvatarImageStyleChange(e.target.value)}>
          <option value="plain">{t('avatar_image_style_plain') || 'Plain'}</option>
          <option value="rounded">{t('avatar_image_style_rounded') || 'Rounded'}</option>
          <option value="circle">{t('avatar_image_style_circle') || 'Circle'}</option>
        </select>
        <label>{t('avatar_image_style_label') || 'Image style'}</label>
      </div>
    </div>
  );
}
