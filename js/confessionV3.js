// V3 Confession Flow - 5단계 자기심문 구조
// 감각 앵커 → 상황 서술 → 신체 반응 → 감정/이유/대상 → 자기문답+봉인

// ===== 데이터 정의 =====

const BODY_CHIPS_V3 = {
  fight: [
    { label: '주먹을 꽉 쥐었다', key: 'fist_clench', dominance: 0.2 },
    { label: '턱이 꽉 닫혔다', key: 'jaw_tight', dominance: 0.15 },
    { label: '열이 올랐다', key: 'heat_rising', dominance: 0.1 },
  ],
  flight: [
    { label: '다리가 불안했다', key: 'restless_legs', dominance: -0.05 },
    { label: '가슴이 조였다', key: 'chest_tight', dominance: -0.1 },
    { label: '도망치고 싶었다', key: 'want_to_run', dominance: -0.15 },
  ],
  freeze: [
    { label: '몸이 마비됐다', key: 'body_frozen', dominance: -0.2 },
    { label: '움직일 수 없었다', key: 'cant_move', dominance: -0.25 },
    { label: '멍해졌다', key: 'went_blank', dominance: -0.2 },
  ],
  fawn: [
    { label: '웃었다', key: 'smiled', dominance: -0.1 },
    { label: '동의했다', key: 'agreed', dominance: -0.15 },
    { label: '몸을 작게 만들었다', key: 'made_small', dominance: -0.2 },
  ],
};

const EMOTION_CHIPS_V3 = [
  { label: '죄책감', key: 'guilt' },
  { label: '두려움', key: 'fear' },
  { label: '분노', key: 'anger' },
  { label: '슬픔', key: 'sadness' },
  { label: '수치심', key: 'shame' },
  { label: '그리움', key: 'longing' },
  { label: '안도', key: 'relief' },
  { label: '혼란', key: 'confusion' },
  { label: '허탈', key: 'emptiness' },
  { label: '경외', key: 'awe' },
  { label: '이상한 기쁨', key: 'strange_joy' },
  { label: '무감각', key: 'numbness', void: true },
];

const REASON_CHIPS_V3 = [
  { label: '내 잘못인 것 같아서', key: 'self_blame' },
  { label: '어쩔 수 없었으니까', key: 'helpless' },
  { label: '누군가가 배신했으니까', key: 'betrayal' },
  { label: '말하고 싶지 않아', key: 'void', void: true },
];

const TARGET_CHIPS_V3 = [
  { label: '나 자신', key: 'self' },
  { label: '그 사람', key: 'other' },
  { label: '그 상황', key: 'situation' },
  { label: '모르겠어', key: 'unknown' },
];

const SEAL_CHIPS_V3 = [
  { label: '아직 아픈 것', key: 'still_hurts' },
  { label: '이제 괜찮은 것', key: 'okay_now' },
  { label: '아직 모르는 것', key: 'dont_know' },
  { label: '다시 보고 싶지 않은 것', key: 'never_again', void: true },
];

// ===== V3 State =====

const v3State = {
  currentStage: 0,
  data: {},
  isProcessing: false,
};

function resetV3State() {
  v3State.currentStage = 0;
  v3State.data = {
    sensory_raw: '', sensory_anchor: null,
    situation_raw: '', situation_context: null,
    body_responses: [], body_cluster: '', dominance_modifier: 0,
    emotions: [], reason: '', target: '',
    seal_relation: '', seal_word: '',
    generated_questions: [], selected_questions: [],
  };
  v3State.isProcessing = false;
}

// ===== V3 Stages 정의 =====

