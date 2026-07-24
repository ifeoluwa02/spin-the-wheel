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

  const nameValid = name.trim().length >= 2;
  const phoneValid = isValidPhone(phone);
  const canSubmit = nameValid && phoneValid && !submitting;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
    });
  }

  return (
    <form className="reg-form" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span>Full Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Akin Omisakin"
          autoComplete="name"
          required
        />
        {touched && !nameValid && (
          <small className="field-error">Please enter your full name.</small>
        )}
      </label>

      <label className="field">
        <span>Phone Number</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="080 1234 5678"
          autoComplete="tel"
          required
        />
        {touched && !phoneValid && (
          <small className="field-error">Please enter a valid phone number.</small>
        )}
      </label>

      <label className="field">
        <span>
          Email Address <em>(optional)</em>
        </span>
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
        style={{ background: accentColor || "#0E7C7B" }}
        disabled={!canSubmit}
      >
        {submitting ? "Checking eligibility…" : "Continue to Spin"}
      </button>
    </form>
  );
}
