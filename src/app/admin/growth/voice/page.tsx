import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  activateFounderVoiceProfileAction,
  disableFounderVoiceProfileAction,
  generateFounderVoiceTestAction,
  uploadFounderVoiceProfileAction,
} from "./actions";

export const metadata: Metadata = { title: "Growth Voice Profile" };

const TEST_ERROR_TEXT: Record<string, string> = {
  voice_worker_not_configured: "Rösttjänsten är inte konfigurerad ännu.",
  voice_cost_not_configured: "Kostnadsgränsen för rösttestet saknas.",
  voice_budget_blocked: "Budgetmotorn stoppade rösttestet.",
  voice_reference_unavailable: "Referensinspelningen kunde inte läsas privat.",
  voice_test_failed: "Rösttestet misslyckades. Profilen är fortfarande privat och inaktiv.",
};

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
        <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">Stöd: WAV, MP3 och M4A. Max 25 MB. Profilen hamnar först i testläge. Ett privat AI-röstprov skapas därefter och du aktiverar profilen först när du själv har lyssnat.</p>
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
            const testPassed = metadata.test_synthesis_passed === true;
            const testError = String(metadata.test_error || "");
            return (
              <article key={profile.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${profile.status === "active" ? "bg-emerald-400/10 text-emerald-200" : profile.status === "failed" ? "bg-rose-400/10 text-rose-200" : "bg-amber-400/10 text-amber-200"}`}>{profile.status}</span>
                      <span className="text-xs text-[#7f8ea2]">{profile.provider} · {profile.model}</span>
                    </div>
                    <p className="mt-3 text-sm text-[#c7d0dc]">Uppladdad {new Date(profile.created_at).toLocaleString("sv-SE")}</p>
                    <p className="mt-1 text-xs text-[#7f8ea2]">{Number(metadata.size_bytes ?? 0) > 0 ? `${Math.round(Number(metadata.size_bytes) / 1024 / 1024 * 10) / 10} MB` : "Storlek saknas"} · rösttest {testPassed ? "godkänt" : "inte godkänt ännu"}</p>
                  </div>
                  {profile.status !== "disabled" ? (
                    <form action={disableFounderVoiceProfileAction}>
                      <input type="hidden" name="id" value={profile.id} />
                      <button className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#9aa7b8]">Inaktivera</button>
                    </form>
                  ) : null}
                </div>

                {profile.status === "testing" && !testPassed ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
                    <p className="text-sm leading-6 text-[#c7d0dc]">Nästa steg är ett kort privat rösttest med Chatterbox. Det räknas mot samma 50/75 kr-budget som resten av motorn.</p>
                    {testError ? <p className="mt-2 text-xs text-amber-200">{TEST_ERROR_TEXT[testError] ?? "Rösttestet behöver köras igen."}</p> : null}
                    <form action={generateFounderVoiceTestAction} className="mt-3">
                      <input type="hidden" name="id" value={profile.id} />
                      <button className="rounded-md bg-[#b99b5f] px-3 py-2 text-xs font-semibold text-[#07111f]">Skapa privat rösttest</button>
                    </form>
                  </div>
                ) : null}

                {testPassed ? (
                  <div className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                    <p className="text-sm font-semibold">Lyssna innan aktivering</p>
                    <audio controls preload="none" className="mt-3 w-full" src={`/api/admin/growth/voice-test/${profile.id}`} />
                    {profile.status === "testing" ? (
                      <form action={activateFounderVoiceProfileAction} className="mt-3">
                        <input type="hidden" name="id" value={profile.id} />
                        <button className="rounded-md bg-emerald-300 px-3 py-2 text-xs font-semibold text-[#07111f]">Aktivera denna röst ✓</button>
                      </form>
                    ) : profile.status === "active" ? (
                      <p className="mt-3 text-xs text-emerald-200">Den här rösten är aktiv och får användas av den automatiska svenska videomotorn.</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {(profiles ?? []).length === 0 ? <p className="text-sm text-[#9aa7b8]">Ingen privat röstprofil har lagrats ännu.</p> : null}
        </div>
      </section>
    </main>
  );
}
