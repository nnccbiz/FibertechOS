'use client';

import { useRef, useState } from 'react';

interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
}

export default function SignaturePad({ label, onSave }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    const ctx = getCtx();
    if (!ctx) return;
    setDrawing(true);
    setHasSignature(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (!drawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    setDrawing(false);
  }

  function clear() {
    const ctx = getCtx();
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSignature(false);
  }

  function save() {
    if (!canvasRef.current) return;
    onSave(canvasRef.current.toDataURL('image/png'));
  }

  return (
    <div className="space-y-2">
      <label className="block text-lg font-medium text-content-body">{label}</label>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="border border-line-strong rounded-lg bg-white touch-none w-full"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-2">
        <button type="button" onClick={clear} className="px-3 py-1 text-lg rounded bg-neutral-200 hover:bg-neutral-300">
          נקה
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!hasSignature}
          className="px-3 py-1 text-lg rounded bg-primary text-white hover:bg-primary-700 disabled:opacity-50"
        >
          שמור חתימה
        </button>
      </div>
    </div>
  );
}
