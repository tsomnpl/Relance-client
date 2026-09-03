// This file validates input, guards shared quota, and calls RodiumAi from the server.
import { NextResponse } from "next/server";
import { getQuotaState, incrementQuotaOnSuccess } from "@/lib/quota";

const RODIUM_API_URL = "https://api.rodiumai.io/v1/chat/completions";
const DEFAULT_RODIUM_MODEL = "openai/gpt-4o-mini";
const RODIUM_MODEL = process.env.RODIUMAI_MODEL ?? DEFAULT_RODIUM_MODEL;
const RODIUM_MAX_TOKENS = Number(process.env.RODIUMAI_MAX_TOKENS ?? 220);
const RODIUM_TIMEOUT_MS = Number(process.env.RODIUMAI_TIMEOUT_MS ?? 25000);

const QUOTA_EXHAUSTED_MESSAGE =
  "Les essais gratuits sont epuises. Soutiens le createur pour continuer a utiliser l'outil 🙏";

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

type RodiumMessageContent =
  | string
  | Array<{
      type?: string;
      text?: string;
    }>;

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBoundedPositiveInt(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateForLog(value: string, maxLength = 500) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}

function getRodiumApiKey() {
  return process.env.RODIUMAI_API_KEY;
}

function resolveProviderScopedModel(model: string) {
  const cleaned = model.trim();
  if (!cleaned) return DEFAULT_RODIUM_MODEL;
  return cleaned.includes("/") ? cleaned : `openai/${cleaned}`;
}

function extractAssistantMessage(content: RodiumMessageContent | undefined): string {
  if (!content) return "";

  if (typeof content === "string") {
    return content.trim();
  }

  return content
    .map((part) => {
      if (part?.type === "text" && part.text) return part.text;
      if (part?.text) return part.text;
      return "";
    })
    .join("\n")
    .trim();
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
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "Requete invalide." }, { status: 415 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Requete invalide." }, { status: 400 });
    }

    if (!isPlainObject(rawBody)) {
      return NextResponse.json({ error: "Requete invalide." }, { status: 400 });
    }

    const body = rawBody as Record<string, unknown>;
    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim() : "";
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

    if (
      typeof firmness !== "string" ||
      !Object.prototype.hasOwnProperty.call(firmnessToneMap, firmness)
    ) {
      return NextResponse.json({ error: "Le niveau de fermete choisi est invalide." }, { status: 400 });
    }

    const quotaState = await getQuotaState();
    if (quotaState.exhausted) {
      return NextResponse.json(
        {
          error: QUOTA_EXHAUSTED_MESSAGE,
          quotaExhausted: true,
          quota: quotaState,
        },
        { status: 429 },
      );
    }

    const apiKey = getRodiumApiKey();
    if (!apiKey) {
      console.error("RodiumAi key is missing at runtime.");
      return NextResponse.json({ error: "Configuration serveur incomplete." }, { status: 500 });
    }

    const payload: Required<RelanceRequest> = {
      clientName,
      amountDue,
      lateDays,
      remindersSent,
      firmness: firmness as keyof typeof firmnessToneMap,
    };

    const model = resolveProviderScopedModel(RODIUM_MODEL);
    const timeoutMs = toBoundedPositiveInt(RODIUM_TIMEOUT_MS, 25000);
    const maxTokens = clamp(toBoundedPositiveInt(RODIUM_MAX_TOKENS, 220), 64, 400);

    const aiResponse = await fetch(RODIUM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
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
        temperature: 0.4,
        max_tokens: maxTokens,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!aiResponse.ok) {
      const upstreamBody = await aiResponse.text();

      console.error("RodiumAi upstream error", {
        status: aiResponse.status,
        statusText: aiResponse.statusText,
        model,
        requestId: aiResponse.headers.get("x-request-id"),
        body: truncateForLog(upstreamBody),
      });

      return NextResponse.json(
        { error: "Le service de generation est temporairement indisponible." },
        { status: 502 },
      );
    }

    const upstreamBody = await aiResponse.text();
    let data: {
      choices?: Array<{
        message?: {
          content?: RodiumMessageContent;
        };
      }>;
    };
    try {
      data = JSON.parse(upstreamBody) as typeof data;
    } catch {
      console.error("RodiumAi returned invalid JSON", {
        status: aiResponse.status,
        model,
        requestId: aiResponse.headers.get("x-request-id"),
        body: truncateForLog(upstreamBody),
      });
      return NextResponse.json(
        { error: "Le service de generation a renvoye une reponse invalide." },
        { status: 502 },
      );
    }

    const generatedMessage = extractAssistantMessage(data.choices?.[0]?.message?.content);
    if (!generatedMessage) {
      console.error("RodiumAi invalid response shape", {
        model,
        requestId: aiResponse.headers.get("x-request-id"),
        hasChoices: Boolean(data.choices?.length),
        body: truncateForLog(upstreamBody),
      });

      return NextResponse.json(
        { error: "Le service de generation a renvoye une reponse invalide." },
        { status: 502 },
      );
    }

    const quotaUpdate = await incrementQuotaOnSuccess();
    if (!quotaUpdate.accepted) {
      return NextResponse.json(
        {
          error: QUOTA_EXHAUSTED_MESSAGE,
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
  } catch (error) {
    console.error("Relance API failure", error);
    return NextResponse.json(
      {
        error: "Impossible de traiter la demande pour le moment. Verifie ta connexion et reessaie.",
      },
      { status: 500 },
    );
  }
}
