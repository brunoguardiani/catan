"use client";

import type { AudioPreferences } from "./AudioManager";

const volumes = [
  ["master", "Volume geral"], ["music", "Música"],
  ["effects", "Efeitos"], ["ambient", "Ambiente"],
] as const;

export default function AudioSettings({ open, preferences, canRestart, onToggle, onChange, onRestart, onLeave }: { open: boolean; preferences: AudioPreferences; canRestart: boolean; onToggle: () => void; onChange: (next: AudioPreferences) => void; onRestart: () => void; onLeave: () => void }) {
  return <div className="audio-settings-wrap">
    <button type="button" className="audio-settings-trigger" aria-label="Configurações" aria-expanded={open} onClick={onToggle}>⚙</button>
    {open && <section className="audio-settings" aria-label="Configurações">
      <h2>Configurações</h2>
      <h3>Áudio e animações</h3>
      {volumes.map(([key, label]) => <label key={key} className="audio-volume"><span>{label} <output>{Math.round(preferences[key] * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(preferences[key] * 100)} onChange={event => onChange({ ...preferences, [key]: Number(event.target.value) / 100 })} /></label>)}
      <label className="audio-check"><input type="checkbox" checked={preferences.muted} onChange={event => onChange({ ...preferences, muted: event.target.checked })} /> Silenciar tudo</label>
      <label className="audio-check"><input type="checkbox" checked={preferences.reduceMotion} onChange={event => onChange({ ...preferences, reduceMotion: event.target.checked })} /> Reduzir animações</label>
      <label className="audio-check"><input type="checkbox" checked={preferences.tableShake} onChange={event => onChange({ ...preferences, tableShake: event.target.checked })} /> Tremor da mesa</label>
      <label className="audio-check"><input type="checkbox" checked={preferences.comicReactions} onChange={event => onChange({ ...preferences, comicReactions: event.target.checked })} /> Reações cômicas de outros jogadores</label>
      <p>A música começa após sua primeira interação com a mesa.</p>
      <div className="audio-settings-actions">
        {canRestart && <button type="button" onClick={onRestart}>↺ Reiniciar partida</button>}
        <button type="button" onClick={onLeave}>Sair da partida</button>
      </div>
    </section>}
  </div>;
}
