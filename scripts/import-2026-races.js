/**
 * 2026년 1~3월 대회 기록 일괄 임포트 스크립트
 *
 * 사용법:
 *   cd functions && node ../scripts/import-2026-races.js
 *
 * 각 대회별 scrape_job 문서를 status="complete"로 생성합니다.
 * report.html 에서 검토 후 "기록 저장하기"로 최종 확정하세요.
 *
 * 이미 입력된 대회(skip):
 *   - 2026 부천국제10km로드레이스 (2026-03-08)
 *   - 2026 고양특례시 하프마라톤 (2026-03-08)
 *   - 2026서울마라톤 (2026-03-15)
 *
 * 닉네임 보정 적용:
 *   BicC→BigC, 신뾰리→신뽀리, 메드켓→매드캣, 필봉타형→필봉,
 *   호야king→호야킹, 뭐는자→뛰는자, 둠초딩→동초딩, 돈은철→동은철,
 *   정선욱→정선옥, 이동련→이동현, 류태준→류해준, 엄인웅→엄인용
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

// ====================================================
// 대회 데이터 (이미지 추출 + 닉네임 보정 적용)
// ====================================================
const RACES = [
  // ──────────────────────────── 1월 ────────────────────────────
  {
    eventName: "여수해양마라톤",
    eventDate: "2026-01-11",
    results: [
      { nickname: "롸져",     realName: "설민태", distance: "full",  netTime: "2:47:51", note: "" },
      { nickname: "디모",     realName: "김성한", distance: "full",  netTime: "2:53:45", note: "" },
      { nickname: "아Q",      realName: "정균범", distance: "full",  netTime: "2:55:08", note: "" },
      { nickname: "즐런",     realName: "박조련", distance: "full",  netTime: "2:58:25", note: "" },
      { nickname: "바우돌리노", realName: "서동욱", distance: "full",  netTime: "3:02:48", note: "" },
      { nickname: "된다",     realName: "황순길", distance: "full",  netTime: "3:03:13", note: "" },
      { nickname: "오칠팔이", realName: "이기원", distance: "full",  netTime: "3:08:28", note: "" },
      { nickname: "보라미",   realName: "한남규", distance: "full",  netTime: "3:17:42", note: "" },
      { nickname: "송송",     realName: "송진수", distance: "full",  netTime: "3:25:35", note: "" },
      { nickname: "BigC",     realName: "김정찬", distance: "full",  netTime: "3:29:27", note: "" },
      { nickname: "치동런",   realName: "강창기", distance: "full",  netTime: "3:29:37", note: "" },
      { nickname: "데이",     realName: "이영철", distance: "full",  netTime: "3:34:44", note: "" },
      { nickname: "무천",     realName: "이완희", distance: "full",  netTime: "3:37:34", note: "" },
      { nickname: "라우펜더만", realName: "이원기", distance: "full", netTime: "3:38:46", note: "" },
      { nickname: "마그마그", realName: "장대섭", distance: "full",  netTime: "3:43:40", note: "" },
      { nickname: "바람요정", realName: "김유정", distance: "full",  netTime: "3:53:58", note: "" },
      { nickname: "호밀",     realName: "서복덕", distance: "full",  netTime: "3:54:06", note: "" },
      { nickname: "가람",     realName: "임창수", distance: "full",  netTime: "3:55:55", note: "" },
      { nickname: "진달",     realName: "김진규", distance: "full",  netTime: "4:05:33", note: "" },
      { nickname: "브리따",   realName: "정다은", distance: "full",  netTime: "4:05:40", note: "" },
      { nickname: "해피하우스", realName: "강동원", distance: "full", netTime: "4:20:37", note: "" },
      { nickname: "민주아빠", realName: "김종현", distance: "full",  netTime: "4:23:43", note: "" },
      { nickname: "개마고원", realName: "박세진", distance: "full",  netTime: "4:41:32", note: "" },
      { nickname: "보스턴",   realName: "방현규", distance: "full",  netTime: "4:42:08", note: "" },
      { nickname: "난닝구",   realName: "김덕환", distance: "full",  netTime: "4:42:09", note: "" },
      { nickname: "신뽀리",   realName: "신귀용", distance: "half",  netTime: "1:44:07", note: "" },
      { nickname: "쌤마",     realName: "이계환", distance: "half",  netTime: "2:07:05", note: "" },
      { nickname: "희우",     realName: "설희우", distance: "10K",   netTime: "0:49:11", note: "" },
    ],
  },
  {
    eventName: "철원알몸마라톤",
    eventDate: "2026-01-24",
    results: [
      { nickname: "신뽀리", realName: "신귀용", distance: "6.5K", netTime: "0:27:31", note: "" },
    ],
  },
  {
    eventName: "화성궁평항마라톤",
    eventDate: "2026-01-31",
    results: [
      { nickname: "짱구는목말러", realName: "임기빈", distance: "half", netTime: "1:19:35", note: "PB, 3위" },
      { nickname: "필봉",        realName: "서정모", distance: "32K",  netTime: "2:31:50", note: "" },
    ],
  },

  // ──────────────────────────── 2월 ────────────────────────────
  {
    eventName: "동계국제마라톤",
    eventDate: "2026-02-21",
    results: [
      { nickname: "zepi", realName: "장성남", distance: "32.195K", netTime: "2:19:57", note: "" },
    ],
  },
  {
    eventName: "대구마라톤",
    eventDate: "2026-02-22",
    results: [
      { nickname: "스카이",     realName: "윤상기", distance: "full", netTime: "2:54:57", note: "PB" },
      { nickname: "나이스",     realName: "이동현", distance: "full", netTime: "2:55:59", note: "" },
      { nickname: "된다",       realName: "황순길", distance: "full", netTime: "3:08:55", note: "" },
      { nickname: "즐런",       realName: "박조련", distance: "full", netTime: "3:15:39", note: "" },
      { nickname: "오칠팔이",   realName: "이기원", distance: "full", netTime: "3:25:21", note: "" },
      { nickname: "예예",       realName: "서병수", distance: "full", netTime: "3:25:44", note: "" },
      { nickname: "진달",       realName: "김진규", distance: "full", netTime: "3:29:22", note: "" },
      { nickname: "필봉",       realName: "서정모", distance: "full", netTime: "3:35:18", note: "" },
      { nickname: "BigC",       realName: "김정찬", distance: "full", netTime: "3:36:44", note: "" },
      { nickname: "BEAT",       realName: "남기철", distance: "full", netTime: "3:36:50", note: "" },
      { nickname: "데이",       realName: "이영철", distance: "full", netTime: "3:42:33", note: "" },
      { nickname: "James",      realName: "김형석", distance: "full", netTime: "3:45:52", note: "" },
      { nickname: "목우인",     realName: "류해준", distance: "full", netTime: "3:46:45", note: "" },
      { nickname: "라우펜더만", realName: "이원기", distance: "full", netTime: "3:51:32", note: "" },
      { nickname: "무천",       realName: "이완희", distance: "full", netTime: "3:55:38", note: "" },
      { nickname: "Tommy",      realName: "김태영", distance: "full", netTime: "3:55:39", note: "" },
      { nickname: "달다",       realName: "서호성", distance: "full", netTime: "3:56:18", note: "" },
      { nickname: "민주아빠",   realName: "김종현", distance: "full", netTime: "3:56:39", note: "PB" },
      { nickname: "레이스",     realName: "정선옥", distance: "full", netTime: "3:56:56", note: "" },
      { nickname: "블루",       realName: "조영진", distance: "full", netTime: "4:00:33", note: "" },
      { nickname: "깜보",       realName: "최종한", distance: "full", netTime: "4:03:04", note: "" },
      { nickname: "헥사",       realName: "손동휘", distance: "full", netTime: "4:18:01", note: "" },
      { nickname: "피온",       realName: "이강원", distance: "full", netTime: "4:25:04", note: "" },
      { nickname: "가람",       realName: "임창수", distance: "full", netTime: "4:26:10", note: "" },
      { nickname: "해피하우스", realName: "강동원", distance: "full", netTime: "4:42:48", note: "" },
      { nickname: "매드캣",     realName: "김정숙", distance: "full", netTime: "4:42:48", note: "" },
      { nickname: "개마고원",   realName: "박세진", distance: "full", netTime: "4:55:00", note: "" },
    ],
  },
  {
    eventName: "오사카마라톤",
    eventDate: "2026-02-22",
    results: [
      { nickname: "롸져", realName: "설민태", distance: "full", netTime: "2:45:30", note: "PB" },
      { nickname: "햇살", realName: "임예니", distance: "full", netTime: "3:57:50", note: "" },
      { nickname: "서비", realName: "김경섭", distance: "full", netTime: "4:24:12", note: "" },
    ],
  },
  {
    eventName: "경기수원국제하프마라톤",
    eventDate: "2026-02-22",
    results: [
      { nickname: "다니엘",   realName: "이순실", distance: "10K",  netTime: "0:39:47", note: "" },
      { nickname: "써니형",   realName: "이의선", distance: "half", netTime: "1:19:58", note: "" },
      { nickname: "크로버",   realName: "김정국", distance: "half", netTime: "1:22:48", note: "" },
      { nickname: "아Q",      realName: "정균범", distance: "half", netTime: "1:23:44", note: "" },
      { nickname: "동초딩",   realName: "동은철", distance: "half", netTime: "1:32:31", note: "" },
      { nickname: "뛰는자",   realName: "오현진", distance: "half", netTime: "1:58:11", note: "" },
    ],
  },
  {
    eventName: "고구려마라톤",
    eventDate: "2026-02-22",
    results: [
      { nickname: "송버드",       realName: "이재용", distance: "32K",  netTime: "2:48:49", note: "" },
      { nickname: "짱구는목말러", realName: "임기빈", distance: "full", netTime: "2:51:29", note: "" },
    ],
  },

  // ──────────────────────────── 3월 ────────────────────────────
  {
    eventName: "도쿄마라톤",
    eventDate: "2026-03-01",
    results: [
      { nickname: "블랙소닉", realName: "전남석", distance: "full", netTime: "2:57:00", note: "" },
      { nickname: "우상향",   realName: "김형진", distance: "full", netTime: "3:40:16", note: "" },
      // 언스파(엄인용) - 기록 미제공으로 제외
    ],
  },
  {
    eventName: "머니투데이방송마라톤",
    eventDate: "2026-03-01",
    results: [
      { nickname: "디모",         realName: "김성한", distance: "full", netTime: "2:41:00", note: "2위" },
      { nickname: "써니형",       realName: "이의선", distance: "full", netTime: "2:42:30", note: "3위, PB" },
      { nickname: "짱구는목말러", realName: "임기빈", distance: "10K",  netTime: "0:37:05", note: "" },
      { nickname: "두두",         realName: "손두현", distance: "10K",  netTime: "0:37:24", note: "" },
      { nickname: "송송",         realName: "송진수", distance: "10K",  netTime: "0:40:22", note: "연대1위" },
    ],
  },
  {
    eventName: "뉴발런스하프레이스",
    eventDate: "2026-03-02",
    results: [
      { nickname: "크로버",   realName: "김정국", distance: "half", netTime: "1:22:00", note: "PB" },
      { nickname: "James",    realName: "김형석", distance: "half", netTime: "1:26:03", note: "" },
      { nickname: "엠제이",   realName: "이민주", distance: "half", netTime: "1:27:10", note: "PB" },
      { nickname: "마그마그", realName: "장대섭", distance: "half", netTime: "1:36:20", note: "PB" },
      { nickname: "체리",     realName: "허헤원", distance: "half", netTime: "1:42:19", note: "PB" },
      { nickname: "헥사",     realName: "손동휘", distance: "half", netTime: "1:43:54", note: "" },
      { nickname: "호야킹",   realName: "김재호", distance: "half", netTime: "1:56:07", note: "" },
    ],
  },
  {
    eventName: "대전트레일",
    eventDate: "2026-03-07",
    results: [
      { nickname: "크로버", realName: "김정국", distance: "30K", netTime: "2:45:35", note: "" },
    ],
  },
  {
    eventName: "부산비치울트라",
    eventDate: "2026-03-07",
    results: [
      { nickname: "보스턴", realName: "방현규", distance: "100K", netTime: "13:56:00", note: "" },
    ],
  },
];

async function main() {
  console.log(`📋 총 ${RACES.length}개 대회, ${RACES.reduce((s, r) => s + r.results.length, 0)}건 기록을 임포트합니다.\n`);

  for (const race of RACES) {
    const now = new Date().toISOString();
    const sourceId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const jobRef = db.collection("scrape_jobs").doc();
    await jobRef.set({
      source: "manual",
      sourceId,
      eventName: race.eventName,
      eventDate: race.eventDate,
      location: "",
      status: "complete",
      progress: {
        searched: 0,
        total: race.results.length,
        found: race.results.length,
      },
      results: race.results.map((r) => {
        const hasPB = /\bPB\b/i.test(r.note || "");
        const cleanNote = (r.note || "").replace(/,?\s*PB\s*,?/gi, "").replace(/^[,\s]+|[,\s]+$/g, "").trim();
        return {
          memberNickname: r.nickname,
          memberRealName: r.realName,
          memberGender: r.gender || "",
          bib: r.bib || "",
          distance: r.distance,
          netTime: r.netTime,
          gunTime: r.gunTime || r.netTime,
          overallRank: r.overallRank || null,
          genderRank: null,
          pace: "",
          status: "auto",
          candidateCount: 1,
          isPB: hasPB,
          pbConfirmed: false,
          isGuest: false,
          note: cleanNote,
        };
      }),
      createdAt: now,
    });

    console.log(`✅ [${race.eventDate}] ${race.eventName} — ${race.results.length}명 (jobId: ${jobRef.id})`);

    // 동일 sourceId 충돌 방지
    await new Promise((r) => setTimeout(r, 60));
  }

  console.log("\n🎉 완료! report.html 에서 각 대회를 검토 후 저장하세요.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 오류:", e);
  process.exit(1);
});
