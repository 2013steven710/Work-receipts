"use client";

import { useState } from "react";
import { cloudAvailable } from "../../lib/cloud/link";
import type { CloudKind } from "../../lib/cloud/drive";

/** "Where should we keep your receipts?" ClaimTidy itself never keeps them (v13). */
export function StorageStep({ onChoose, busy, error }: { onChoose: (choice: CloudKind | "device") => void; busy: boolean; error: string | null }) {
  const [confirmDevice, setConfirmDevice] = useState(false);
  const google = cloudAvailable("google");
  const microsoft = cloudAvailable("microsoft");
  return (
    <div className="screen center">
      <h2>Where should we keep your receipts?</h2>
      <p className="hint">
        ClaimTidy never keeps your receipts. They stay on this phone, with a copy in your own storage so a lost phone doesn&apos;t mean lost receipts.
      </p>
      {google && (
        <button className="primary" disabled={busy} onClick={() => onChoose("google")}>
          Google Drive
        </button>
      )}
      {microsoft && (
        <button className="primary" disabled={busy} onClick={() => onChoose("microsoft")}>
          OneDrive
        </button>
      )}
      {!google && !microsoft && <p className="hint">Google Drive and OneDrive aren&apos;t available yet.</p>}
      {!confirmDevice ? (
        <button className="secondary" disabled={busy} onClick={() => setConfirmDevice(true)}>
          This phone only
        </button>
      ) : (
        <div className="warn-box" role="alert">
          <p>Your receipts will be kept only on this phone. If the phone is lost or the app is removed, they&apos;re gone. You can add Google Drive or OneDrive later.</p>
          <button className="secondary" disabled={busy} onClick={() => onChoose("device")}>
            I understand, keep them on this phone
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
