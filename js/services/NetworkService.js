// js/services/NetworkService.js
// 네트워크 호출을 중앙화하는 서비스

import { getSupabaseClient } from '../lib/supabaseClient.js';

/**
 * NetworkService - Supabase 호출을 중앙화
 * 모든 네트워크 호출은 이 서비스를 통해 이루어지며,
 * { ok, data, error } 형태로 반환합니다.
 */
class NetworkService {
  /**
   * Supabase 클라이언트 가져오기
   * @returns {Object|null} Supabase 클라이언트 또는 null
   */
  _getClient() {
    const client = getSupabaseClient();
    if (!client) {
      console.warn('[NetworkService] Supabase 클라이언트가 초기화되지 않았습니다');
    }
    return client;
  }

  /**
   * 공개된 메모리 목록 조회 (scenes, choices 포함)
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async fetchMemories() {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data: memoriesDataSupabase, error: memoriesError } = await client
        .from('memories')
        .select('*')
        .order('id', { ascending: true });

      if (memoriesError) {
        console.error('[NetworkService.fetchMemories] memories 조회 실패', memoriesError);
        return { ok: false, data: null, error: memoriesError };
      }

      if (!memoriesDataSupabase || memoriesDataSupabase.length === 0) {
        return { ok: true, data: [], error: null };
      }

      // 각 메모리의 scenes와 choices를 불러오기
      const supabaseMemories = await Promise.all(
        memoriesDataSupabase.map(async (memory) => {
          const { data: scenesData, error: scenesError } = await client
            .from('scenes')
            .select('*')
            .eq('memory_id', memory.id)
            .order('scene_order', { ascending: true });

          if (scenesError) {
            console.error(`[NetworkService.fetchMemories] Memory ${memory.id} scenes 조회 실패`, scenesError);
            // scenes 에러가 있어도 메모리는 반환 (빈 scenes 배열로)
            const isLive = !!memory.live_session_id;
            return {
              id: memory.id,
              code: memory.code || '',
              title: memory.title || '',
              memory_words: memory.memory_words || null,
              completed_sentence: memory.completed_sentence || null,
              layers: memory.layers || 0,
              dilution: memory.dilution || 50,
              recentRank: memory.id || 0,
              scenes: [],
              live_session_id: memory.live_session_id,
              is_live: isLive
            };
          }

          const scenes = await Promise.all(
            (scenesData || []).map(async (scene) => {
              const { data: choicesData, error: choicesError } = await client
                .from('choices')
                .select('*')
                .eq('scene_id', scene.id)
                .order('choice_order', { ascending: true });

              if (choicesError) {
                console.error(`[NetworkService.fetchMemories] Scene ${scene.id} choices 조회 실패`, choicesError);
                return null;
              }

              const echoWords = Array.isArray(scene.echo_words)
                ? scene.echo_words
                : typeof scene.echo_words === 'string'
                ? JSON.parse(scene.echo_words)
                : [];

              const emotionDist = scene.emotion_dist || {};

              return {
                id: scene.id,
                text: scene.text || '',
                sceneType: scene.scene_type || 'normal',
                echoWords: echoWords,
                choices: (choicesData || []).map((choice) => ({
                  text: choice.text || '',
                  emotion: choice.emotion || 'fear',
                  intensity: choice.intensity || 5,
                  nextScene: choice.nextScene || 'end',
                  percentage: 0
                })),
                emotionDist: emotionDist,
                voidInfo: scene.void_info || null,
                originalChoice: scene.original_choice !== undefined ? scene.original_choice : 0,
                originalReason: scene.original_reason || '',
                originalEmotion: scene.original_emotion
                  ? typeof scene.original_emotion === 'string'
                    ? JSON.parse(scene.original_emotion)
                    : scene.original_emotion
                  : null,
                originalReasonVector: scene.original_reason_vector
                  ? typeof scene.original_reason_vector === 'string'
                    ? JSON.parse(scene.original_reason_vector)
                    : scene.original_reason_vector
                  : null,
                text_stage_1: scene.text_stage_1 || null,
                text_stage_2: scene.text_stage_2 || null,
                text_stage_3: scene.text_stage_3 || null
              };
            })
          );

          const validScenes = scenes.filter((s) => s !== null);
          const isLive = !!memory.live_session_id;

          return {
            id: memory.id,
            code: memory.code || '',
            title: memory.title || '',
            memory_words: memory.memory_words || null,
            completed_sentence: memory.completed_sentence || null,
            layers: memory.layers || 0,
            dilution: memory.dilution || 50,
            recentRank: memory.id || 0,
            scenes: validScenes,
            live_session_id: memory.live_session_id,
            is_live: isLive
          };
        })
      );

      const validSupabaseMemories = supabaseMemories.filter((m) => m !== null);

      return { ok: true, data: validSupabaseMemories, error: null };
    } catch (error) {
      console.error('[NetworkService.fetchMemories] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 메모리 ID로 메모리 정보 조회
   * @param {number} memoryId - 메모리 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getMemoryById(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('memories')
        .select('author_note, source_session_id')
        .eq('id', memoryId)
        .single();

      if (error) {
        console.error('[NetworkService.getMemoryById] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getMemoryById] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 라이브 세션 생성
   * @param {Object} sessionData - 세션 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async createSession(sessionData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const result = await client
        .from('live_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (result.error) {
        console.error('[NetworkService.createSession] 세션 생성 실패', result.error);
        return { ok: false, data: null, error: result.error };
      }

      // 생성된 세션이 실제로 DB에 있는지 확인
      const { data: verifyData, error: verifyError } = await client
        .from('live_sessions')
        .select('*')
        .eq('id', result.data.id)
        .single();

      if (verifyError || !verifyData) {
        console.error('[NetworkService.createSession] 세션 검증 실패', verifyError);
        return { ok: false, data: null, error: verifyError || new Error('세션 검증 실패') };
      }

      return { ok: true, data: result.data, error: null };
    } catch (error) {
      console.error('[NetworkService.createSession] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션 코드로 세션 조회
   * @param {string} sessionCode - 세션 코드
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async findSessionsByCode(sessionCode) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('*')
        .eq('session_code', sessionCode.toUpperCase())
        .is('ended_at', null);

      if (error) {
        console.error('[NetworkService.findSessionsByCode] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.findSessionsByCode] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션에 체험자 참여
   * @param {number} sessionId - 세션 ID
   * @param {string} userId - 사용자 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async joinSession(sessionId, userId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .update({ experiencer_id: userId })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.joinSession] 참여 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.joinSession] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션 종료
   * @param {number} sessionId - 세션 ID
   * @param {number} alignment - 정렬도
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async endSession(sessionId, alignment) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .update({
          ended_at: new Date().toISOString(),
          alignment: alignment
        })
        .eq('id', sessionId);

      if (error) {
        console.error('[NetworkService.endSession] 종료 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.endSession] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션의 메모리 운명 업데이트
   * @param {number} sessionId - 세션 ID
   * @param {string} fate - 운명 ('preserve', 'dilute', 'erase')
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async updateSessionMemoryFate(sessionId, fate) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .update({ memory_fate: fate })
        .eq('id', sessionId);

      if (error) {
        console.error('[NetworkService.updateSessionMemoryFate] 업데이트 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.updateSessionMemoryFate] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션 정보 조회
   * @param {number} sessionId - 세션 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getSessionById(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('[NetworkService.getSessionById] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getSessionById] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션의 체험자 ID 조회
   * @param {number} sessionId - 세션 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getSessionExperiencerId(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('experiencer_id')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('[NetworkService.getSessionExperiencerId] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getSessionExperiencerId] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 사용자의 세션 히스토리 조회
   * @param {string} userId - 사용자 ID
   * @param {number} limit - 조회 제한 수
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getUserSessionHistory(userId, limit = 50) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('*')
        .or(`narrator_id.eq.${userId},experiencer_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[NetworkService.getUserSessionHistory] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getUserSessionHistory] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 사용자의 세션 ID 목록 조회
   * @param {string} userId - 사용자 ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getUserSessionIds(userId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('id')
        .or(`narrator_id.eq.${userId},experiencer_id.eq.${userId}`);

      if (error) {
        console.error('[NetworkService.getUserSessionIds] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getUserSessionIds] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션 ID 목록으로 세션의 화자 ID 조회
   * @param {number} sessionId - 세션 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getSessionNarratorId(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('narrator_id')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('[NetworkService.getSessionNarratorId] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getSessionNarratorId] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 장면 저장 (scenes 테이블)
   * @param {Object} sceneData - 장면 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveScene(sceneData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('scenes')
        .insert(sceneData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.saveScene] 저장 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveScene] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 라이브 장면 저장 (live_scenes 테이블)
   * @param {Object} sceneData - 장면 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveLiveScene(sceneData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_scenes')
        .insert(sceneData)
        .select();

      if (error) {
        console.error('[NetworkService.saveLiveScene] 저장 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveLiveScene] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션의 라이브 장면 목록 조회
   * @param {number} sessionId - 세션 ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getLiveScenesBySessionId(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('live_scenes')
        .select('*')
        .eq('session_id', sessionId)
        .order('scene_index', { ascending: true });

      if (error) {
        console.error('[NetworkService.getLiveScenesBySessionId] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getLiveScenesBySessionId] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 선택 저장 (choices 테이블)
   * @param {Object} choiceData - 선택 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveChoice(choiceData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('choices')
        .insert(choiceData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.saveChoice] 저장 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveChoice] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 플레이 저장 (plays 테이블)
   * @param {Object} playData - 플레이 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async savePlay(playData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('plays')
        .insert(playData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.savePlay] 저장 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.savePlay] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 메모리의 오염도 조회 (plays 테이블 count)
   * @param {number} memoryId - 메모리 ID
   * @returns {Promise<{ok: boolean, data: number|null, error: Error|null}>}
   */
  async getContaminationLevel(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { count, error } = await client
        .from('plays')
        .select('*', { count: 'exact', head: true })
        .eq('memory_id', memoryId);

      if (error) {
        console.error('[NetworkService.getContaminationLevel] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: count || 0, error: null };
    } catch (error) {
      console.error('[NetworkService.getContaminationLevel] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 메모리 저장
   * @param {Object} memoryData - 메모리 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveMemory(memoryData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('memories')
        .insert(memoryData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.saveMemory] 저장 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveMemory] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션 ID 목록으로 메모리 조회
   * @param {Array<number>} sessionIds - 세션 ID 배열
   * @param {number} limit - 조회 제한 수
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getMemoriesBySessionIds(sessionIds, limit = 50) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('memories')
        .select('*')
        .in('source_session_id', sessionIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[NetworkService.getMemoriesBySessionIds] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getMemoriesBySessionIds] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 세션 ID 목록으로 메모리 ID 목록 조회
   * @param {Array<number>} sessionIds - 세션 ID 배열
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getMemoryIdsBySessionIds(sessionIds) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('memories')
        .select('id')
        .in('source_session_id', sessionIds);

      if (error) {
        console.error('[NetworkService.getMemoryIdsBySessionIds] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getMemoryIdsBySessionIds] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 쪽지 전송
   * @param {Object} noteData - 쪽지 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async sendNote(noteData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { error } = await client.from('notes').insert(noteData);

      if (error) {
        console.error('[NetworkService.sendNote] 전송 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: null, error: null };
    } catch (error) {
      console.error('[NetworkService.sendNote] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 플레이 조회 (scene_id와 memory_id로)
   * @param {number} sceneId - 장면 ID
   * @param {number} memoryId - 메모리 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getPlayBySceneAndMemory(sceneId, memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('plays')
        .select('alignment, user_emotion')
        .eq('scene_id', sceneId)
        .eq('memory_id', memoryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('[NetworkService.getPlayBySceneAndMemory] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getPlayBySceneAndMemory] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 장면 목록 조회 (memory_id로)
   * @param {number} memoryId - 메모리 ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getScenesByMemoryId(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('scenes')
        .select('scene_order, text, original_emotion, original_reason')
        .eq('memory_id', memoryId)
        .order('scene_order');

      if (error) {
        console.error('[NetworkService.getScenesByMemoryId] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getScenesByMemoryId] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 쪽지 읽음 처리
   * @param {number} noteId - 쪽지 ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async markNoteAsRead(noteId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('notes')
        .update({ is_read: true })
        .eq('id', noteId);

      if (error) {
        console.error('[NetworkService.markNoteAsRead] 업데이트 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.markNoteAsRead] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 플레이의 mismatch_type 목록 조회
   * @param {number} memoryId - 메모리 ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getPlaysMismatchTypes(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('plays')
        .select('mismatch_type')
        .eq('memory_id', memoryId)
        .not('mismatch_type', 'is', null);

      if (error) {
        console.error('[NetworkService.getPlaysMismatchTypes] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getPlaysMismatchTypes] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 장면 업데이트
   * @param {number} sceneId - 장면 ID
   * @param {Object} updateData - 업데이트 데이터
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async updateScene(sceneId, updateData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('scenes')
        .update(updateData)
        .eq('id', sceneId);

      if (error) {
        console.error('[NetworkService.updateScene] 업데이트 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.updateScene] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * Supabase Edge Function 호출
   * @param {string} functionName - 함수 이름
   * @param {Object} body - 요청 body
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async invokeFunction(functionName, body) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client.functions.invoke(functionName, { body });

      if (error) {
        console.error(`[NetworkService.invokeFunction] ${functionName} 호출 실패`, error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error(`[NetworkService.invokeFunction] ${functionName} 에러 발생`, error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * 받은 쪽지 목록 조회
   * @param {string} userId - 사용자 ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async loadReceivedNotes(userId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('Supabase 클라이언트가 없습니다') };
      }

      const { data, error } = await client
        .from('notes')
        .select('*,memories(title)')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[NetworkService.loadReceivedNotes] 조회 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.loadReceivedNotes] 에러 발생', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * Supabase 클라이언트 반환 (구독 등에 필요)
   * @returns {Object|null} Supabase 클라이언트
   */
  getClient() {
    return this._getClient();
  }
}

// 싱글톤 인스턴스 export
export const networkService = new NetworkService();
