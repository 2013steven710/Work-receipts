"use client";

import { LAUNCH_COUNTRIES, OTHER_COUNTRIES } from "@claimtidy/core";
import { useState } from "react";

export function EmailStep({ onSubmit, busy, error }: { onSubmit: (email: string) => void; busy: boolean; error: string | null }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="screen center"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email.trim());
      }}
    >
      <h1 className="brand">ClaimTidy</h1>
      <p>Snap a receipt, tap a category, and your monthly claim builds itself.</p>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Email me a code"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function CodeStep({ email, onSubmit, onBack, busy, error }: { email: string; onSubmit: (code: string) => void; onBack: () => void; busy: boolean; error: string | null }) {
  const [code, setCode] = useState("");
  return (
    <form
      className="screen center"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(code.trim());
      }}
    >
      <h2>Check your email</h2>
      <p>We sent a 6-digit code to {email}.</p>
      <label htmlFor="code">Code</label>
      <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Checking…" : "Sign in"}
      </button>
      <button className="link" type="button" onClick={onBack}>
        Use a different email
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** "Which country does this profile belong to?" (concept section 0). */
export function CountryStep({ onChoose, busy, error }: { onChoose: (country: string, currency: string) => void; busy: boolean; error: string | null }) {
  const [other, setOther] = useState("");
  return (
    <div className="screen center">
      <h2>Which country is this profile for?</h2>
      <p className="hint">It sets your tax rules, currency and date format, and where your data is stored.</p>
      {LAUNCH_COUNTRIES.map((c) => (
        <button key={c.code} className="primary country" disabled={busy} onClick={() => onChoose(c.code, c.currency)}>
          {c.name}
        </button>
      ))}
      <label htmlFor="other-country">Another country</label>
      <select id="other-country" value={other} onChange={(e) => setOther(e.target.value)}>
        <option value="">Choose…</option>
        {OTHER_COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        className="secondary"
        disabled={!other || busy}
        onClick={() => {
          const c = OTHER_COUNTRIES.find((x) => x.code === other);
          if (c) onChoose(c.code, c.currency);
        }}
      >
        Continue
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
