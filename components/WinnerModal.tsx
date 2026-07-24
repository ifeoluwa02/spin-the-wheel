"use client";

import type { Prize } from "@/types";

interface WinnerModalProps {
  prize: Prize;
  campaignName: string;
  accentColor: string;
  onClose: () => void;
}

export default function WinnerModal({ prize, campaignName, accentColor, onClose }: WinnerModalProps) {
  const won = !prize.isLosing;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Spin result">
      <div className="modal-card">
        <p className="modal-eyebrow" style={{ color: accentColor }}>{campaignName}</p>
        {won ? (
          <>
            <h2 className="modal-title">You won!</h2>
            <p className="modal-prize">{prize.label}</p>
            <p className="modal-sub">Show this screen to a staff member to claim your prize.</p>
          </>
        ) : (
          <>
            <h2 className="modal-title">So close</h2>
            <p className="modal-prize">{prize.label}</p>
            <p className="modal-sub">Thanks for playing — better luck next time.</p>
          </>
        )}
        <button className="btn-primary" style={{ background: accentColor }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
