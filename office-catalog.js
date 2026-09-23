const applianceGuide = (name, extra = "") => ({
  title: `${name}은 대형폐기물 목록에 넣지 말고 폐가전 경로로 안내하세요.`,
  source: "폐가전 무상방문수거 · 소형폐가전 수거함",
  sourceUrl: "https://www.15990903.or.kr/portal/cnts/userGuide.do",
  reservationUrl: "https://www.15990903.or.kr/portal/reserve/reserve.do",
  reservationLabel: `${name} 무상수거 예약하기`,
  steps: [
    `대형폐가전(또는 소형폐가전 5개 이상)은 1599-0903 또는 “${name} 무상수거 예약하기”에서 방문수거를 안내합니다.`,
    "소형폐가전 1~4개는 시청·읍면동 행정복지센터, 이마트, 전자제품매장 소형폐가전 수거함을 안내합니다.",
    "무상수거가 거절되는 파손·분해 제품만 조례 별표 1 유사 규격 수수료로 수기 접수합니다."
  ],
  notice: extra || "제천시 안내에 따라 폐가전은 대형폐기물 신고 목록에 억지로 넣지 않습니다."
});

const recyclingGuide = (title, steps, notice) => ({
  title,
  source: "제천시 폐기물관리 조례 별표 2 · 환경부 분리배출 안내",
  sourceUrl: "https://www.mcee.go.kr/home/web/board/read.do?boardCategoryId=&boardId=1398800&boardMasterId=54",
  steps,
  notice
});

export const ORDINANCE_SOURCE = {
  title: "제천시 폐기물관리 조례 별표 1",
  caption: "대형폐기물 품목 및 수집·운반 수수료(제18조제1항관련)",
  revised: "2022. 11. 18.",
  note: "상기 대형폐기물은 일반 가정용 가구규격이며 이외 가구는 규격이 유사한 품목의 수수료를 적용함."
};

