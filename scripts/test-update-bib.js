#!/usr/bin/env node

/**
 * Test script for update-bib API endpoint
 * Tests: parameter validation, participant verification, bib update
 */

const admin = require("firebase-admin");

// Connect to emulator
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
admin.initializeApp({ projectId: "dmc-attendance" });
const db = admin.firestore();

async function setupTestData() {
  console.log("📝 Setting up test data...");
  
  const testEventId = "evt_test_bib_001";
  const testEvent = {
    eventId: testEventId,
    eventName: "배번 입력 테스트 대회",
    eventDate: "2026-05-01",
    participants: [
      {
        nickname: "테스트러너",
        realName: "김테스트",
        memberId: "member001"
      },
      {
        nickname: "러너2",
        realName: "이러너",
        memberId: "member002"
      }
    ]
  };
  
  await db.collection("race_events").doc(testEventId).set(testEvent);
  console.log("✅ Test event created:", testEventId);
  return testEventId;
}

async function testAPI(testCase) {
  console.log(`\n🧪 Test: ${testCase.name}`);
  
  const response = await fetch(
    "http://localhost:5001/dmc-attendance/asia-northeast3/race?action=group-events",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testCase.payload)
    }
  );
  
  const status = response.status;
  const data = await response.json();
  
  console.log(`   Status: ${status}`);
  console.log(`   Response:`, JSON.stringify(data, null, 2));
  
  if (testCase.expectedStatus && status !== testCase.expectedStatus) {
    console.error(`   ❌ Expected status ${testCase.expectedStatus}, got ${status}`);
    return false;
  }
  
  if (testCase.expectedFields) {
    for (const [field, value] of Object.entries(testCase.expectedFields)) {
      if (data[field] !== value) {
        console.error(`   ❌ Expected ${field}=${value}, got ${data[field]}`);
        return false;
      }
    }
  }
  
  console.log(`   ✅ Pass`);
  return true;
}

async function verifyBibUpdate(eventId, nickname, expectedBib) {
  console.log(`\n🔍 Verifying bib update in Firestore...`);
  
  const eventDoc = await db.collection("race_events").doc(eventId).get();
  const event = eventDoc.data();
  const participant = event.participants.find(p => p.nickname === nickname);
  
  if (participant && participant.bib === expectedBib) {
    console.log(`   ✅ Bib correctly updated: ${expectedBib}`);
    return true;
  } else {
    console.error(`   ❌ Bib mismatch. Expected: ${expectedBib}, Got: ${participant?.bib}`);
    return false;
  }
}

async function runTests() {
  try {
    const eventId = await setupTestData();
    
    const tests = [
      // 성공 케이스
      {
        name: "Valid bib update",
        payload: {
          subAction: "update-bib",
          eventId: eventId,
          nickname: "테스트러너",
          bib: "12345"
        },
        expectedStatus: 200,
        expectedFields: { ok: true }
      },
      
      // 에러 케이스 1: eventId 없음
      {
        name: "Missing eventId",
        payload: {
          subAction: "update-bib",
          nickname: "테스트러너",
          bib: "12345"
        },
        expectedStatus: 400,
        expectedFields: { ok: false, error: "eventId required" }
      },
      
      // 에러 케이스 2: nickname 없음
      {
        name: "Missing nickname",
        payload: {
          subAction: "update-bib",
          eventId: eventId,
          bib: "12345"
        },
        expectedStatus: 400,
        expectedFields: { ok: false, error: "nickname required" }
      },
      
      // 에러 케이스 3: bib 없음
      {
        name: "Missing bib",
        payload: {
          subAction: "update-bib",
          eventId: eventId,
          nickname: "테스트러너"
        },
        expectedStatus: 400,
        expectedFields: { ok: false, error: "bib required" }
      },
      
      // 에러 케이스 4: bib 빈 문자열
      {
        name: "Empty bib (whitespace only)",
        payload: {
          subAction: "update-bib",
          eventId: eventId,
          nickname: "테스트러너",
          bib: "   "
        },
        expectedStatus: 400,
        expectedFields: { ok: false, error: "bib cannot be empty" }
      },
      
      // 에러 케이스 5: 존재하지 않는 대회
      {
        name: "Event not found",
        payload: {
          subAction: "update-bib",
          eventId: "nonexistent_event",
          nickname: "테스트러너",
          bib: "12345"
        },
        expectedStatus: 404,
        expectedFields: { ok: false, error: "event not found" }
      },
      
      // 에러 케이스 6: 참가자 아님
      {
        name: "Not a participant",
        payload: {
          subAction: "update-bib",
          eventId: eventId,
          nickname: "비참가자",
          bib: "12345"
        },
        expectedStatus: 403,
        expectedFields: { ok: false, error: "not a participant" }
      },
      
      // 성공 케이스 2: 배번 덮어쓰기 (업데이트)
      {
        name: "Update existing bib",
        payload: {
          subAction: "update-bib",
          eventId: eventId,
          nickname: "테스트러너",
          bib: "99999"
        },
        expectedStatus: 200,
        expectedFields: { ok: true }
      }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      const result = await testAPI(test);
      if (result) {
        passed++;
      } else {
        failed++;
      }
    }
    
    // Firestore 검증
    const verified = await verifyBibUpdate(eventId, "테스트러너", "99999");
    if (verified) {
      passed++;
    } else {
      failed++;
    }
    
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
    console.log(`${"=".repeat(50)}`);
    
    if (failed === 0) {
      console.log("✅ All tests passed!");
    } else {
      console.log("❌ Some tests failed.");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTests();
