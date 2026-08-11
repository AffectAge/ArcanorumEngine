import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

type TableProps = HTMLAttributes<HTMLTableElement> & {
  children: ReactNode;
};

type CellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
};

type HeadCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  children: ReactNode;
};

export function AppTableShell({ children, className = "", ...props }: Props) {
  return (
    <div {...props} className={`arc-scrollbar overflow-auto rounded-xl border border-[var(--arc-color-brown)] bg-[var(--arc-color-paper-soft)] ${className}`}>
      {children}
    </div>
  );
}

export function AppTable({ children, className = "", ...props }: TableProps) {
  return (
    <table {...props} className={`w-full border-separate border-spacing-y-1 text-left text-xs ${className}`}>
      {children}
    </table>
  );
}

export function AppHeadCell({ children, className = "", ...props }: HeadCellProps) {
  return (
    <th {...props} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--arc-color-text-muted)] ${className}`}>
      {children}
    </th>
  );
}

export function AppCell({ children, className = "", ...props }: CellProps) {
  return (
    <td {...props} className={`border-y border-[var(--arc-color-brown)] bg-[var(--arc-color-paper-muted)] px-3 py-2 text-[var(--arc-color-text-paper)] first:rounded-l-lg first:border-l last:rounded-r-lg last:border-r ${className}`}>
      {children}
    </td>
  );
}
