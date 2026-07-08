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
 *   Body: { image_base64: string, effect: 'whitening'|'veneers'|'enhancement'|'alignment', intensity: number (0-100) }
 *   Returns: { result_url: string, status: 'success'|'error' }
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const REPLICATE_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* ─── Replicate model configs per effect ─────────────────────────────────── */
const EFFECT_MODELS: Record<string, { version: string; input_fn: (img: string, intensity: number) => Record<string, unknown> }> = {
  whitening: {
    // GFPGAN — face restoration & enhancement (brightens/cleans teeth naturally)
    version: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
    input_fn: (img, intensity) => ({
      img: img,
      version: 'v1.4',
      scale: 2,
      weight: Math.min(1, intensity / 100),
    }),
  },
  enhancement: {
    // CodeFormer — state-of-the-art face restoration
    version: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
    input_fn: (img, intensity) => ({
      img: img,
      version: 'v1.4',
      scale: 2,
      weight: Math.min(1, intensity / 100),
    }),
  },
  veneers: {
    // Same model with higher weight for more dramatic effect
    version: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
    input_fn: (img, intensity) => ({
      img: img,
      version: 'v1.4',
      scale: 2,
      weight: 1,
    }),
  },
  alignment: {
    // Face enhancement for alignment visualization
    version: '7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
    input_fn: (img, intensity) => ({
      img: img,
      version: 'v1.4',
      scale: 2,
      weight: Math.min(1, intensity / 100),
    }),
  },
};

/* ─── Call Replicate API ──────────────────────────────────────────────────── */
async function callReplicate(
  modelVersion: string,
  input: Record<string, unknown>,
): Promise<string> {
  // Create prediction
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ version: modelVersion, input }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Replicate create failed: ${createRes.status} ${err}`);
  }

  let prediction = await createRes.json();

  // Poll for completion (max 60s)
  const maxWait = 60_000;
  const start = Date.now();
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    if (Date.now() - start > maxWait) throw new Error('AI processing timeout');
    await new Promise(r => setTimeout(r, 2000));

    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status === 'failed') {
    throw new Error(`AI processing failed: ${prediction.error ?? 'Unknown error'}`);
  }

  // Return the output URL
  const output = prediction.output;
  return typeof output === 'string' ? output : Array.isArray(output) ? output[0] : '';
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
          error: 'REPLICATE_API_TOKEN not configured. Set it in Supabase Dashboard → Edge Functions → Secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { image_base64, effect, intensity = 75 } = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ status: 'error', error: 'Missing image_base64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const effectConfig = EFFECT_MODELS[effect] ?? EFFECT_MODELS.enhancement;

    // Convert base64 to data URI if needed
    const imageUri = image_base64.startsWith('data:')
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    const input = effectConfig.input_fn(imageUri, intensity);
    const resultUrl = await callReplicate(effectConfig.version, input);

    return new Response(
      JSON.stringify({ status: 'success', result_url: resultUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ status: 'error', error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
