"use client";

import { useState, FormEvent } from "react";
import { User, Phone, Mail, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { isValidNigerianPhone, normalizeNigerianPhone } from "@/lib/phone";

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
  secondaryColor?: string;
}

export default function RegistrationForm({
  onSubmit,
  submitting,
  error,
  accentColor,
  secondaryColor,
}: RegistrationFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);

  const nameValid = name.trim().length >= 2;
  const phoneValid = isValidNigerianPhone(phone);
  const canSubmit = nameValid && phoneValid && !submitting;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const normalizedPhone = normalizeNigerianPhone(phone);
    if (!canSubmit || !normalizedPhone) return;
    onSubmit({ name: name.trim(), phone: normalizedPhone, email: email.trim() || undefined });
  }

  const fields = [
    {
      id: "name",
      label: "Full Name",
      type: "text",
      value: name,
      onChange: setName,
      placeholder: "e.g. Akin Omisakin",
      autoComplete: "name",
      icon: User,
      error: touched && !nameValid ? "Please enter your full name." : null,
      required: true,
    },
    {
      id: "phone",
      label: "Phone Number",
      sublabel: "Nigerian 11-digit mobile",
      type: "tel",
      value: phone,
      onChange: setPhone,
      placeholder: "e.g. 0803 123 4567",
      autoComplete: "tel",
      icon: Phone,
      error: touched && !phoneValid ? "Enter a valid 11-digit Nigerian number (e.g. 080..., 090..., 081..., 070..., 091... or +234)" : null,
      required: true,
    },
    {
      id: "email",
      label: "Email Address",
      sublabel: "optional",
      type: "email",
      value: email,
      onChange: setEmail,
      placeholder: "you@example.com",
      autoComplete: "email",
      icon: Mail,
      error: null,
      required: false,
    },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full space-y-4">
      {fields.map(({ id, label, sublabel, type, value, onChange, placeholder, autoComplete, icon: Icon, error: fieldError, required }) => (
        <div key={id} className="space-y-1.5">
          <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
            {label}
            {sublabel && <span className="text-[10px] font-medium normal-case tracking-normal lowercase" style={{ color: "rgba(255,255,255,0.25)" }}>({sublabel})</span>}
          </label>
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: fieldError ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.25)" }}>
              <Icon className="w-4 h-4" />
            </div>
            <input
              id={id}
              type={type}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              autoComplete={autoComplete}
              required={required}
              className="w-full pl-10 pr-4 py-3.5 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: fieldError
                  ? "1.5px solid rgba(248,113,113,0.5)"
                  : "1.5px solid rgba(255,255,255,0.08)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = `${accentColor}80`; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = fieldError ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            />
          </div>
          {fieldError && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {fieldError}
            </p>
          )}
        </div>
      ))}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-white text-base transition-all disabled:opacity-40 hover:opacity-90 active:scale-[0.98] group cursor-pointer"
        style={{
          background: `linear-gradient(135deg, ${accentColor}, ${secondaryColor || accentColor})`,
          boxShadow: `0 8px 24px ${accentColor}40`,
          fontFamily: "Rubik, sans-serif",
        }}
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking eligibility…
          </>
        ) : (
          <>
            Continue to Spin
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>
    </form>
  );
}
