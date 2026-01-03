/**
 * Memories Data
 * 기억 데이터와 유틸리티 함수를 포함하는 모듈
 */

// 기억 데이터 배열
const memoriesData = [
  {
    "id": 0,
    "code": "A-001",
    "title": "당신에게",
    "layers": 0,
    "dilution": 50,
    "recentRank": 1,
    "scenes": [
      {
        "text": "장례식장의 냉기가 피부를 파고든다. 당신은 엄마의 관 앞에 서 있다. 발가락이 보인다.",
        "sceneType": "normal",
        "echoWords": [
          "무서웠어",
          "화가 났어",
          "미안해"
        ],
        "choices": [
          {
            "text": "발가락을 만진다",
            "percentage": 42,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "손을 거둔다",
            "percentage": 38,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "그 자리를 떠난다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "마지막으로 만지고 싶었으니까"
      },
      {
        "text": "차가웠다. 얼음보다 차갑고, 돌보다 딱딱했다. 누군가 뒤에서 당신의 이름을 부른다.",
        "sceneType": "normal",
        "echoWords": [
          "돌아보지 않았어",
          "눈물이 났어"
        ],
        "choices": [
          {
            "text": "뒤를 돌아본다",
            "percentage": 55,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "무시하고 계속 만진다",
            "percentage": 30,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "손을 떼고 대답한다",
            "percentage": 15,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "들리지 않는 척 하고 싶었으니까"
      },
      {
        "text": "삼촌이다. 그는 \"이제 그만 해\"라고 말한다. 그의 눈에는 불편함이 서려 있다.",
        "sceneType": "branch",
        "echoWords": [
          "창피했어",
          "화가 났어"
        ],
        "choices": [
          {
            "text": "삼촌에게 소리친다",
            "percentage": 18,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "조용히 물러난다",
            "percentage": 52,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "계속 만지며 울기 시작한다",
            "percentage": 30,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 2,
        "originalReason": "멈출 수가 없었으니까"
      },
      {
        "text": "눈물이 볼을 타고 흐른다. 엄마의 발가락은 여전히 차갑다. 당신의 손은 떨리고 있다.",
        "sceneType": "normal",
        "echoWords": [
          "놓고 싶지 않았어",
          "후회했어"
        ],
        "choices": [
          {
            "text": "\"사랑해\"라고 말한다",
            "percentage": 45,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "아무 말 없이 손을 거둔다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "더 세게 잡는다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "평생 말하지 못했으니까"
      },
      {
        "text": "장례식장을 나선다. 밖은 비가 온다. 우산이 없다. 당신의 손에는 아직 그녀의 차가움이 남아있다.",
        "sceneType": "ending",
        "echoWords": [
          "걷고 싶었어",
          "혼자이고 싶었어"
        ],
        "choices": [
          {
            "text": "비를 맞으며 걷는다",
            "percentage": 60,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "처마 밑에서 기다린다",
            "percentage": 25,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "택시를 잡는다",
            "percentage": 15,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "모든게 아무 의미 없었으니까."
      }
    ]
  },
  {
    "id": 1,
    "code": "A-017",
    "title": "차가운 손끝",
    "layers": 128,
    "dilution": 50,
    "recentRank": 2,
    "scenes": [
      {
        "text": "차를 몰고 병원으로 가는 길이다. 라디오가 지지직거린다. 설정을 잘못했나보다.",
        "sceneType": "normal",
        "echoWords": [
          "끄고 싶었어",
          "들어야 했어"
        ],
        "choices": [
          {
            "text": "라디오를 끈다",
            "percentage": 38,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "계속 듣는다",
            "percentage": 45,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "다른 채널을 찾는다",
            "percentage": 17,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "들어야만 했으니까"
      },
      {
        "text": "뉴스가 보도되고 있다. 다중충돌사고. 4명 사망, 12명 부상. 서해안고속도로.",
        "sceneType": "normal",
        "echoWords": [
          "거짓말이었으면",
          "도망가고 싶었어"
        ],
        "choices": [
          {
            "text": "라디오를 강하게 끈다",
            "percentage": 42,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "계속 듣는다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "차를 세운다",
            "percentage": 23,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "더 이상 듣고 싶지 않았으니까"
      },
      {
        "text": "엄마의 얼굴을 떠올려본다. 하지만 곧 그 상상은 허상처럼 스러져간다.",
        "sceneType": "normal",
        "echoWords": [
          "기억나지 않아",
          "그리워했어"
        ],
        "choices": [
          {
            "text": "눈을 감고 다시 떠올린다",
            "percentage": 28,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "생각을 멈춘다",
            "percentage": 52,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "사진을 꺼낸다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "더 이상 그릴 수 없었으니까"
      },
      {
        "text": "병원에 도착한다. 엄마는 이미 옮겨지지 못한 채 사망한 두 명 중 한 명이었다.",
        "sceneType": "normal",
        "echoWords": [
          "거부하고 싶었어",
          "받아들여야 했어"
        ],
        "choices": [
          {
            "text": "문을 연다",
            "percentage": 48,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "차 안에 머문다",
            "percentage": 32,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "돌아간다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "봐야만 했으니까"
      },
      {
        "text": "엄마의 발가락을 만진다. 엄지발가락의 굳은살과 뒤꿈치의 갈림길이 손에 박힌다.",
        "sceneType": "normal",
        "echoWords": [
          "마지막이었어",
          "후회했어"
        ],
        "choices": [
          {
            "text": "계속 만진다",
            "percentage": 55,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "손을 거둔다",
            "percentage": 30,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "\"사랑해\"라고 속삭인다",
            "percentage": 15,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "만져보지 못한 촉감을 느끼고 싶었으니까"
      },
      {
        "text": "장례식장. 상주는 삼촌이 되었다. 당신은 입양아였기 때문에 상주가 되지 못했다.",
        "sceneType": "normal",
        "echoWords": [
          "화가 났어",
          "참아야 했어"
        ],
        "choices": [
          {
            "text": "조용히 앉아 있다",
            "percentage": 58,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "항의한다",
            "percentage": 22,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "떠난다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "언제나 물러나 꾹 참는 성격이었으니까"
      },
      {
        "text": "늦은 저녁. 조문객이 잦아든다. 상주석으로 돌아와 조용히 앉아 눈을 감는다.",
        "sceneType": "normal",
        "echoWords": [
          "외로웠어",
          "그리워했어"
        ],
        "choices": [
          {
            "text": "엄마를 생각한다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "당신을 생각한다",
            "percentage": 45,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "아무것도 생각하지 않는다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "당신 생각을 하고 있었으니까"
      },
      {
        "text": "욕조에 찬물을 받는다. 반도 채워지지 않은 찬물에 몸을 던진다. 차갑다.",
        "sceneType": "normal",
        "echoWords": [
          "깨어나고 싶었어",
          "아프고 싶었어"
        ],
        "choices": [
          {
            "text": "계속 물에 있다",
            "percentage": 40,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "물에서 나온다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "더 차가운 물을 받는다",
            "percentage": 25,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "생생한 감각이 필요했으니까"
      },
      {
        "text": "호텔 스위트룸 문을 연다. 남편과 닮았지만 더 작고 새하얀 피부를 가진 소년이 서 있다.",
        "sceneType": "normal",
        "echoWords": [
          "당신이었어",
          "믿고 싶었어"
        ],
        "choices": [
          {
            "text": "그에게 다가간다",
            "percentage": 52,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "문을 닫는다",
            "percentage": 28,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "\"왜 떠났어?\"라고 묻는다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "단번에 그것이 당신임을 알았으니까"
      }
    ]
  },
  {
    "id": 2,
    "code": "A-034",
    "title": "빈 의자",
    "layers": 12,
    "dilution": 50,
    "recentRank": 3,
    "scenes": [
      {
        "text": "장례식장의 냉기가 피부를 파고든다. 당신은 엄마의 관 앞에 서 있다. 발가락이 보인다.",
        "sceneType": "normal",
        "echoWords": [
          "무서웠어",
          "화가 났어",
          "미안해"
        ],
        "choices": [
          {
            "text": "발가락을 만진다",
            "percentage": 42,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "손을 거둔다",
            "percentage": 38,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "그 자리를 떠난다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "마지막으로 만지고 싶었으니까"
      },
      {
        "text": "차가웠다. 얼음보다 차갑고, 돌보다 딱딱했다. 누군가 뒤에서 당신의 이름을 부른다.",
        "sceneType": "normal",
        "echoWords": [
          "돌아보지 않았어",
          "눈물이 났어"
        ],
        "choices": [
          {
            "text": "뒤를 돌아본다",
            "percentage": 55,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "무시하고 계속 만진다",
            "percentage": 30,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "손을 떼고 대답한다",
            "percentage": 15,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "들리지 않는 척 하고 싶었으니까"
      },
      {
        "text": "삼촌이다. 그는 \"이제 그만 해\"라고 말한다. 그의 눈에는 불편함이 서려 있다.",
        "sceneType": "normal",
        "echoWords": [
          "창피했어",
          "화가 났어"
        ],
        "choices": [
          {
            "text": "삼촌에게 소리친다",
            "percentage": 18,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "조용히 물러난다",
            "percentage": 52,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "계속 만지며 울기 시작한다",
            "percentage": 30,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 2,
        "originalReason": "멈출 수가 없었으니까"
      },
      {
        "text": "눈물이 볼을 타고 흐른다. 엄마의 발가락은 여전히 차갑다. 당신의 손은 떨리고 있다.",
        "sceneType": "normal",
        "echoWords": [
          "놓고 싶지 않았어",
          "후회했어"
        ],
        "choices": [
          {
            "text": "\"사랑해\"라고 말한다",
            "percentage": 45,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "아무 말 없이 손을 거둔다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "더 세게 잡는다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "평생 말하지 못했으니까"
      },
      {
        "text": "장례식장을 나선다. 밖은 비가 온다. 우산이 없다. 당신의 손에는 아직 그녀의 차가움이 남아있다.",
        "sceneType": "normal",
        "echoWords": [
          "걷고 싶었어",
          "혼자이고 싶었어"
        ],
        "choices": [
          {
            "text": "비를 맞으며 걷는다",
            "percentage": 60,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "처마 밑에서 기다린다",
            "percentage": 25,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "택시를 잡는다",
            "percentage": 15,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "씻겨나가고 싶었으니까"
      }
    ]
  },
  {
    "id": 3,
    "code": "A-042",
    "title": "라디오 소리와 함께",
    "layers": 23,
    "dilution": 50,
    "recentRank": 4,
    "scenes": [
      {
        "text": "차를 몰고 병원으로 가는 길이다. 라디오가 지지직거린다. 설정을 잘못했나보다.",
        "sceneType": "normal",
        "echoWords": [
          "끄고 싶었어",
          "들어야 했어"
        ],
        "choices": [
          {
            "text": "라디오를 끈다",
            "percentage": 38,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "계속 듣는다",
            "percentage": 45,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "다른 채널을 찾는다",
            "percentage": 17,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "들어야만 했으니까"
      },
      {
        "text": "뉴스가 보도되고 있다. 다중충돌사고. 4명 사망, 12명 부상. 서해안고속도로.",
        "sceneType": "normal",
        "echoWords": [
          "거짓말이었으면",
          "도망가고 싶었어"
        ],
        "choices": [
          {
            "text": "라디오를 강하게 끈다",
            "percentage": 42,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "계속 듣는다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "차를 세운다",
            "percentage": 23,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "더 이상 듣고 싶지 않았으니까"
      },
      {
        "text": "엄마의 얼굴을 떠올려본다. 하지만 곧 그 상상은 허상처럼 스러져간다.",
        "sceneType": "normal",
        "echoWords": [
          "기억나지 않아",
          "그리워했어"
        ],
        "choices": [
          {
            "text": "눈을 감고 다시 떠올린다",
            "percentage": 28,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "생각을 멈춘다",
            "percentage": 52,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "사진을 꺼낸다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "더 이상 그릴 수 없었으니까"
      },
      {
        "text": "병원에 도착한다. 엄마는 이미 옮겨지지 못한 채 사망한 두 명 중 한 명이었다.",
        "sceneType": "normal",
        "echoWords": [
          "거부하고 싶었어",
          "받아들여야 했어"
        ],
        "choices": [
          {
            "text": "문을 연다",
            "percentage": 48,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "차 안에 머문다",
            "percentage": 32,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "돌아간다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "봐야만 했으니까"
      },
      {
        "text": "엄마의 발가락을 만진다. 엄지발가락의 굳은살과 뒤꿈치의 갈림길이 손에 박힌다.",
        "sceneType": "normal",
        "echoWords": [
          "마지막이었어",
          "후회했어"
        ],
        "choices": [
          {
            "text": "계속 만진다",
            "percentage": 55,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "손을 거둔다",
            "percentage": 30,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "\"사랑해\"라고 속삭인다",
            "percentage": 15,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "만져보지 못한 촉감을 느끼고 싶었으니까"
      },
      {
        "text": "장례식장. 상주는 삼촌이 되었다. 당신은 입양아였기 때문에 상주가 되지 못했다.",
        "sceneType": "normal",
        "echoWords": [
          "화가 났어",
          "참아야 했어"
        ],
        "choices": [
          {
            "text": "조용히 앉아 있다",
            "percentage": 58,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "항의한다",
            "percentage": 22,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "떠난다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "언제나 물러나 꾹 참는 성격이었으니까"
      },
      {
        "text": "늦은 저녁. 조문객이 잦아든다. 상주석으로 돌아와 조용히 앉아 눈을 감는다.",
        "sceneType": "normal",
        "echoWords": [
          "외로웠어",
          "그리워했어"
        ],
        "choices": [
          {
            "text": "엄마를 생각한다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "당신을 생각한다",
            "percentage": 45,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "아무것도 생각하지 않는다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 1,
        "originalReason": "당신 생각을 하고 있었으니까"
      },
      {
        "text": "욕조에 찬물을 받는다. 반도 채워지지 않은 찬물에 몸을 던진다. 차갑다.",
        "sceneType": "normal",
        "echoWords": [
          "깨어나고 싶었어",
          "아프고 싶었어"
        ],
        "choices": [
          {
            "text": "계속 물에 있다",
            "percentage": 40,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "물에서 나온다",
            "percentage": 35,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "더 차가운 물을 받는다",
            "percentage": 25,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "생생한 감각이 필요했으니까"
      },
      {
        "text": "호텔 스위트룸 문을 연다. 남편과 닮았지만 더 작고 새하얀 피부를 가진 소년이 서 있다.",
        "sceneType": "normal",
        "echoWords": [
          "당신이었어",
          "믿고 싶었어"
        ],
        "choices": [
          {
            "text": "그에게 다가간다",
            "percentage": 52,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "문을 닫는다",
            "percentage": 28,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          },
          {
            "text": "\"왜 떠났어?\"라고 묻는다",
            "percentage": 20,
            "emotion": "fear",
            "intensity": 5,
            "nextScene": "end"
          }
        ],
        "emotionDist": {
          "fear": 100,
          "anger": 0,
          "shame": 0,
          "joy": 0
        },
        "originalChoice": 0,
        "originalReason": "단번에 그것이 당신임을 알았으니까"
      }
    ]
  }
];

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


