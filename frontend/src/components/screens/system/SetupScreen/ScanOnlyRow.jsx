import React from 'react';
import { Zap } from 'lucide-react';
import { useI18n } from '../../../../i18n';
import SuitAvatar from '../../../SuitAvatar';
import AvatarUpload from '../../../AvatarUpload';
import { useSessionStore } from '../../../../store/sessionStore';
import { IS_MODERATOR } from '../../../../utils/viewMode';
import { useSetupStore } from '../../../../store/setupStore';
import { useShallow } from 'zustand/shallow';
import InfoButton from '../../../InfoButton';

function ScanOnlyRow({ keyId, d, hasLedfx }) {
  const { t } = useI18n();
  const avatarImageStyle = useSessionStore(s => s.avatarImageStyle);
  const { mqttStatus, pushMqtt, setIcon } = useSetupStore(useShallow(s => ({ mqttStatus: s.mqttStatus, pushMqtt: s.pushMqtt, setIcon: s.setIcon })));
  const ms = mqttStatus[d.ip] ?? 'idle';
  const active = ms === 'running' || ms === 'done';
  return (
    <tr key={keyId} className={`setup-row${active ? '' : ' setup-scan-only'}`}>
      <td>
        <button className={`setup-hijack-btn setup-hijack-${ms}`} disabled={ms === 'running'} onClick={() => pushMqtt(d.ip)} title="Overwrite MQTT config and reboot WLED — no backup">
          {ms === 'idle' && <><Zap size={13} /> {t('hijack_idle')}</>}
          {ms === 'running' && t('hijack_running')}
          {ms === 'done' && t('hijack_done')}
          {ms === 'error' && t('hijack_error')}
        </button>
      </td>
      <td className="setup-wled-name">
        {d.wledName || '—'}
        {d.mqtt?.correctBroker
          ? <span className="setup-mqtt-ok" title={`Broker: ${d.mqtt.broker}:${d.mqtt.port} — ${d.mqtt.clientId}`}> ✓</span>
          : d.mqtt?.enabled
            ? <span className="setup-mqtt-wrong" title={`Pointing to ${d.mqtt.broker}:${d.mqtt.port}`}> ⚠</span>
            : null}
      </td>
      {!IS_MODERATOR && <td className="setup-ip">{d.ip ? <a href={`http://${d.ip}`} target="_blank" rel="noopener noreferrer">{d.ip}</a> : '—'}</td>}
      {hasLedfx && <td />} {/* placeholder for ledFx column alignment */}
      <td className="setup-avatar-cell">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SuitAvatar name={d.wledName || ''} icon={d.icon} edit={IS_MODERATOR} onChange={(icon) => setIcon(keyId, icon)} imageStyle={avatarImageStyle ?? 'rounded'} />
          <AvatarUpload hexId={keyId} currentIcon={d.icon} onUploaded={(filename) => setIcon(keyId, `avatar:${filename}`)} />
          <button className="btn btn--icon btn--ghost btn--small" title="Clear avatar" onClick={() => setIcon(keyId, undefined)}>✕</button>
        </div>
      </td>
      <td className="setup-info-cell">
        <InfoButton title={t('info')}>
          <div style={{ minWidth: 200 }}>
            <div><strong>ID:</strong> {keyId}</div>
            {d.ip && <div><strong>IP:</strong> {d.ip}</div>}
            <div><strong>WLED:</strong> {d.wledName || '—'}</div>
            <div><strong>FW:</strong> {d.fw || '—'}</div>
            <div><strong>MQTT enabled:</strong> {d.mqtt?.enabled ? 'yes' : 'no'}</div>
            <div><strong>MQTT broker:</strong> {d.mqtt?.broker ? `${d.mqtt.broker}:${d.mqtt.port}` : '—'}</div>
            <div><strong>MQTT client:</strong> {d.mqtt?.clientId || '—'}</div>
            <div><strong>Correct broker:</strong> {d.mqtt?.correctBroker ? '✓ yes' : '✗ no'}</div>
            <div><strong>Hijack status:</strong> {ms}</div>
          </div>
        </InfoButton>
      </td>
    </tr>
  );
}

export default React.memo(ScanOnlyRow);