const V3_STAGES = [
  // Stage 1: 감각 앵커
  {
    id: 'sensory', stage: 1,
    prompt: '눈을 감아봐.\n그 순간으로 돌아가봐.\n\n뭐가 보여? 뭐가 들려?\n무슨 냄새가 나?',
    type: 'textarea', placeholder: '떠오르는 대로, 천천히...',
    handler: handleSensory,
  },
  // Stage 2: 상황 (음성 입력 우선)
  {
    id: 'situation', stage: 2,
    getPrompt: () => {
      const a = v3State.data.sensory_anchor;
      if (!a) return '그때, 무슨 일이 벌어지고 있었어?';
      const hints = { visual: '그 장면이 보일 때', olfactory: '그 냄새가 날 때', auditory: '그 소리가 들릴 때', somatic: '그 감각이 느껴질 때', narrative: '그 이야기 속에서' };
      return `${hints[a.modality] || '그 순간'},\n무슨 일이 벌어지고 있었어?`;
    },
    type: 'textarea_voice', placeholder: '말해도 되고, 써도 돼...',
    handler: handleSituation,
  },
  // Stage 3: 신체 반응
  {
    id: 'body', stage: 3,
    prompt: '그 순간, 너의 몸은 어땠어?',
    type: 'cluster_chips', maxSelect: 3,
    handler: handleBody,
  },
  // Stage 4a: 감정
  {
    id: 'emotion', stage: 4,
    getPrompt: () => {
      const names = { fight: '몸이 싸우려 했구나', flight: '몸이 도망치려 했구나', freeze: '몸이 멈췄구나', fawn: '몸이 맞추려 했구나' };
      const prefix = names[v3State.data.body_cluster] || '';
      return prefix ? `${prefix}.\n그건 어떤 감정이었을까?\n(두 개까지 고를 수 있어)` : '그건 어떤 감정이었을까?\n(두 개까지 고를 수 있어)';
    },
    type: 'multi_chips', chips: EMOTION_CHIPS_V3, maxSelect: 2,
    handler: handleEmotion,
  },
  // Stage 4b: 이유
  {
    id: 'reason', stage: 4,
    getPrompt: () => {
      const emos = v3State.data.emotions || [];
      if (emos.includes('numbness') && emos.length === 1) return '왜 아무것도 느끼지 못했을까?';
      const labels = emos.map(e => EMOTION_CHIPS_V3.find(c => c.key === e)?.label || e);
      return `왜 ${labels.join('과 ')}을 느꼈을까?`;
    },
    type: 'chips', chips: REASON_CHIPS_V3,
    handler: handleReason,
  },
  // Stage 4c: 대상
  {
    id: 'target', stage: 4,
    getPrompt: () => {
      const emos = v3State.data.emotions || [];
      const labels = emos.map(e => EMOTION_CHIPS_V3.find(c => c.key === e)?.label || e);
      return `그 ${labels.join('과 ')}은...\n누구를 향한 거야?`;
    },
    type: 'chips', chips: TARGET_CHIPS_V3,
    handler: handleTarget,
  },
  // Stage 5a: 자기문답
  {
    id: 'self_questions', stage: 5,
    prompt: '잠깐.\n\n이 기억에 대해, 너 자신에게\n묻고 싶은 게 있지 않아?',
    type: 'question_select',
    handler: handleQuestionSelect,
  },
  // Stage 5b: 봉인 관계
  {
    id: 'seal_relation', stage: 5,
    prompt: '이 기억에서 나와.\n문을 닫아.\n\n돌아보면, 이 기억은 지금 너한테 뭐야?',
    type: 'chips', chips: SEAL_CHIPS_V3,
    handler: handleSealRelation,
  },
  // Stage 5c: 봉인어
  {
    id: 'seal_word', stage: 5,
    prompt: '마지막으로.\n이 기억을 한 단어로.',
    type: 'seal_text',
    handler: handleSealWord,
  },
];

// ===== Handler 함수들 =====

