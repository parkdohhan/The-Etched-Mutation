// Supabase Edge Function: Claude Scene Conversion
// 화자 입력 텍스트를 받아서 Claude API로 장면 변환

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_PROMPT = `너는 '기억 변환 장치'이다.

화자가 입력한 문장을 바탕으로, 체험자에게 보여줄 장면을 생성한다.

규칙:
1) 출력은 반드시 2~3문장
2) 감각 묘사를 1개 이상 포함 (촉각/시각/소리/온도/냄새)
3) 과도한 서사 금지, 현재 순간에 집중
4) 심리 해석, 설명, 분석 금지
5) 선택지 포함하지 않음
6) '당신은...' 형식의 2인칭 시점
7) 원문을 단순 반복하지 말고 감각적으로 변환`

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'

serve(async (req) => {
  // CORS 헤더 설정
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 요청 본문 파싱
    const { text } = await req.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: '텍스트 입력이 필요합니다.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Claude API 키 가져오기 (환경 변수에서)
    const claudeApiKey = Deno.env.get('CLAUDE_API_KEY')
    
    if (!claudeApiKey) {
      console.error('CLAUDE_API_KEY 환경 변수가 설정되지 않았습니다.')
      return new Response(
        JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Claude API 호출
    const claudeResponse = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `화자가 입력한 기억: "${text.trim()}"

이 기억을 체험자가 직접 경험하는 장면으로 변환하라.`,
          },
        ],
      }),
    })

    if (!claudeResponse.ok) {
      const errorData = await claudeResponse.json()
      console.error('Claude API 에러:', errorData)
      return new Response(
        JSON.stringify({ 
          error: 'Claude API 호출 실패',
          details: errorData.error?.message || '알 수 없는 오류'
        }),
        {
          status: claudeResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const claudeData = await claudeResponse.json()
    const convertedScene = claudeData.content[0].text.trim()

    // 성공 응답
    return new Response(
      JSON.stringify({ 
        scene: convertedScene,
        success: true 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Edge Function 에러:', error)
    return new Response(
      JSON.stringify({ 
        error: '서버 오류가 발생했습니다.',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})