/** 조례 별표 1 중 사무실 전화접수로 받는 대형폐기물. 폐가전·재활용·공사장 폐기물은 넣지 않는다. */
export const OFFICE_ITEM_CATALOG = [
  { id: "living", icon: "⌂", name: "거실·침실 가구", items: [
    { name: "쇼파", ordinanceName: "쇼파(개당)", options: [["1인용", 3000], ["2~3인용", 5000], ["4인용 이상", 8000]] },
    { name: "장농", ordinanceName: "장 농(1쪽)", options: [["90㎝미만", 5000], ["90㎝이상", 10000], ["120㎝이상", 15000]] },
    { name: "서랍장", ordinanceName: "서랍장", options: [["3단미만", 3000], ["3단이상", 5000]] },
    { name: "거실장", ordinanceName: "거실장", options: [["모든규격", 5000]] },
    { name: "화장대", ordinanceName: "화장대", options: [["문갑화장대", 3000], ["서랍화장대", 5000]] },
    { name: "신발장", ordinanceName: "신발장", options: [["60㎝미만", 3000], ["60㎝이상", 5000]] },
    { name: "문갑", ordinanceName: "문 갑", options: [["모든규격", 3000]] },
    { name: "비키니 옷장", ordinanceName: "비키니 옷장", options: [["모든규격", 2000]] },
    { name: "침대 매트리스", ordinanceName: "침대 매트리스", options: [["1인용", 5000], ["2인용", 8000]] },
    { name: "침대세트", ordinanceName: "침대세트", options: [["1인용", 10000], ["2인용", 15000]] },
    { name: "침대틀", ordinanceName: "침대틀", options: [["1인용", 5000], ["2인용", 7000]] },
    { name: "오디오 장식장", ordinanceName: "오디오 장식장", options: [["60㎝미만", 3000], ["60㎝이상", 5000]] },
  ] },
  { id: "kitchen", icon: "▤", name: "주방·욕실", items: [
    { name: "식탁", ordinanceName: "식탁(테이블)", options: [["4인용미만", 3000], ["4인용이상", 4000]] },
    { name: "상", ordinanceName: "상", options: [["모든규격", 2000], ["교자상", 3000]] },
    { name: "씽크대", ordinanceName: "씽크대", options: [["60㎝미만", 4000], ["60㎝이상", 5000]] },
    { name: "전자레인지대", ordinanceName: "전자레인지대", options: [["모든규격", 3000]] },
    { name: "쌀통", ordinanceName: "쌀 통", options: [["모든규격", 3000]] },
    { name: "세면기", ordinanceName: "세면기", options: [["모든규격", 3000]] },
    { name: "변기", ordinanceName: "변 기", options: [["모든규격", 3000]] },
    { name: "욕조", ordinanceName: "욕 조", options: [["모든규격", 5000]] },
  ] },
  { id: "office", icon: "▥", name: "학습·사무 가구", items: [
    { name: "책상", ordinanceName: "책 상", options: [["컴퓨터책상", 4000], ["일반책상", 5000], ["세트(책장,상판,서랍장)", 7000]] },
    { name: "장식장·책장", ordinanceName: "장식장 및 책장", options: [["70㎝미만", 5000], ["70㎝이상", 7000]] },
    { name: "책꽂이", ordinanceName: "책꽂이", options: [["모든규격", 2000]] },
    { name: "의자", ordinanceName: "의 자", options: [["모든규격", 2000]] },
    { name: "캐비닛", ordinanceName: "캐비넽", options: [["모든규격", 4000]] },
    { name: "파일캐비닛", ordinanceName: "파일 캐비넽", options: [["3단이하", 2000], ["4단이상", 3000]] },
  ] },
  { id: "life", icon: "◫", name: "침구·생활용품", items: [
    { name: "이불", ordinanceName: "이불(담요,솜이불)", options: [["장당", 2000]] },
    { name: "카페트", ordinanceName: "카페트", options: [["210cm미만", 5000], ["210cm이상", 8000]] },
    { name: "양탄자", ordinanceName: "양탄자", options: [["모든규격", 3000]] },
    { name: "대자리", ordinanceName: "대자리", options: [["모든규격", 2000]] },
    { name: "옥매트", ordinanceName: "옥매트", options: [["모든규격", 5000]] },
    { name: "전기담요", ordinanceName: "전기담요", options: [["3인용기준", 3000]] },
    { name: "전기매트", ordinanceName: "전기매트", options: [["모든규격", 3000]] },
    { name: "거울(액자,유리)", ordinanceName: "거울(액자,유리)", options: [["액자소형묶음", 2000], ["소형(1m 미만)", 3000], ["대형(1m 이상)", 4000]] },
    { name: "액자(유리 없는)", ordinanceName: "액 자(유리없는)", options: [["1m×1m 미만", 2000], ["1m×1m 이상", 3000]] },
    { name: "옷걸이", ordinanceName: "옷걸이", options: [["모든규격", 2000]] },
    { name: "빨래건조대", ordinanceName: "빨래건조대", options: [["모든규격", 3000]] },
    { name: "유모차", ordinanceName: "유모차", options: [["모든규격", 3000]] },
    { name: "보행기", ordinanceName: "보행기", options: [["모든규격", 3000]] },
    { name: "가방류", ordinanceName: "가방류", options: [["90cm미만", 1000], ["90cm이상", 2000], ["골프 및 볼링가방세트", 3000]] },
    { name: "벽시계", ordinanceName: "벽시계", options: [["1m미만", 1000], ["1m이상", 2000]] },
    { name: "병풍", ordinanceName: "병 풍", options: [["6쪽미만", 3000], ["6쪽이상", 4000]] },
    { name: "조명기구", ordinanceName: "조명기구", options: [["1m미만", 2000], ["1m이상", 3000]] },
  ] },
  { id: "leisure", icon: "◌", name: "운동·레저", items: [
    { name: "자전거", ordinanceName: "자전거", options: [["유아용(세발)", 3000], ["아동용(두발)", 4000], ["성인용(두발)", 5000]] },
    { name: "텐트", ordinanceName: "텐 트", options: [["4인이하", 3000], ["5인이상", 5000]] },
    { name: "트램폴린", ordinanceName: "트램폴린", options: [["모든규격", 5000]] },
    { name: "안마의자", ordinanceName: "안마의자", options: [["모든규격", 10000]] },
    { name: "오락기", ordinanceName: "오락기", options: [["120㎝미만", 5000], ["120㎝이상", 10000]] },
    { name: "피아노", ordinanceName: "피아노", options: [["어프라이트", 10000], ["그랜드", 15000]] },
    { name: "아이스박스", ordinanceName: "아이스박스", options: [["모든규격", 3000]] },
  ] },
  { id: "outdoor", icon: "⌘", name: "기타·야외용품", items: [
    { name: "문짝", ordinanceName: "문 짝", options: [["창문", 3000], ["나무", 4000], ["유리", 5000]] },
    { name: "나무묶음", ordinanceName: "나무묶음", options: [["직경40㎝", 5000]] },
    { name: "목재류", ordinanceName: "목재류", options: [["톤당(분리된 것)", 100000]] },
    { name: "스티로폼", ordinanceName: "스티로폼", options: [["1㎡당", 18000]] },
    { name: "장판", ordinanceName: "장 판", options: [["직경30cm", 3000]] },
    { name: "간판", ordinanceName: "간 판", options: [["높이1m미만", 3000], ["높이1m이상", 5000]] },
    { name: "고무통", ordinanceName: "고무통", options: [["높이1m미만", 2000], ["높이1m이상", 3000]] },
    { name: "항아리", ordinanceName: "항아리", options: [["모든규격", 2000]] },
    { name: "수족관", ordinanceName: "수족관", options: [["1m 미만", 3000], ["1m 이상", 5000]] },
    { name: "소화기", ordinanceName: "소화기", options: [["5㎏미만", 3000], ["5㎏이상", 5000]] },
    { name: "난로", ordinanceName: "난 로", options: [["모든규격", 2000]] },
    { name: "보일러", ordinanceName: "보일러", options: [["20평형미만", 3000], ["20평형이상", 5000]] },
    { name: "보일러 기름탱크", ordinanceName: "보일러 기름탱크", options: [["모든규격", 2000]] },
    { name: "물탱크(FRP 제외)", ordinanceName: "물탱크(F R P)제외", options: [["1톤용량당", 5000]] },
    { name: "이동식화장실", ordinanceName: "이동식화장실", options: [["1인용", 30000], ["2인용", 60000], ["3인용 이상", 100000]] },
    { name: "자동판매기", ordinanceName: "자동판매기", options: [["높이1m미만", 6000], ["높이1m이상", 10000]] },
    { name: "TV 받침대", ordinanceName: "텔레비젼", options: [["모든규격", 2000]] },
  ] },
];

