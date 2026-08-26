import { useState, FormEvent } from "react";
import { User, Phone, Mail, ArrowRight, AlertCircle, Loader2, Calendar, Users } from "lucide-react";
import { isValidNigerianPhone, normalizeNigerianPhone } from "@/lib/phone";
import { getGradientContrastColor } from "@/lib/colors";
import { AGE_RANGES, GENDERS } from "@/types";

export interface RegistrationValues {
  name: string;
  phone: string;
  email?: string;
  ageRange?: string;
  gender?: string;
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
  const [ageRange, setAgeRange] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [touched, setTouched] = useState(false);

  const btnTextColor = getGradientContrastColor(accentColor, secondaryColor || accentColor);

  const nameValid = name.trim().length >= 2;
  const phoneValid = isValidNigerianPhone(phone);
  const ageValid = Boolean(ageRange);
  const genderValid = Boolean(gender);
  const canSubmit = nameValid && phoneValid && ageValid && genderValid && !submitting;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    const normalizedPhone = normalizeNigerianPhone(phone);
    if (!canSubmit || !normalizedPhone) return;
    onSubmit({
      name: name.trim(),
      phone: normalizedPhone,
      email: email.trim() || undefined,
      ageRange: ageRange || undefined,
      gender: gender || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full space-y-3.5">
      {/* Full Name */}
      <div className="space-y-1">
        <label htmlFor="name" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
          Full Name
        </label>
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: touched && !nameValid ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.25)" }}>
            <User className="w-4 h-4" />
          </div>
          <input
            id="name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Akin Omisakin"
            autoComplete="name"
            required
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: touched && !nameValid ? "1.5px solid rgba(248,113,113,0.5)" : "1.5px solid rgba(255,255,255,0.08)",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = `${accentColor}80`; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = touched && !nameValid ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          />
        </div>
        {touched && !nameValid && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            Please enter your full name.
          </p>
        )}
      </div>

      {/* Phone Number */}
      <div className="space-y-1">
        <label htmlFor="phone" className="flex items-center justify-between text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
          <span>Phone Number</span>
          <span className="text-[10px] font-medium normal-case tracking-normal text-white/30">Nigerian 11-digit</span>
        </label>
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: touched && !phoneValid ? "rgba(248,113,113,0.7)" : "rgba(255,255,255,0.25)" }}>
            <Phone className="w-4 h-4" />
          </div>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 0803 123 4567"
            autoComplete="tel"
            required
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all font-mono"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: touched && !phoneValid ? "1.5px solid rgba(248,113,113,0.5)" : "1.5px solid rgba(255,255,255,0.08)",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = `${accentColor}80`; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = touched && !phoneValid ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          />
        </div>
        {touched && !phoneValid && (
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            Enter a valid 11-digit number (e.g. 080..., 090..., 081..., 070..., 091...).
          </p>
        )}
      </div>

      {/* Age Range & Gender Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Age Range */}
        <div className="space-y-1">
          <label htmlFor="ageRange" className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
            Age Range *
          </label>
          <div className="relative">
            <select
              id="ageRange"
              value={ageRange}
              onChange={e => setAgeRange(e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl text-xs sm:text-sm text-white outline-none transition-all appearance-none cursor-pointer"
              style={{
                background: "rgba(10, 18, 30, 0.9)",
                border: touched && !ageValid ? "1.5px solid rgba(248,113,113,0.5)" : "1.5px solid rgba(255,255,255,0.12)",
                color: ageRange ? "#ffffff" : "rgba(255,255,255,0.35)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = `${accentColor}80`; }}
              onBlur={e => { e.currentTarget.style.borderColor = touched && !ageValid ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.12)"; }}
            >
              <option value="" disabled className="bg-[#0b131e] text-white/40">Select Age</option>
              {AGE_RANGES.map(range => (
                <option key={range} value={range} className="bg-[#0b131e] text-white py-1">
                  {range} yrs
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30 text-[10px]">
              ▼
            </div>
          </div>
          {touched && !ageValid && (
            <p className="text-[10px] font-semibold text-red-400">Select age range</p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-1">
          <label htmlFor="gender" className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
            Gender *
          </label>
          <div className="relative">
            <select
              id="gender"
              value={gender}
              onChange={e => setGender(e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl text-xs sm:text-sm text-white outline-none transition-all appearance-none cursor-pointer"
              style={{
                background: "rgba(10, 18, 30, 0.9)",
                border: touched && !genderValid ? "1.5px solid rgba(248,113,113,0.5)" : "1.5px solid rgba(255,255,255,0.12)",
                color: gender ? "#ffffff" : "rgba(255,255,255,0.35)",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = `${accentColor}80`; }}
              onBlur={e => { e.currentTarget.style.borderColor = touched && !genderValid ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.12)"; }}
            >
              <option value="" disabled className="bg-[#0b131e] text-white/40">Select Gender</option>
              {GENDERS.map(g => (
                <option key={g} value={g} className="bg-[#0b131e] text-white py-1">
                  {g}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30 text-[10px]">
              ▼
            </div>
          </div>
          {touched && !genderValid && (
            <p className="text-[10px] font-semibold text-red-400">Select gender</p>
          )}
        </div>
      </div>

      {/* Email Address (Optional) */}
      <div className="space-y-1">
        <label htmlFor="email" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.45)" }}>
          Email Address
          <span className="text-[10px] font-medium normal-case tracking-normal text-white/25">(optional)</span>
        </label>
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/25">
            <Mail className="w-4 h-4" />
          </div>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder:text-white/20 outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.08)",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = `${accentColor}80`; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black text-base transition-all disabled:opacity-40 hover:opacity-90 active:scale-[0.98] group cursor-pointer mt-1"
        style={{
          background: `linear-gradient(135deg, ${accentColor}, ${secondaryColor || accentColor})`,
          color: btnTextColor,
          boxShadow: `0 8px 24px ${accentColor}40`,
          fontFamily: "Rubik, sans-serif",
        }}
      >
        {submitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Registering…</span>
          </>
        ) : (
          <>
            <span>Proceed to Spin</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </>
        )}
      </button>
    </form>
  );
}
