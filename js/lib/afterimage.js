// js/lib/afterimage.js
// Afterimage (잔상) data layer.
// See docs/잔상_시스템_설계-260409.md
//
// - matchAfterimage: call match_afterimage RPC, returns one candidate (or null)
// - logAfterimageShow: insert into afterimage_events
// - markAfterimageReaction: update event with reaction kind
// - saveUtteranceCandidates: insert raw user phrases into utterances table
// - getViewerSessionId: stable per-browser anonymous id

import { getSupabaseClient } from './supabaseClient.js';

const SESSION_KEY = 'tem_viewer_session_id';

// ─── PII / safety auto-filter ────────────────────────────────────
// Reject candidates that look like they contain personal data, links, or
// loud identifying markers. Conservative on purpose — false positives drop
// the line, false negatives surface to the admin queue.
const PII_PATTERNS = [
  // emails
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  // phone numbers (KR / international, loose)
  /\b\d{2,4}[-\s]?\d{3,4}[-\s]?\d{4}\b/,
  // KR resident registration number (RRN) and similar 13-digit ids
  /\b\d{6}[-\s]?[1-4]\d{6}\b/,
  // URLs
  /https?:\/\/\S+/i,
  /\bwww\.\S+/i,
  // long digit runs (likely card / id / account)
  /\b\d{10,}\b/,
  // social handles
  /(^|\s)@[A-Za-z0-9_]{3,}/,
];

function _looksLikePII(text) {
  if (!text) return false;
  return PII_PATTERNS.some((re) => re.test(text));
}

// ─── Anonymous viewer session id ─────────────────────────────────

export function getViewerSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'anon_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // private mode / no localStorage
    return 'anon_ephemeral_' + Date.now().toString(36);
  }
}

async function _getViewerIdAndSession() {
  const supabase = getSupabaseClient();
  let viewerId = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      viewerId = data?.user?.id || null;
    } catch {}
  }
  return { viewerId, sessionId: getViewerSessionId() };
}

// ─── Match RPC ────────────────────────────────────────────────────

/**
 * Pick one afterimage candidate from the top-5 matches.
 * Returns { id, text, score, isOwn } or null.
 *
 * @param {Object} ctx
 * @param {string} ctx.lang             'ko' | 'en'
 * @param {string[]} [ctx.emotionTags]
 * @param {string[]} [ctx.keywords]
 * @param {number} [ctx.axisX]          attribution -1..1
 * @param {number} [ctx.axisZ]          core fear -1..1
 * @param {boolean} [ctx.preferOwn]     bias toward viewer's own past utterances (30% strategy)
 */
export async function matchAfterimage(ctx) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { viewerId, sessionId } = await _getViewerIdAndSession();
  const preferContributor = ctx.preferOwn && viewerId ? viewerId : null;

  try {
    const { data, error } = await supabase.rpc('match_afterimage', {
      p_lang: ctx.lang || 'ko',
      p_emotion_tags: ctx.emotionTags || [],
      p_keywords: ctx.keywords || [],
      p_axis_x: typeof ctx.axisX === 'number' ? ctx.axisX : 0,
      p_axis_z: typeof ctx.axisZ === 'number' ? ctx.axisZ : 0,
      p_viewer_id: viewerId,
      p_viewer_session_id: sessionId,
      p_prefer_contributor: preferContributor,
    });

    if (error) {
      console.warn('[afterimage] match_afterimage RPC error:', error.message);
      return null;
    }
    if (!data || data.length === 0) return null;

    // Pick a random one from top 5 — see §6.1 (avoid feeling algorithmic)
    const pick = data[Math.floor(Math.random() * data.length)];
    return {
      id: pick.id,
      text: pick.text,
      score: pick.score,
      isOwn: pick.is_own === true,
    };
  } catch (e) {
    console.warn('[afterimage] match exception:', e);
    return null;
  }
}

// ─── Event logging ────────────────────────────────────────────────

export async function logAfterimageShow({ utteranceId, playId = null, sceneId = null }) {
  const supabase = getSupabaseClient();
  if (!supabase || !utteranceId) return null;
  const { viewerId, sessionId } = await _getViewerIdAndSession();

  try {
    const { data, error } = await supabase
      .from('afterimage_events')
      .insert({
        viewer_id: viewerId,
        viewer_session_id: sessionId,
        utterance_id: utteranceId,
        play_id: playId,
        scene_id: sceneId,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[afterimage] logShow error:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.warn('[afterimage] logShow exception:', e);
    return null;
  }
}

export async function markAfterimageReaction(eventId, kind) {
  if (!eventId) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    await supabase
      .from('afterimage_events')
      .update({ reacted: true, reaction_kind: kind })
      .eq('id', eventId);
  } catch (e) {
    console.warn('[afterimage] markReaction exception:', e);
  }
}

// ─── Utterance harvest from a Record session ──────────────────────

/**
 * Extract candidate utterances from a Record conversation and save them.
 * Always stored as moderation_status=pending — admin approval still required.
 * is_public reflects the contributor's explicit consent at record time.
 *
 * @param {Object} args
 * @param {Array}  args.conversation   getConversationHistory() output
 * @param {string} args.lang           'ko' | 'en'
 * @param {string} [args.memoryId]
 * @param {string} [args.contributorId]  auth.uid() if logged in
 * @param {string[]} [args.emotionTags]
 * @param {boolean} [args.isPublic]    contributor consent flag
 * @returns {Promise<number>}  number of candidates saved
 */
export async function saveUtteranceCandidates({
  conversation,
  lang = 'ko',
  memoryId = null,
  contributorId = null,
  emotionTags = [],
  isPublic = false,
}) {
  if (!Array.isArray(conversation) || conversation.length === 0) return 0;
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const userMessages = conversation
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content.trim())
    .filter((t) => {
      if (!t) return false;
      // skip system markers
      if (t.startsWith('[') && t.endsWith(']')) return false;
      // length sanity (matches DB CHECK)
      const len = [...t].length;
      if (len < 3 || len > 280) return false;
      // PII / link auto-reject
      if (_looksLikePII(t)) {
        console.log('[afterimage] dropped candidate (PII match)');
        return false;
      }
      return true;
    });

  if (userMessages.length === 0) return 0;

  // Prefer the most evocative-looking lines: short-to-mid sentences,
  // not pure factual short answers ("yes", "no", "okay")
  const SKIP_WORDS = new Set([
    '응', '예', '아니', '몰라', '몰라요', 'yes', 'no', 'ok', 'okay', 'sure', '네', '아니요',
  ]);
  const ranked = userMessages
    .map((text) => {
      const norm = text.toLowerCase();
      let score = Math.min(text.length, 120); // prefer mid-length
      if (SKIP_WORDS.has(norm)) score -= 100;
      if (text.length < 8) score -= 30;
      return { text, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .filter((c) => c.score > 0);

  if (ranked.length === 0) return 0;

  const rows = ranked.map((c) => ({
    text: c.text,
    lang,
    contributor_id: contributorId,
    source_type: 'record',
    memory_id: memoryId,
    emotion_tags: emotionTags,
    is_public: !!isPublic,
    moderation_status: 'pending',
  }));

  try {
    const { error } = await supabase.from('utterances').insert(rows);
    if (error) {
      console.warn('[afterimage] saveUtteranceCandidates error:', error.message);
      return 0;
    }
    console.log(`[afterimage] saved ${rows.length} utterance candidates (pending review)`);
    return rows.length;
  } catch (e) {
    console.warn('[afterimage] saveUtteranceCandidates exception:', e);
    return 0;
  }
}
