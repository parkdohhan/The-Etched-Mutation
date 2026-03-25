# contaminate-text Edge Function

텍스트 오염 시스템을 위한 Edge Function입니다.

## 기능

plays 수에 따라 기억이 오염되는 과정을 시뮬레이션하여 텍스트를 변형합니다.

## Stage

- **Stage 1 (객체화)**: 1인칭을 3인칭으로 변경
- **Stage 2 (추상화)**: 구체적인 대상/장소/시간을 모호하게
- **Stage 3 (소거)**: 핵심 단어를 [...] 또는 ██로 대체, 문장 일부 생략

## 요청 형식

```json
{
  "text": "원본 텍스트",
  "stage": 1  // 1, 2, 또는 3
}
```

## 응답 형식

```json
{
  "contaminatedText": "변형된 텍스트"
}
```





