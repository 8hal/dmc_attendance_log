#!/usr/bin/env node
/**
 * confirmed race_results 중복 병합 (배포 불필요 — 스크립트 내 거리 클리닝 맵만 사용).
 *
 * 그룹: canonicalEventId+실명 (canonical 있을 때) 또는 source+sourceId+실명
 * 조건: 동일 그룹 내 netTime 초 차이 ≤ --max-sec-diff (기본 15)
 * 잘못된 5K(2시간 초과) 행은 keeper 후보에서 감점, 거리 합의 시 full/ultra 등으로 통일
 *
 *   node scripts/merge-duplicate-race-results.js
 *   node scripts/merge-duplicate-race-results.js --apply
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { normalizeRaceDistance } = require("../functions/lib/raceDistance");
const { timeToSeconds } = require("../functions/lib/scraper");

const APPLY = process.argv.includes("--apply");
const maxSecArg = process.argv.find((a) => a.startsWith("--max-sec-diff="));
const MAX_SEC_DIFF = maxSecArg ? parseInt(maxSecArg.split("=")[1], 10) : 15;

if (APPLY && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST 설정됨 — --apply 금지. 해제 후 prod ADC 로 실행.");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

/** 배포 없이 데이터만 맞출 때 쓰는 추가 별칭 (functions/raceDistance 와 별도) */
const CLEAN_DISTANCE = {
  "32.195k": "32K",
  "32.195km": "32K",
  "32.195K": "32K",
  "32K": "32K",
  "32k": "32K",
  "32km": "32K",
  "51K": "ultra",
  "51k": "ultra",
  "11km": "11K",
  "11KM": "11K",
  "10.8km": "10K",
  "10.8KM": "10K",
  "38-p": "38K-P",
  "38_p": "38K-P",
  "38K-P": "38K-P",
  "38j": "38K-J",
  "38J": "38K-J",
  "38K-J": "38K-J",
  DDC20: "20K",
  ddc20: "20K",
  "25k": "25k",
  "25K": "25k",
};

/**
 * @param {string} raw
 * @returns {string}
 */
function cleanDistance(raw) {
  const t = String(raw || "").trim();
  if (!t) return "unknown";
  if (CLEAN_DISTANCE[t]) return CLEAN_DISTANCE[t];
  const low = t.toLowerCase();
  if (CLEAN_DISTANCE[low]) return CLEAN_DISTANCE[low];
  return normalizeRaceDistance(t);
}

function buildDocId(memberRealName, distanceNorm, eventDate) {
  const safeName = String(memberRealName || "").replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const safeDist = String(distanceNorm || "").replace(/[^a-zA-Z0-9]/g, "_");
  const safeDate = String(eventDate || "").replace(/[^0-9\-]/g, "");
  return `${safeName}_${safeDist}_${safeDate}`;
}

function isBadShortDistance(distNorm, sec) {
  if (sec == null || sec === Infinity) return false;
  if (distNorm === "5K" && sec >= 7200) return true;
  if (distNorm === "3K" && sec >= 7200) return true;
  return false;
}

function scoreDoc(d, sec) {
  const distNorm = cleanDistance(d.distance);
  let s = 0;
  if (d.pbConfirmed) s += 30;
  if (d.source && d.source !== "manual") s += 15;
  if (d.bib && String(d.bib).trim()) s += 5;
  if (d.netTime && String(d.netTime).trim()) s += 2;
  if (isBadShortDistance(distNorm, sec)) s -= 200;
  return s;
}

function mergePayload(keeper, loser) {
  const k = { ...keeper };
  k.pbConfirmed = !!(keeper.pbConfirmed || loser.pbConfirmed);
  k.bib = (keeper.bib && String(keeper.bib).trim()) ? keeper.bib : loser.bib || "";
  k.netTime = (keeper.netTime && String(keeper.netTime).trim()) ? keeper.netTime : loser.netTime || "";
  k.gunTime = (keeper.gunTime && String(keeper.gunTime).trim()) ? keeper.gunTime : loser.gunTime || "";
  k.canonicalEventId = keeper.canonicalEventId || loser.canonicalEventId || null;
  k.note = [keeper.note, loser.note].filter(Boolean).join(" | ") || keeper.note || "";
  if (scoreDoc(loser, timeToSeconds(loser.netTime)) > scoreDoc(keeper, timeToSeconds(keeper.netTime))) {
    k.memberNickname = loser.memberNickname || keeper.memberNickname;
  }
  return k;
}

/**
 * @param {{ distance: string }[]} rows
 * @param {(number|null)[]} secs
 */
function consensusDistance(rows, secs) {
  const cleaned = rows.map((r, i) => ({
    c: cleanDistance(r.distance),
    bad: isBadShortDistance(normalizeRaceDistance(r.distance), secs[i]),
  }));
  const nonBad = cleaned.filter((x) => !x.bad).map((x) => x.c);
  const pool = nonBad.length ? nonBad : cleaned.map((x) => x.c);
  const priority = ["full", "ultra", "half", "30K", "32K", "20K", "11K", "10K", "5K", "3K"];
  for (const p of priority) {
    if (pool.includes(p)) return p;
  }
  const freq = new Map();
  for (const p of pool) freq.set(p, (freq.get(p) || 0) + 1);
  let best = pool[0];
  let n = 0;
  for (const [k, v] of freq) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best;
}

