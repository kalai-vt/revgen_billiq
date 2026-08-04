import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface PageActionsContextValue {
  action: ReactNode;
  setAction: (node: ReactNode) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ReactNode>(null);
  return <PageActionsContext.Provider value={{ action, setAction }}>{children}</PageActionsContext.Provider>;
}

function usePageActionsContext(): PageActionsContextValue {
  const ctx = useContext(PageActionsContext);
  if (!ctx) throw new Error('usePageActionsContext must be used within a PageActionsProvider');
  return ctx;
}

/** Read by Breadcrumbs to render the current page's action, if any, on the right of the crumb row. */
export function useBreadcrumbAction(): ReactNode {
  return usePageActionsContext().action;
}

/**
 * Renders nothing itself — registers `children` into the breadcrumb row's action slot
 * (top-right, in line with "Home") for as long as this component stays mounted.
 */
export function PageHeaderAction({ children }: { children: ReactNode }) {
  const { setAction } = usePageActionsContext();
  useEffect(() => {
    setAction(children);
    return () => setAction(null);
  }, [children, setAction]);
  return null;
}