async function handleSensory(text) {
  v3State.data.sensory_raw = text;
  showV3Processing('감각을 읽고 있어...');
  
  if (!window.networkService) {
    console.error('networkService가 아직 초기화되지 않았습니다');
    v3State.data.sensory_anchor = {
      modality: 'narrative',
      content: text.substring(0, 100),
      weight: 1.0,
    };
    advanceV3();
    return;
  }
  
  try {
    const result = await window.networkService.invokeFunction('claude-scene', {
      type: 'sensory_analysis',
      text: text,
    });
    
    console.log('[V3] handleSensory result:', result);
    
    if (!result) {
      throw new Error('No response from networkService');
    }
    
    if (!result.ok) {
      throw new Error('NetworkService error: ' + (result.error?.message || 'Unknown error'));
    }
    
    if (!result.data) {
      throw new Error('No data in response');
    }
    
    // result.data가 문자열일 수 있으므로 파싱 시도
    let response = result.data;
    if (typeof response === 'string') {
      try {
        response = JSON.parse(response);
      } catch (e) {
        console.error('[V3] Failed to parse response as JSON:', e);
        throw new Error('Response is not valid JSON');
      }
    }
    
    console.log('[V3] handleSensory parsed response:', response);
    
    if (response && response.modality) {
      v3State.data.sensory_anchor = {
        modality: response.modality,
        content: response.content || text.substring(0, 100),
        weight: response.weight || 1.0,
        all_modalities: response.all_modalities || {},
      };
      
      if (response.modality === 'olfactory') {
        v3State.data.sensory_anchor.arousal_weight = 0.15;
      }
    } else {
      console.warn('[V3] handleSensory: response missing modality, using fallback. Response:', response);
      throw new Error('Invalid response structure: missing modality');
    }
  } catch (error) {
    console.error('Sensory analysis failed:', error);
    v3State.data.sensory_anchor = {
      modality: 'narrative',
      content: text.substring(0, 100),
      weight: 1.0,
    };
  }
  
  advanceV3();
}

async function handleSituation(text) {
  v3State.data.situation_raw = text;
  showV3Processing('상황을 읽고 있어...');
  
  if (!window.networkService) {
    console.error('networkService가 아직 초기화되지 않았습니다');
    v3State.data.situation_context = {
      temporal: 'unknown',
      spatial: 'unknown',
      actors: [],
      role: 'unknown',
    };
    advanceV3();
    return;
  }
  
  try {
    const result = await window.networkService.invokeFunction('claude-scene', {
      type: 'situation_analysis',
      text: text,
      sensory_anchor: v3State.data.sensory_anchor,
    });
    
    console.log('[V3] handleSituation result:', result);
    
    if (!result) {
      throw new Error('No response from networkService');
    }
    
    if (!result.ok) {
      throw new Error('NetworkService error: ' + (result.error?.message || 'Unknown error'));
    }
    
    if (!result.data) {
      throw new Error('No data in response');
    }
    
    // result.data가 문자열일 수 있으므로 파싱 시도
    let response = result.data;
    if (typeof response === 'string') {
      try {
        response = JSON.parse(response);
      } catch (e) {
        console.error('[V3] Failed to parse response as JSON:', e);
        throw new Error('Response is not valid JSON');
      }
    }
    
    console.log('[V3] handleSituation parsed response:', response);
    
    // Edge Function이 타입을 인식하지 못하고 기본 장면 생성 응답을 반환한 경우
    if (response && response.scene) {
      console.warn('[V3] handleSituation: Edge Function이 기본 장면 생성 응답을 반환했습니다. 폴백 사용.');
      // 폴백으로 처리
      response = null;
    }
    
    if (response && response.temporal) {
      v3State.data.situation_context = {
        temporal: response.temporal,
        spatial: response.spatial,
        actors: response.actors || [],
        role: response.role || 'unknown',
      };
    } else {
      console.warn('[V3] handleSituation: response missing temporal, using fallback. Response:', response);
      // 폴백 처리 (에러를 던지지 않고 폴백 사용)
      v3State.data.situation_context = {
        temporal: 'unknown',
        spatial: 'unknown',
        actors: [],
        role: 'unknown',
      };
    }
  } catch (error) {
    console.error('Situation analysis failed:', error);
    // 에러가 발생해도 폴백으로 계속 진행
    if (!v3State.data.situation_context) {
      v3State.data.situation_context = {
        temporal: 'unknown',
        spatial: 'unknown',
        actors: [],
        role: 'unknown',
      };
    }
  }
  
  advanceV3();
}

