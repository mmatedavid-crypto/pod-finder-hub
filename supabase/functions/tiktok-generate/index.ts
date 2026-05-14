// TikTok video generator — MVP
// Pipeline: script (Gemini) → TTS (ElevenLabs) → STT (ElevenLabs) → 4 images (Gemini) → Creatomate render → Storage
// Invoke: POST { episode_id?: uuid, dry_run?: boolean, regenerate?: boolean }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_AI_KEY = Deno.env.get('LOVABLE_API_KEY')!
const ELEVENLABS_KEY = Deno.env.get('ELEVENLABS_API_KEY')!
const CREATOMATE_KEY = Deno.env.get('CREATOMATE_API_KEY')!

const BUCKET = 'tiktok-videos'
const VOICE_ID = 'nPczCjzI2devNBz1zQrb' // Brian
const TTS_MODEL = 'eleven_turbo_v2_5'
const STT_MODEL = 'scribe_v2'
const SCRIPT_MODEL = 'google/gemini-2.5-flash'
const IMAGE_MODEL = 'google/gemini-3.1-flash-image-preview'
const DAILY_BUDGET_USD = 2.0

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// ---------- helpers ----------

async function checkBudget(): Promise<{ ok: boolean; spent: number }> {
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('tiktok_videos')
    .select('total_cost_usd')
    .gte('created_at', since.toISOString())
  const spent = (data ?? []).reduce((s, r: any) => s + Number(r.total_cost_usd || 0), 0)
  return { ok: spent < DAILY_BUDGET_USD, spent }
}

async function pickEpisode(): Promise<string | null> {
  // Top S-tier ep from last 7 days that has no tiktok_videos row yet
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabase
    .from('episodes')
    .select('id, podcast_id, episode_rank, published_at, podcasts!inner(rank_label, language)')
    .gte('published_at', since)
    .eq('podcasts.rank_label', 'S')
    .or('language.is.null,language.ilike.en%', { foreignTable: 'podcasts' })
    .order('episode_rank', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(50)
  if (!data?.length) return null
  for (const ep of data) {
    const { data: existing } = await supabase
      .from('tiktok_videos')
      .select('id')
      .eq('episode_id', ep.id)
      .in('status', ['rendered', 'pending', 'script_done', 'tts_done', 'stt_done', 'images_done'])
      .maybeSingle()
    if (!existing) return ep.id
  }
  return null
}

async function generateScript(episode: any, podcast: any): Promise<{ script: string; broll_prompts: string[]; cost: number }> {
  const ctx = [
    `Podcast: ${podcast.title}`,
    `Episode: ${episode.title}`,
    episode.ai_summary ? `Summary: ${episode.ai_summary}` : '',
    episode.description ? `Description: ${String(episode.description).slice(0, 1500)}` : '',
    episode.topics?.length ? `Topics: ${episode.topics.join(', ')}` : '',
    episode.people?.length ? `People: ${episode.people.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const sys = `You are a viral TikTok scriptwriter for podcast highlights. Output an 80-100 word, single-paragraph spoken script for a 30-40 second 9:16 video. Structure: 1) HOOK (one bold question or claim, max 12 words) 2) Three concrete insights from the episode (no fluff, no "in this episode") 3) CTA: "Search [podcast title] on Podiverzum.com". Tone: punchy, declarative, conversational. No emojis, no hashtags, no stage directions. Also produce 4 short, vivid b-roll image prompts (each <20 words, photorealistic 9:16, no text in image, no logos, no real people's faces).`

  const tool = {
    type: 'function',
    function: {
      name: 'emit_script',
      description: 'Emit final script and image prompts',
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: '80-100 word spoken script, single paragraph' },
          broll_prompts: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
        },
        required: ['script', 'broll_prompts'],
        additionalProperties: false,
      },
    },
  }

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_AI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SCRIPT_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: ctx }],
      tools: [tool],
      tool_choice: { type: 'function', function: { name: 'emit_script' } },
    }),
  })
  if (!res.ok) throw new Error(`Script gen failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  const args = JSON.parse(json.choices[0].message.tool_calls[0].function.arguments)
  return { script: args.script, broll_prompts: args.broll_prompts, cost: 0.002 }
}

async function tts(text: string): Promise<{ bytes: Uint8Array; cost: number }> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text()}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  // ~$0.18 per 1k chars on turbo v2.5
  const cost = (text.length / 1000) * 0.18
  return { bytes: buf, cost }
}

async function stt(mp3: Uint8Array): Promise<{ words: any[]; cost: number }> {
  const fd = new FormData()
  fd.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'voiceover.mp3')
  fd.append('model_id', STT_MODEL)
  fd.append('language_code', 'eng')
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY },
    body: fd,
  })
  if (!res.ok) throw new Error(`STT failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return { words: json.words ?? [], cost: 0.02 }
}

