/**
 * 打字机专用 AudioContext
 */
let typewriterCtx: AudioContext | null = null;

export function getTypewriterAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) {
    throw new Error("AudioContext not supported");
  }
  if (!typewriterCtx) {
    typewriterCtx = new Ctor({ latencyHint: "interactive" });
  }
  return typewriterCtx;
}

/** 在用户打开开关时调用一次，避免首键无声 */
export async function warmTypewriterAudio(): Promise<void> {
  try {
    const c = getTypewriterAudioContext();
    if (c.state === "suspended") {
      await c.resume();
    }
  } catch {
    /* ignore */
  }
}
