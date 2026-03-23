#!/usr/bin/env node

/**
 * search_cache 프리워밍: 클럽 회원 전원 × 2025-2026 전체 대회 검색 → Firestore 캐시 저장
 *
 * 사용법:
 *   node scripts/prewarm-search-cache.js                     # 전체 (2025+2026)
 *   node scripts/prewarm-search-cache.js --year 2025         # 특정 연도만
 *   node scripts/prewarm-search-cache.js --member 김민수     # 특정 회원만
 *   node scripts/prewarm-search-cache.js --dry-run           # 실제 검색 없이 대상만 확인
 *   node scripts/prewarm-search-cache.js --resume            # 캐시 미스만 검색 (이어하기)
 *
 * 예상 소요: 154명 × ~270개 대회 (확정 제외), 소스별 병렬
 * DELAY_MS=200ms 기준, 회원 1명당 ~3분, 전체 ~8시간 (1회성)
 *
 * TODO: 캐싱 우선순위 — race_results 보유 건수가 많은 회원(활동적)을 먼저 처리.
 *       중단 시 활동 회원부터 캐시가 채워져 있어 사용자 체감 효과 극대화.
 *
 * TODO: 병렬 그룹 실행 (--member-range 옵션)
 *   현재: 154명 직렬 → ~6시간
 *   개선: 터미널 N개에서 회원을 분할 실행 → 시간 1/N
 *
 *   사용법 (구현 시):
 *     터미널 1: node scripts/prewarm-search-cache.js --resume --member-range 1-52
 *     터미널 2: node scripts/prewarm-search-cache.js --resume --member-range 53-103
 *     터미널 3: node scripts/prewarm-search-cache.js --resume --member-range 104-154
 *
 *   안전성:
 *     - --resume 모드라 캐시 키 충돌 없음 (회원별로 다른 키)
 *     - Firestore 쓰기도 doc 단위라 동시성 문제 없음
 *
 *   부하 가이드라인 (2026-03-22 조사):
 *     - DELAY_MS=200ms → 소스당 5 req/s (현재, 안전)
 *     - 2그룹 → 소스당 10 req/s (업계 권장 상한, 안전)
 *     - 3그룹 → 소스당 15 req/s (시도 가능, 모니터링 필요)
 *     - 5그룹 → 소스당 25 req/s (공격적, 한국 타이밍사이트 특성상 가능성 높음)
 *     - 참고: 중규모 공개 데이터 사이트 권장 3~10 req/s
 *     - 차단 시 HTTP 429 또는 일시적 IP 차단 → --resume으로 재실행
 *     - 한국 타이밍사이트(smartchip/spct/myresult/marazone)는 안티봇 미적용,
 *       대회 당일 수천 명 동시 조회 감당하는 인프라라 임계값이 높을 것으로 추정
 */

const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const path = require("path");

initializeApp({ credential: applicationDefault(), projectId: "dmc-attendance" });
const db = getFirestore();

const scraper = require(path.join(__dirname, "..", "functions", "lib", "scraper"));

const CACHE_COL = "search_cache";
const DELAY_MS = scraper.DELAY_MS;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const yearFilter = args.includes("--year") ? parseInt(args[args.indexOf("--year") + 1]) : null;
const memberFilter = args.includes("--member") ? args[args.indexOf("--member") + 1] : null;
const dryRun = args.includes("--dry-run");
const resume = args.includes("--resume");

async function getMembers() {
  const snap = await db.collection("members").where("hidden", "!=", true).get();
  const members = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.realName) members.push({ realName: d.realName, nickname: d.nickname || "", gender: d.gender || "" });
  });
  return members;
}

async function getConfirmedEventKeys() {
  const snap = await db.collection("race_results").get();
  const keys = new Map();
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.source && d.sourceId && d.memberRealName) {
      const memberKey = `${d.source}_${d.sourceId}_${d.memberRealName}`;
      keys.set(memberKey, true);
    }
  });
  return keys;
}

async function discoverEvents() {
  const years = yearFilter ? [yearFilter] : [2025, 2026];
  const allEvents = [];
  for (const y of years) {
    console.log(`[discover] ${y}년 대회 목록 불러오는 중...`);
    const events = await scraper.discoverAllEvents(y);
    allEvents.push(...events);
    console.log(`[discover] ${y}년: ${events.length}개 대회`);
  }
  return allEvents.map((e) => ({
    source: e.source,
    sourceId: e.sourceId,
    eventName: e.name || e.eventName || e.sourceId,
    eventDate: e.date || e.eventDate || "",
  }));
}

async function batchCheckCached(cacheKeys) {
  const BATCH = 500;
  const cachedSet = new Set();
  for (let i = 0; i < cacheKeys.length; i += BATCH) {
    const batch = cacheKeys.slice(i, i + BATCH);
    const refs = batch.map((k) => db.collection(CACHE_COL).doc(k));
    const docs = await db.getAll(...refs);
    for (const doc of docs) {
      if (!doc.exists) continue;
      const age = Date.now() - (doc.data().cachedAt?.toMillis?.() || 0);
      if (age < CACHE_TTL_MS) cachedSet.add(doc.id);
    }
  }
  return cachedSet;
}

