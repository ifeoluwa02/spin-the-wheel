"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Prize } from "@/types";

interface SpinWheelProps {
  prizes: Prize[];
  /** Called once the wheel has fully stopped, with the prize it landed on. */
  onFinish: (prize: Prize) => void;
  /** Index into `prizes` that the wheel must land on. Set only right before spinning. */
  targetIndex: number | null;
  /** Flips to a new truthy value each time a spin should start. */
  spinToken: number;
  size?: number;
  accentColor: string;
}

const TAU = Math.PI * 2;

// Cubic ease-out with a slight overshoot settle, tuned to feel like a
// wheel with real friction rather than a linear/robotic slowdown.
function easeOutWheel(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export default function SpinWheel({
  prizes,
  onFinish,
  targetIndex,
  spinToken,
  size = 340,
  accentColor,
}: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0); // current rotation, radians
  const animRef = useRef<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const lastSpinToken = useRef(0);

  const segmentAngle = TAU / Math.max(prizes.length, 1);

  const draw = useCallback(
    (rotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const cssSize = size;
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      const cx = cssSize / 2;
      const cy = cssSize / 2;
      const r = cssSize / 2 - 8;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      prizes.forEach((prize, i) => {
        const start = i * segmentAngle;
        const end = start + segmentAngle;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, start, end);
        ctx.closePath();
        ctx.fillStyle = prize.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.save();
        ctx.rotate(start + segmentAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${Math.max(11, size / 28)}px system-ui, sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 2;
        const label = prize.label.length > 16 ? prize.label.slice(0, 15) + "…" : prize.label;
        ctx.fillText(label, r - 14, 4);
        ctx.restore();
      });

      // Hub
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.16, 0, TAU);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = accentColor;
      ctx.stroke();

      ctx.restore();

      // Outer rim
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, TAU);
      ctx.lineWidth = 8;
      ctx.strokeStyle = accentColor;
      ctx.stroke();
    },
    [prizes, segmentAngle, size, accentColor]
  );

  // Initial + reactive redraw when not spinning
  useEffect(() => {
    if (!spinning) draw(rotationRef.current);
  }, [draw, spinning]);

  useEffect(() => {
    if (spinToken === 0 || spinToken === lastSpinToken.current) return;
    if (targetIndex === null) return;
    const resolvedTargetIndex = targetIndex;
    lastSpinToken.current = spinToken;

    // Land the pointer (fixed at top, angle = -PI/2) on the middle of targetIndex,
    // after several full extra rotations for a satisfying spin.
    const targetMid = resolvedTargetIndex * segmentAngle + segmentAngle / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 2); // 5-6 full turns
    const currentMod = ((rotationRef.current % TAU) + TAU) % TAU;
    // We want final rotation R such that (R - (-PI/2 - targetMid)) is a multiple of TAU... simpler:
    // pointer angle in wheel-space after rotation R is: (-PI/2 - R) mod TAU, want it == targetMid
    // => R = -PI/2 - targetMid - k*TAU, choose forward spin instead:
    const desiredFinalMod = ((-Math.PI / 2 - targetMid) % TAU + TAU) % TAU;
    let delta = desiredFinalMod - currentMod;
    if (delta < 0) delta += TAU;
    const finalRotation = rotationRef.current + delta + extraSpins * TAU;

    const startRotation = rotationRef.current;
    const duration = 4200 + Math.random() * 500;
    const startTime = performance.now();
    setSpinning(true);

    function frame(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutWheel(t);
      rotationRef.current = startRotation + (finalRotation - startRotation) * eased;
      draw(rotationRef.current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        setSpinning(false);
        onFinish(prizes[resolvedTargetIndex]);
      }
    }
    animRef.current = requestAnimationFrame(frame);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken, targetIndex]);

  return (
    <div className="wheel-wrap" style={{ width: size, height: size }}>
      <div className="wheel-pointer" style={{ borderTopColor: accentColor }} />
      <canvas ref={canvasRef} />
    </div>
  );
}