export const OFFICE_QUICK_ITEMS = [
  { name: "쇼파", option: "2~3인용", fee: 5000, quantity: 1 },
  { name: "장농", option: "90㎝미만", fee: 5000, quantity: 1 },
  { name: "책상", option: "일반책상", fee: 5000, quantity: 1 },
  { name: "침대 매트리스", option: "1인용", fee: 5000, quantity: 1 },
];

export const EXCLUDED_EWASTE_ITEMS = [
  { name: "가스레인지", ordinanceName: "가스레인지", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("가스레인지") },
  { name: "가스오븐레인지", ordinanceName: "가스오븐레인지", ordinanceFees: [["높이1m미만", 2000], ["높이1m이상", 4000]], guide: applianceGuide("가스오븐레인지") },
  { name: "가습기", ordinanceName: "가습기", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("가습기") },
  { name: "공기청정기", ordinanceName: "공기청정기", ordinanceFees: [["높이1m미만", 4000], ["높이1m이상", 6000]], guide: applianceGuide("공기청정기") },
  { name: "냉온수기", ordinanceName: "냉온수기", ordinanceFees: [["모든규격", 3000]], guide: applianceGuide("냉온수기") },
  { name: "냉장고", ordinanceName: "냉장고", ordinanceFees: [["300ℓ미만", 4000], ["300ℓ이상", 6000], ["500ℓ이상", 8000]], guide: applianceGuide("냉장고", "가정용·업소용·냉동고·김치냉장고는 단일 수거 대상입니다. 내부 음식물과 포장재를 먼저 비우도록 안내하세요.") },
  { name: "녹즙기(믹서기)", ordinanceName: "녹즙기(믹서기)", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("녹즙기(믹서기)") },
  { name: "복사기", ordinanceName: "복사기", ordinanceFees: [["모든규격", 10000]], guide: applianceGuide("복사기", "토너가 새지 않게 고정한 뒤 무상수거 가능 여부를 안내하세요.") },
  { name: "선풍기", ordinanceName: "선풍기", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("선풍기") },
  { name: "세탁기", ordinanceName: "세탁기", ordinanceFees: [["모든규격", 4000]], guide: applianceGuide("세탁기", "일반·드럼·탈수기는 단일 수거 대상입니다. 급수호스와 내부 물기를 정리하도록 안내하세요.") },
  { name: "스피커", ordinanceName: "스피커", ordinanceFees: [["1ｍ미만", 2000], ["1ｍ이상", 3000]], guide: applianceGuide("스피커") },
  { name: "식기건조기", ordinanceName: "식기건조기", ordinanceFees: [["모든규격", 4000]], guide: applianceGuide("식기건조기") },
  { name: "식기세척기", ordinanceName: "식기세척기", ordinanceFees: [["모든규격", 4000]], guide: applianceGuide("식기세척기", "단일 수거 대상입니다. 빌트인 제품은 수거 가능한 상태로 철거되어야 합니다.") },
  { name: "에어컨", ordinanceName: "에어콘", ordinanceFees: [["66㎡이상", 5000], ["264㎡이상", 8000]], guide: applianceGuide("에어컨", "실내기·실외기·일체형은 단일 수거 대상입니다. 설치 제품은 기본 철거가 끝난 경우만 방문수거합니다.") },
  { name: "오디오", ordinanceName: "오디오", ordinanceFees: [["소형(50cm미만)", 3000], ["대형(50cm이상)", 5000]], guide: applianceGuide("오디오") },
  { name: "전기밥솥", ordinanceName: "전기밥솥", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("전기밥솥") },
  { name: "전자올겐", ordinanceName: "전자올겐", ordinanceFees: [["모든규격", 4000]], guide: applianceGuide("전자올겐") },
  { name: "전축", ordinanceName: "전 축", ordinanceFees: [["모든규격", 10000]], guide: applianceGuide("전축") },
  { name: "정수기", ordinanceName: "정수기", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("정수기") },
  { name: "청소기", ordinanceName: "청소기", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("청소기") },
  { name: "컴퓨터 본체", ordinanceName: "컴퓨터 본체", ordinanceFees: [["모든규격", 2000]], guide: applianceGuide("컴퓨터 본체", "노트북·PC·모니터·프린터는 5개 이상 다량 배출 기준을 확인하세요.") },
  { name: "컴퓨터 모니터", ordinanceName: "컴퓨터 모니터", ordinanceFees: [["모든규격", 3000]], guide: applianceGuide("컴퓨터 모니터", "노트북·PC·모니터·프린터는 5개 이상 다량 배출 기준을 확인하세요.") },
  { name: "텔레비전", ordinanceName: "텔레비젼", ordinanceFees: [["30인치미만", 3000], ["30인치이상", 4000], ["42인치이상", 5000]], guide: applianceGuide("텔레비전", "31인치 이상 TV는 단일 수거 대상이며, 소형은 5개 이상 다량 배출 또는 수거함을 안내하세요.") },
  { name: "팩스", ordinanceName: "팩스기기", ordinanceFees: [["모든규격", 3000]], guide: applianceGuide("팩스", "토너·잉크 누출을 막은 뒤 소형폐가전 경로를 안내하세요.") },
  { name: "프린터", ordinanceName: "프린터기", ordinanceFees: [["소형(가정용)", 2000], ["대형(업소용)", 4000]], guide: applianceGuide("프린터", "토너·잉크가 새지 않게 분리하거나 고정한 뒤 무상수거·수거함을 안내하세요.") },
  { name: "전자레인지", ordinanceName: "전자레인지", ordinanceFees: [], guide: applianceGuide("전자레인지", "조례 별표 1에는 전자레인지대가 있고, 전자레인지 본체는 폐가전 경로로 안내합니다.") },
];

