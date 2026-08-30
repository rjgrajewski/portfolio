export function Callout({
  value,
  caption,
}: {
  value: string;
  caption: string;
}) {
  return (
    <aside className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <p className="text-h3 text-accent">{value}</p>
      <p className="mt-1 text-small text-neutral-400">{caption}</p>
    </aside>
  );
}
