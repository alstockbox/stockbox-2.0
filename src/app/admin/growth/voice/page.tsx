import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { disableFounderVoiceProfileAction, uploadFounderVoiceProfileAction } from "./actions";

export const metadata: Metadata = { title: "Growth Voice Profile" };

export default async function GrowthVoicePage() {
  await requireAdmin();
  const supabase = createAdminClient();
  if (!supabase) return <main className="mx-auto max-w-3xl px-6 py-12 text-[#f4efe5]">Supabase saknas.</main>;

  const { data: profiles } = await supabase
    .from("acq_voice_profiles")
    .select("id,language,provider,model,status,consent_at,metadata,created_at,updated_at")
    .eq("language", "sv")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-[#f4efe5] sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">StockBox Growth</p>
      <h1 className="mt-2 text-3xl font-semibold">Privat svensk röstprofil</h1>
      <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">
        Referensljudet lagras i den privata bucketen <code>growth-voice-private</code>. Ingen publik URL skapas och filen ska aldrig läggas i GitHub.
      </p>

      <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-semibold">Ladda upp 5–10 minuter</h2>
        <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">Stöd: WAV, MP3 och M4A. Max 25 MB. Profilen hamnar först i testläge och blir inte aktiv förrän ett röstprov har verifierats.</p>
        <form action={uploadFounderVoiceProfileAction} className="mt-5 space-y-4">
          <input
            type="file"
            name="voiceFile"
            required
            accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,.wav,.mp3,.m4a"
            className="block w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm"
          />
          <label className="flex items-start gap-3 text-sm leading-6 text-[#c7d0dc]">
            <input type="checkbox" name="consent" required className="mt-1" />
            <span>Jag godkänner att StockBox använder denna inspelning som privat referens för min svenska AI-röst i den automatiska contentmotorn.</span>
          </label>
          <button className="rounded-md bg-[#b99b5f] px-4 py-2 text-sm font-semibold text-[#07111f]">Spara privat röstprov</button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Profiler</h2>
        <div className="mt-4 space-y-3">
          {(profiles ?? []).map((profile) => {
            const metadata = (profile.metadata ?? {}) as Record<string, unknown>;
            return (
              <article key={profile.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${profile.status === "active" ? "bg-emerald-400/10 text-emerald-200" : profile.status === "failed" ? "bg-rose-400/10 text-rose-200" : "bg-amber-400/10 text-amber-200"}`}>{profile.status}</span>
                      <span className="text-xs text-[#7f8ea2]">{profile.provider} · {profile.model}</span>
                    </div>
                    <p className="mt-3 text-sm text-[#c7d0dc]">Uppladdad {new Date(profile.created_at).toLocaleString("sv-SE")}</p>
                    <p className="mt-1 text-xs text-[#7f8ea2]">{Number(metadata.size_bytes ?? 0) > 0 ? `${Math.round(Number(metadata.size_bytes) / 1024 / 1024 * 10) / 10} MB` : "Storlek saknas"} · rösttest {metadata.test_synthesis_passed === true ? "godkänt" : "inte godkänt ännu"}</p>
                  </div>
                  {profile.status !== "disabled" ? (
                    <form action={disableFounderVoiceProfileAction}>
                      <input type="hidden" name="id" value={profile.id} />
                      <button className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#9aa7b8]">Inaktivera</button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
          {(profiles ?? []).length === 0 ? <p className="text-sm text-[#9aa7b8]">Ingen privat röstprofil har lagrats ännu.</p> : null}
        </div>
      </section>
    </main>
  );
}
