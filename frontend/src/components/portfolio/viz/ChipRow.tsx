interface ChipRowProps {
  items: readonly string[];
  className?: string;
}

export function ChipRow({ items, className = "" }: ChipRowProps) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-small text-neutral-300"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