function handleBody(selectedKeys) {
  v3State.data.body_responses = selectedKeys;
  
  // 클러스터 카운트
  const clusterCounts = { fight: 0, flight: 0, freeze: 0, fawn: 0 };
  let totalDominance = 0;
  let count = 0;
  
  for (const key of selectedKeys) {
    for (const [cluster, chips] of Object.entries(BODY_CHIPS_V3)) {
      const chip = chips.find(c => c.key === key);
      if (chip) {
        clusterCounts[cluster]++;
        totalDominance += chip.dominance || 0;
        count++;
        break;
      }
    }
  }
  
  // 가장 많은 클러스터
  const maxCluster = Object.entries(clusterCounts).reduce((a, b) => 
    clusterCounts[a[0]] > clusterCounts[b[0]] ? a : b
  )[0];
  
  v3State.data.body_cluster = maxCluster;
  v3State.data.dominance_modifier = count > 0 ? totalDominance / count : 0;
  
  // somatic 감각이면 dominance 감소
  if (v3State.data.sensory_anchor?.modality === 'somatic') {
    v3State.data.dominance_modifier -= 0.1;
  }
  
  advanceV3();
}

function handleEmotion(selected) {
  v3State.data.emotions = Array.isArray(selected) ? selected : [selected];
  advanceV3();
}

function handleReason(selected) {
  v3State.data.reason = selected;
  advanceV3();
}

function handleTarget(selected) {
  v3State.data.target = selected;
  generateQuestions();
}

async function generateQuestions() {
  showV3Processing('질문을 만들고 있어...');
  
  if (!window.networkService) {
    console.error('networkService가 아직 초기화되지 않았습니다');
    v3State.data.generated_questions = fallbackQuestions();
    advanceV3();
    return;
  }
  
  try {
    const result = await window.networkService.invokeFunction('claude-scene', {
      type: 'generate_questions',
      confession_data: {
        sensory_anchor: v3State.data.sensory_anchor,
        situation_raw: v3State.data.situation_raw,
        situation_context: v3State.data.situation_context,
        body_cluster: v3State.data.body_cluster,
        body_responses: v3State.data.body_responses,
        emotions: v3State.data.emotions,
        reason: v3State.data.reason,
        target: v3State.data.target,
      },
    });
    
    console.log('[V3] generateQuestions result:', result);
    
    if (!result) {
      throw new Error('No response from networkService');
    }
    
    if (!result.ok) {
      throw new Error('NetworkService error: ' + (result.error?.message || 'Unknown error'));
    }
    
    if (!result.data) {
      throw new Error('No data in response');
    }
    
    // result.data가 문자열일 수 있으므로 파싱 시도
    let response = result.data;
    if (typeof response === 'string') {
      try {
        response = JSON.parse(response);
      } catch (e) {
        console.error('[V3] Failed to parse response as JSON:', e);
        throw new Error('Response is not valid JSON');
      }
    }
    
    console.log('[V3] generateQuestions parsed response:', response);
    
    if (response && response.questions && Array.isArray(response.questions)) {
      v3State.data.generated_questions = response.questions;
    } else {
      console.warn('[V3] generateQuestions: response missing questions array, using fallback. Response:', response);
      throw new Error('Invalid response structure: missing questions array');
    }
  } catch (error) {
    console.error('Question generation failed:', error);
    v3State.data.generated_questions = fallbackQuestions();
  }
  
  advanceV3();
}

function fallbackQuestions() {
  const { emotions, reason, target } = v3State.data;
  const questions = [];
  
  // shame 또는 target=other → spotlight
  if ((emotions.includes('shame') || target === 'other')) {
    questions.push({ text: '그 사람이 알아챘을까?', category: 'spotlight' });
  }
  
  // self_blame → counterfactual
  if (reason === 'self_blame') {
    questions.push({ text: '그때 다르게 했으면 어떻게 됐을까?', category: 'counterfactual' });
  }
  
  // self_blame + guilt/shame → attribution_error
  if (reason === 'self_blame' && (emotions.includes('guilt') || emotions.includes('shame'))) {
    questions.push({ text: '정말 내 잘못이었을까?', category: 'attribution_error' });
  }
  
  // 항상 포함: reality_check
  questions.push({ text: '그게 정말 그렇게 된 거 맞아?', category: 'reality_check' });
  
  // target=other/self → perspective_shift
  if (target === 'other' || target === 'self') {
    questions.push({ text: target === 'other' ? '그 사람은 나를 어떻게 봤을까?' : '그때의 나는 지금의 나를 어떻게 봤을까?', category: 'perspective_shift' });
  }
  
  return questions.slice(0, 4);
}