async function generateImage(prompt: string): Promise<Uint8Array> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_AI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{
        role: 'user',
        content: `${prompt}. Photorealistic, cinematic lighting, 9:16 vertical, no text, no logos, no watermarks.`,
      }],
      modalities: ['image', 'text'],
    }),
  })
  if (!res.ok) throw new Error(`Image gen failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  const b64 = json.choices?.[0]?.message?.images?.[0]?.image_url?.url
  if (!b64) throw new Error('No image in response')
  const data = b64.startsWith('data:') ? b64.split(',')[1] : b64
  return Uint8Array.from(atob(data), c => c.charCodeAt(0))
}

async function uploadToStorage(path: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
  if (error) throw new Error(`Upload ${path} failed: ${error.message}`)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

function buildCreatomateSource(opts: {
  voiceoverUrl: string
  brollUrls: string[]
  coverUrl: string | null
  words: any[]
  duration: number
  podcastTitle: string
}) {
  const { voiceoverUrl, brollUrls, coverUrl, words, duration, podcastTitle } = opts
  // Slideshow timing — distribute b-rolls across duration
  const segments = brollUrls.length
  const segDur = duration / segments
  const imageElements = brollUrls.map((url, i) => ({
    type: 'image',
    track: 1,
    time: i * segDur,
    duration: segDur,
    source: url,
    fit: 'cover',
    animations: [{
      type: 'scale',
      easing: 'linear',
      start_scale: i % 2 === 0 ? '100%' : '115%',
      end_scale: i % 2 === 0 ? '115%' : '100%',
      duration: segDur,
    }],
  }))

  // Karaoke captions — group words into ~3-word chunks
  const chunks: { text: string; start: number; end: number }[] = []
  for (let i = 0; i < words.length; i += 3) {
    const grp = words.slice(i, i + 3)
    if (!grp.length) break
    const text = grp.map((w: any) => w.text).join(' ').trim()
    if (!text) continue
    chunks.push({ text, start: grp[0].start ?? 0, end: grp[grp.length - 1].end ?? 0 })
  }
  const captionElements = chunks.map((c) => ({
    type: 'text',
    track: 2,
    time: c.start,
    duration: Math.max(0.3, c.end - c.start),
    x: '50%',
    y: '78%',
    width: '88%',
    text: c.text.toUpperCase(),
    font_family: 'Inter',
    font_weight: '900',
    font_size: '7.5 vmin',
    line_height: '1.1',
    fill_color: '#ffffff',
    stroke_color: '#000000',
    stroke_width: '1.2 vmin',
    background_color: 'rgba(0,0,0,0.45)',
    background_x_padding: '4%',
    background_y_padding: '3%',
    background_border_radius: '12',
    text_alignment: 'center',
    shadow_color: 'rgba(0,0,0,0.6)',
    shadow_blur: '2 vmin',
  }))

  const branding = {
    type: 'text',
    track: 3,
    time: 0,
    duration,
    x: '50%',
    y: '6%',
    text: 'PODIVERZUM.COM',
    font_family: 'Inter',
    font_weight: '700',
    font_size: '3.5 vmin',
    fill_color: '#ffffff',
    background_color: 'rgba(0,0,0,0.6)',
    background_x_padding: '3%',
    background_y_padding: '2%',
    background_border_radius: '8',
    text_alignment: 'center',
  }

  const podcastBadge = {
    type: 'text',
    track: 3,
    time: 0,
    duration,
    x: '50%',
    y: '12%',
    width: '85%',
    text: podcastTitle,
    font_family: 'Inter',
    font_weight: '600',
    font_size: '3 vmin',
    fill_color: '#ffffff',
    text_alignment: 'center',
    shadow_color: 'rgba(0,0,0,0.8)',
    shadow_blur: '1.5 vmin',
  }

  return {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration,
    elements: [
      ...imageElements,
      { type: 'audio', source: voiceoverUrl, track: 4 },
      ...captionElements,
      branding,
      podcastBadge,
    ],
  }
}

async function renderCreatomate(source: any): Promise<{ url: string; cost: number }> {
  const startRes = await fetch('https://api.creatomate.com/v2/renders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CREATOMATE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, output_format: 'mp4' }),
  })
  if (!startRes.ok) throw new Error(`Creatomate start failed: ${startRes.status} ${await startRes.text()}`)
  const arr = await startRes.json()
  const renderId = Array.isArray(arr) ? arr[0]?.id : arr?.id
  if (!renderId) throw new Error(`No render ID in response: ${JSON.stringify(arr)}`)
  // Poll up to 90s
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const sRes = await fetch(`https://api.creatomate.com/v2/renders/${renderId}`, {
      headers: { Authorization: `Bearer ${CREATOMATE_KEY}` },
    })
    if (!sRes.ok) continue
    const s = await sRes.json()
    if (s.status === 'succeeded' && s.url) return { url: s.url, cost: 0.15 }
    if (s.status === 'failed') throw new Error(`Creatomate render failed: ${s.error_message || 'unknown'}`)
  }
  throw new Error('Creatomate render timeout (90s)')
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let videoId: string | null = null
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    let episodeId: string | undefined = body.episode_id
    const dryRun = !!body.dry_run
    const regenerate = !!body.regenerate

    if (!episodeId) {
      episodeId = await pickEpisode() ?? undefined
      if (!episodeId) {
        return new Response(JSON.stringify({ ok: false, reason: 'no_eligible_episode' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const budget = await checkBudget()
    if (!budget.ok) {
      return new Response(JSON.stringify({ ok: false, reason: 'budget_exceeded', spent: budget.spent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: episode, error: epErr } = await supabase
      .from('episodes')
      .select('id, title, description, ai_summary, summary, topics, people, podcast_id, image_url')
      .eq('id', episodeId)
      .single()
    if (epErr || !episode) throw new Error(`Episode not found: ${episodeId}`)

    const { data: podcast } = await supabase
      .from('podcasts')
      .select('id, title, image_url, language, rank_label')
      .eq('id', episode.podcast_id)
      .single()
    if (!podcast) throw new Error('Podcast not found')

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, episode: episode.title, podcast: podcast.title }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If regenerate, delete existing
    if (regenerate) {
      await supabase.from('tiktok_videos').delete().eq('episode_id', episodeId)
    }

    // Insert pending row
    const { data: row, error: insErr } = await supabase
      .from('tiktok_videos')
      .insert({ episode_id: episodeId, podcast_id: podcast.id, status: 'pending' })
      .select('id')
      .single()
    if (insErr || !row) throw new Error(`Insert failed: ${insErr?.message}`)
    videoId = row.id

    // 1. Script
    const { script, broll_prompts, cost: scriptCost } = await generateScript(episode, podcast)
    await supabase.from('tiktok_videos').update({
      status: 'script_done', script, script_model: SCRIPT_MODEL, script_cost_usd: scriptCost,
    }).eq('id', videoId)

    // 2. TTS
    const { bytes: mp3, cost: ttsCost } = await tts(script)
    const voiceoverUrl = await uploadToStorage(`${videoId}/voiceover.mp3`, mp3, 'audio/mpeg')
    await supabase.from('tiktok_videos').update({
      status: 'tts_done', voiceover_url: voiceoverUrl, voiceover_cost_usd: ttsCost,
    }).eq('id', videoId)

    // 3. STT
    const { words, cost: sttCost } = await stt(mp3)
    const duration = words.length ? Math.max(...words.map((w: any) => w.end ?? 0)) + 0.5 : 35
    await supabase.from('tiktok_videos').update({
      status: 'stt_done', subtitle_words: words, voiceover_duration_s: duration,
      voiceover_cost_usd: ttsCost + sttCost,
    }).eq('id', videoId)

    // 4. 4 images in parallel
    const imageResults = await Promise.allSettled(broll_prompts.map(generateImage))
    const brollUrls: string[] = []
    for (let i = 0; i < imageResults.length; i++) {
      const r = imageResults[i]
      if (r.status === 'fulfilled') {
        const url = await uploadToStorage(`${videoId}/broll-${i + 1}.png`, r.value, 'image/png')
        brollUrls.push(url)
      }
    }
    if (brollUrls.length < 2) throw new Error(`Image gen produced only ${brollUrls.length} images`)
    const brollCost = brollUrls.length * 0.04
    await supabase.from('tiktok_videos').update({
      status: 'images_done', broll_image_urls: brollUrls, broll_cost_usd: brollCost,
    }).eq('id', videoId)

    // 5. Creatomate render
    const source = buildCreatomateSource({
      voiceoverUrl,
      brollUrls,
      coverUrl: episode.image_url || podcast.image_url,
      words,
      duration,
      podcastTitle: podcast.title,
    })
    const { url: renderUrl, cost: renderCost } = await renderCreatomate(source)

    // 6. Download MP4 → Storage
    const mp4Res = await fetch(renderUrl)
    if (!mp4Res.ok) throw new Error(`MP4 download failed: ${mp4Res.status}`)
    const mp4Bytes = new Uint8Array(await mp4Res.arrayBuffer())
    const finalUrl = await uploadToStorage(`${videoId}/final.mp4`, mp4Bytes, 'video/mp4')

    const total = scriptCost + ttsCost + sttCost + brollCost + renderCost
    await supabase.from('tiktok_videos').update({
      status: 'rendered',
      video_url: finalUrl,
      video_duration_s: duration,
      render_cost_usd: renderCost,
      total_cost_usd: total,
      generated_at: new Date().toISOString(),
    }).eq('id', videoId)

    return new Response(JSON.stringify({ ok: true, video_id: videoId, video_url: finalUrl, total_cost_usd: total }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    console.error('tiktok-generate error', msg)
    if (videoId) {
      await supabase.from('tiktok_videos').update({ status: 'failed', error: msg.slice(0, 2000) }).eq('id', videoId)
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