export const EXCLUDED_RECYCLING_ITEMS = [
  { name: "투명 페트병", guide: recyclingGuide("투명 페트병 배출 방법", ["내용물을 비우고 물로 헹궈 이물질을 제거합니다.", "라벨을 떼고 가능한 한 찌그러뜨립니다.", "투명 페트병은 유색 플라스틱과 분리해 지정 수거함에 배출합니다."], "음료·생수병 기준입니다. 오염이 제거되지 않으면 재활용이 어려울 수 있습니다.") },
  { name: "종이·골판지", guide: recyclingGuide("종이·골판지 배출 방법", ["택배 상자의 송장, 테이프, 완충재를 제거합니다.", "이물질이 섞이지 않도록 접어서 종이류로 배출합니다.", "종이팩은 일반 종이와 구분해 전용 수거함에 배출하고, 없으면 따로 묶어 배출합니다."], "기름·음식물에 오염된 종이는 종량제봉투로 배출합니다.") },
  { name: "플라스틱 용기", guide: recyclingGuide("플라스틱 용기 배출 방법", ["내용물과 물기를 제거합니다.", "뚜껑·라벨·은박지 등 다른 재질을 가능한 한 분리합니다.", "재질별로 분리해 재활용품 수거함에 배출합니다."], "세척해도 이물질이 제거되지 않는 용기는 종량제봉투로 배출합니다.") },
  { name: "캔·고철", guide: recyclingGuide("캔·고철 배출 방법", ["내용물을 비우고 물로 헹궈 건조합니다.", "플라스틱 뚜껑 등 다른 재질은 분리합니다.", "날카로운 부분은 안전하게 처리한 뒤 캔·고철류 수거함에 배출합니다."], "페인트·기름 등이 묻어 있는 금속은 재활용 대상이 아닐 수 있습니다.") },
  { name: "유리병", guide: recyclingGuide("유리병 배출 방법", ["내용물을 비우고 물로 헹굽니다.", "병뚜껑·마개는 다른 재질로 분리합니다.", "깨지지 않은 유리병만 유리병 수거함에 배출합니다."], "깨진 병과 판유리는 신문지 등으로 감싸 일반 또는 불연성 폐기물 기준에 따라 배출합니다.") },
  { name: "폐건전지·형광등", guide: recyclingGuide("폐건전지·형광등 배출 방법", ["폐건전지와 형광등은 일반 재활용품·종량제봉투에 섞지 않습니다.", "주민센터, 공동주택, 판매점 등에 설치된 전용 수거함을 확인합니다.", "형광등은 깨지지 않도록 포장해 전용 수거함에 넣습니다."], "전용 수거함 위치와 수거 품목은 단지·지역 기준이 다를 수 있습니다.") },
];

