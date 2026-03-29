#!/usr/bin/env node
/**
 * pre-deploy-test 전용: Firestore 에뮬레이터에 최소 데이터 1건(member).
 * emulators:exec 가 FIRESTORE_EMULATOR_HOST 를 넣어 주므로 프로덕션에 쓰지 않음.
 */
const fs = require("fs");
const path = require("path");

const functionsDir = path.join(__dirname, "..", "functions");
const nm = path.join(functionsDir, "node_modules");
if (!fs.existsSync(nm)) {
  console.error("functions/node_modules 없음. cd functions && npm ci");
  process.exit(1);
}
require("module").globalPaths.unshift(nm);

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST 없음. 이 스크립트는 firebase emulators:exec 안에서만 실행하세요."
  );
  process.exit(1);
}

initializeApp({ projectId: "dmc-attendance" });
const db = getFirestore();

const SEED_ID = "pre_deploy_seed_member";

(async () => {
  await db
    .collection("members")
    .doc(SEED_ID)
    .set(
      {
        nickname: "프리배포시드",
        realName: "PreDeploySeed",
        gender: "M",
        hidden: false,
        team: "",
      },
      { merge: true }
    );
  console.log("[seed-emulator-pre-deploy] members/" + SEED_ID + " OK");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
