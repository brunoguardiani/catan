export default function BuildIcon({ kind }: { kind: "road" | "settlement" | "city" }) {
  if (kind === "road") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 22c7-5 19-5 26 0M5 22v5m22-5v5M10 19v8m12-8v8M3 27h26" /></svg>;
  if (kind === "settlement") return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15 16 5l12 10M7 13v14h18V13M13 27v-8h6v8" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27V11h5v4h4V9h5v6h4v-4h5v16H5ZM12 27v-7h8v7M5 11V7h5v4m4-2V5h5v4m4 2V7h5v4" /></svg>;
}