export const EXCLUDED_OTHER_ROUTES = [
  {
    name: "공사장 생활폐기물",
    guide: {
      title: "공사장 생활폐기물은 대형폐기물 전화접수로 받지 않습니다.",
      source: "제천시 폐기물관리 조례 별표 7",
      steps: [
        "공사장에서 나오는 생활폐기물은 별표 7 톤당 120,000원 경로입니다.",
        "사업장 생활계폐기물(가연성)은 ㎥당 80,000원 경로입니다.",
        "대형폐기물 신고 목록에 넣지 말고 자원순환과(043-641-6422) 안내를 따릅니다."
      ],
      notice: "건설폐기물·위험물·사업장폐기물은 가정 대형폐기물과 섞어 접수하지 않습니다."
    }
  }
];

export const OFFICE_ADDRESS_PRESETS = [
  { id: "cheongjeon", label: "청전 의병대로", address: "충청북도 제천시 의병대로 123 (청전동)", addressDetail: "현관 앞 분리수거장", latitude: 37.1326, longitude: 128.1910 },
  { id: "gyodong", label: "교동 중앙로", address: "충청북도 제천시 의림대로 50 (교동)", addressDetail: "행정복지센터 앞", latitude: 37.1368, longitude: 128.2112 },
  { id: "haso", label: "하소 청전로", address: "충청북도 제천시 청전로 7 (하소동)", addressDetail: "아파트 단지 출입구", latitude: 37.1189, longitude: 128.2054 }
];

export const ITEM_SYNONYMS = {
  "쇼파": "쇼파", "소파": "쇼파",
  "장롱": "장농", "장농": "장농",
  "매트리스": "침대 매트리스", "매트": "침대 매트리스", "라텍스": "침대 매트리스",
  "침대": "침대세트",
  "싱크대": "씽크대", "씽크대": "씽크대",
  "티비": "텔레비전", "텔레비젼": "텔레비전", "tv": "텔레비전",
  "선풍기": "선풍기", "에어콘": "에어컨",
  "김치냉장고": "냉장고", "냉동고": "냉장고",
  "건조기": "세탁기",
  "컴퓨터": "컴퓨터 본체", "모니터": "컴퓨터 모니터", "피씨": "컴퓨터 본체", "pc": "컴퓨터 본체",
  "서랍": "서랍장", "수납장": "서랍장",
  "식탁의자": "의자", "체어": "의자",
  "아기침대": "침대틀", "카시트": "유모차",
  "거울": "거울(액자,유리)",
  "콘솔": "화장대",
  "캐비넽": "캐비닛", "캐비넷": "캐비닛",
  "페트병": "투명 페트병", "생수병": "투명 페트병",
  "박스": "종이·골판지", "골판지": "종이·골판지", "택배상자": "종이·골판지",
  "플라스틱": "플라스틱 용기",
  "캔": "캔·고철", "고철": "캔·고철",
  "건전지": "폐건전지·형광등", "배터리": "폐건전지·형광등", "형광등": "폐건전지·형광등", "전구": "폐건전지·형광등",
  "전자레인지": "전자레인지", "마이크로웨이브": "전자레인지"
};