function handleQuestionSelect(indices) {
  v3State.data.selected_questions = indices.map(i => v3State.data.generated_questions[i]);
  advanceV3();
}

function handleSealRelation(selected) {
  v3State.data.seal_relation = selected;
  advanceV3();
}

function handleSealWord(word) {
  v3State.data.seal_word = word;
  completeV3();
}

// ===== completeV3 =====

function completeV3() {
  showV3Processing('기억을 현상하고 있어...');
  const d = v3State.data;

  // 감각 양식 → V2 sensory 매핑
  const modMap = {
    visual:    { smell: 'nothing', sound: 'nothing', touch: 'nothing' },
    olfactory: { smell: 'rain_heavy', sound: 'silence', touch: 'nothing' },
    auditory:  { smell: 'nothing', sound: 'crowd', touch: 'nothing' },
    somatic:   { smell: 'nothing', sound: 'silence', touch: 'cold_air' },
    narrative: { smell: 'nothing', sound: 'silence', touch: 'nothing' },
  };
  const bodyMap = { fight: 'trembling', flight: 'chest_tight', freeze: 'nothing', fawn: 'nothing' };
  const attrMap = { self_blame: 'my_choice', helpless: 'no_choice', betrayal: 'no_choice', void: 'unknown' };

  const sensory = modMap[d.sensory_anchor?.modality] || modMap.visual;

  const flowData = {
    sensory,
    anchor: { object: d.sensory_anchor?.content || d.sensory_raw?.substring(0, 50) || '', context: 'unknown' },
    action: { what: d.situation_raw?.substring(0, 200) || '', attribution: attrMap[d.reason] || 'unknown' },
    crash: {
      event: d.situation_raw || '',
      bodyFeel: bodyMap[d.body_cluster] || 'nothing',
      emotion: d.emotions.length > 0 ? d.emotions : ['sadness'],
      target: d.target || 'unknown',
    },
    seal: { relation: d.seal_relation || 'dont_know', word: d.seal_word || '' },
  };

  // 기존 flowState에 주입
  window._v3FlowData = flowData;

  // V3 전용 메타데이터 (saveConfessionToDB에서 사용)
  window.confessionV3Data = {
    sensory_anchor: d.sensory_anchor,
    body_response: d.body_responses,
    self_questions: d.selected_questions,
    situation_context: d.situation_context,
    dominance_modifier: d.dominance_modifier,
  };

  // 기존 generateSceneFromRitual 호출
  if (typeof window._v3GenerateScene === 'function') {
    window._v3GenerateScene(flowData);
  }
}

// ===== UI 렌더링 =====

function startV3Flow() {
  const flowEl = document.getElementById('confessionFlow');
  if (!flowEl) {
    console.error('confessionFlow element not found');
    return;
  }
  
  flowEl.innerHTML = '';
  const zone = document.createElement('div');
  zone.id = 'confessionV3Zone';
  zone.className = 'v3-zone';
  flowEl.appendChild(zone);
  
  resetV3State();
  renderV3Stage(0);
}

function renderV3Stage(index) {
  const zone = document.getElementById('confessionV3Zone');
  if (!zone) return;
  
  const stage = V3_STAGES[index];
  if (!stage) {
    console.error('Invalid stage index:', index);
    return;
  }
  
  zone.innerHTML = '';
  
  // Stage indicator
  const indicator = document.createElement('div');
  indicator.className = 'v3-stage-indicator';
  indicator.textContent = `${stage.stage} / 5`;
  zone.appendChild(indicator);
  
  // Prompt area
  const promptEl = document.createElement('div');
  promptEl.className = 'v3-prompt';
  zone.appendChild(promptEl);
  
  // Input area
  const inputZone = document.createElement('div');
  inputZone.className = 'v3-input-zone';
  zone.appendChild(inputZone);
  
  // Prompt 타이핑
  const promptText = typeof stage.prompt === 'function' ? stage.prompt() : (typeof stage.getPrompt === 'function' ? stage.getPrompt() : stage.prompt);
  v3TypeWrite(promptEl, promptText, 35, () => {
    renderV3Input(inputZone, stage);
  });
}

