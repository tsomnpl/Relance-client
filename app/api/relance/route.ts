// This file validates requests, enforces shared quota, and calls RodiumAi securely.
import { NextResponse } from "next/server";
import { getQuotaState, incrementQuotaOnSuccess } from "@/lib/quota";

const RODIUM_API_URL = "https://api.rodiumai.io/v1/chat/completions";
const RODIUM_MODEL = process.env.RODIUMAI_MODEL ?? "openai/gpt-4o-mini";

const firmnessToneMap = {
  "Rappel poli": "courtois et respectueux",
  "Relance ferme": "professionnel, direct et ferme",
  "Dernier avis": "tres ferme, legalement prudent et sans menace abusive",
} as const;

type RelanceRequest = {
  clientName: string;
  amountDue: number;
  lateDays: number;
  remindersSent?: number;
  firmness: keyof typeof firmnessToneMap;
};

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function buildPrompt(payload: Required<RelanceRequest>) {
  const tone = firmnessToneMap[payload.firmness];

  return [
    "Tu es un assistant specialise en relance de paiement en Afrique de l'Ouest.",
    "Redige un seul message WhatsApp en francais, clair, humain et professionnel.",
    `Ton attendu: ${tone}.`,
    "Le message doit rester bref (80 a 140 mots), sans liste a puces, sans markdown.",
    "Contexte de la dette:",
    `- Client: ${payload.clientName}`,
    `- Montant du: ${payload.amountDue} FCFA`,
    `- Jours de retard: ${payload.lateDays}`,
    `- Relances deja envoyees: ${payload.remindersSent}`,
    "Inclus un appel a l'action precis avec un delai de paiement raisonnable.",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RelanceRequest>;

    const clientName = body.clientName?.trim();
    const amountDue = body.amountDue;
    const lateDays = body.lateDays;
    const remindersSent = body.remindersSent ?? 0;
    const firmness = body.firmness;

    if (!clientName || clientName.length < 2) {
      return NextResponse.json(
        { error: "Le nom du client est obligatoire (minimum 2 caracteres)." },
        { status: 400 },
      );
    }

    if (!isNonNegativeNumber(amountDue) || amountDue <= 0) {
      return NextResponse.json(
        { error: "Le montant du doit etre un nombre positif." },
        { status: 400 },
      );
    }

    if (!isNonNegativeNumber(lateDays)) {
      return NextResponse.json(
        { error: "Les jours de retard doivent etre un nombre positif ou nul." },
        { status: 400 },
      );
    }

    if (!isNonNegativeNumber(remindersSent)) {
      return NextResponse.json(
        { error: "Le nombre de relances envoyees doit etre positif ou nul." },
        { status: 400 },
      );
    }

    if (!firmness || !(firmness in firmnessToneMap)) {
      return NextResponse.json(
        { error: "Le niveau de fermete choisi est invalide." },
        { status: 400 },
      );
    }

    const quotaState = await getQuotaState();

    if (quotaState.exhausted) {
      return NextResponse.json(
        {
          error:
            "Les essais gratuits sont epuises. Soutiens le createur pour continuer a utiliser l'outil 🙏",
          quotaExhausted: true,
          quota: quotaState,
        },
        { status: 429 },
      );
    }

    const apiKey = process.env.RODIUMAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "La cle API RodiumAi est absente. Ajoute RODIUMAI_API_KEY dans les variables d'environnement.",
        },
        { status: 500 },
      );
    }

    const payload: Required<RelanceRequest> = {
      clientName,
      amountDue,
      lateDays,
      remindersSent,
      firmness,
    };

    const aiResponse = await fetch(RODIUM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: RODIUM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Tu rediges des relances de paiement professionnelles, courtes et adaptees au contexte local francophone.",
          },
          {
            role: "user",
            content: buildPrompt(payload),
          },
        ],
        temperature: 0.5,
        max_tokens: 220,
      }),
      cache: "no-store",
    });

    if (!aiResponse.ok) {
      const responseBody = await aiResponse.text();
      return NextResponse.json(
        {
          error: "Echec de generation via RodiumAi. Merci de reessayer.",
          details: responseBody.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const data = (await aiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const generatedMessage = data.choices?.[0]?.message?.content?.trim();

    if (!generatedMessage) {
      return NextResponse.json(
        { error: "Reponse RodiumAi invalide: message introuvable." },
        { status: 502 },
      );
    }

    const quotaUpdate = await incrementQuotaOnSuccess();

    if (!quotaUpdate.accepted) {
      return NextResponse.json(
        {
          error:
            "Les essais gratuits sont epuises. Soutiens le createur pour continuer a utiliser l'outil 🙏",
          quotaExhausted: true,
          quota: quotaUpdate.quota,
        },
        { status: 429 },
      );
    }

    return NextResponse.json({
      message: generatedMessage,
      quota: quotaUpdate.quota,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Impossible de traiter la demande pour le moment. Verifie ta connexion et reessaie.",
      },
      { status: 500 },
    );
  }
}
