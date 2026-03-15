// V3 Confession Flow - 5-stage self-interrogation structure
// Sensory anchor → Situation narration → Body response → Emotion/Reason/Target → Self-questioning + Seal

// ===== Data Definitions =====

const BODY_CHIPS_V3 = {
  fight: [
    { label: 'Clenched my fists', key: 'fist_clench', dominance: 0.2 },
    { label: 'Jaw locked tight', key: 'jaw_tight', dominance: 0.15 },
    { label: 'Heat rising', key: 'heat_rising', dominance: 0.1 },
  ],
  flight: [
    { label: 'Legs felt restless', key: 'restless_legs', dominance: -0.05 },
    { label: 'Chest tightened', key: 'chest_tight', dominance: -0.1 },
    { label: 'Wanted to run', key: 'want_to_run', dominance: -0.15 },
  ],
  freeze: [
    { label: 'Body went numb', key: 'body_frozen', dominance: -0.2 },
    { label: 'Couldn\'t move', key: 'cant_move', dominance: -0.25 },
    { label: 'Went blank', key: 'went_blank', dominance: -0.2 },
  ],
  fawn: [
    { label: 'Smiled', key: 'smiled', dominance: -0.1 },
    { label: 'Agreed', key: 'agreed', dominance: -0.15 },
    { label: 'Made myself small', key: 'made_small', dominance: -0.2 },
  ],
};

const EMOTION_CHIPS_V3 = [
  { label: 'Guilt', key: 'guilt' },
  { label: 'Fear', key: 'fear' },
  { label: 'Anger', key: 'anger' },
  { label: 'Sadness', key: 'sadness' },
  { label: 'Shame', key: 'shame' },
  { label: 'Longing', key: 'longing' },
  { label: 'Relief', key: 'relief' },
  { label: 'Confusion', key: 'confusion' },
  { label: 'Emptiness', key: 'emptiness' },
  { label: 'Awe', key: 'awe' },
  { label: 'Strange joy', key: 'strange_joy' },
  { label: 'Numbness', key: 'numbness', void: true },
];

const REASON_CHIPS_V3 = [
  { label: 'Because it felt like my fault', key: 'self_blame' },
  { label: 'Because there was no other way', key: 'helpless' },
  { label: 'Because someone betrayed me', key: 'betrayal' },
  { label: 'I don\'t want to say', key: 'void', void: true },
];

const TARGET_CHIPS_V3 = [
  { label: 'Myself', key: 'self' },
  { label: 'That person', key: 'other' },
  { label: 'The situation', key: 'situation' },
  { label: 'I don\'t know', key: 'unknown' },
];

