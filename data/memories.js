/**
 * Memories Data
 * 기억 데이터와 유틸리티 함수를 포함하는 모듈
 */

// 기억 데이터 배열
const memoriesData = [];

/**
 * MemoryUtils
 * 기억 데이터를 다루는 유틸리티 함수들
 */
const MemoryUtils = {
    /**
     * ID로 기억 찾기
     * @param {number} id - 기억 ID
     * @returns {Object|null} 기억 객체 또는 null
     */
    findById(id) {
        return memoriesData.find(memory => memory.id === id) || null;
    },

    /**
     * 코드로 기억 찾기
     * @param {string} code - 기억 코드 (예: 'A-001')
     * @returns {Object|null} 기억 객체 또는 null
     */
    findByCode(code) {
        return memoriesData.find(memory => memory.code === code) || null;
    },

    /**
     * 인기순으로 정렬 (해석 레이어 많은 순)
     * @param {Array} memories - 정렬할 기억 배열 (기본값: 전체)
     * @returns {Array} 정렬된 배열
     */
    sortByPopular(memories = memoriesData) {
        return [...memories].sort((a, b) => b.layers - a.layers);
    },

    /**
     * 최신순으로 정렬 (recentRank 낮은 순)
     * @param {Array} memories - 정렬할 기억 배열 (기본값: 전체)
     * @returns {Array} 정렬된 배열
     */
    sortByRecent(memories = memoriesData) {
        return [...memories].sort((a, b) => a.recentRank - b.recentRank);
    },

    /**
     * 코드로 검색
     * @param {string} query - 검색어
     * @returns {Array} 검색 결과 배열
     */
    search(query) {
        const upperQuery = query.toUpperCase().trim();
        if (!upperQuery) return memoriesData;
        return memoriesData.filter(memory => 
            memory.code.includes(upperQuery) || 
            memory.title.includes(query)
        );
    },

    /**
     * 전체 데이터를 JSON으로 내보내기
     * @returns {string} JSON 문자열
     */
    exportJSON() {
        return JSON.stringify(memoriesData, null, 2);
    },

    /**
     * JSON 데이터 가져오기 (Supabase 연결 시 사용)
     * @param {string|Array} data - JSON 문자열 또는 배열
     */
    importJSON(data) {
        if (typeof data === 'string') {
            const parsed = JSON.parse(data);
            memoriesData.length = 0;
            memoriesData.push(...parsed);
        } else if (Array.isArray(data)) {
            memoriesData.length = 0;
            memoriesData.push(...data);
        }
    },

    /**
     * 전체 기억 데이터 가져오기
     * @returns {Array} 기억 데이터 배열
     */
    getAll() {
        return memoriesData;
    }
};
