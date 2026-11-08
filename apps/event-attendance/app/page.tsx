"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EventRegistrationView } from "@/components/EventRegistrationView";
import { INITIAL_EVENTS } from "@/lib/constants";

function RegistrationWithParams() {
  const searchParams = useSearchParams();
  const eventParam = searchParams.get("event");

  const matchingEvent = eventParam
    ? INITIAL_EVENTS.find((e) => e.slug === eventParam || e.id === eventParam) || null
    : null;

  return (
    <EventRegistrationView
      initialEvent={matchingEvent}
      lockedMode={Boolean(eventParam && matchingEvent)}
      targetSlug={eventParam || undefined}
    />
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading Event Passes...</p>
          </div>
        </div>
      }
    >
      <RegistrationWithParams />
    </Suspense>
  );
}