export const SYNONYMS = ITEM_SYNONYMS;

export const CITIZEN_ITEM_CATALOG = [
  ...OFFICE_ITEM_CATALOG,
  { id: "appliance", icon: "◉", name: "가전제품", items: EXCLUDED_EWASTE_ITEMS },
  { id: "recycling", icon: "♻", name: "재활용·분리배출", items: EXCLUDED_RECYCLING_ITEMS }
];

export function flattenPayableItems(catalog = OFFICE_ITEM_CATALOG) {
  return catalog.flatMap((category) => category.items.map((item) => ({ ...item, categoryId: category.id, categoryName: category.name })));
}

export function catalogHasPayableItem(name, catalog = OFFICE_ITEM_CATALOG) {
  const key = normalizeCatalogText(name);
  return flattenPayableItems(catalog).some((item) => itemNamesMatch(item, key));
}

export function normalizeCatalogText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function itemNamesMatch(item, key) {
  if (!key) return false;
  return [item.name, item.ordinanceName].some((name) => normalizeCatalogText(name) === key || normalizeCatalogText(name).includes(key));
}

export function parseFeeWon(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  const digits = String(value ?? "").replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return NaN;
  const fee = Number(digits);
  return Number.isInteger(fee) && fee >= 0 ? fee : NaN;
}

/** 마스터 목록에 없는 품목도 이름·규격·수량·수수료만 있으면 접수에 넣을 수 있다. */
export function buildCustomCartItem({ name, option, fee, quantity } = {}) {
  const trimmedName = String(name || "").trim();
  const trimmedOption = String(option || "").trim() || "수기 입력";
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const unitFee = parseFeeWon(fee);
  if (!trimmedName) return { error: "수기 품목명을 입력해 주세요." };
  if (!Number.isInteger(unitFee)) return { error: "수수료는 0원 이상 정수로 입력해 주세요." };
  return {
    item: {
      name: trimmedName,
      option: trimmedOption,
      fee: unitFee,
      quantity: qty,
      custom: true
    }
  };
}

export function matchExcludedRoute(query) {
  const raw = String(query || "").trim();
  if (!raw) return null;
  const canonical = ITEM_SYNONYMS[raw] || ITEM_SYNONYMS[raw.toLowerCase()] || raw;
  const key = normalizeCatalogText(canonical);
  const eWaste = EXCLUDED_EWASTE_ITEMS.find((item) => itemNamesMatch(item, key));
  if (eWaste) return { kind: "ewaste", ...eWaste };
  const recycling = EXCLUDED_RECYCLING_ITEMS.find((item) => itemNamesMatch(item, key));
  if (recycling) return { kind: "recycling", ...recycling };
  const other = EXCLUDED_OTHER_ROUTES.find((item) => itemNamesMatch(item, key));
  if (other) return { kind: "other", ...other };
  if (/폐가전|가전|무상수거/.test(raw)) return { kind: "ewaste", name: "폐가전", guide: applianceGuide("폐가전") };
  if (/공사|사업장|건설폐기물/.test(raw)) return { kind: "other", ...EXCLUDED_OTHER_ROUTES[0] };
  return null;
}

export function searchPayableItems(query, catalog = OFFICE_ITEM_CATALOG) {
  const raw = String(query || "").trim();
  if (!raw) return flattenPayableItems(catalog);
  const canonical = ITEM_SYNONYMS[raw] || ITEM_SYNONYMS[raw.toLowerCase()] || "";
  const key = normalizeCatalogText(raw);
  const canonKey = normalizeCatalogText(canonical);
  return flattenPayableItems(catalog).filter((item) => itemNamesMatch(item, key) || (canonKey && itemNamesMatch(item, canonKey)));
}

export function findPayableItem(name, catalog = OFFICE_ITEM_CATALOG) {
  const key = normalizeCatalogText(ITEM_SYNONYMS[name] || name);
  return flattenPayableItems(catalog).find((item) => itemNamesMatch(item, key)) || null;
}

export function payableItemCount(catalog = OFFICE_ITEM_CATALOG) {
  return flattenPayableItems(catalog).length;
}

export function ordinanceOptionCount(catalog = OFFICE_ITEM_CATALOG) {
  return flattenPayableItems(catalog).reduce((sum, item) => sum + item.options.length, 0);
}
