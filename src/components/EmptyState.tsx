import type { ReactNode } from 'react';
export function EmptyState({title, children, action}:{title:string;children:ReactNode;action?:ReactNode}) {
  return <div className="empty-state"><div className="empty-orb">✦</div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