const SEAL_CHIPS_V3 = [
  { label: 'Something that still hurts', key: 'still_hurts' },
  { label: 'Something I\'m okay with now', key: 'okay_now' },
  { label: 'Something I still don\'t understand', key: 'dont_know' },
  { label: 'Something I never want to see again', key: 'never_again', void: true },
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

// ===== V3 Stages Definition =====

const V3_STAGES = [
  // Stage 1: Sensory anchor
  {
    id: 'sensory', stage: 1,
    prompt: 'Close your eyes.\nGo back to that moment.\n\nWhat do you see? What do you hear?\nWhat do you smell?',
    type: 'textarea', placeholder: 'Whatever comes to mind, slowly...',
    handler: handleSensory,
  },
  // Stage 2: Situation (voice input preferred)
  {
    id: 'situation', stage: 2,
    getPrompt: () => {
      const a = v3State.data.sensory_anchor;
      if (!a) return 'What was happening then?';
      const hints = { visual: 'When that scene appears', olfactory: 'When that smell returns', auditory: 'When that sound reaches you', somatic: 'When that sensation comes back', narrative: 'Inside that story' };
      return `${hints[a.modality] || 'In that moment'},\nwhat was happening?`;
    },
    type: 'textarea_voice', placeholder: 'You can speak, or you can write...',
    handler: handleSituation,
  },
  // Stage 3: Body response
  {
    id: 'body', stage: 3,
    prompt: 'In that moment, what did your body do?',
    type: 'cluster_chips', maxSelect: 3,
    handler: handleBody,
  },
  // Stage 4a: Emotion
  {
    id: 'emotion', stage: 4,
    getPrompt: () => {
      const names = { fight: 'Your body tried to fight', flight: 'Your body tried to run', freeze: 'Your body froze', fawn: 'Your body tried to appease' };
      const prefix = names[v3State.data.body_cluster] || '';
      return prefix ? `${prefix}.\nWhat emotion was that?\n(You can choose up to two)` : 'What emotion was that?\n(You can choose up to two)';
    },
    type: 'multi_chips', chips: EMOTION_CHIPS_V3, maxSelect: 2,
    handler: handleEmotion,
  },
  // Stage 4b: Reason
  {
    id: 'reason', stage: 4,
    getPrompt: () => {
      const emos = v3State.data.emotions || [];
      if (emos.includes('numbness') && emos.length === 1) return 'Why couldn\'t you feel anything?';
      const labels = emos.map(e => EMOTION_CHIPS_V3.find(c => c.key === e)?.label || e);
      return `Why did you feel ${labels.join(' and ')}?`;
    },
    type: 'chips', chips: REASON_CHIPS_V3,
    handler: handleReason,
  },
  // Stage 4c: Target
  {
    id: 'target', stage: 4,
    getPrompt: () => {
      const emos = v3State.data.emotions || [];
      const labels = emos.map(e => EMOTION_CHIPS_V3.find(c => c.key === e)?.label || e);
      return `That ${labels.join(' and ')}...\nWho was it directed at?`;
    },
    type: 'chips', chips: TARGET_CHIPS_V3,
    handler: handleTarget,
  },
  // Stage 5a: Self-questioning
  {
    id: 'self_questions', stage: 5,
    prompt: 'Wait.\n\nAbout this memory,\nis there something you want to ask yourself?',
    type: 'question_select',
    handler: handleQuestionSelect,
  },
  // Stage 5b: Seal relation
  {
    id: 'seal_relation', stage: 5,
    prompt: 'Step out of this memory.\nClose the door.\n\nLooking back, what is this memory to you now?',
    type: 'chips', chips: SEAL_CHIPS_V3,
    handler: handleSealRelation,
  },
  // Stage 5c: Seal word
  {
    id: 'seal_word', stage: 5,
    prompt: 'One last thing.\nThis memory, in a single word.',
    type: 'seal_text',
    handler: handleSealWord,
  },
];

// ===== Handler Functions =====

async function handleSensory(text) {
  v3State.data.sensory_raw = text;
  showV3Processing('Reading your senses...');
  
  if (!window.networkService) {
    console.error('networkService is not yet initialized');
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
    
    // result.data may be a string, so attempt parsing
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
  showV3Processing('Reading the situation...');
  
  if (!window.networkService) {
    console.error('networkService is not yet initialized');
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
    
    // result.data may be a string, so attempt parsing
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
    
    // Edge Function didn't recognize the type and returned a default scene generation response
    if (response && response.scene) {
      console.warn('[V3] handleSituation: Edge Function returned default scene generation response. Using fallback.');
      // Use fallback
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
      // Fallback instead of throwing error
      v3State.data.situation_context = {
        temporal: 'unknown',
        spatial: 'unknown',
        actors: [],
        role: 'unknown',
      };
    }
  } catch (error) {
    console.error('Situation analysis failed:', error);
    // Continue with fallback even on error
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
  
  // Cluster count
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
  
  // Dominant cluster
  const maxCluster = Object.entries(clusterCounts).reduce((a, b) => 
    clusterCounts[a[0]] > clusterCounts[b[0]] ? a : b
  )[0];
  
  v3State.data.body_cluster = maxCluster;
  v3State.data.dominance_modifier = count > 0 ? totalDominance / count : 0;
  
  // Reduce dominance if sensory anchor is somatic
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
  showV3Processing('Forming questions...');
  
  if (!window.networkService) {
    console.error('networkService is not yet initialized');
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
    
    // result.data may be a string, so attempt parsing
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
  
  // shame or target=other → spotlight
  if ((emotions.includes('shame') || target === 'other')) {
    questions.push({ text: 'Did they notice?', category: 'spotlight' });
  }
  
  // self_blame → counterfactual
  if (reason === 'self_blame') {
    questions.push({ text: 'What if I had done it differently?', category: 'counterfactual' });
  }
  
  // self_blame + guilt/shame → attribution_error
  if (reason === 'self_blame' && (emotions.includes('guilt') || emotions.includes('shame'))) {
    questions.push({ text: 'Was it really my fault?', category: 'attribution_error' });
  }
  
  // Always included: reality_check
  questions.push({ text: 'Is that really how it happened?', category: 'reality_check' });
  
  // target=other/self → perspective_shift
  if (target === 'other' || target === 'self') {
    questions.push({ text: target === 'other' ? 'How did they see me?' : 'How would the me back then see the me now?', category: 'perspective_shift' });
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
  showV3Processing('Developing the memory...');
  const d = v3State.data;

  // Sensory modality → V2 sensory mapping
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

  // Inject into existing flowState
  window._v3FlowData = flowData;

  // V3-specific metadata (used by saveConfessionToDB)
  window.confessionV3Data = {
    sensory_anchor: d.sensory_anchor,
    body_response: d.body_responses,
    self_questions: d.selected_questions,
    situation_context: d.situation_context,
    dominance_modifier: d.dominance_modifier,
  };

  // Call existing generateSceneFromRitual
  if (typeof window._v3GenerateScene === 'function') {
    window._v3GenerateScene(flowData);
  }
}

// ===== UI Rendering =====

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
  
  // Prompt typewriter
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
  textarea.placeholder = stage.placeholder || 'You can speak, or you can write...';
  textarea.rows = 6;
  
  const voiceHint = document.createElement('div');
  voiceHint.className = 'v3-voice-hint';
  voiceHint.textContent = 'Press the microphone button to speak your input';
  
  const voiceRow = document.createElement('div');
  voiceRow.className = 'v3-voice-row';
  
  const micBtn = document.createElement('button');
  micBtn.className = 'v3-mic-btn';
  micBtn.type = 'button';
  micBtn.innerHTML = '🎙 <span>Press to speak</span>';
  
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
  let lastProcessedIndex = -1; // Track already-processed resultIndex
  
  micBtn.addEventListener('click', () => {
    if (!hasSpeechRecognition) {
      if (window.showNotification) {
        window.showNotification('This browser does not support speech recognition');
      }
      return;
    }
    
    if (isRecording) {
      if (recognition) {
        recognition.stop();
        recognition = null;
      }
      isRecording = false;
      lastProcessedIndex = -1; // Reset
      micBtn.classList.remove('v3-mic-active');
      micBtn.innerHTML = '🎙 <span>Press to speak</span>';
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event) => {
        let interimText = '';
        let newFinalText = '';
        
        // Start from event.resultIndex, only process unprocessed results
        // With continuous: true, the same result may arrive multiple times
        const startIndex = Math.max(event.resultIndex, lastProcessedIndex + 1);
        
        for (let i = startIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          
          if (result.isFinal) {
            // Final result: add only once
            newFinalText += transcript;
            lastProcessedIndex = i; // Update processed index
          } else {
            // Interim result: for real-time display
            interimText += transcript;
          }
        }
        
        // Accumulate final transcript (prevent duplicates)
        if (newFinalText) {
          accumulatedText += newFinalText;
          textarea.value = accumulatedText;
          console.log('[V3] STT final text added:', newFinalText, 'total:', accumulatedText);
        }
        
        // Show interim in real-time (existing text + accumulated final + current interim)
        if (interimText) {
          textarea.value = accumulatedText + interimText;
        }
        
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      };
      
      recognition.onend = () => {
        isRecording = false;
        lastProcessedIndex = -1; // Reset
        micBtn.classList.remove('v3-mic-active');
        micBtn.innerHTML = '🎙 <span>Press to speak</span>';
        if (recognition) {
          recognition = null;
        }
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isRecording = false;
        lastProcessedIndex = -1; // Reset
        micBtn.classList.remove('v3-mic-active');
        micBtn.innerHTML = '🎙 <span>Press to speak</span>';
        
        if (event.error === 'not-allowed' && window.showNotification) {
          window.showNotification('Microphone permission is required');
        }
      };
      
      try {
        lastProcessedIndex = -1; // Reset on new recording start
        recognition.start();
        isRecording = true;
        micBtn.classList.add('v3-mic-active');
        micBtn.innerHTML = '⏹ <span>Speaking...</span>';
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        lastProcessedIndex = -1; // Reset
        if (window.showNotification) {
          window.showNotification('Unable to start speech recognition');
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
  // Flatten all clusters and shuffle
  const allChips = [];
  for (const [cluster, chips] of Object.entries(BODY_CHIPS_V3)) {
    chips.forEach(chip => {
      allChips.push({ ...chip, _cluster: cluster });
    });
  }
  
  // Shuffle (Fisher-Yates)
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
    zone.innerHTML = '<div class="v3-error">Unable to generate questions.</div>';
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
  input.placeholder = 'Just one word';
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
