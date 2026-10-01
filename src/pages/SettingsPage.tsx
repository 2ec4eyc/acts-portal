import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { Card } from '../components/Card';
import { StorageSettings } from '../components/StorageSettings';
import { AuditLogPage } from './AuditLogPage';
import {
  fetchAlertSettings, fetchBillingSettings, fetchFeatureSettings, updateAlertSettings, updateBillingSettings, updateFeatures,
  type AttendanceAlerts, type BillingSettings, type Features, type SettingInfo,
} from '../lib/settings';

const SWITCHES: { key: keyof Features; label: string; description: string; available: boolean }[] = [
  { key: 'studentSchedule', label: 'Student schedule', description: 'Students see the Schedule page with their class calendar.', available: true },
  { key: 'announcements', label: 'Announcements', description: 'Announcements are shown on dashboards and admins can post them.', available: true },
  { key: 'chat', label: 'Chat with the school office', description: 'Students can send messages to admins. Turn off during exams.', available: false },
  { key: 'receiptUploads', label: 'Payment receipt uploads', description: 'Students can upload proof of payment on their Billing page. Turn off during maintenance.', available: true },
];

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const AlertSettings = () => {
  const [saved, setSaved] = useState<AttendanceAlerts | null>(null);
  const [form, setForm] = useState<AttendanceAlerts | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAlertSettings().then((r) => { setSaved(r.value); setForm(r.value); }).catch((e) => setMessage({ ok: false, text: e.message })); }, []);

  if (!form || !saved) return null;
  const changed = (Object.keys(form) as (keyof AttendanceAlerts)[]).filter((k) => form[k] !== saved[k]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const r = await updateAlertSettings(Object.fromEntries(changed.map((k) => [k, form[k]])));
      setSaved(r.value); setForm(r.value); setMessage({ ok: true, text: 'Saved.' });
    } catch (err) { setMessage({ ok: false, text: (err as Error).message }); }
    finally { setSaving(false); }
  };
  const num = 'w-20 bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-fb-blue tabular-nums';

  return (
    <Card title="Absence alerts">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-fb-textSecondary">When a student reaches these numbers of absences in one course, the student, the course's teacher and every admin get a notification. Each alert is sent once.</p>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
            <input type="number" className={num} min={1} max={50} required value={form.warnAt} onChange={(e) => setForm({ ...form, warnAt: Number(e.target.value) })} />
            Warning at
          </label>
          <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
            <input type="number" className={num} min={1} max={50} required value={form.escalateAt} onChange={(e) => setForm({ ...form, escalateAt: Number(e.target.value) })} />
            Escalation at
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-fb-textPrimary">
          <input type="checkbox" className="accent-fb-blue w-4 h-4" checked={form.countExcused} onChange={(e) => setForm({ ...form, countExcused: e.target.checked })} />
          Count excused absences too
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-fb-textPrimary">
          <input type="checkbox" className="accent-fb-blue w-4 h-4" checked={form.countLate} onChange={(e) => setForm({ ...form, countLate: e.target.checked })} />
          Count "late" as an absence
        </label>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-bold ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
        <button type="submit" disabled={saving || changed.length === 0} className="px-5 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Card>
  );
};

const ReminderSettings = () => {
  const [saved, setSaved] = useState<BillingSettings | null>(null);
  const [form, setForm] = useState<BillingSettings | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { fetchBillingSettings().then((r) => { setSaved(r.value); setForm(r.value); }).catch((e) => setMessage({ ok: false, text: e.message })); }, []);
  if (!form || !saved) return null;
  const changed = (Object.keys(form) as (keyof BillingSettings)[]).filter((k) => form[k] !== saved[k]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setMessage(null);
    try {
      const r = await updateBillingSettings(Object.fromEntries(changed.map((k) => [k, form[k]])));
      setSaved(r.value); setForm(r.value); setMessage({ ok: true, text: 'Saved.' });
    } catch (err) { setMessage({ ok: false, text: (err as Error).message }); }
  };
  const num = 'w-20 bg-white border-2 border-fb-gray rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-fb-blue tabular-nums';
  return (
    <Card title="Payment reminders">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-fb-textSecondary">Sent automatically every morning to students with unpaid invoices. Use 0 to turn a reminder off. Admins can also send one any time from a student's statement.</p>
        <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
          <input type="number" className={num} min={0} max={60} required value={form.reminderDaysBefore} onChange={(e) => setForm({ ...form, reminderDaysBefore: Number(e.target.value) })} />
          days before the due date
        </label>
        <label className="flex items-center gap-3 text-sm font-bold text-fb-textPrimary">
          <input type="number" className={num} min={0} max={60} required value={form.overdueEveryDays} onChange={(e) => setForm({ ...form, overdueEveryDays: Number(e.target.value) })} />
          then every this many days while overdue
        </label>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm font-bold ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
        <button type="submit" disabled={changed.length === 0} className="px-5 py-2.5 bg-fb-blue text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40">Save</button>
      </form>
    </Card>
  );
};

export type SettingsTab = 'general' | 'storage' | 'audit';
const TABS: [SettingsTab, string][] = [['general', 'General'], ['storage', 'Storage'], ['audit', 'Audit log']];

export const SettingsPage = ({ tab: initialTab = 'general' }: { tab?: SettingsTab }) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);
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
        <p className="text-sm text-fb-textSecondary">Portal features, alerts, receipt storage and the audit log. Feature changes reach all users within about a minute.</p>
      </div>
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${tab === id ? 'bg-fb-blue text-white' : 'bg-white border border-fb-border text-fb-textSecondary'}`}>{name}</button>
        ))}
      </div>
      {tab === 'general' && (
        <>
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
          <AlertSettings />
          <ReminderSettings />
          {info?.updatedAt && (
            <p className="text-xs text-fb-textSecondary">Last changed {formatWhen(info.updatedAt)}{info.updatedBy ? ` by ${info.updatedBy}` : ''}. Every change is recorded in the Audit log tab.</p>
          )}
        </>
      )}
      {tab === 'storage' && <StorageSettings />}
      {tab === 'audit' && <AuditLogPage embedded />}
    </div>
  );
};
