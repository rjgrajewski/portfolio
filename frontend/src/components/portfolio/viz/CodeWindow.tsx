import type { ReactNode } from "react";

export function CodeWindow({
  filename,
  children,
}: {
  filename: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
      <div className="flex items-center gap-1.5 border-b border-neutral-800 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
        <span className="ml-2 font-mono text-small text-neutral-500">{filename}</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-small leading-relaxed">
        {children}
      </pre>
    </div>
  );
}
