// js/services/NetworkService.js
// 네트워크 call 중앙화하 service

import { getSupabaseClient } from '../lib/supabaseClient.js';

/**
 * NetworkService - Supabase call 중앙화
 * 모든 네트워크 call service 루어지며,
 * { ok, data, error } 형태 return .
 */
class NetworkService {
  /**
 * Supabase client 져오기
 * @returns {Object|null} Supabase client 또 null
   */
  _getClient() {
    const client = getSupabaseClient();
    if (!client) {
      console.warn('[NetworkService] Supabase client not initialized');
    }
    return client;
  }

  /**
 * 공개 memory list query (scenes, choices )
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async fetchMemories() {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data: memoriesDataSupabase, error: memoriesError } = await client
        .from('memories')
        .select('*')
        .order('id', { ascending: true });

      if (memoriesError) {
        console.error('[NetworkService.fetchMemories] memories Query failed', memoriesError);
        return { ok: false, data: null, error: memoriesError };
      }

      if (!memoriesDataSupabase || memoriesDataSupabase.length === 0) {
        return { ok: true, data: [], error: null };
      }

 // 각 memory scenes choices 불러오기
      const supabaseMemories = await Promise.all(
        memoriesDataSupabase.map(async (memory) => {
          const { data: scenesData, error: scenesError } = await client
            .from('scenes')
            .select('*')
            .eq('memory_id', memory.id)
            .order('scene_order', { ascending: true });

          if (scenesError) {
            console.error(`[NetworkService.fetchMemories] Memory ${memory.id} scenes Query failed`, scenesError);
 // scenes 러 있어 memory return (빈 scenes array )
            const isLive = !!memory.live_session_id;
            return {
              id: memory.id,
              code: memory.code || '',
              title: memory.title || '',
              sound_map: memory.sound_map || null,
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
                console.error(`[NetworkService.fetchMemories] Scene ${scene.id} choices Query failed`, choicesError);
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
            sound_map: memory.sound_map || null,
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
      console.error('[NetworkService.fetchMemories] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * memory ID memory 정보 query
 * @param {number} memoryId - memory ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getMemoryById(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('memories')
        .select('author_note, source_session_id')
        .eq('id', memoryId)
        .single();

      if (error) {
        console.error('[NetworkService.getMemoryById] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getMemoryById] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * live session create
 * @param {Object} sessionData - session data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async createSession(sessionData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
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

 // create session 실제 DB 있 지 check
      const { data: verifyData, error: verifyError } = await client
        .from('live_sessions')
        .select('*')
        .eq('id', result.data.id)
        .single();

      if (verifyError || !verifyData) {
        console.error('[NetworkService.createSession] 세션 검증 실패', verifyError);
        return { ok: false, data: null, error: verifyError || new Error('Session verification failed') };
      }

      return { ok: true, data: result.data, error: null };
    } catch (error) {
      console.error('[NetworkService.createSession] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session 코드 session query
 * @param {string} sessionCode - session 코드
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async findSessionsByCode(sessionCode) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('*')
        .eq('session_code', sessionCode.toUpperCase())
        .is('ended_at', null);

      if (error) {
        console.error('[NetworkService.findSessionsByCode] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.findSessionsByCode] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session experiencer 참여
 * @param {number} sessionId - session ID
 * @param {string} userId - user ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async joinSession(sessionId, userId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
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
      console.error('[NetworkService.joinSession] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session end
 * @param {number} sessionId - session ID
 * @param {number} alignment - alignment
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async endSession(sessionId, alignment) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
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
      console.error('[NetworkService.endSession] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session memory 운명 업데 트
 * @param {number} sessionId - session ID
 * @param {string} fate - 운명 ('preserve', 'dilute', 'erase')
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async updateSessionMemoryFate(sessionId, fate) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .update({ memory_fate: fate })
        .eq('id', sessionId);

      if (error) {
        console.error('[NetworkService.updateSessionMemoryFate] Update failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.updateSessionMemoryFate] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session 정보 query
 * @param {number} sessionId - session ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getSessionById(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('[NetworkService.getSessionById] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getSessionById] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session experiencer ID query
 * @param {number} sessionId - session ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getSessionExperiencerId(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('experiencer_id')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('[NetworkService.getSessionExperiencerId] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getSessionExperiencerId] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * user session 히스토리 query
 * @param {string} userId - user ID
 * @param {number} limit - query 제 수
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getUserSessionHistory(userId, limit = 50) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('*')
        .or(`narrator_id.eq.${userId},experiencer_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[NetworkService.getUserSessionHistory] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getUserSessionHistory] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * user session ID list query
 * @param {string} userId - user ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getUserSessionIds(userId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('id')
        .or(`narrator_id.eq.${userId},experiencer_id.eq.${userId}`);

      if (error) {
        console.error('[NetworkService.getUserSessionIds] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getUserSessionIds] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session ID list으 session narrator ID query
 * @param {number} sessionId - session ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getSessionNarratorId(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_sessions')
        .select('narrator_id')
        .eq('id', sessionId)
        .single();

      if (error) {
        console.error('[NetworkService.getSessionNarratorId] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getSessionNarratorId] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * scene save (scenes 테 블)
 * @param {Object} sceneData - scene data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveScene(sceneData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('scenes')
        .insert(sceneData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.saveScene] Save failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveScene] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * live scene save (live_scenes 테 블)
 * @param {Object} sceneData - scene data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveLiveScene(sceneData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_scenes')
        .insert(sceneData)
        .select();

      if (error) {
        console.error('[NetworkService.saveLiveScene] Save failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveLiveScene] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session live scene list query
 * @param {number} sessionId - session ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getLiveScenesBySessionId(sessionId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('live_scenes')
        .select('*')
        .eq('session_id', sessionId)
        .order('scene_index', { ascending: true });

      if (error) {
        console.error('[NetworkService.getLiveScenesBySessionId] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getLiveScenesBySessionId] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * 선택 save (choices 테 블)
 * @param {Object} choiceData - 선택 data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveChoice(choiceData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('choices')
        .insert(choiceData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.saveChoice] Save failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveChoice] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * play save (plays 테 블)
 * @param {Object} playData - play data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async savePlay(playData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('plays')
        .insert(playData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.savePlay] Save failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.savePlay] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * memory contamination query (plays 테 블 count)
 * @param {number} memoryId - memory ID
   * @returns {Promise<{ok: boolean, data: number|null, error: Error|null}>}
   */
  async getPlayCount(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { count, error } = await client
        .from('plays')
        .select('*', { count: 'exact', head: true })
        .eq('memory_id', memoryId);

      if (error) {
        console.error('[NetworkService.getPlayCount] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: count || 0, error: null };
    } catch (error) {
      console.error('[NetworkService.getPlayCount] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * memory별 play list query (strata 단면용)
 * @param {string} memoryId - memory ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getPlaysByMemoryId(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }
      const { data, error } = await client
        .from('plays')
        .select('id, user_emotion, alignment, scene_id, created_at')
        .eq('memory_id', memoryId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('[NetworkService.getPlaysByMemoryId] Query failed', error);
        return { ok: false, data: null, error };
      }
      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getPlaysByMemoryId] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * memory save
 * @param {Object} memoryData - memory data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async saveMemory(memoryData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('memories')
        .insert(memoryData)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.saveMemory] Save failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.saveMemory] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session ID list으 memory query
 * @param {Array<number>} sessionIds - session ID array
 * @param {number} limit - query 제 수
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getMemoriesBySessionIds(sessionIds, limit = 50) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('memories')
        .select('*')
        .in('source_session_id', sessionIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[NetworkService.getMemoriesBySessionIds] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getMemoriesBySessionIds] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * session ID list으 memory ID list query
 * @param {Array<number>} sessionIds - session ID array
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getMemoryIdsBySessionIds(sessionIds) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('memories')
        .select('id')
        .in('source_session_id', sessionIds);

      if (error) {
        console.error('[NetworkService.getMemoryIdsBySessionIds] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getMemoryIdsBySessionIds] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * note 전송
 * @param {Object} noteData - note data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async sendNote(noteData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { error } = await client.from('notes').insert(noteData);

      if (error) {
        console.error('[NetworkService.sendNote] 전송 실패', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: null, error: null };
    } catch (error) {
      console.error('[NetworkService.sendNote] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * play query (scene_id memory_id )
 * @param {number} sceneId - scene ID
 * @param {number} memoryId - memory ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async getPlayBySceneAndMemory(sceneId, memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
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
        console.error('[NetworkService.getPlayBySceneAndMemory] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.getPlayBySceneAndMemory] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * scene list query (memory_id )
 * @param {number} memoryId - memory ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getScenesByMemoryId(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('scenes')
        .select('scene_order, text, original_emotion, original_reason')
        .eq('memory_id', memoryId)
        .order('scene_order');

      if (error) {
        console.error('[NetworkService.getScenesByMemoryId] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getScenesByMemoryId] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * note 읽음 process
 * @param {number} noteId - note ID
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async markNoteAsRead(noteId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('notes')
        .update({ is_read: true })
        .eq('id', noteId);

      if (error) {
        console.error('[NetworkService.markNoteAsRead] Update failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.markNoteAsRead] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * play mismatch_type list query
 * @param {number} memoryId - memory ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async getPlaysMismatchTypes(memoryId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('plays')
        .select('mismatch_type')
        .eq('memory_id', memoryId)
        .not('mismatch_type', 'is', null);

      if (error) {
        console.error('[NetworkService.getPlaysMismatchTypes] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.getPlaysMismatchTypes] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * scene 업데 트
 * @param {number} sceneId - scene ID
 * @param {Object} updateData - 업데 트 data
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async updateScene(sceneId, updateData) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('scenes')
        .update(updateData)
        .eq('id', sceneId);

      if (error) {
        console.error('[NetworkService.updateScene] Update failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.updateScene] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * memory layers/dilution 업데 트 (희석 시스템)
 * @param {number} memoryId - memory ID
 * @param {number} layers - 총 체험 횟수
 * @param {number} dilution - original 비중 (0~100)
   */
  async updateMemoryDilution(memoryId, layers, dilution) {
    try {
      const client = this._getClient();
      if (!client) return { ok: false, data: null, error: new Error('No Supabase client') };

      const { data, error } = await client
        .from('memories')
        .update({ layers, dilution })
        .eq('id', memoryId)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.updateMemoryDilution] 실패:', error);
        return { ok: false, data: null, error };
      }
      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.updateMemoryDilution] 에러:', error);
      return { ok: false, data: null, error };
    }
  }

  /**
   * memory contamination 상태 update (ContaminationTracker MVP v3 출력)
   * @param {number} memoryId - memory ID
   * @param {Object} contState - updateContamination() 반환 state 전체
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async updateMemoryContamination(memoryId, contState) {
    try {
      const client = this._getClient();
      if (!client) return { ok: false, data: null, error: new Error('No Supabase client') };

      const patch = {
        cont_drift:            contState.cont_drift,
        cont_fixation:         contState.cont_fixation,
        cont_stage:            contState.cont_stage,
        cont_depth:            contState.cont_depth,
        lifetime_drift_sum:    contState.lifetime_drift_sum,
        lifetime_fix_sum:      contState.lifetime_fix_sum,
        drift_dir_v:           contState.drift_dir_v,
        drift_dir_a:           contState.drift_dir_a,
        drift_dir_d:           contState.drift_dir_d,
        lifetime_dir_v_sum:    contState.lifetime_dir_v_sum,
        lifetime_dir_a_sum:    contState.lifetime_dir_a_sum,
        lifetime_dir_d_sum:    contState.lifetime_dir_d_sum,
        cont_last_alignment:   contState.cont_last_alignment,
        cont_last_level:       contState.cont_last_level,
        cont_last_shape:       contState.cont_last_shape,
        cont_last_pattern:     contState.cont_last_pattern,
        cont_last_mismatch:    contState.cont_last_mismatch,
        cont_last_updated:     contState.cont_last_updated,
        // 3-axis vector
        cont_divergence:       contState.cont_divergence ?? 0,
        cont_convergence:      contState.cont_convergence ?? 0,
        cont_heterogeneity:    contState.cont_heterogeneity ?? 0,
        _cont_align_mean:      contState._cont_align_mean ?? 0,
        _cont_align_m2:        contState._cont_align_m2 ?? 0,
        cont_stage_1:          contState.cont_stage_1 ?? 0,
        cont_stage_2:          contState.cont_stage_2 ?? 0,
        cont_stage_3:          contState.cont_stage_3 ?? 0,
      };

      const { data, error } = await client
        .from('memories')
        .update(patch)
        .eq('id', memoryId)
        .select()
        .single();

      if (error) {
        console.error('[NetworkService.updateMemoryContamination] 실패:', error);
        return { ok: false, data: null, error };
      }
      return { ok: true, data, error: null };
    } catch (error) {
      console.error('[NetworkService.updateMemoryContamination] 에러:', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * Supabase Edge Function call
 * @param {string} functionName - function 름
 * @param {Object} body - request body
   * @returns {Promise<{ok: boolean, data: Object|null, error: Error|null}>}
   */
  async invokeFunction(functionName, body) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client.functions.invoke(functionName, { body });

      if (error) {
        console.error(`[NetworkService.invokeFunction] ${functionName} 호출 실패`, error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      console.error(`[NetworkService.invokeFunction] ${functionName} Error occurred`, error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * 받 note list query
 * @param {string} userId - user ID
   * @returns {Promise<{ok: boolean, data: Array|null, error: Error|null}>}
   */
  async loadReceivedNotes(userId) {
    try {
      const client = this._getClient();
      if (!client) {
        return { ok: false, data: null, error: new Error('No Supabase client') };
      }

      const { data, error } = await client
        .from('notes')
        .select('*,memories(title)')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[NetworkService.loadReceivedNotes] Query failed', error);
        return { ok: false, data: null, error };
      }

      return { ok: true, data: data || [], error: null };
    } catch (error) {
      console.error('[NetworkService.loadReceivedNotes] Error occurred', error);
      return { ok: false, data: null, error };
    }
  }

  /**
 * Supabase client return (subscribe 등 needed)
 * @returns {Object|null} Supabase client
   */
  getClient() {
    return this._getClient();
  }
}

// 싱글톤 인스턴스 export
export const networkService = new NetworkService();
