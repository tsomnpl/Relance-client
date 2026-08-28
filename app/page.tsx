// This file renders the mobile-first debt form, AI generation flow, and result actions.
"use client";

import { FormEvent, useMemo, useState } from "react";

const CREATOR_MOMO_NUMBERS = {
  benin: "+229 0147371678",
  togo: "+228 98677542",
};

const QUOTA_EXHAUSTED_TEXT =
  "Les essais gratuits sont epuises. Soutiens le createur pour continuer a utiliser l'outil 🙏";

type Firmness = "Rappel poli" | "Relance ferme" | "Dernier avis";

type QuotaState = {
  used: number;
  limit: number;
  exhausted: boolean;
};

const firmnessOptions: Firmness[] = ["Rappel poli", "Relance ferme", "Dernier avis"];

export default function Page() {
  const [clientName, setClientName] = useState("");
  const [amountDue, setAmountDue] = useState("");
  const [lateDays, setLateDays] = useState("");
  const [remindersSent, setRemindersSent] = useState("0");
  const [firmness, setFirmness] = useState<Firmness>("Rappel poli");
  const [whatsAppNumber, setWhatsAppNumber] = useState("");

  const [generatedMessage, setGeneratedMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaExhausted, setQuotaExhausted] = useState(false);

  const usageLabel = useMemo(() => {
    if (!quota) return "Essais gratuits: 5 au total";
    return `Essais utilises: ${quota.used}/${quota.limit}`;
  }, [quota]);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/relance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientName,
          amountDue: Number(amountDue),
          lateDays: Number(lateDays),
          remindersSent: Number(remindersSent || "0"),
          firmness,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        quota?: QuotaState;
        quotaExhausted?: boolean;
      };

      if (!response.ok) {
        setGeneratedMessage("");
        setError(payload.error ?? "Une erreur est survenue.");
        setQuota(payload.quota ?? null);
        if (payload.quotaExhausted) {
          setQuotaExhausted(true);
        }
        return;
      }

      setGeneratedMessage(payload.message ?? "");
      setQuota(payload.quota ?? null);
      if (payload.quota?.exhausted) {
        setQuotaExhausted(true);
      }
    } catch {
      setError("Impossible de joindre le serveur. Verifie ta connexion.");
    } finally {
      setLoading(false);
    }
  }

  async function copyMessage() {
    if (!generatedMessage) return;
    await navigator.clipboard.writeText(generatedMessage);
    setCopied(true);
  }

  function openWhatsApp() {
    if (!generatedMessage) return;
    const cleanedNumber = whatsAppNumber.replace(/\D/g, "");
    if (!cleanedNumber) {
      setError("Saisis un numero WhatsApp valide avant l'envoi.");
      return;
    }
    const url = `https://wa.me/${cleanedNumber}?text=${encodeURIComponent(generatedMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h1 className="text-2xl font-semibold text-slate-900">Relance Client</h1>
        <p className="mt-2 text-sm text-slate-600">
          Renseigne la dette, choisis le ton, puis genere un message pro en francais.
        </p>

        <p className="mt-3 text-xs font-medium text-slate-500">{usageLabel}</p>

        {quotaExhausted ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">{QUOTA_EXHAUSTED_TEXT}</p>
            <p className="mt-3">Benin: {CREATOR_MOMO_NUMBERS.benin}</p>
            <p>Togo: {CREATOR_MOMO_NUMBERS.togo}</p>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="mt-6 space-y-4">
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-slate-700">
                Nom du client
              </label>
              <input
                id="clientName"
                type="text"
                required
                minLength={2}
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-slate-500"
                placeholder="Ex: Ets Kouassi"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="amountDue" className="block text-sm font-medium text-slate-700">
                  Montant du (FCFA)
                </label>
                <input
                  id="amountDue"
                  type="number"
                  min={1}
                  required
                  value={amountDue}
                  onChange={(event) => setAmountDue(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                  placeholder="50000"
                />
              </div>

              <div>
                <label htmlFor="lateDays" className="block text-sm font-medium text-slate-700">
                  Jours de retard
                </label>
                <input
                  id="lateDays"
                  type="number"
                  min={0}
                  required
                  value={lateDays}
                  onChange={(event) => setLateDays(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                  placeholder="14"
                />
              </div>
            </div>

            <div>
              <label htmlFor="remindersSent" className="block text-sm font-medium text-slate-700">
                Relances deja envoyees
              </label>
              <input
                id="remindersSent"
                type="number"
                min={0}
                value={remindersSent}
                onChange={(event) => setRemindersSent(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label htmlFor="firmness" className="block text-sm font-medium text-slate-700">
                Niveau de fermete
              </label>
              <select
                id="firmness"
                value={firmness}
                onChange={(event) => setFirmness(event.target.value as Firmness)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
              >
                {firmnessOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Generation..." : "Generer le message"}
            </button>
          </form>
        )}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {generatedMessage ? (
          <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-700">Message genere</h2>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{generatedMessage}</p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={copyMessage}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
              >
                {copied ? "Message copie" : "Copier le message"}
              </button>

              <div className="space-y-2">
                <label htmlFor="whatsAppNumber" className="block text-sm font-medium text-slate-700">
                  Numero WhatsApp du client
                </label>
                <input
                  id="whatsAppNumber"
                  type="tel"
                  value={whatsAppNumber}
                  onChange={(event) => setWhatsAppNumber(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
                  placeholder="Ex: +229 97000000"
                />
              </div>

              <button
                type="button"
                onClick={openWhatsApp}
                className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
              >
                Envoyer sur WhatsApp
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
