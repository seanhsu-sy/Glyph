import { useTypewriterStore } from "../app/store/typewriterStore";
import { warmTypewriterAudio } from "../features/typewriter/typewriterAudioContext";

/** 书籍库页顶栏：与主题、新建书籍同一行 */
export function TypewriterSoundButton() {
  const enabled = useTypewriterStore((s) => s.enabled);
  const setEnabled = useTypewriterStore((s) => s.setEnabled);

  return (
    <button
      type="button"
      title={enabled ? "按键音：开" : "按键音：关"}
      aria-pressed={enabled}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        if (next) void warmTypewriterAudio();
      }}
      style={{
        border: "1px solid var(--btn-border)",
        borderRadius: 9,
        background: "var(--btn-bg)",
        color: enabled ? "var(--text)" : "var(--text-sub)",
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1.2,
        minWidth: 40,
      }}
    >
      音
    </button>
  );
}
