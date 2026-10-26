import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Calendar, MapPin, ChevronRight, Home } from "lucide-react";
import { fetchEventById, fetchAllEvents } from "@/lib/repository";
import { EventRegistrationView } from "@/components/EventRegistrationView";

interface PageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const event = await fetchEventById(params.slug);
  if (!event) {
    return {
      title: "Event Not Found | Passflow",
      description: "The requested event could not be found on Passflow.",
    };
  }

  return {
    title: `Register: ${event.title} | Passflow`,
    description:
      event.description ||
      `Official fast-track pass registration for ${event.title} at ${event.venueName}.`,
  };
}

export default async function DedicatedEventPage({ params }: PageProps) {
  const event = await fetchEventById(params.slug);

  if (!event) {
    const allEvents = await fetchAllEvents();

    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/80 p-8 shadow-sm text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Event Not Found
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              The event link <span className="font-mono text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md">/e/{params.slug}</span> does not exist or has expired.
            </p>
          </div>

          {allEvents.length > 0 && (
            <div className="text-left space-y-2 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Active Upcoming Events:
              </span>
              <div className="space-y-2">
                {allEvents.slice(0, 3).map((evt) => (
                  <Link
                    key={evt.id}
                    href={`/e/${evt.slug || evt.id}`}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 transition-colors group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {evt.title}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {evt.venueName} &bull; {new Date(evt.startDate).toLocaleDateString()}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Home className="w-4 h-4" />
              <span>Return to Platform Home</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <EventRegistrationView
      initialEvent={event}
      lockedMode={true}
      targetSlug={params.slug}
    />
  );
}
