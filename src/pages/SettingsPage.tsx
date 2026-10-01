import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { Card } from '../components/Card';
import { fetchFeatureSettings, updateFeatures, type Features, type SettingInfo } from '../lib/settings';

const SWITCHES: { key: keyof Features; label: string; description: string; available: boolean }[] = [
  { key: 'studentSchedule', label: 'Student schedule', description: 'Students see the Schedule page with their class calendar.', available: true },
  { key: 'announcements', label: 'Announcements', description: 'Announcements are shown and can be posted.', available: false },
  { key: 'chat', label: 'Chat with the school office', description: 'Students can send messages to admins. Turn off during exams.', available: false },
  { key: 'receiptUploads', label: 'Payment receipt uploads', description: 'Students can upload proof of payment for review.', available: false },
];

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export const SettingsPage = () => {
  const [info, setInfo] = useState<SettingInfo<Features> | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<keyof Features | null>(null);

  useEffect(() => { fetchFeatureSettings().then(setInfo).catch((e) => setError(e.message)); }, []);

  const toggle = async (key: keyof Features) => {
    if (!info) return;
    setSaving(key);
    setError('');
    try { setInfo(await updateFeatures({ [key]: !info.value[key] })); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black text-fb-textPrimary italic tracking-tight">Settings</h1>
        <p className="text-sm text-fb-textSecondary">Turn portal features on or off for everyone. Changes reach all users within about a minute.</p>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</p>}
      <Card title="Features" noPadding>
        {!info ? (
          <p className="p-5 text-sm text-fb-textSecondary flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>
        ) : (
          <ul className="divide-y divide-fb-border">
            {SWITCHES.map((s) => {
              const on = info.value[s.key];
              return (
                <li key={s.key} className="p-4 md:p-5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p id={`label-${s.key}`} className="font-bold text-fb-textPrimary">{s.label}</p>
                    <p className="text-xs text-fb-textSecondary">
                      {s.description}
                      {!s.available && <span className="block text-amber-700 font-semibold mt-0.5">Takes effect when this module is added to the portal.</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={`label-${s.key}`}
                    disabled={saving !== null}
                    onClick={() => toggle(s.key)}
                    className={`relative shrink-0 w-12 h-7 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fb-blue disabled:opacity-60 ${on ? 'bg-fb-blue' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
                    <span className="sr-only">{on ? 'On' : 'Off'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {info?.updatedAt && (
        <p className="text-xs text-fb-textSecondary">Last changed {formatWhen(info.updatedAt)}{info.updatedBy ? ` by ${info.updatedBy}` : ''}. Every change is recorded in the Audit Log.</p>
      )}
    </div>
  );
};