function renderV3Input(zone, stage) {
  switch (stage.type) {
    case 'textarea':
      renderTextarea(zone, stage);
      break;
    case 'textarea_voice':
      renderTextareaWithVoice(zone, stage);
      break;
    case 'chips':
      renderChips(zone, stage, false);
      break;
    case 'multi_chips':
      renderChips(zone, stage, true);
      break;
    case 'cluster_chips':
      renderClusterChips(zone, stage);
      break;
    case 'question_select':
      renderQuestionSelect(zone, stage);
      break;
    case 'seal_text':
      renderSealText(zone, stage);
      break;
    default:
      console.error('Unknown stage type:', stage.type);
  }
}

function renderTextarea(zone, stage) {
  const textarea = document.createElement('textarea');
  textarea.className = 'v3-textarea';
  textarea.placeholder = stage.placeholder || '';
  textarea.rows = 6;
  
  const submitBtn = document.createElement('button');
  submitBtn.className = 'v3-submit-btn';
  submitBtn.textContent = '→';
  submitBtn.disabled = true;
  
  textarea.addEventListener('input', () => {
    submitBtn.disabled = !textarea.value.trim();
  });
  
  submitBtn.addEventListener('click', () => {
    if (textarea.value.trim() && stage.handler) {
      stage.handler(textarea.value.trim());
    }
  });
  
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && textarea.value.trim()) {
      e.preventDefault();
      if (stage.handler) {
        stage.handler(textarea.value.trim());
      }
    }
  });
  
  zone.appendChild(textarea);
  zone.appendChild(submitBtn);
  setTimeout(() => textarea.focus(), 100);
}

function renderTextareaWithVoice(zone, stage) {
  const textarea = document.createElement('textarea');
  textarea.className = 'v3-textarea';
  textarea.placeholder = stage.placeholder || '말해도 되고, 써도 돼...';
  textarea.rows = 6;
  
  const voiceHint = document.createElement('div');
  voiceHint.className = 'v3-voice-hint';
  voiceHint.textContent = '마이크 버튼을 눌러 말로 입력할 수 있습니다';
  
  const voiceRow = document.createElement('div');
  voiceRow.className = 'v3-voice-row';
  
  const micBtn = document.createElement('button');
  micBtn.className = 'v3-mic-btn';
  micBtn.type = 'button';
  micBtn.innerHTML = '🎙 <span>눌러서 말하기</span>';
  
  const submitBtn = document.createElement('button');
  submitBtn.className = 'v3-submit-btn';
  submitBtn.type = 'button';
  submitBtn.textContent = '→';
  submitBtn.disabled = true;
  
  const hasSpeechRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  if (!hasSpeechRecognition) {
    micBtn.disabled = true;
    micBtn.style.opacity = '0.5';
    micBtn.style.cursor = 'not-allowed';
  }
  
  let isRecording = false;
  let recognition = null;
  let accumulatedText = textarea.value || '';
  let lastProcessedIndex = -1; // 이미 처리한 resultIndex 추적
  
  micBtn.addEventListener('click', () => {
    if (!hasSpeechRecognition) {
      if (window.showNotification) {
        window.showNotification('이 브라우저는 음성 인식을 지원하지 않습니다');
      }
      return;
    }
    
    if (isRecording) {
      if (recognition) {
        recognition.stop();
        recognition = null;
      }
      isRecording = false;
      lastProcessedIndex = -1; // 리셋
      micBtn.classList.remove('v3-mic-active');
      micBtn.innerHTML = '🎙 <span>눌러서 말하기</span>';
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let interimText = '';
        let newFinalText = '';
        
        // event.resultIndex부터 시작하여 이미 처리하지 않은 결과만 처리
        // continuous: true일 때 같은 결과가 여러 번 올 수 있으므로 주의
        const startIndex = Math.max(event.resultIndex, lastProcessedIndex + 1);
        
        for (let i = startIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal) {
            // final 결과는 한 번만 추가
            newFinalText += transcript;
            lastProcessedIndex = i; // 처리 완료 인덱스 업데이트
          } else {
            // interim 결과는 실시간 표시용
            interimText += transcript;
          }
        }
        
        // final transcript는 누적 (중복 방지)
        if (newFinalText) {
          accumulatedText += newFinalText;
          textarea.value = accumulatedText;
          console.log('[V3] STT final text added:', newFinalText, 'total:', accumulatedText);
        }
        
        // interim은 실시간 표시 (기존 텍스트 + 누적 final + 현재 interim)
        if (interimText) {
          textarea.value = accumulatedText + interimText;
        }
        
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      };
      
      recognition.onend = () => {
        isRecording = false;
        lastProcessedIndex = -1; // 리셋
        micBtn.classList.remove('v3-mic-active');
        micBtn.innerHTML = '🎙 <span>눌러서 말하기</span>';
        if (recognition) {
          recognition = null;
        }
      };
      
      recognition.onerror = (event) => {
        console.error('음성 인식 오류:', event.error);
        isRecording = false;
        lastProcessedIndex = -1; // 리셋
        micBtn.classList.remove('v3-mic-active');
        micBtn.innerHTML = '🎙 <span>눌러서 말하기</span>';
        
        if (event.error === 'not-allowed' && window.showNotification) {
          window.showNotification('마이크 권한이 필요합니다');
        }
      };
      
      try {
        lastProcessedIndex = -1; // 새 녹음 시작 시 리셋
        recognition.start();
        isRecording = true;
        micBtn.classList.add('v3-mic-active');
        micBtn.innerHTML = '⏹ <span>말하기 중...</span>';
      } catch (e) {
        console.error('음성 인식 시작 실패:', e);
        lastProcessedIndex = -1; // 리셋
        if (window.showNotification) {
          window.showNotification('음성 인식을 시작할 수 없습니다');
        }
      }
    }
  });
  
  textarea.addEventListener('input', () => {
    submitBtn.disabled = !textarea.value.trim();
    accumulatedText = textarea.value;
  });
  
  submitBtn.addEventListener('click', () => {
    if (textarea.value.trim() && stage.handler) {
      stage.handler(textarea.value.trim());
    }
  });
  
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && textarea.value.trim()) {
      e.preventDefault();
      if (stage.handler) {
        stage.handler(textarea.value.trim());
      }
    }
  });
  
  voiceRow.appendChild(micBtn);
  voiceRow.appendChild(submitBtn);
  
  zone.appendChild(voiceHint);
  zone.appendChild(textarea);
  zone.appendChild(voiceRow);
  
  setTimeout(() => textarea.focus(), 100);
}

