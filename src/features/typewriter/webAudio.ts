import { getTypewriterAudioContext } from "./typewriterAudioContext";

/**
 * 略偏中频、带一点体积感，比纯高频更不刺耳；合成在 microtask 里跑，不阻塞 CodeMirror 事务
 */
export function playTypewriterClick(volume = 0.18) {
  queueMicrotask(() => {
    try {
      const ctx = getTypewriterAudioContext();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const t = ctx.currentTime;
      const master = ctx.createGain();
      const g = Math.min(0.34, Math.max(0.1, volume));
      master.gain.value = g;
      master.connect(ctx.destination);

      const dur = 0.014;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 1.4;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800;
      const peak = ctx.createBiquadFilter();
      peak.type = "peaking";
      peak.frequency.value = 4200;
      peak.Q.value = 0.75;
      peak.gain.value = 5;
      const gN = ctx.createGain();
      gN.gain.setValueAtTime(0.0001, t);
      gN.gain.exponentialRampToValueAtTime(1, t + 0.0005);
      gN.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      src.connect(hp).connect(peak).connect(gN).connect(master);
      src.start(t);
      src.stop(t + dur + 0.002);

      const body = ctx.createOscillator();
      body.type = "sine";
      body.frequency.setValueAtTime(245 + Math.random() * 25, t);
      const gB = ctx.createGain();
      gB.gain.setValueAtTime(0.0001, t);
      gB.gain.exponentialRampToValueAtTime(0.14, t + 0.0012);
      gB.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      const lpB = ctx.createBiquadFilter();
      lpB.type = "lowpass";
      lpB.frequency.value = 520;
      body.connect(lpB).connect(gB).connect(master);
      body.start(t);
      body.stop(t + 0.038);

      const tick = ctx.createOscillator();
      tick.type = "square";
      tick.frequency.setValueAtTime(4100 + Math.random() * 500, t);
      const gT = ctx.createGain();
      gT.gain.setValueAtTime(0.0001, t);
      gT.gain.exponentialRampToValueAtTime(0.16, t + 0.00025);
      gT.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 9000;
      tick.connect(lp).connect(gT).connect(master);
      tick.start(t);
      tick.stop(t + 0.01);

      const tick2 = ctx.createOscillator();
      tick2.type = "sine";
      tick2.frequency.setValueAtTime(5600 + Math.random() * 450, t);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.08, t + 0.0002);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
      tick2.connect(g2).connect(master);
      tick2.start(t);
      tick2.stop(t + 0.008);
    } catch {
      /* ignore */
    }
  });
}