(async () => {
  const snap = await db.collection("race_results").where("status", "==", "confirmed").get();
  /** @type {Map<string, FirebaseFirestore.QueryDocumentSnapshot>} */
  const byDocId = new Map();
  snap.forEach((d) => byDocId.set(d.id, d));

  /** @type {Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>} */
  const groups = new Map();

  function addG(key, doc) {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  snap.forEach((doc) => {
    const d = doc.data();
    const name = d.memberRealName || "";
    if (!name) return;
    if (d.canonicalEventId) {
      addG(`ce\t${d.canonicalEventId}\t${name}`, doc);
    }
    if (d.source && d.sourceId) {
      addG(`src\t${d.source}\t${d.sourceId}\t${name}`, doc);
    }
  });

  const orderedKeys = [...groups.keys()].sort((a, b) => {
    const ac = a.startsWith("ce\t") ? 0 : 1;
    const bc = b.startsWith("ce\t") ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return a.localeCompare(b);
  });

  /** @type {{ key: string; docs: FirebaseFirestore.QueryDocumentSnapshot[]; action: string; detail: string; merged?: object; newId?: string; deleteIds?: string[] }[]} */
  const plans = [];
  const consumed = new Set();

  for (const key of orderedKeys) {
    const docs = groups.get(key);
    if (docs.length < 2) continue;
    const uniq = new Map();
    for (const doc of docs) uniq.set(doc.id, doc);
    const list = [...uniq.values()];
    if (list.length < 2) continue;
    if (list.some((d) => consumed.has(d.id))) continue;

    const rows = list.map((x) => x.data());
    const secs = rows.map((r) => {
      const s = timeToSeconds(r.netTime);
      return s === Infinity ? null : s;
    });
    const validSecs = secs.filter((s) => s != null);
    if (validSecs.length >= 2) {
      const mn = Math.min(...validSecs);
      const mx = Math.max(...validSecs);
      if (mx - mn > MAX_SEC_DIFF) {
        plans.push({ key, docs: list, action: "skip", detail: `시간 차 ${mx - mn}s > ${MAX_SEC_DIFF}s` });
        continue;
      }
    }

    const targetDist = consensusDistance(rows, secs);
    const sorted = [...list].sort(
      (a, b) => scoreDoc(b.data(), timeToSeconds(b.data().netTime)) - scoreDoc(a.data(), timeToSeconds(a.data().netTime))
    );
    let merged = { ...sorted[0].data() };
    for (let i = 1; i < sorted.length; i++) {
      merged = mergePayload(merged, sorted[i].data());
    }
    merged.distance = targetDist;

    const newId = buildDocId(merged.memberRealName, targetDist, merged.eventDate);
    const oldIds = list.map((d) => d.id);
    const deleteIds = oldIds.filter((id) => id !== newId);

    if (!oldIds.includes(newId) && byDocId.has(newId)) {
      plans.push({
        key,
        docs: list,
        action: "skip",
        detail: `목표 docId ${newId} 가 그룹 밖에 이미 존재 — 수동 처리`,
      });
      continue;
    }

    if (oldIds.includes(newId)) {
      const keeperSnap = list.find((d) => d.id === newId);
      if (!keeperSnap) continue;
      let m = { ...keeperSnap.data() };
      for (const doc of list) {
        if (doc.id === newId) continue;
        m = mergePayload(m, doc.data());
      }
      m.distance = targetDist;
      plans.push({
        key,
        docs: list,
        action: "merge-in-place",
        detail: `유지 ${newId}, 삭제 ${deleteIds.join(", ")}`,
        merged: m,
        newId,
        deleteIds,
      });
      for (const d of list) consumed.add(d.id);
    } else {
      plans.push({
        key,
        docs: list,
        action: "move-create",
        detail: `신규 ${newId}, 삭제 ${oldIds.join(", ")}`,
        merged,
        newId,
        deleteIds: oldIds,
      });
      for (const d of list) consumed.add(d.id);
    }
  }

  const toRun = plans.filter((p) => p.action !== "skip");
  const skipped = plans.filter((p) => p.action === "skip");

  console.log(`모드: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`max-sec-diff: ${MAX_SEC_DIFF}`);
  console.log(`스캔: ${snap.size}건, 중복 그룹(후보): ${plans.length} (실행 ${toRun.length}, 제외 ${skipped.length})\n`);

  for (const p of skipped.slice(0, 20)) {
    console.log(`[skip] ${p.key} — ${p.detail}`);
  }
  if (skipped.length > 20) console.log(`… skip ${skipped.length - 20} more`);

  console.log("");
  for (const p of toRun) {
    console.log(`[${p.action}] ${p.key}`);
    console.log(`    ${p.detail}`);
    for (const doc of p.docs) {
      const d = doc.data();
      console.log(
        `    - ${doc.id} | ${d.distance}→${cleanDistance(d.distance)} | ${d.netTime} | bib=${d.bib || "-"}`
      );
    }
    console.log(`    ⇒ distance=${p.merged.distance} doc=${p.newId}`);
    console.log("");
  }

  if (!APPLY) {
    console.log("DRY-RUN 끝. 백업 후 --apply");
    process.exit(0);
  }

  let batch = db.batch();
  let n = 0;
  const commit = async () => {
    if (n > 0) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  };

  for (const p of toRun) {
    const ref = db.collection("race_results").doc(p.newId);
    batch.set(ref, p.merged);
    n++;
    for (const id of p.deleteIds) {
      batch.delete(db.collection("race_results").doc(id));
      n++;
      if (n >= 400) await commit();
    }
    if (n >= 400) await commit();
  }
  await commit();
  console.log("✅ merge-duplicate-race-results 적용 완료");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
