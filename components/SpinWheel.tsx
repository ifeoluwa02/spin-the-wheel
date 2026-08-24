"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Prize } from "@/types";
import { playTickSound } from "@/lib/audio";
import { getContrastTextColor, isLightColor } from "@/lib/colors";

interface SpinWheelProps {
  prizes: Prize[];
  targetIndex: number | null;
  spinToken: number;
  onFinish: (prize: Prize) => void;
  accentColor?: string;
  logoUrl?: string;
  size?: number;
}

const TAU = Math.PI * 2;

function easeOutWheel(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export default function SpinWheel({
  prizes,
  targetIndex,
  spinToken,
  onFinish,
  accentColor = "#FF6B35",
  logoUrl,
  size = 320,
}: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const lastSpinToken = useRef(spinToken);
  const lastSegmentRef = useRef(-1);

  const numSegments = prizes.length;
  const segmentAngle = TAU / (numSegments || 1);

  const draw = useCallback(
    (rotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const cssSize = size;
      canvas.width = cssSize * dpr;
      canvas.height = cssSize * dpr;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      if (prizes.length === 0) return;

      const cx = cssSize / 2;
      const cy = cssSize / 2;
      const r = cssSize / 2 - 12;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      // Draw wheel segments
      prizes.forEach((prize, i) => {
        const start = i * segmentAngle;
        const end = start + segmentAngle;
        const sliceLight = isLightColor(prize.color);
        const sliceTextColor = getContrastTextColor(prize.color);

        // Wedge background
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, start, end);
        ctx.closePath();
        ctx.fillStyle = prize.color;
        ctx.fill();

        // Wedge border separator
        ctx.strokeStyle = sliceLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Segment text label
        ctx.save();
        ctx.rotate(start + segmentAngle / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = sliceTextColor;

        // Dynamic font size calculation based on number of segments
        const fontSize = Math.max(10, Math.min(15, (size / prizes.length) * 0.45));
        ctx.font = `700 ${fontSize}px "Space Grotesk", system-ui, sans-serif`;
        ctx.shadowColor = sliceLight ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 3;

        const maxChars = prizes.length > 8 ? 12 : 16;
        const label =
          prize.label.length > maxChars ? prize.label.slice(0, maxChars - 1) + "…" : prize.label;
        ctx.fillText(label, r - 18, fontSize * 0.35);
        ctx.restore();
      });

      // Center Hub Circle
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, TAU);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = accentColor || "#3b82f6";
      ctx.stroke();

      ctx.restore();

      // Outer metallic decorative rim
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, 0, TAU);
      ctx.lineWidth = 10;
      ctx.strokeStyle = accentColor || "#ffffff";
      ctx.stroke();

      // Outer gold/glow accent ring
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, TAU);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.stroke();
    },
    [prizes, segmentAngle, size, accentColor]
  );

  useEffect(() => {
    if (!spinning) draw(rotationRef.current);
  }, [draw, spinning]);

  useEffect(() => {
    if (spinToken === 0 || spinToken === lastSpinToken.current) return;
    if (targetIndex === null) return;
    const resolvedTargetIndex = targetIndex;
    lastSpinToken.current = spinToken;

    const targetMid = resolvedTargetIndex * segmentAngle + segmentAngle / 2;
    const extraSpins = 5 + Math.floor(Math.random() * 2);
    const currentMod = ((rotationRef.current % TAU) + TAU) % TAU;

    const desiredFinalMod = ((-Math.PI / 2 - targetMid) % TAU + TAU) % TAU;
    let delta = desiredFinalMod - currentMod;
    if (delta < 0) delta += TAU;
    const finalRotation = rotationRef.current + delta + extraSpins * TAU;

    const startRotation = rotationRef.current;
    const duration = 4800 + Math.random() * 500;
    const startTime = performance.now();
    setSpinning(true);

    function frame(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutWheel(t);
      const currentRot = startRotation + (finalRotation - startRotation) * eased;
      rotationRef.current = currentRot;

      // Audio tick calculation when pointer passes a segment line
      const currentPointerAngle = ((-Math.PI / 2 - currentRot) % TAU + TAU) % TAU;
      const currentSegment = Math.floor(currentPointerAngle / segmentAngle);

      if (currentSegment !== lastSegmentRef.current && t < 0.98) {
        lastSegmentRef.current = currentSegment;
        playTickSound(1 - t);
      }

      draw(currentRot);

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
  }, [spinToken, targetIndex, prizes, segmentAngle, draw, onFinish]);

  return (
    <div className="wheel-wrap" style={{ width: size, height: size }}>
      {/* Top Pointer Arrow */}
      <div
        className={`wheel-pointer ${spinning ? "pointer-bouncing" : ""}`}
        style={{ borderTopColor: accentColor || "#ffffff" }}
      />
      <canvas ref={canvasRef} />
    </div>
  );
}
