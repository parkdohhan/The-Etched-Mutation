// /js/shared/api.js
// Supabase API 유틸리티 function들

import { getSupabaseClient } from '../lib/supabaseClient.js';

// memory list 져오기
export async function fetchMemories() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('fetchMemories: Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabaseClient
    .from('memories')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchMemories error:', error);
    return [];
  }

  return data || [];
}

// scene 져오기
export async function fetchScenes(memoryId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('fetchScenes: Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabaseClient
    .from('scenes')
    .select('*, choices(*)')
    .eq('memory_id', memoryId)
    .order('scene_order');

  if (error) {
    console.error('fetchScenes error:', error);
    return [];
  }

  return data || [];
}

// play save
export async function savePlay(playData) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('savePlay: Supabase client not initialized');
    return null;
  }

  const { data, error } = await supabaseClient
    .from('plays')
    .insert(playData)
    .select()
    .single();

  if (error) {
    console.error('savePlay error:', error);
    return null;
  }

  return data;
}

// note save
export async function saveNote(noteData) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('saveNote: Supabase client not initialized');
    return null;
  }

  const { data, error } = await supabaseClient
    .from('notes')
    .insert(noteData)
    .select()
    .single();

  if (error) {
    console.error('saveNote error:', error);
    return null;
  }

  return data;
}

// note 져오기
export async function fetchNotes(userId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('fetchNotes: Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabaseClient
    .from('notes')
    .select('*, memories(title)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchNotes error:', error);
    return [];
  }

  return data || [];
}

/**
 * memory 'Fetus' state라면 'alive' active화 (첫 목격)
 * DB call 1번으 줄여 최적화함
 */
export async function activateMemoryIfFetus(memoryId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('activateMemoryIfFetus: Supabase client not initialized');
    return;
  }

 // 조건: id 일치하고 AND status 'Fetus'인 업데 트
  const { data, error } = await supabaseClient
    .from('memories')
    .update({ status: 'alive' })
    .eq('id', memoryId)
    .eq('status', 'Fetus')
    .select();

  if (error) {
    console.error('activateMemoryIfFetus error:', error);
    return;
  }

 // data return되었다면 업데 트 success했다 뜻 (즉, 방금 깨어남)
  if (data && data.length > 0) {
    console.log(`[Memory] Status Activated: ${memoryId} (Fetus → alive)`);
 // needed시 여기서 "첫 번째 목격자 되셨습니다" notification process possible
  }
}

