'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

// Live vessel position + ETA to Ashdod/Haifa (/api/import/vessel-track —
// Datalastic; degrades to VesselFinder/MarineTraffic links without the key).
// Shared by the shipments view and the per-project import tracker.
export default function VesselTracker({ vesselName }: { vesselName: string }) {
  const [state, setState] = useState<any>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/import/vessel-track?vessel=${encodeURIComponent(vesselName)}`);
        const json = await res.json();
        if (!cancelled) setState({ loading: false, ...json });
      } catch {
        if (!cancelled) setState({ loading: false, error: 'fetch_failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [vesselName]);

  const v = state.vessel;
  const fmtWhen = (iso: string | null) => iso ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="bg-azure-100 border border-azure rounded-lg px-4 py-3 mb-3 text-[13px]">
      {state.loading ? (
        <p className="text-azure-600"><Icon name="satellite" size={14} /> מאתר את {vesselName}...</p>
      ) : v ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-azure-600" dir="ltr"><Icon name="ship" size={14} /> {v.name}</span>
            {v.lat != null && (
              <a href={`https://www.google.com/maps?q=${v.lat},${v.lon}`} target="_blank" rel="noreferrer" className="text-azure-600 underline" dir="ltr">
                {v.lat.toFixed(2)}°, {v.lon.toFixed(2)}°
              </a>
            )}
            {v.speed_kn > 0 && <span className="text-content-body" dir="ltr">{v.speed_kn} kn</span>}
            {v.destination && <span className="text-content-body">יעד מדווח: <b dir="ltr">{v.destination}</b></span>}
            {v.reported_eta && <span className="text-content-body">ETA מדווח: {fmtWhen(v.reported_eta)}</span>}
          </div>
          {state.ports?.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {state.ports.map((p: any) => (
                <span key={p.key} className="text-content-body">
                  <Icon name="anchor" size={14} /> {p.name}: <b>{p.distance_nm.toLocaleString()}</b> מייל ימי
                  {p.eta_date ? <> · הגעה משוערת <b>{fmtWhen(p.eta_date)}</b></> : ' (הספינה עוגנת/איטית)'}
                </span>
              ))}
            </div>
          )}
          {v.last_position_at && <p className="text-[11px] text-neutral-400">עדכון מיקום אחרון: {fmtWhen(v.last_position_at)}</p>}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-content-body">
            {state.configured === false
              ? 'מעקב חי לא מוגדר (חסר DATALASTIC_API_KEY) — אפשר לפתוח במפה חיצונית:'
              : `לא נמצא מידע חי על ${vesselName} — נסו במפה חיצונית:`}
          </p>
          {state.links && (
            <p className="flex gap-3">
              <a href={state.links.vesselfinder} target="_blank" rel="noreferrer" className="text-azure-600 underline">VesselFinder ↗</a>
              <a href={state.links.marinetraffic} target="_blank" rel="noreferrer" className="text-azure-600 underline">MarineTraffic ↗</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