function renderChips(zone, stage, multiSelect) {
  const chips = stage.chips || [];
  const selected = [];
  const maxSelect = stage.maxSelect || (multiSelect ? 2 : 1);
  
  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'v3-chips-container';
  
  chips.forEach((chip, index) => {
    const chipEl = document.createElement('button');
    chipEl.className = 'v3-chip';
    chipEl.textContent = chip.label;
    chipEl.type = 'button';
    
    if (chip.void) {
      chipEl.classList.add('v3-chip-void');
    }
    
    chipEl.addEventListener('click', () => {
      if (multiSelect) {
        const idx = selected.indexOf(chip.key);
        if (idx >= 0) {
          selected.splice(idx, 1);
          chipEl.classList.remove('v3-chip-selected');
        } else if (selected.length < maxSelect) {
          selected.push(chip.key);
          chipEl.classList.add('v3-chip-selected');
        }
      } else {
        selected.length = 0;
        selected.push(chip.key);
        chipsContainer.querySelectorAll('.v3-chip').forEach(c => c.classList.remove('v3-chip-selected'));
        chipEl.classList.add('v3-chip-selected');
      }
      
      if (selected.length > 0 && stage.handler) {
        setTimeout(() => {
          stage.handler(multiSelect ? selected : selected[0]);
        }, 300);
      }
    });
    
    chipsContainer.appendChild(chipEl);
  });
  
  zone.appendChild(chipsContainer);
}

