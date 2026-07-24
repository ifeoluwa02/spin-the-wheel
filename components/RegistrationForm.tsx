"use client";

import { useState, FormEvent } from "react";

export interface RegistrationValues {
  name: string;
  phone: string;
  email?: string;
}

interface RegistrationFormProps {
  onSubmit: (values: RegistrationValues) => void;
  submitting: boolean;
  error?: string | null;
  accentColor: string;
}

function isValidPhone(phone: string): boolean {
  // Accepts digits, spaces, +, -, () — requires at least 7 digits total.
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7;
}

export default function RegistrationForm({
  onSubmit,
  submitting,
  error,
  accentColor,
}: RegistrationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  const nameValid = name.trim().length > 1;
  const phoneValid = isValidPhone(phone);
  const canSubmit = nameValid && phoneValid && !submitting;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined });
  }

  return (
    <form className="reg-form" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
          autoComplete="name"
          required
        />
        {touched && !nameValid && <small className="field-error">Enter your name to continue.</small>}
      </label>

      <label className="field">
        <span>Phone number</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="080 000 0000"
          autoComplete="tel"
          required
        />
        {touched && !phoneValid && <small className="field-error">Enter a valid phone number.</small>}
      </label>

      <label className="field">
        <span>Email <em>(optional)</em></span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <button
        type="submit"
        className="btn-primary"
        style={{ background: accentColor }}
        disabled={!canSubmit}
      >
        {submitting ? "Checking…" : "Continue to spin"}
      </button>
    </form>
  );
}
