export interface TimelineItem {
  period: string;
  title: string;
  detail: string;
}

export function Timeline({ items }: { items: readonly TimelineItem[] }) {
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li
          key={item.title}
          className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-0.5"
        >
          <p className="text-small text-neutral-500">{item.period}</p>
          <div>
            <p className="font-medium text-neutral-100">{item.title}</p>
            <p className="text-small text-neutral-400">{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
