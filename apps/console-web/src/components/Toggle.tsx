export default function Toggle({
  on, onChange, small,
}: { on: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <button
      type="button"
      className={`sw ${on ? "on" : ""} ${small ? "sm" : ""}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={on ? "已启用" : "未启用"}
    />
  );
}
