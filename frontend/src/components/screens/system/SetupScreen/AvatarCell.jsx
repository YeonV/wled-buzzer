import React from 'react';
import SuitAvatar from '../../../SuitAvatar';
import AvatarUpload from '../../../AvatarUpload';
import { useSessionStore } from '../../../../store/sessionStore';
import { IS_MODERATOR } from '../../../../utils/viewMode';
import { useSetupStore } from '../../../../store/setupStore';

export default function AvatarCell({ id, displayName, icon }) {
  const avatarImageStyle = useSessionStore(s => s.avatarImageStyle);
  const setIcon = useSetupStore(s => s.setIcon);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <SuitAvatar name={displayName} icon={icon} edit={IS_MODERATOR} onChange={(ic) => setIcon(id, ic)} imageStyle={avatarImageStyle ?? 'rounded'} />
      <AvatarUpload hexId={id} currentIcon={icon} onUploaded={(filename) => setIcon(id, `avatar:${filename}`)} />
      <button className="btn btn--icon btn--ghost btn--small" title="Clear avatar" onClick={() => setIcon(id, undefined)}>✕</button>
    </div>
  );
}
