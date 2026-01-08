// /js/shared/api.js
// Supabase API 유틸리티 함수들

import { getSupabaseClient } from '../lib/supabaseClient.js';

// 기억 목록 가져오기
export async function fetchMemories() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('fetchMemories: Supabase 클라이언트가 초기화되지 않았습니다');
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

// 장면 가져오기
export async function fetchScenes(memoryId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('fetchScenes: Supabase 클라이언트가 초기화되지 않았습니다');
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

// 플레이 저장
export async function savePlay(playData) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('savePlay: Supabase 클라이언트가 초기화되지 않았습니다');
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

// 쪽지 저장
export async function saveNote(noteData) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('saveNote: Supabase 클라이언트가 초기화되지 않았습니다');
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

// 쪽지 가져오기
export async function fetchNotes(userId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('fetchNotes: Supabase 클라이언트가 초기화되지 않았습니다');
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
 * 기억이 'Fetus' 상태라면 'alive'로 활성화 (첫 목격)
 * DB 호출을 1번으로 줄여 최적화함
 */
export async function activateMemoryIfFetus(memoryId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.error('activateMemoryIfFetus: Supabase 클라이언트가 초기화되지 않았습니다');
    return;
  }

  // 조건: id가 일치하고 AND status가 'Fetus'인 경우에만 업데이트
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

  // 데이터가 반환되었다면 업데이트가 성공했다는 뜻 (즉, 방금 깨어남)
  if (data && data.length > 0) {
    console.log(`[Memory] Status Activated: ${memoryId} (Fetus → alive)`);
    // 필요시 여기서 "첫 번째 목격자가 되셨습니다" 알림 처리 가능
  }
}

