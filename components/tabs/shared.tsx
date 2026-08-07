export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-3 px-4 py-2.5 rounded-[10px] text-sm bg-red-500/10 border border-red-500/30 text-red-400">
      {message}
    </div>
  );
}

export function TxLink({ label, href }: { label: string; href: string }) {
  return (
    <div className="mt-3 px-4 py-2.5 rounded-[10px] text-sm bg-[var(--mcp-accent)]/10 border border-[var(--mcp-accent)]/30 text-center">
      {label}{" "}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[#60a5fa] hover:underline"
      >
        View on Basescan
      </a>
    </div>
  );
}

export function Spinner() {
  return (
    <span className="inline-block w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin mr-2 align-middle" />
  );
}

export function ActionButton({
  onClick,
  disabled,
  loading,
  loadingText,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full py-4 rounded-[14px] text-base font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
        loading
          ? "bg-[var(--mcp-surface)] text-[var(--mcp-text-dim)]"
          : "bg-[var(--mcp-accent)] text-white hover:opacity-90"
      } ${className}`}
    >
      {loading ? (
        <>
          <Spinner />
          {loadingText ?? "Loading..."}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function InfoBox({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div className="my-3 px-4 py-3 rounded-xl bg-black/20 border border-[var(--mcp-border)] text-sm text-[var(--mcp-text-dim)] flex flex-col gap-1.5">
      {rows.map(([label, val]) => (
        <div key={label} className="flex justify-between">
          <span>{label}</span>
          <span className="text-[var(--mcp-text)]">{val}</span>
        </div>
      ))}
    </div>
  );
}
