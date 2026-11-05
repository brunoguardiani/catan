export type AudioCue =
  | "diceMove" | "diceThrow" | "diceImpact" | "diceSettle"
  | "cardGrab" | "cardSlide" | "trade" | "slap" | "punch" | "handWhoosh"
  | "turn" | "road" | "settlement" | "city" | "card" | "offer" | "robber" | "steal" | "victory" | "fireworks" | "longestRoad" | "largestArmy"
  | "bookOpen" | "pageTurn" | "bookClose";

export type AudioPreferences = {
  master: number; music: number; effects: number; ambient: number; muted: boolean;
  reduceMotion: boolean; tableShake: boolean; comicReactions: boolean;
};

export const defaultAudioPreferences: AudioPreferences = {
  master: .8, music: .23, effects: .7, ambient: .15, muted: false,
  reduceMotion: false, tableShake: true, comicReactions: true,
};

const storageKey = "catan-preferences-v1";
const legacyStorageKey = "ilhas-do-vento-preferences-v1";

export function loadAudioPreferences(): AudioPreferences {
  if (typeof window === "undefined") return { ...defaultAudioPreferences };
  try {
    const defaults = { ...defaultAudioPreferences, reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false };
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    const result = { ...defaults };
    for (const key of ["master", "music", "effects", "ambient"] as const) {
      if (typeof saved[key] === "number" && Number.isFinite(saved[key])) result[key] = Math.max(0, Math.min(1, saved[key]));
    }
    for (const key of ["muted", "reduceMotion", "tableShake", "comicReactions"] as const) {
      if (typeof saved[key] === "boolean") result[key] = saved[key];
    }
    return result;
  } catch { return { ...defaultAudioPreferences }; }
}

export function saveAudioPreferences(preferences: AudioPreferences) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Storage is optional. */ }
}

const noteFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private ambient: GainNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private lastCue = new Map<AudioCue, number>();
  private preferences = { ...defaultAudioPreferences };

  setPreferences(preferences: AudioPreferences) {
    this.preferences = preferences;
    if (this.context && this.master && this.music && this.effects && this.ambient) {
      const at = this.context.currentTime;
      this.master.gain.setTargetAtTime(preferences.muted ? 0 : preferences.master, at, .03);
      this.music.gain.setTargetAtTime(preferences.music, at, .06);
      this.effects.gain.setTargetAtTime(preferences.effects, at, .03);
      this.ambient.gain.setTargetAtTime(preferences.ambient, at, .1);
    }
  }

  async unlock(background = true) {
    if (typeof window === "undefined" || !window.AudioContext) return;
    if (!this.context) {
      try {
        const context = new AudioContext();
        this.context = context;
        this.master = context.createGain();
        this.music = context.createGain();
        this.effects = context.createGain();
        this.ambient = context.createGain();
        this.music.connect(this.master);
        this.effects.connect(this.master);
        this.ambient.connect(this.master);
        this.master.connect(context.destination);
        this.setPreferences(this.preferences);
        if (background) this.startWind(context);
      } catch { return; }
    }
    if (this.context && background && !this.wind) this.startWind(this.context);
    if (this.context && background && !this.scheduler) {
      this.nextBeat = this.context.currentTime + .12;
      this.scheduler = setInterval(() => this.scheduleMusic(), 160);
    }
    if (this.context.state === "suspended") {
      try { await this.context.resume(); } catch { /* The browser may require another gesture. */ }
    }
  }

  async suspend() {
    if (this.scheduler) { clearInterval(this.scheduler); this.scheduler = null; }
    if (this.context?.state === "running") {
      try { await this.context.suspend(); } catch { /* Audio remains optional. */ }
    }
  }

  private noiseBuffer(context: AudioContext, duration: number) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private startWind(context: AudioContext) {
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(context, 2);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 430;
    const level = context.createGain();
    level.gain.value = .035;
    source.connect(filter).connect(level).connect(this.ambient!);
    source.start();
    this.wind = source;
  }

  private tone(frequency: number, duration: number, level: number, type: OscillatorType = "sine", at?: number, category: "effects" | "music" | "ambient" = "effects") {
    const context = this.context;
    const output = this[category];
    if (!context || !output) return;
    const start = at ?? context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.linearRampToValueAtTime(Math.max(.0002, level), start + Math.min(.025, duration * .1));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  private pluck(frequency: number, duration: number, level: number, at: number) {
    const context = this.context;
    if (!context || !this.music) return;
    const sampleRate = context.sampleRate;
    const delay = Math.max(2, Math.round(sampleRate / frequency));
    const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < delay && i < data.length; i++) data[i] = Math.random() * 2 - 1;
    for (let i = delay; i < data.length; i++) data[i] = (data[i - delay] + data[i - delay + 1]) * .499;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(gain).connect(this.music);
    source.start(at);
    source.stop(at + duration + .01);
  }

  private noise(duration: number, level: number, cutoff: number, at?: number) {
    const context = this.context;
    if (!context || !this.effects) return;
    const start = at ?? context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer(context, duration);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(Math.max(.0002, level), start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(start);
    source.stop(start + duration + .01);
  }

  private scheduleMusic() {
    const context = this.context;
    if (!context || context.state !== "running") return;
    const melody = [69, 72, 74, 72, 69, 65, 67, 69, 72, 74, 76, 74, 72, 69, 67, 65,
      67, 69, 72, 69, 67, 64, 65, 67, 69, 72, 74, 72, 69, 67, 65, 64,
      65, 69, 72, 74, 72, 69, 67, 65, 64, 67, 69, 72, 69, 67, 65, 62,
      64, 65, 69, 72, 74, 72, 69, 65, 67, 69, 72, 69, 67, 65, 64, 62];
    const bass = [50, 53, 48, 50];
    if (this.nextBeat < context.currentTime - .5) this.nextBeat = context.currentTime + .05;
    while (this.nextBeat < context.currentTime + .45) {
      const at = this.nextBeat;
      const index = this.beat % melody.length;
      if (!this.preferences.muted && this.preferences.music > 0) {
        // Plucked string and breathy flute layers form an original quiet loop.
        this.pluck(noteFrequency(melody[index]), .82, .075, at);
        this.tone(noteFrequency(melody[index] - 12), .88, .012, "sine", at + .018, "music");
        if (this.beat % 4 === 0) this.pluck(noteFrequency(bass[Math.floor(this.beat / 8) % bass.length]), 1.3, .065, at);
        if (this.beat % 8 === 6) this.tone(noteFrequency(melody[index] + 12), 1.15, .018, "sine", at + .14, "music");
      }
      if (!this.preferences.muted && this.preferences.ambient > 0 && this.beat % 32 === 23) {
        this.tone(1450, .16, .008, "sine", at + .25, "ambient");
        this.tone(1800, .14, .005, "sine", at + .36, "ambient");
      }
      this.beat++;
      this.nextBeat += .5;
    }
  }

  play(cue: AudioCue, intensity = 1) {
    const context = this.context;
    if (!context || context.state !== "running" || this.preferences.muted || this.preferences.effects === 0) return;
    const now = performance.now();
    const minimumGap = cue === "diceImpact" ? 75 : cue === "diceMove" ? 140 : 180;
    if (now - (this.lastCue.get(cue) ?? -Infinity) < minimumGap) return;
    this.lastCue.set(cue, now);
    const power = Math.max(.2, Math.min(1, intensity));
    const start = context.currentTime;
    switch (cue) {
      case "diceMove": this.noise(.035, .012 * power, 2000); break;
      case "diceThrow": this.noise(.11, .028 * power, 2600); this.tone(170, .12, .018 * power, "triangle"); break;
      case "diceImpact": this.noise(.075, .065 * power, 1900); this.tone(150, .09, .035 * power, "triangle"); break;
      case "diceSettle": this.noise(.06, .014, 1300); break;
      case "cardGrab": case "cardSlide": case "card": case "steal": this.noise(cue === "cardSlide" ? .19 : .1, .027 * power, 2400); break;
      case "bookOpen": this.noise(.28, .027 * power, 1150); this.noise(.15, .018 * power, 2100, start + .19); break;
      case "pageTurn": this.noise(.26, .022 * power, 2600); this.noise(.13, .015 * power, 1500, start + .32); break;
      case "bookClose": this.noise(.17, .025 * power, 1250); this.tone(105, .14, .011 * power, "triangle", start + .12); break;
      case "handWhoosh": this.noise(.13, .018 * power, 1500); break;
      case "slap": this.noise(.16, .12 * power, 2600); this.tone(125, .13, .04, "triangle"); break;
      case "punch": this.noise(.26, .17 * power, 950); this.tone(72, .34, .15 * power, "triangle"); this.tone(118, .13, .065 * power, "sawtooth"); break;
      case "trade": this.noise(.09, .03, 2700); this.tone(660, .28, .027, "sine", start + .09); this.tone(880, .3, .025, "sine", start + .16); break;
      case "turn": this.tone(660, .46, .038, "sine"); this.tone(880, .5, .025, "sine", start + .11); break;
      case "road": this.noise(.11, .058, 900); this.tone(185, .11, .034, "triangle"); break;
      case "settlement": this.noise(.13, .07, 1100); this.tone(210, .16, .04, "triangle"); break;
      case "city": this.noise(.17, .09, 1200); this.tone(170, .2, .05, "triangle"); break;
      case "offer": this.tone(590, .2, .024, "sine"); break;
      case "robber": this.tone(130, .5, .04, "triangle"); this.tone(155, .45, .022, "sine", start + .07); break;
      case "longestRoad": [440, 554, 659].forEach((pitch, index) => this.tone(pitch, .55, .032, "triangle", start + index * .11)); break;
      case "largestArmy": this.noise(.16, .07, 550); this.tone(110, .2, .055, "triangle"); this.tone(110, .2, .045, "triangle", start + .23); break;
      case "victory": [523, 659, 784, 1046].forEach((pitch, index) => this.tone(pitch, .8, .045, "triangle", start + index * .15)); break;
      case "fireworks": [0, .28, .62].forEach(delay => { this.noise(.13, .021 * power, 2900, start + delay); this.tone(700 + delay * 340, .27, .012 * power, "sine", start + delay); }); break;
    }
  }
}

export const audioManager = new AudioManager();
