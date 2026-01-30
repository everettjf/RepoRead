import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";

interface ResizableSidebarProps {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

export function ResizableSidebar({
  children,
  defaultWidth = 280,
  minWidth = 180,
  maxWidth = 500,
  storageKey = "sidebar-width",
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;

      const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(clampedWidth);
      localStorage.setItem(storageKey, String(clampedWidth));
    },
    [isResizing, minWidth, maxWidth, storageKey]
  );

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", resize);
      document.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <aside
      ref={sidebarRef}
      className="sidebar"
      style={{ width, minWidth, maxWidth }}
    >
      {children}
      <div
        className={`sidebar-resize-handle ${isResizing ? "active" : ""}`}
        onMouseDown={startResizing}
      />
    </aside>
  );
}
