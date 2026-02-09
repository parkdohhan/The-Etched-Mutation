// js/services/RealtimeService.js
// Supabase Realtime 구독 서비스

import { getSupabaseClient } from '../lib/supabaseClient.js';

class RealtimeService {
    constructor() {
        this.channels = {};
        this.intervals = {};
    }

    /**
     * Supabase 클라이언트 가져오기
     * @returns {Object|null} Supabase 클라이언트 또는 null
     */
    _getClient() {
        return getSupabaseClient();
    }

    /**
     * 세션 참여 구독 (live_sessions 테이블 UPDATE)
     * @param {number} sessionId - 세션 ID
     * @param {Object} handlers - 이벤트 핸들러
     * @param {Function} handlers.onExperiencerJoin - 체험자 참여 시 호출
     * @param {Function} handlers.onSubscribed - 구독 성공 시 호출 (폴링 시작용)
     */
    subscribeToSessionJoin(sessionId, handlers = {}) {
        const { onExperiencerJoin, onSubscribed } = handlers;
        const supabaseClient = this._getClient();
        
        if (!supabaseClient || !sessionId) {
            console.log('구독 실패: supabaseClient 또는 sessionId 없음', {
                supabaseClient: !!supabaseClient,
                sessionId
            });
            return;
        }

        console.log('구독 시작, 세션 ID:', sessionId);
        
        const channel = supabaseClient
            .channel('session-join-' + sessionId)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'live_sessions',
                filter: `id=eq.${sessionId}`
            }, (payload) => {
                console.log('이벤트 수신:', payload);
                if (payload.new.experiencer_id) {
                    console.log('체험자 참여 감지!', payload.new.experiencer_id);
                    if (onExperiencerJoin) {
                        onExperiencerJoin(payload.new);
                    }
                }
            })
            .subscribe((status) => {
                console.log('구독 상태:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('구독 성공, 폴링 시작');
                    if (onSubscribed) {
                        onSubscribed();
                    }
                }
            });

        this.channels.sessionJoin = channel;
        console.log('구독 채널 생성 완료:', channel);
    }

    /**
     * Live 장면 구독 (live_scenes 테이블 INSERT)
     * @param {number} sessionId - 세션 ID
     * @param {Object} handlers - 이벤트 핸들러
     * @param {Function} handlers.onSceneInsert - 새 장면 수신 시 호출
     */
    subscribeToLiveScenes(sessionId, handlers = {}) {
        const { onSceneInsert } = handlers;
        const supabaseClient = this._getClient();
        
        if (!supabaseClient || !sessionId) {
            return;
        }

        console.log('live_scenes 구독 시작, 세션 ID:', sessionId);
        
        const channel = supabaseClient
            .channel('live-scenes-' + sessionId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'live_scenes',
                filter: `session_id=eq.${sessionId}`
            }, (payload) => {
                console.log('새 장면 수신:', payload);
                if (onSceneInsert) {
                    onSceneInsert(payload.new);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('live_scenes 구독 성공');
                } else if (status === 'CHANNEL_ERROR') {
                    console.log('live_scenes 구독 실패 (무시됨)');
                }
            });

        this.channels.liveScenes = channel;
    }

    /**
     * Live 해석 구독 (비활성화됨)
     */
    subscribeToLiveInterpretations() {
        // live_interpretations 테이블이 없으므로 완전히 비활성화
        return;
    }

    /**
     * 체험자 선택 구독 (choices 테이블 INSERT)
     * @param {number} sessionId - 세션 ID
     * @param {Object} handlers - 이벤트 핸들러
     * @param {Function} handlers.onChoiceInsert - 새 선택 수신 시 호출
     */
    subscribeToExperiencerChoices(sessionId, handlers = {}) {
        const { onChoiceInsert } = handlers;
        const supabaseClient = this._getClient();
        
        if (!supabaseClient) {
            console.error('subscribeToExperiencerChoices: supabaseClient 없음');
            return;
        }
        
        if (!sessionId) {
            console.error('subscribeToExperiencerChoices: sessionId 없음');
            return;
        }

        console.log('체험자 감정 구독 시작, 세션:', sessionId);
        
        const channel = supabaseClient
            .channel('choices-' + sessionId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'choices',
                filter: `live_session_id=eq.${sessionId}`
            }, (payload) => {
                console.log('체험자 감정 수신 (choices 테이블):', payload);
                console.log('payload.new:', payload.new);
                if (payload.new && payload.new.emotion_vector) {
                    if (onChoiceInsert) {
                        onChoiceInsert(payload.new);
                    }
                } else {
                    console.error('payload.new 또는 emotion_vector가 없습니다');
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('choices 테이블 구독 성공!');
                } else if (status === 'CHANNEL_ERROR') {
                    console.log('choices 테이블 구독 실패 (무시됨)');
                }
            });

        this.channels.experiencerChoices = channel;
        console.log('choices 채널 생성 완료:', channel);
    }

    /**
     * 장면 구독 (scenes 테이블 INSERT)
     * @param {number} sessionId - 세션 ID
     * @param {Object} handlers - 이벤트 핸들러
     * @param {Function} handlers.onSceneInsert - 새 장면 수신 시 호출
     */
    subscribeToScenes(sessionId, handlers = {}) {
        const { onSceneInsert } = handlers;
        const supabaseClient = this._getClient();
        
        if (!supabaseClient) {
            console.error('subscribeToScenes: supabaseClient 없음');
            return;
        }
        
        if (!sessionId) {
            console.error('subscribeToScenes: sessionId 없음');
            return;
        }

        console.log('장면 구독 시작, 세션 ID:', sessionId);
        
        const channel = supabaseClient
            .channel('scenes-' + sessionId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'scenes',
                filter: `live_session_id=eq.${sessionId}`
            }, (payload) => {
                console.log('새 장면 수신 (scenes 테이블):', payload);
                console.log('payload.new:', payload.new);
                if (payload.new) {
                    if (onSceneInsert) {
                        onSceneInsert(payload.new);
                    }
                } else {
                    console.error('payload.new가 없습니다');
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('scenes 테이블 구독 성공!');
                } else if (status === 'CHANNEL_ERROR') {
                    console.log('scenes 테이블 구독 실패 (무시됨)');
                }
            });

        this.channels.scenes = channel;
        console.log('scenes 채널 생성 완료:', channel);
    }

    /**
     * 화자 감정 구독 (scenes 테이블 INSERT, emotion_vector 필터링)
     * @param {number} sessionId - 세션 ID
     * @param {Object} handlers - 이벤트 핸들러
     * @param {Function} handlers.onNarratorEmotionInsert - 화자 감정 수신 시 호출
     */
    subscribeToNarratorEmotion(sessionId, handlers = {}) {
        const { onNarratorEmotionInsert } = handlers;
        const supabaseClient = this._getClient();
        
        if (!supabaseClient || !sessionId) {
            console.error('subscribeToNarratorEmotion: supabaseClient 또는 sessionId 없음');
            return;
        }

        console.log('화자 감정 구독 시작, 세션 ID:', sessionId);
        
        const channel = supabaseClient
            .channel('narrator-scenes-' + sessionId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'scenes',
                filter: `live_session_id=eq.${sessionId}`
            }, (payload) => {
                console.log('화자 장면/감정 수신:', payload.new);
                if (payload.new && payload.new.emotion_vector) {
                    if (onNarratorEmotionInsert) {
                        onNarratorEmotionInsert(payload.new);
                    }
                }
            })
            .subscribe((status) => {
                console.log('화자 감정 구독 상태:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('화자 감정 구독 성공!');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('화자 감정 구독 실패');
                }
            });

        this.channels.narratorEmotion = channel;
        console.log('화자 감정 채널 생성 완료:', channel);
    }

    /**
     * 특정 채널 구독 해제
     * @param {string} channelName - 채널 이름 ('sessionJoin', 'liveScenes', 'experiencerChoices', 'scenes', 'narratorEmotion')
     */
    unsubscribe(channelName) {
        if (this.channels[channelName]) {
            this.channels[channelName].unsubscribe();
            delete this.channels[channelName];
            console.log(`채널 구독 해제: ${channelName}`);
        }
    }

    /**
     * 모든 구독 해제 및 정리
     */
    cleanup() {
        // 모든 채널 구독 해제
        Object.keys(this.channels).forEach(channelName => {
            if (this.channels[channelName]) {
                this.channels[channelName].unsubscribe();
                console.log(`채널 구독 해제: ${channelName}`);
            }
        });
        this.channels = {};

        // 모든 인터벌 정리
        Object.keys(this.intervals).forEach(intervalName => {
            if (this.intervals[intervalName]) {
                globalThis.clearInterval(this.intervals[intervalName]);
                console.log(`인터벌 정리: ${intervalName}`);
            }
        });
        this.intervals = {};
    }

    /**
     * 인터벌 등록 (정리용)
     * @param {string} name - 인터벌 이름
     * @param {number} intervalId - setInterval 반환값
     */
    registerInterval(name, intervalId) {
        this.intervals[name] = intervalId;
    }

    /**
     * 인터벌 해제
     * @param {string} name - 인터벌 이름
     */
    clearInterval(name) {
        if (this.intervals[name]) {
            globalThis.clearInterval(this.intervals[name]);
            delete this.intervals[name];
            console.log(`인터벌 해제: ${name}`);
        }
    }
}

export const realtimeService = new RealtimeService();