async function run() {
  console.log("=== search_cache 프리워밍 ===");
  console.log(`옵션: year=${yearFilter || "all"}, member=${memberFilter || "all"}, dryRun=${dryRun}, resume=${resume}`);

  const [members, confirmedKeys, events] = await Promise.all([
    getMembers(),
    getConfirmedEventKeys(),
    discoverEvents(),
  ]);

  const targetMembers = memberFilter ? members.filter((m) => m.realName === memberFilter) : members;
  console.log(`\n회원: ${targetMembers.length}명, 대회: ${events.length}개, 확정 기록 키: ${confirmedKeys.size}개`);

  if (dryRun) {
    console.log(`[dry-run] 전체 쌍: ${targetMembers.length * events.length}건`);
    console.log("[dry-run] 실제 검색 없이 종료합니다.");
    process.exit(0);
  }

  let globalCompleted = 0;
  let globalFound = 0;
  let globalSkippedConfirmed = 0;
  let globalSkippedCached = 0;
  let globalToSearch = 0;
  const globalStart = Date.now();

  for (let mi = 0; mi < targetMembers.length; mi++) {
    const member = targetMembers[mi];
    const candidates = [];
    let memberSkippedConfirmed = 0;

    for (const ev of events) {
      const cacheKey = `${ev.source}_${ev.sourceId}_${member.realName}`.substring(0, 1500);
      const confirmedKey = `${ev.source}_${ev.sourceId}_${member.realName}`;
      if (confirmedKeys.has(confirmedKey)) {
        memberSkippedConfirmed++;
        continue;
      }
      candidates.push({ ...ev, cacheKey });
    }
    globalSkippedConfirmed += memberSkippedConfirmed;

    let memberEvents = candidates;
    if (resume && candidates.length > 0) {
      const cachedSet = await batchCheckCached(candidates.map((c) => c.cacheKey));
      memberEvents = candidates.filter((c) => !cachedSet.has(c.cacheKey));
      globalSkippedCached += cachedSet.size;
    }

    globalToSearch += memberEvents.length;

    if (memberEvents.length === 0) {
      console.log(`[${mi + 1}/${targetMembers.length}] ${member.realName}: 스킵 (확정 ${memberSkippedConfirmed}, 캐시 ${candidates.length - memberEvents.length})`);
      continue;
    }

    const bySource = {};
    for (const ev of memberEvents) {
      if (!bySource[ev.source]) bySource[ev.source] = [];
      bySource[ev.source].push(ev);
    }

    let memberCompleted = 0;
    let memberFound = 0;

    const searchSource = async (sourceEvents) => {
      for (const ev of sourceEvents) {
        try {
          await scraper.sleep(DELAY_MS);
          const results = await scraper.searchMember(ev.source, ev.sourceId, member.realName);

          const hasResults = results && results.length > 0;
          const resultEntry = hasResults
            ? {
                eventName: ev.eventName,
                eventDate: ev.eventDate,
                source: ev.source,
                sourceId: ev.sourceId,
                records: results.map((r) => ({
                  ...r,
                  memberRealName: member.realName,
                  memberNickname: member.nickname,
                  memberGender: member.gender,
                })),
              }
            : null;

          await db.collection(CACHE_COL).doc(ev.cacheKey).set({
            realName: member.realName,
            source: ev.source,
            sourceId: ev.sourceId,
            found: hasResults,
            result: resultEntry,
            cachedAt: FieldValue.serverTimestamp(),
          });

          memberCompleted++;
          globalCompleted++;
          if (hasResults) { memberFound++; globalFound++; }

          if (globalCompleted % 50 === 0) {
            const elapsed = ((Date.now() - globalStart) / 1000).toFixed(0);
            const rate = (globalCompleted / elapsed * 60).toFixed(0);
            console.log(`  [전체 ${globalCompleted}건] ${member.realName} ${memberCompleted}/${memberEvents.length} | 발견 ${globalFound}건 | ${elapsed}s (${rate}건/분)`);
          }
        } catch (err) {
          memberCompleted++;
          globalCompleted++;
        }
      }
    };

    console.log(`[${mi + 1}/${targetMembers.length}] ${member.realName}: ${memberEvents.length}개 검색 시작 (${Object.keys(bySource).length}개 소스 병렬)`);
    await Promise.all(Object.values(bySource).map(searchSource));
    console.log(`  → ${member.realName} 완료: 검색 ${memberCompleted}건, 발견 ${memberFound}건`);
  }

  const totalSec = ((Date.now() - globalStart) / 1000).toFixed(0);
  console.log(`\n=== 완료 ===`);
  console.log(`검색: ${globalCompleted}건, 발견: ${globalFound}건, 소요: ${totalSec}초`);
  console.log(`스킵: 확정 ${globalSkippedConfirmed}건, 캐시 ${globalSkippedCached}건`);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
