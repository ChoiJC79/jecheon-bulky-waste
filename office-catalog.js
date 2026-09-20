export const OFFICE_ITEM_CATALOG = [
  { id: "living", name: "거실·침실 가구", items: [
    { name: "소파", options: [["1인용", 3000], ["2인용", 5000], ["3인용 이상", 8000]] },
    { name: "침대", options: [["프레임", 5000], ["매트리스", 6000], ["세트", 10000]] },
    { name: "장롱", options: [["1쪽", 5000], ["2쪽", 10000], ["3쪽 이상", 15000]] },
    { name: "서랍장", options: [["3단 이하", 3000], ["4단 이상", 5000]] },
    { name: "TV장식장", options: [["1m 미만", 3000], ["1m 이상", 5000]] },
    { name: "신발장", options: [["소형", 3000], ["대형", 5000]] },
    { name: "화장대", options: [["일반", 3000], ["대형", 5000]] }
  ] },
  { id: "kitchen", name: "주방·식탁 가구", items: [
    { name: "식탁", options: [["2인용", 3000], ["4인용", 5000], ["6인용 이상", 7000]] },
    { name: "식탁의자", options: [["일반", 1000], ["대형", 2000]] },
    { name: "찬장", options: [["소형", 3000], ["대형", 5000]] },
    { name: "싱크대", options: [["1m 미만", 4000], ["1m 이상", 7000]] },
    { name: "아일랜드 식탁", options: [["일반", 5000], ["대형", 8000]] }
  ] },
  { id: "office", name: "학습·사무 가구", items: [
    { name: "책상", options: [["1m 미만", 3000], ["1m 이상", 5000]] },
    { name: "책장", options: [["3단 이하", 3000], ["4단 이상", 5000]] },
    { name: "사무용 의자", options: [["일반", 2000], ["대형", 3000]] },
    { name: "파일캐비닛", options: [["2단 이하", 3000], ["3단 이상", 5000]] }
  ] },
  { id: "life", name: "침구·생활용품", items: [
    { name: "매트리스", options: [["1인용", 5000], ["2인용", 7000]] },
    { name: "카펫", options: [["3㎡ 미만", 2000], ["3㎡ 이상", 4000]] },
    { name: "전신거울", options: [["일반", 2000], ["대형", 3000]] },
    { name: "유아용품", options: [["유모차", 3000], ["아기침대", 5000]] }
  ] },
  { id: "leisure", name: "운동·레저", items: [
    { name: "자전거", options: [["일반", 3000], ["전기", 5000]] },
    { name: "러닝머신", options: [["일반", 8000], ["대형", 12000]] },
    { name: "텐트", options: [["소형", 2000], ["대형", 4000]] }
  ] },
  { id: "outdoor", name: "기타·야외용품", items: [
    { name: "화분", options: [["소형", 1000], ["대형", 3000]] },
    { name: "빨래건조대", options: [["일반", 2000], ["대형", 3000]] },
    { name: "문짝", options: [["일반", 3000], ["대형", 5000]] }
  ] }
];

export const OFFICE_ADDRESS_PRESETS = [
  { id: "cheongjeon", label: "청전 의병대로", address: "충청북도 제천시 의병대로 123 (청전동)", addressDetail: "현관 앞 분리수거장", latitude: 37.1326, longitude: 128.1910 },
  { id: "gyodong", label: "교동 중앙로", address: "충청북도 제천시 의림대로 50 (교동)", addressDetail: "행정복지센터 앞", latitude: 37.1368, longitude: 128.2112 },
  { id: "haso", label: "하소 청전로", address: "충청북도 제천시 청전로 7 (하소동)", addressDetail: "아파트 단지 출입구", latitude: 37.1189, longitude: 128.2054 }
];