function renderClusterChips(zone, stage) {
  // 모든 클러스터를 flat하게 펼치고 셔플
  const allChips = [];
  for (const [cluster, chips] of Object.entries(BODY_CHIPS_V3)) {
    chips.forEach(chip => {
      allChips.push({ ...chip, _cluster: cluster });
    });
  }
  
  // 셔플 (Fisher-Yates)
  for (let i = allChips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allChips[i], allChips[j]] = [allChips[j], allChips[i]];
  }
  
  const selected = [];
  const maxSelect = stage.maxSelect || 3;
  
  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'v3-chips-container';
  
  allChips.forEach((chip) => {
    const chipEl = document.createElement('button');
    chipEl.className = 'v3-chip';
    chipEl.textContent = chip.label;
    chipEl.type = 'button';
    
    chipEl.addEventListener('click', () => {
      const idx = selected.indexOf(chip.key);
      if (idx >= 0) {
        selected.splice(idx, 1);
        chipEl.classList.remove('v3-chip-selected');
      } else if (selected.length < maxSelect) {
        selected.push(chip.key);
        chipEl.classList.add('v3-chip-selected');
      }
      
      if (selected.length >= maxSelect && stage.handler) {
        setTimeout(() => {
          stage.handler(selected);
        }, 300);
      }
    });
    
    chipsContainer.appendChild(chipEl);
  });
  
  zone.appendChild(chipsContainer);
}

function renderQuestionSelect(zone, stage) {
  const questions = v3State.data.generated_questions || [];
  if (questions.length === 0) {
    zone.innerHTML = '<div class="v3-error">질문을 생성할 수 없습니다.</div>';
    return;
  }
  
  const selected = [];
  const maxSelect = 2;
  
  const questionsContainer = document.createElement('div');
  questionsContainer.className = 'v3-questions-container';
  
  questions.forEach((q, index) => {
    const qEl = document.createElement('button');
    qEl.className = 'v3-question';
    qEl.textContent = q.text;
    qEl.type = 'button';
    
    qEl.addEventListener('click', () => {
      const idx = selected.indexOf(index);
      if (idx >= 0) {
        selected.splice(idx, 1);
        qEl.classList.remove('v3-question-selected');
      } else if (selected.length < maxSelect) {
        selected.push(index);
        qEl.classList.add('v3-question-selected');
      }
      
      if (selected.length > 0 && stage.handler) {
        setTimeout(() => {
          stage.handler(selected);
        }, 300);
      }
    });
    
    questionsContainer.appendChild(qEl);
  });
  
  zone.appendChild(questionsContainer);
}

function renderSealText(zone, stage) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'v3-seal-input';
  input.placeholder = '단 하나의 단어';
  input.maxLength = 20;
  
  const submitBtn = document.createElement('button');
  submitBtn.className = 'v3-submit-btn';
  submitBtn.textContent = '→';
  submitBtn.disabled = true;
  
  input.addEventListener('input', () => {
    submitBtn.disabled = !input.value.trim();
  });
  
  submitBtn.addEventListener('click', () => {
    if (input.value.trim() && stage.handler) {
      stage.handler(input.value.trim());
    }
  });
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      if (stage.handler) {
        stage.handler(input.value.trim());
      }
    }
  });
  
  zone.appendChild(input);
  zone.appendChild(submitBtn);
  setTimeout(() => input.focus(), 100);
}

function advanceV3() {
  v3State.currentStage++;
  if (v3State.currentStage < V3_STAGES.length) {
    renderV3Stage(v3State.currentStage);
  } else {
    console.log('V3 flow complete');
  }
}

function showV3Processing(text) {
  const zone = document.getElementById('confessionV3Zone');
  if (!zone) return;
  
  zone.innerHTML = `
    <div class="v3-processing">
      <div class="v3-spinner"></div>
      <div class="v3-processing-text">${text}</div>
    </div>
  `;
}

function v3TypeWrite(el, text, speed, cb) {
  if (!el) return;
  let i = 0;
  el.textContent = '';
  
  function type() {
    if (i < text.length) {
      const char = text[i];
      el.textContent += char;
      i++;
      
      let delay = speed;
      if (char === '.' || char === '?') {
        delay = 180;
      } else if (char === '\n') {
        delay = 240;
      }
      
      setTimeout(type, delay);
    } else if (cb) {
      cb();
    }
  }
  
  type();
}

// ===== Export =====

window.startV3Flow = startV3Flow;
window.v3State = v3State;
window.BODY_CHIPS_V3 = BODY_CHIPS_V3;
