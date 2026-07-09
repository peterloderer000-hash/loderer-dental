/**
 * Smile Transform — AI-powered dental smile design
 *
 * Supabase Edge Function (Deno)
 * Calls Replicate API for real image transformations.
 *
 * Required secrets (set via Supabase Dashboard → Edge Functions → Secrets):
 *   REPLICATE_API_TOKEN — your Replicate API token
 *
 * Endpoints:
 *   POST /smile-transform
 *   Body: { image_url: string, effect: string, intensity: number }
 *   Returns: { result_url: string, status: 'success'|'error' }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const REPLICATE_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* ─── Replicate model — GFPGAN face restoration/enhancement ──────────────── */
const GFPGAN_VERSION = '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56';

function buildInput(imageUrl: string, effect: string, intensity: number): Record<string, unknown> {
  const weight = Math.min(1, intensity / 100);

  // All effects use GFPGAN with different weight/scale settings
  switch (effect) {
    case 'whitening':
      return { img: imageUrl, version: 'v1.4', scale: 2, weight };
    case 'veneers':
      return { img: imageUrl, version: 'v1.4', scale: 2, weight: 1 };
    case 'alignment':
      return { img: imageUrl, version: 'v1.4', scale: 2, weight: Math.max(0.5, weight) };
    case 'enhancement':
    default:
      return { img: imageUrl, version: 'v1.4', scale: 2, weight };
  }
}

/* ─── Call Replicate API ──────────────────────────────────────────────────── */
async function callReplicate(input: Record<string, unknown>): Promise<string> {
  // Create prediction
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',  // Use Replicate's sync mode (waits up to 60s)
    },
    body: JSON.stringify({ version: GFPGAN_VERSION, input }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    console.error('Replicate create error:', createRes.status, errBody);

    if (createRes.status === 401 || createRes.status === 403) {
      throw new Error('Neplatný Replicate API kľúč. Skontrolujte REPLICATE_API_TOKEN.');
    }
    if (createRes.status === 422) {
      throw new Error('Neplatný vstup pre AI model. Skúste inú fotku.');
    }
    throw new Error(`AI server error (${createRes.status})`);
  }

  let prediction = await createRes.json();

  // If sync mode returned completed, use it directly
  if (prediction.status === 'succeeded') {
    const output = prediction.output;
    return typeof output === 'string' ? output : Array.isArray(output) ? output[0] : '';
  }

  // Otherwise poll for completion (max 90s)
  if (prediction.status === 'failed') {
    throw new Error(`AI spracovanie zlyhalo: ${prediction.error ?? 'model error'}`);
  }

  const maxWait = 90_000;
  const start = Date.now();
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
    if (Date.now() - start > maxWait) {
      throw new Error('AI spracovanie trvalo príliš dlho. Skúste menšiu fotku.');
    }
    await new Promise(r => setTimeout(r, 2000));

    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
    });

    if (!pollRes.ok) {
      throw new Error(`Chyba pri kontrole stavu AI (${pollRes.status})`);
    }

    prediction = await pollRes.json();
  }

  if (prediction.status === 'failed') {
    throw new Error(`AI model zlyhalo: ${prediction.error ?? 'Neznáma chyba'}`);
  }

  if (prediction.status === 'canceled') {
    throw new Error('AI spracovanie bolo zrušené');
  }

  // Return the output URL
  const output = prediction.output;
  const resultUrl = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : '';

  if (!resultUrl) {
    throw new Error('AI model nevrátilo výsledok');
  }

  return resultUrl;
}

/* ─── Main handler ────────────────────────────────────────────────────────── */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!REPLICATE_TOKEN) {
      return new Response(
        JSON.stringify({
          status: 'error',
          error: 'REPLICATE_API_TOKEN nie je nakonfigurovaný. Nastavte ho v Supabase Dashboard → Edge Functions → Secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const { image_url, image_base64, effect = 'enhancement', intensity = 75 } = body;

    // Accept either URL (preferred) or base64
    let imageInput = image_url;
    if (!imageInput && image_base64) {
      imageInput = image_base64.startsWith('data:')
        ? image_base64
        : `data:image/jpeg;base64,${image_base64}`;
    }

    if (!imageInput) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'Chýba image_url alebo image_base64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
   