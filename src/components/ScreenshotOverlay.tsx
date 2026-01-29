import { useState, useEffect, useCallback, useRef } from "react";
import html2canvas from "html2canvas";

interface ScreenshotOverlayProps {
  targetRef: React.RefObject<HTMLElement | null>;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function ScreenshotOverlay({
  targetRef,
  onCapture,
  onCancel,
}: ScreenshotOverlayProps) {
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const getEventPosition = (
    e: React.MouseEvent | React.TouchEvent
  ): { x: number; y: number } => {
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handleStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const { x, y } = getEventPosition(e);
      setSelection({ startX: x, startY: y, endX: x, endY: y });
      setIsSelecting(true);
    },
    []
  );

  const handleMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isSelecting || !selection) return;
      e.preventDefault();
      const { x, y } = getEventPosition(e);
      setSelection((prev) =>
        prev ? { ...prev, endX: x, endY: y } : null
      );
    },
    [isSelecting, selection]
  );

  const handleEnd = useCallback(async () => {
    if (!selection || !targetRef.current) {
      setIsSelecting(false);
      setSelection(null);
      return;
    }

    const rect = normalizeRect(selection);
    const width = rect.endX - rect.startX;
    const height = rect.endY - rect.startY;

    // Minimum selection size
    if (width < 10 || height < 10) {
      setIsSelecting(false);
      setSelection(null);
      return;
    }

    try {
      // Capture the entire target element
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: "#1e1e1e",
        scale: 2, // Higher resolution
        logging: false,
        useCORS: true,
      });

      // Get the target element's position
      const targetRect = targetRef.current.getBoundingClientRect();

      // Calculate the crop area relative to the target element
      const cropX = Math.max(0, rect.startX - targetRect.left) * 2;
      const cropY = Math.max(0, rect.startY - targetRect.top) * 2;
      const cropWidth = Math.min(width * 2, canvas.width - cropX);
      const cropHeight = Math.min(height * 2, canvas.height - cropY);

      // Create a cropped canvas
      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;
      const ctx = croppedCanvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(
          canvas,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight
        );
        const dataUrl = croppedCanvas.toDataURL("image/png");
        onCapture(dataUrl);
      }
    } catch (error) {
      console.error("Screenshot capture failed:", error);
    }

    setIsSelecting(false);
    setSelection(null);
  }, [selection, targetRef, onCapture]);

  // Normalize rect to ensure start is always top-left
  const normalizeRect = (rect: SelectionRect) => ({
    startX: Math.min(rect.startX, rect.endX),
    startY: Math.min(rect.startY, rect.endY),
    endX: Math.max(rect.startX, rect.endX),
    endY: Math.max(rect.startY, rect.endY),
  });

  const selectionStyle = selection
    ? (() => {
        const rect = normalizeRect(selection);
        return {
          left: rect.startX,
          top: rect.startY,
          width: rect.endX - rect.startX,
          height: rect.endY - rect.startY,
        };
      })()
    : null;

  return (
    <div
      ref={overlayRef}
      className="screenshot-overlay"
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    >
      {!isSelecting && (
        <div className="screenshot-instructions">
          <p>Drag to select region</p>
          <p className="screenshot-hint">Press ESC to cancel</p>
        </div>
      )}
      {selectionStyle && (
        <div className="screenshot-selection" style={selectionStyle} />
      )}
    </div>
  );
}
