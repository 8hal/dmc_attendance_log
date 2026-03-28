#!/usr/bin/env node
/**
 * race_events 생성 또는 sourceMappings 병합 (§2.4 전역 유일 검사).
 * race_results.jobId 는 변경하지 않음.
 *
 *   node scripts/backfill-race-events-mapping.js --config scripts/data/race-events-mapping.json
 *   node scripts/backfill-race-events-mapping.js --config ... --apply
 *
 * 플래그 없이 실행 = DRY-RUN(쓰기 없음). 쓰기는 반드시 --apply.
 * 프로덕션은 백업·팀 승인 후 실행 (data-write-safety).
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const configIdx = args.indexOf("--config");
const configPath =
  configIdx >= 0 && args[configIdx + 1]
    ? path.resolve(args[configIdx + 1])
    : null;

if (!configPath || !fs.existsSync(configPath)) {
  console.error("사용법: node scripts/backfill-race-events-mapping.js --config <json> [--apply]");
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

function sourceKey(source, sourceId) {
  return `${source != null ? String(source) : "unknown"}_${sourceId != null ? String(sourceId) : "unknown"}`;
}

/** @returns {Promise<Record<string, string>>} */
async function loadGlobalSourceIndex() {
  const snap = await db.collection("race_events").get();
  /** @type {Record<string, string>} */
  const map = {};
  snap.forEach((doc) => {
    const d = doc.data();
    const list = Array.isArray(d.sourceMappings) ? d.sourceMappings : [];
    for (const m of list) {
      map[sourceKey(m.source, m.sourceId)] = doc.id;
    }
  });
  return map;
}

/**
 * @param {import("firebase-admin/firestore").Firestore} db
 * @param {any[]} events
 * @param {boolean} apply
 */
async function backfillCanonicalOnResults(db, events, apply) {
  for (const ev of events) {
    const docId = ev.docId;
    for (const m of ev.sourceMappings || []) {
      const snap = await db
        .collection("race_results")
        .where("source", "==", String(m.source))
        .where("sourceId", "==", String(m.sourceId))
        .where("status", "==", "confirmed")
        .get();

      let batch = db.batch();
      let batchCount = 0;
      let total = 0;

      const flush = async () => {
        if (batchCount > 0 && apply) await batch.commit();
        batch = db.batch();
        batchCount = 0;
      };

      for (const rd of snap.docs) {
        const d = rd.data();
        if (d.canonicalEventId === docId) continue;
        total++;
        if (apply) {
          batch.update(rd.ref, { canonicalEventId: docId });
          batchCount++;
          if (batchCount >= 400) await flush();
        }
      }
      await flush();
      console.log(
        `  race_results canonicalEventId: ${m.source}_${m.sourceId} → ${docId} (${total}건 ${apply ? "업데이트" : "dry-run"})`
      );
    }
  }
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const events = raw.events;
  if (!Array.isArray(events) || events.length === 0) {
    console.error("config.events 가 비었습니다.");
    process.exit(1);
  }

  const updateResultsCanonicalId = !!raw.updateResultsCanonicalId;

  console.log(`설정: ${configPath}`);
  console.log(`모드: ${APPLY ? "APPLY" : "DRY-RUN (쓰기 없음)"}`);
  console.log(`updateResultsCanonicalId: ${updateResultsCanonicalId}\n`);

  const globalIndex = await loadGlobalSourceIndex();
  const errors = [];

  for (const ev of events) {
    const docId = ev.docId;
    const primaryName = ev.primaryName;
    const eventDate = ev.eventDate;
    const mappings = ev.sourceMappings;

    if (!docId || !primaryName || !eventDate || !Array.isArray(mappings) || mappings.length === 0) {
      errors.push(`이벤트 스킵: docId/primaryName/eventDate/sourceMappings 필수 — ${JSON.stringify(ev)}`);
      continue;
    }

    for (const m of mappings) {
      if (m.source == null || m.sourceId == null || m.source === "" || m.sourceId === "") {
        errors.push(`[${docId}] sourceMappings 에 빈 source/sourceId`);
        continue;
      }
      const sk = sourceKey(m.source, m.sourceId);
      const existing = globalIndex[sk];
      if (existing && existing !== docId) {
        errors.push(`§2.4 충돌: ${sk} 는 이미 race_events/${existing} 에 등록됨 (요청 ${docId})`);
      }
    }
  }

  if (errors.length) {
    console.error("검증 실패:\n" + errors.join("\n"));
    process.exit(1);
  }

  let batch = db.batch();
  let batchOps = 0;

  const flushRaceEvents = async () => {
    if (batchOps > 0 && APPLY) await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const ev of events) {
    const docId = ev.docId;
    const merge = ev.merge !== false;
    const mappings = ev.sourceMappings;
    const ref = db.collection("race_events").doc(docId);
    const existing = await ref.get();

    if (existing.exists) {
      if (!merge) {
        console.log(`건너뜀 (이미 존재, merge:false): ${docId}`);
        continue;
      }
      const d = existing.data();
      const current = Array.isArray(d.sourceMappings) ? [...d.sourceMappings] : [];
      const keys = new Set(current.map((m) => sourceKey(m.source, m.sourceId)));
      let added = 0;
      for (const m of mappings) {
        const sk = sourceKey(m.source, m.sourceId);
        if (!keys.has(sk)) {
          current.push({ source: String(m.source), sourceId: String(m.sourceId) });
          keys.add(sk);
          added++;
        }
      }
      if (added === 0) {
        console.log(`변경 없음: ${docId}`);
        continue;
      }
      console.log(`MERGE ${docId}: sourceMappings +${added}건 → 총 ${current.length}건`);
      if (APPLY) {
        batch.update(ref, {
          sourceMappings: current,
          updatedAt: new Date().toISOString(),
        });
        batchOps++;
        if (batchOps >= 400) await flushRaceEvents();
      }
      for (const m of mappings) {
        globalIndex[sourceKey(m.source, m.sourceId)] = docId;
      }
    } else {
      const payload = {
        primaryName: ev.primaryName,
        eventDate: ev.eventDate,
        sourceMappings: mappings.map((m) => ({
          source: String(m.source),
          sourceId: String(m.sourceId),
        })),
        createdAt: new Date().toISOString(),
        backfilledAt: new Date().toISOString(),
      };
      console.log(`CREATE ${docId}:`, JSON.stringify(payload));
      if (APPLY) {
        batch.set(ref, payload);
        batchOps++;
        if (batchOps >= 400) await flushRaceEvents();
      }
      for (const m of mappings) {
        globalIndex[sourceKey(m.source, m.sourceId)] = docId;
      }
    }
  }

  await flushRaceEvents();

  if (updateResultsCanonicalId) {
    console.log("\n[race_results.canonicalEventId 옵션]");
    await backfillCanonicalOnResults(db, events, APPLY);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN 끝. 쓰려면 같은 명령에 --apply 추가.");
  } else {
    console.log("\n✅ race_events (및 옵션 race_results) 적용 완료.");
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
