# 일달천금 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구 7명이 러닝 기록을 제출하면 스폰서가 1km당 1,000원을 지급하는 웹앱을 Next.js + Firebase로 구축한다.

**Architecture:** Next.js 14 App Router 기반 웹앱. API Routes에서 OpenAI Vision으로 이미지 추출, Firebase Admin SDK로 Firestore/Storage 조작. 관리자 인증은 httpOnly JWT 쿠키, 일반 사용자는 인증 없이 이름 선택으로 접근.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS, Firebase Firestore + Storage (Admin SDK), OpenAI GPT-4o Vision, jose (JWT), Vitest + @testing-library/react, Vercel

---

## 파일 구조

```
ildal-cheongeom/
├── app/
│   ├── layout.tsx                          # 루트 레이아웃
│   ├── page.tsx                            # 홈/리더보드
│   ├── submit/page.tsx                     # 기록 제출
│   ├── records/[runnerId]/page.tsx         # 내 기록
│   ├── admin/page.tsx                      # 관리자 화면
│   └── api/
│       ├── runners/route.ts                # GET 러너 목록 (공개)
│       ├── submissions/route.ts            # GET/POST 제출
│       ├── extract-run/route.ts            # POST AI 추출 + Storage 저장
│       └── admin/
│           ├── verify/route.ts             # POST 비밀번호 검증 + JWT 발급
│           ├── runners/route.ts            # POST 러너 추가
│           └── submissions/
│               ├── approve/route.ts        # POST 승인
│               └── reject/route.ts         # POST 거절
├── components/
│   ├── BudgetBar.tsx                       # 자본금 잔액 프로그레스 바
│   ├── RunnerBadge.tsx                     # 고등/대학 배지
│   ├── Leaderboard.tsx                     # 순위 테이블
│   ├── submit/
│   │   ├── RunnerSelect.tsx                # 러너 선택 드롭다운
│   │   ├── ImageUpload.tsx                 # 이미지 업로드 + 미리보기
│   │   ├── ExtractResult.tsx               # AI 추출 결과 + 수정
│   │   └── ManualForm.tsx                  # 수동 입력 폼
│   └── admin/
│       ├── AdminLogin.tsx                  # 비밀번호 입력
│       ├── RunnerList.tsx                  # 러너 명단 (선택 가능)
│       ├── SubmissionCard.tsx              # 기록 카드 (승인/거절/경고배지)
│       └── AddRunnerForm.tsx               # 러너 추가 폼
├── lib/
│   ├── firebase-client.ts                  # 클라이언트 Firestore/Storage
│   ├── firebase-admin.ts                   # Admin SDK (서버 전용)
│   ├── auth.ts                             # JWT 서명/검증 (jose)
│   ├── pace.ts                             # 페이스 계산 + 포맷 유틸
│   └── toss.ts                             # 토스 딥링크 생성
├── types/index.ts                          # Runner, Submission, Config 타입
├── .env.local                              # 환경변수 (gitignore)
├── .env.example                            # 환경변수 예시
├── firestore.rules                         # Firestore 보안 규칙
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## Task 0: 레포 생성 및 프로젝트 초기화

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `.env.example`

- [ ] **Step 1: GitHub에서 새 레포 생성**

  GitHub(https://github.com/new)에서 레포 이름 `ildal-cheongeom` 으로 생성 (Public 또는 Private).

- [ ] **Step 2: Next.js 14 앱 생성**

```bash
npx create-next-app@latest ildal-cheongeom \
  --typescript \
  --tailwind \
  --app \
  --src-dir=no \
  --import-alias="@/*"
cd ildal-cheongeom
```

- [ ] **Step 3: 의존성 설치**

```bash
npm install firebase firebase-admin openai jose
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 4: `.env.example` 작성**

```
# Firebase 클라이언트 (공개 가능)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (서버 전용, 절대 공개 금지)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# OpenAI
OPENAI_API_KEY=

# JWT 서명 키 (랜덤 32자 이상 문자열)
JWT_SECRET=

# 관리자 비밀번호 (배포 후 Firestore 콘솔에서 bcrypt 해시로 설정)
# Firestore settings/main.adminPassword 에 직접 저장
```

- [ ] **Step 5: `vitest.config.ts` 작성**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

- [ ] **Step 6: `vitest.setup.ts` 작성**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 7: `package.json`에 테스트 스크립트 추가**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 8: 초기 커밋**

```bash
git init
git remote add origin https://github.com/{username}/ildal-cheongeom.git
git add .
git commit -m "chore: Next.js 14 프로젝트 초기화"
git push -u origin main
```

---

## Task 1: 타입 정의 및 공통 유틸

**Files:**
- Create: `types/index.ts`
- Create: `lib/pace.ts`
- Create: `lib/toss.ts`
- Create: `lib/__tests__/pace.test.ts`
- Create: `lib/__tests__/toss.test.ts`

- [ ] **Step 1: `lib/__tests__/pace.test.ts` 작성 (실패 테스트)**

```ts
import { calcPace, formatDuration, formatPace, isSpeedValid } from '../pace'

describe('calcPace', () => {
  it('5km 30분 → 6.0 분/km', () => {
    expect(calcPace(5, 1800)).toBe(6.0)
  })
  it('1km 480초 → 8.0 분/km', () => {
    expect(calcPace(1, 480)).toBe(8.0)
  })
})

describe('formatDuration', () => {
  it('480초 → "8:00"', () => {
    expect(formatDuration(480)).toBe('8:00')
  })
  it('3661초 → "1:01:01"', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })
})

describe('formatPace', () => {
  it('6.5 → "6\'30\""', () => {
    expect(formatPace(6.5)).toBe("6'30\"")
  })
})

describe('isSpeedValid', () => {
  it('8분/km → true (기준 7~10)', () => {
    expect(isSpeedValid(8, 7, 10)).toBe(true)
  })
  it('6분/km → false (너무 빠름)', () => {
    expect(isSpeedValid(6, 7, 10)).toBe(false)
  })
  it('11분/km → false (너무 느림)', () => {
    expect(isSpeedValid(11, 7, 10)).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test
```
Expected: `pace` 모듈 없음 오류

- [ ] **Step 3: `lib/pace.ts` 구현**

```ts
export function calcPace(distanceKm: number, durationSec: number): number {
  const paceMin = durationSec / 60 / distanceKm
  return Math.round(paceMin * 100) / 100
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatPace(paceMinPerKm: number): string {
  const min = Math.floor(paceMinPerKm)
  const sec = Math.round((paceMinPerKm - min) * 60)
  return `${min}'${String(sec).padStart(2, '0')}"`
}

export function isSpeedValid(
  paceMinPerKm: number,
  minPace: number,
  maxPace: number
): boolean {
  return paceMinPerKm >= minPace && paceMinPerKm <= maxPace
}
```

- [ ] **Step 4: `lib/__tests__/toss.test.ts` 작성**

```ts
import { makeTossLink } from '../toss'

describe('makeTossLink', () => {
  it('tossId와 금액으로 링크 생성', () => {
    expect(makeTossLink('runner1', 5000)).toBe('https://toss.me/runner1/5000')
  })
  it('tossId 없으면 null 반환', () => {
    expect(makeTossLink('', 5000)).toBeNull()
    expect(makeTossLink(undefined, 5000)).toBeNull()
  })
})
```

- [ ] **Step 5: `lib/toss.ts` 구현**

```ts
export function makeTossLink(tossId: string | undefined, amount: number): string | null {
  if (!tossId) return null
  return `https://toss.me/${tossId}/${amount}`
}
```

- [ ] **Step 6: `types/index.ts` 작성**

```ts
export type RunnerGroup = 'highschool' | 'university'

export interface Runner {
  id: string
  name: string
  group: RunnerGroup
  tossId?: string
  totalKm: number
  totalAmount: number
  pendingAmount: number
}

export interface Submission {
  id: string
  runnerId: string
  runnerName: string
  imageUrl: string | null
  distanceKm: number
  durationSec: number
  paceMinPerKm: number
  submittedAt: string  // ISO 8601
  status: 'pending' | 'approved' | 'rejected'
  approvedAt: string | null
  amount: number
  memo?: string
}

export interface Config {
  totalBudget: number
  spentAmount: number
  adminPassword: string
  ratePerKm: number
  speedMinMinPerKm: number
  speedMaxMinPerKm: number
}

export interface ExtractedRun {
  distanceKm: number
  durationSec: number
  paceMinPerKm: number
}
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
npm test
```
Expected: 모든 테스트 PASS

- [ ] **Step 8: 커밋**

```bash
git add .
git commit -m "feat: 타입 정의 및 pace/toss 유틸 구현"
```

---

## Task 2: Firebase 연동

**Files:**
- Create: `lib/firebase-client.ts`
- Create: `lib/firebase-admin.ts`
- Create: `firestore.rules`

- [ ] **Step 1: Firebase 프로젝트 설정**

  1. [Firebase Console](https://console.firebase.google.com)에서 새 프로젝트 생성 (이름: `ildal-cheongeom`)
  2. Firestore Database 활성화 (프로덕션 모드)
  3. Storage 활성화
  4. 프로젝트 설정 → 웹 앱 추가 → 앱 설정 복사 → `.env.local`에 `NEXT_PUBLIC_FIREBASE_*` 입력
  5. 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → `.env.local`에 `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` 입력

- [ ] **Step 2: `lib/firebase-client.ts` 작성**

```ts
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const db = getFirestore(app)
```

- [ ] **Step 3: `lib/firebase-admin.ts` 작성**

```ts
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

export const adminDb = getFirestore()
export const adminStorage = getStorage()
```

- [ ] **Step 4: `firestore.rules` 작성**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 러너 목록 — 공개 읽기, 쓰기 금지 (Admin SDK만 가능)
    match /runners/{runnerId} {
      allow read: if true;
      allow write: if false;
    }
    // 제출 기록 — 공개 읽기, 쓰기 금지
    match /submissions/{submissionId} {
      allow read: if true;
      allow write: if false;
    }
    // 설정 — 읽기/쓰기 모두 금지 (Admin SDK만)
    match /settings/{document} {
      allow read: if false;
      allow write: if false;
    }
  }
}
```

- [ ] **Step 5: Firebase Console에서 보안 규칙 배포**

  Firebase Console → Firestore → 규칙 탭에 위 내용 붙여넣기 후 게시.

- [ ] **Step 6: Firebase Console에서 `settings/main` 문서 생성**

  Firestore Console → 컬렉션 추가 → `settings` → 문서 ID `main`:
  ```json
  {
    "totalBudget": 1000000,
    "spentAmount": 0,
    "adminPassword": "$2b$10$...",  // bcrypt 해시 (아래 Task 3에서 생성)
    "ratePerKm": 1000,
    "speedMinMinPerKm": 7,
    "speedMaxMinPerKm": 10
  }
  ```
  adminPassword는 Task 3 완료 후 채운다.

- [ ] **Step 7: 커밋**

```bash
git add .
git commit -m "feat: Firebase 클라이언트/Admin SDK 초기화, Firestore 보안 규칙"
```

---

## Task 3: 관리자 인증 API

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/admin/verify/route.ts`
- Create: `lib/__tests__/auth.test.ts`

- [ ] **Step 1: `lib/__tests__/auth.test.ts` 작성**

```ts
import { signAdminToken, verifyAdminToken } from '../auth'

describe('JWT 쿠키 서명 및 검증', () => {
  const secret = 'test-secret-key-32-chars-minimum!!'

  it('서명된 토큰을 검증할 수 있다', async () => {
    const token = await signAdminToken(secret)
    const result = await verifyAdminToken(token, secret)
    expect(result).toBe(true)
  })

  it('잘못된 토큰은 false 반환', async () => {
    const result = await verifyAdminToken('invalid.token.here', secret)
    expect(result).toBe(false)
  })

  it('다른 시크릿으로 서명한 토큰은 검증 실패', async () => {
    const token = await signAdminToken('other-secret-key-32-chars-minimum!')
    const result = await verifyAdminToken(token, secret)
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test lib/__tests__/auth.test.ts
```

- [ ] **Step 3: `lib/auth.ts` 구현**

```ts
import { SignJWT, jwtVerify } from 'jose'

const COOKIE_NAME = 'admin_token'
const TOKEN_TTL = '7d'

export async function signAdminToken(secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret)
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TOKEN_TTL)
    .sign(key)
}

export async function verifyAdminToken(token: string, secret: string): Promise<boolean> {
  try {
    const key = new TextEncoder().encode(secret)
    await jwtVerify(token, key)
    return true
  } catch {
    return false
  }
}

export { COOKIE_NAME }
```

- [ ] **Step 4: `app/api/admin/verify/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { signAdminToken, COOKIE_NAME } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: '비밀번호를 입력하세요.' }, { status: 400 })

  const configDoc = await adminDb.doc('settings/main').get()
  if (!configDoc.exists) return NextResponse.json({ error: '설정 없음' }, { status: 500 })

  const { adminPassword } = configDoc.data()!
  const match = await bcrypt.compare(password, adminPassword)
  if (!match) return NextResponse.json({ error: '비밀번호가 틀렸습니다.' }, { status: 401 })

  const token = await signAdminToken(process.env.JWT_SECRET!)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7일
    path: '/',
  })
  return res
}
```

- [ ] **Step 5: `bcryptjs` 설치**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 6: bcrypt 해시 생성 후 Firestore 업데이트**

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YOUR_PASSWORD', 10).then(h => console.log(h))"
```
출력된 해시를 Firebase Console → `settings/main.adminPassword`에 저장.

- [ ] **Step 7: 테스트 통과 확인**

```bash
npm test
```

- [ ] **Step 8: 관리자 인증 미들웨어 헬퍼 `lib/auth.ts`에 추가**

```ts
import { cookies } from 'next/headers'

export async function requireAdmin(): Promise<boolean> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyAdminToken(token, process.env.JWT_SECRET!)
}
```

- [ ] **Step 9: 커밋**

```bash
git add .
git commit -m "feat: 관리자 JWT 인증 (bcrypt 비밀번호 검증, httpOnly 쿠키)"
```

---

## Task 4: AI 이미지 추출 API

**Files:**
- Create: `app/api/extract-run/route.ts`
- Create: `lib/__tests__/extract-run.test.ts`

- [ ] **Step 1: `lib/__tests__/extract-run.test.ts` 작성 (파싱 로직 단위 테스트)**

```ts
import { parseExtractedJson } from '../../app/api/extract-run/parser'

describe('parseExtractedJson', () => {
  it('정상 JSON 파싱', () => {
    const input = JSON.stringify({ distanceKm: 5.2, durationSec: 2400, paceMinPerKm: 7.7 })
    const result = parseExtractedJson(input)
    expect(result).toEqual({ distanceKm: 5.2, durationSec: 2400, paceMinPerKm: 7.7 })
  })

  it('필수 필드 누락 시 null 반환', () => {
    const input = JSON.stringify({ distanceKm: 5.2 })
    expect(parseExtractedJson(input)).toBeNull()
  })

  it('잘못된 JSON은 null 반환', () => {
    expect(parseExtractedJson('not json')).toBeNull()
  })
})
```

- [ ] **Step 2: `app/api/extract-run/parser.ts` 구현**

```ts
import { ExtractedRun } from '@/types'

export function parseExtractedJson(raw: string): ExtractedRun | null {
  try {
    const data = JSON.parse(raw)
    if (
      typeof data.distanceKm !== 'number' ||
      typeof data.durationSec !== 'number' ||
      typeof data.paceMinPerKm !== 'number'
    ) return null
    return data as ExtractedRun
  } catch {
    return null
  }
}
```

- [ ] **Step 3: `app/api/extract-run/route.ts` 구현**

```ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { adminStorage } from '@/lib/firebase-admin'
import { parseExtractedJson } from './parser'
import { v4 as uuidv4 } from 'uuid'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const EXTRACT_PROMPT = `이 이미지는 러닝 앱(Strava, Nike Run Club, 삼성 헬스 등)의 운동 기록 화면입니다.
다음 정보를 JSON으로만 반환하세요. 다른 텍스트 없이 JSON만 출력하세요.
{
  "distanceKm": <숫자, km 단위>,
  "durationSec": <숫자, 초 단위>,
  "paceMinPerKm": <숫자, 분/km 단위>
}
정보를 확인할 수 없으면 해당 필드에 null을 넣으세요.`

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 })

  // 이미지 → base64
  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const mimeType = file.type || 'image/jpeg'

  // OpenAI Vision 추출
  let extracted = null
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: EXTRACT_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      }],
    })
    const content = response.choices[0].message.content ?? ''
    extracted = parseExtractedJson(content)
  } catch (e) {
    // 추출 실패 → fallback 안내
  }

  // Firebase Storage 저장
  const bucket = adminStorage.bucket()
  const filename = `submissions/${uuidv4()}.${file.name.split('.').pop() || 'jpg'}`
  const fileRef = bucket.file(filename)
  await fileRef.save(buffer, { contentType: mimeType })
  await fileRef.makePublic()
  const imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`

  return NextResponse.json({ extracted, imageUrl })
}
```

- [ ] **Step 4: uuid 설치**

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

- [ ] **Step 6: 커밋**

```bash
git add .
git commit -m "feat: AI 이미지 추출 API (GPT-4o Vision + Firebase Storage)"
```

---

## Task 5: 러너 및 제출 공개 API

**Files:**
- Create: `app/api/runners/route.ts`
- Create: `app/api/submissions/route.ts`

- [ ] **Step 1: `app/api/runners/route.ts` 작성**

```ts
import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'

export async function GET() {
  const snapshot = await adminDb.collection('runners').orderBy('name').get()
  const runners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  return NextResponse.json(runners)
}
```

- [ ] **Step 2: `app/api/submissions/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { calcPace } from '@/lib/pace'

// GET /api/submissions?runnerId=xxx
export async function GET(req: NextRequest) {
  const runnerId = req.nextUrl.searchParams.get('runnerId')
  let query = adminDb.collection('submissions').orderBy('submittedAt', 'desc')
  if (runnerId) query = query.where('runnerId', '==', runnerId) as typeof query
  const snapshot = await query.get()
  const submissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  return NextResponse.json(submissions)
}

// POST /api/submissions — 제출 생성
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { runnerId, runnerName, imageUrl, distanceKm, durationSec } = body

  if (!runnerId || !runnerName || !distanceKm || !durationSec) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  // 예산 소진 확인
  const configDoc = await adminDb.doc('settings/main').get()
  const config = configDoc.data()!
  if (config.spentAmount >= config.totalBudget) {
    return NextResponse.json({ error: '자본금이 소진되었습니다.' }, { status: 400 })
  }

  const paceMinPerKm = calcPace(distanceKm, durationSec)
  const amount = Math.floor(distanceKm) * config.ratePerKm

  const submissionRef = adminDb.collection('submissions').doc()
  const runnerRef = adminDb.doc(`runners/${runnerId}`)

  await adminDb.runTransaction(async (tx) => {
    tx.set(submissionRef, {
      runnerId, runnerName, imageUrl: imageUrl ?? null,
      distanceKm, durationSec, paceMinPerKm, amount,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      approvedAt: null,
    })
    tx.update(runnerRef, { pendingAmount: FieldValue.increment(amount) })
  })

  return NextResponse.json({ id: submissionRef.id, amount })
}
```

- [ ] **Step 3: 커밋**

```bash
git add .
git commit -m "feat: 러너 목록 조회 API, 제출 생성/조회 API"
```

---

## Task 6: 관리자 API (러너 추가, 승인, 거절)

**Files:**
- Create: `app/api/admin/runners/route.ts`
- Create: `app/api/admin/submissions/approve/route.ts`
- Create: `app/api/admin/submissions/reject/route.ts`

- [ ] **Step 1: `app/api/admin/runners/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  }
  const { name, group, tossId } = await req.json()
  if (!name || !group) return NextResponse.json({ error: '이름과 그룹은 필수입니다.' }, { status: 400 })
  if (!['highschool', 'university'].includes(group)) {
    return NextResponse.json({ error: '그룹은 highschool 또는 university' }, { status: 400 })
  }

  const ref = adminDb.collection('runners').doc()
  await ref.set({ name, group, tossId: tossId || '', totalKm: 0, totalAmount: 0, pendingAmount: 0 })
  return NextResponse.json({ id: ref.id })
}
```

- [ ] **Step 2: `app/api/admin/submissions/approve/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: '권한 없음' }, { status: 401 })

  const { submissionId } = await req.json()
  if (!submissionId) return NextResponse.json({ error: 'submissionId 필요' }, { status: 400 })

  const subRef = adminDb.doc(`submissions/${submissionId}`)
  const subDoc = await subRef.get()
  if (!subDoc.exists) return NextResponse.json({ error: '기록 없음' }, { status: 404 })

  const sub = subDoc.data()!
  if (sub.status !== 'pending') return NextResponse.json({ error: '대기 상태가 아님' }, { status: 400 })

  const runnerRef = adminDb.doc(`runners/${sub.runnerId}`)
  const configRef = adminDb.doc('settings/main')

  await adminDb.runTransaction(async (tx) => {
    tx.update(subRef, { status: 'approved', approvedAt: new Date().toISOString() })
    tx.update(runnerRef, {
      totalKm: FieldValue.increment(sub.distanceKm),
      totalAmount: FieldValue.increment(sub.amount),
      pendingAmount: FieldValue.increment(-sub.amount),
    })
    tx.update(configRef, { spentAmount: FieldValue.increment(sub.amount) })
  })

  return NextResponse.json({ ok: true, amount: sub.amount })
}
```

- [ ] **Step 3: `app/api/admin/submissions/reject/route.ts` 작성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: '권한 없음' }, { status: 401 })

  const { submissionId, memo } = await req.json()
  if (!submissionId) return NextResponse.json({ error: 'submissionId 필요' }, { status: 400 })

  const subRef = adminDb.doc(`submissions/${submissionId}`)
  const subDoc = await subRef.get()
  if (!subDoc.exists) return NextResponse.json({ error: '기록 없음' }, { status: 404 })

  const sub = subDoc.data()!
  if (sub.status !== 'pending') return NextResponse.json({ error: '대기 상태가 아님' }, { status: 400 })

  const runnerRef = adminDb.doc(`runners/${sub.runnerId}`)

  await adminDb.runTransaction(async (tx) => {
    tx.update(subRef, { status: 'rejected', memo: memo || '' })
    tx.update(runnerRef, { pendingAmount: FieldValue.increment(-sub.amount) })
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 커밋**

```bash
git add .
git commit -m "feat: 관리자 API (러너 추가, 기록 승인/거절) — Firestore 트랜잭션"
```

---

## Task 7: 공통 UI 컴포넌트

**Files:**
- Create: `components/BudgetBar.tsx`
- Create: `components/RunnerBadge.tsx`
- Create: `components/Leaderboard.tsx`

- [ ] **Step 1: `components/RunnerBadge.tsx` 작성**

```tsx
import { RunnerGroup } from '@/types'

const GROUP_LABELS: Record<RunnerGroup, string> = {
  highschool: '고등',
  university: '대학',
}
const GROUP_COLORS: Record<RunnerGroup, string> = {
  highschool: 'bg-blue-100 text-blue-700',
  university: 'bg-purple-100 text-purple-700',
}

export function RunnerBadge({ group }: { group: RunnerGroup }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${GROUP_COLORS[group]}`}>
      {GROUP_LABELS[group]}
    </span>
  )
}
```

- [ ] **Step 2: `components/BudgetBar.tsx` 작성**

```tsx
export function BudgetBar({ total, spent }: { total: number; spent: number }) {
  const remaining = total - spent
  const pct = Math.min(100, (spent / total) * 100)
  const isOver = spent >= total

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-600">자본금 잔액</span>
        <span className={`text-lg font-bold ${isOver ? 'text-red-500' : 'text-green-600'}`}>
          {remaining.toLocaleString()}원
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${isOver ? 'bg-red-400' : 'bg-green-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>지급: {spent.toLocaleString()}원</span>
        <span>총: {total.toLocaleString()}원</span>
      </div>
      {isOver && (
        <p className="text-xs text-red-500 mt-1 font-medium">⚠️ 자본금이 소진되었습니다. 새 제출이 차단됩니다.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `components/Leaderboard.tsx` 작성**

```tsx
import { Runner } from '@/types'
import { RunnerBadge } from './RunnerBadge'
import Link from 'next/link'

export function Leaderboard({ runners }: { runners: Runner[] }) {
  const sorted = [...runners].sort((a, b) => b.totalAmount - a.totalAmount)
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-3 text-left">순위</th>
            <th className="px-4 py-3 text-left">러너</th>
            <th className="px-4 py-3 text-right">km</th>
            <th className="px-4 py-3 text-right">획득 금액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((runner, i) => (
            <tr key={runner.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-sm font-bold text-gray-500">{i + 1}</td>
              <td className="px-4 py-3">
                <Link href={`/records/${runner.id}`} className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{runner.name}</span>
                  <RunnerBadge group={runner.group} />
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-sm text-gray-600">
                {runner.totalKm.toFixed(1)} km
              </td>
              <td className="px-4 py-3 text-right font-semibold text-green-600">
                {runner.totalAmount.toLocaleString()}원
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">아직 기록이 없습니다</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: 커밋**

```bash
git add .
git commit -m "feat: 공통 UI 컴포넌트 (BudgetBar, RunnerBadge, Leaderboard)"
```

---

## Task 8: 홈/리더보드 화면

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: `app/layout.tsx` 수정**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '일달천금',
  description: '천원길도 1킬로부터',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg text-gray-900">🏃 일달천금</Link>
            <Link
              href="/submit"
              className="bg-green-500 text-white text-sm px-4 py-1.5 rounded-full font-medium hover:bg-green-600 transition-colors"
            >
              기록 제출
            </Link>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: `app/page.tsx` 작성**

```tsx
import { BudgetBar } from '@/components/BudgetBar'
import { Leaderboard } from '@/components/Leaderboard'
import { Runner, Config } from '@/types'
import { adminDb } from '@/lib/firebase-admin'

async function getData(): Promise<{ runners: Runner[]; config: Config }> {
  const [runnersSnap, configDoc] = await Promise.all([
    adminDb.collection('runners').get(),
    adminDb.doc('settings/main').get(),
  ])
  const runners = runnersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Runner))
  const config = configDoc.data() as Config
  return { runners, config }
}

export default async function HomePage() {
  const { runners, config } = await getData()
  return (
    <>
      <BudgetBar total={config.totalBudget} spent={config.spentAmount} />
      <h2 className="text-base font-semibold text-gray-700">리더보드</h2>
      <Leaderboard runners={runners} />
    </>
  )
}
```

- [ ] **Step 3: 로컬에서 확인**

```bash
npm run dev
# http://localhost:3000 에서 리더보드 확인
```

- [ ] **Step 4: 커밋**

```bash
git add .
git commit -m "feat: 홈/리더보드 화면 (서버 컴포넌트, BudgetBar + Leaderboard)"
```

---

## Task 9: 기록 제출 화면

**Files:**
- Create: `components/submit/RunnerSelect.tsx`
- Create: `components/submit/ImageUpload.tsx`
- Create: `components/submit/ExtractResult.tsx`
- Create: `components/submit/ManualForm.tsx`
- Create: `app/submit/page.tsx`

- [ ] **Step 1: `components/submit/RunnerSelect.tsx` 작성**

```tsx
'use client'
import { Runner } from '@/types'

export function RunnerSelect({
  runners, value, onChange
}: { runners: Runner[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">내 이름 선택</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
      >
        <option value="">-- 선택하세요 --</option>
        {runners.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 2: `components/submit/ImageUpload.tsx` 작성**

```tsx
'use client'
import { useRef } from 'react'

export function ImageUpload({
  onFile, preview
}: { onFile: (file: File) => void; preview: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">러닝 기록 스크린샷</label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 text-sm hover:border-green-400 transition-colors"
      >
        {preview ? (
          <img src={preview} alt="업로드 이미지" className="max-h-48 mx-auto rounded-lg" />
        ) : (
          <span>📸 탭하여 사진 선택</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}
```

- [ ] **Step 3: `components/submit/ExtractResult.tsx` 작성**

```tsx
'use client'
import { ExtractedRun } from '@/types'
import { formatDuration, formatPace } from '@/lib/pace'

export function ExtractResult({
  data, onConfirm, onManual
}: {
  data: ExtractedRun
  onConfirm: () => void
  onManual: () => void
}) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-green-800">✅ AI 추출 결과</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white rounded-lg p-2">
          <p className="text-xs text-gray-500">거리</p>
          <p className="font-bold text-gray-900">{data.distanceKm.toFixed(2)} km</p>
        </div>
        <div className="bg-white rounded-lg p-2">
          <p className="text-xs text-gray-500">시간</p>
          <p className="font-bold text-gray-900">{formatDuration(data.durationSec)}</p>
        </div>
        <div className="bg-white rounded-lg p-2">
          <p className="text-xs text-gray-500">페이스</p>
          <p className="font-bold text-gray-900">{formatPace(data.paceMinPerKm)}/km</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="flex-1 bg-green-500 text-white py-2 rounded-lg text-sm font-medium">
          이대로 제출
        </button>
        <button onClick={onManual} className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm">
          직접 수정
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `components/submit/ManualForm.tsx` 작성**

```tsx
'use client'
import { useState } from 'react'
import { calcPace } from '@/lib/pace'
import { ExtractedRun } from '@/types'

export function ManualForm({ onSubmit }: { onSubmit: (data: ExtractedRun) => void }) {
  const [distanceKm, setDistanceKm] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')

  const handleSubmit = () => {
    const dist = parseFloat(distanceKm)
    const min = parseInt(minutes || '0')
    const sec = parseInt(seconds || '0')
    if (!dist || (!min && !sec)) return
    const durationSec = min * 60 + sec
    const paceMinPerKm = calcPace(dist, durationSec)
    onSubmit({ distanceKm: dist, durationSec, paceMinPerKm })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">직접 입력</p>
      <div>
        <label className="text-xs text-gray-500">거리 (km) *</label>
        <input type="number" step="0.01" value={distanceKm} onChange={e => setDistanceKm(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="5.0" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500">분 *</label>
          <input type="number" value={minutes} onChange={e => setMinutes(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="30" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500">초 *</label>
          <input type="number" value={seconds} onChange={e => setSeconds(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="0" />
        </div>
      </div>
      <button onClick={handleSubmit} className="w-full bg-gray-700 text-white py-2 rounded-lg text-sm font-medium">
        입력 완료
      </button>
    </div>
  )
}
```

- [ ] **Step 5: `app/submit/page.tsx` 작성**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Runner, ExtractedRun } from '@/types'
import { RunnerSelect } from '@/components/submit/RunnerSelect'
import { ImageUpload } from '@/components/submit/ImageUpload'
import { ExtractResult } from '@/components/submit/ExtractResult'
import { ManualForm } from '@/components/submit/ManualForm'
import { isSpeedValid } from '@/lib/pace'

type Step = 'select' | 'upload' | 'review' | 'manual' | 'submitting' | 'done'

export default function SubmitPage() {
  const router = useRouter()
  const [runners, setRunners] = useState<Runner[]>([])
  const [runnerId, setRunnerId] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedRun | null>(null)
  const [step, setStep] = useState<Step>('select')
  const [error, setError] = useState('')
  const [speedWarning, setSpeedWarning] = useState(false)

  useEffect(() => {
    fetch('/api/runners').then(r => r.json()).then(setRunners)
  }, [])

  const handleImage = async (file: File) => {
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setStep('upload')

    const formData = new FormData()
    formData.append('image', file)
    const res = await fetch('/api/extract-run', { method: 'POST', body: formData })
    const data = await res.json()
    setImageUrl(data.imageUrl)

    if (data.extracted) {
      setExtracted(data.extracted)
      // 속도 기준 체크 (7~10분/km)
      setSpeedWarning(!isSpeedValid(data.extracted.paceMinPerKm, 7, 10))
      setStep('review')
    } else {
      setStep('manual')
    }
  }

  const handleManual = (data: ExtractedRun) => {
    setExtracted(data)
    setSpeedWarning(!isSpeedValid(data.paceMinPerKm, 7, 10))
    setStep('review')
  }

  const handleSubmit = async () => {
    if (!runnerId || !extracted) return
    const runner = runners.find(r => r.id === runnerId)
    setStep('submitting')

    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runnerId,
        runnerName: runner?.name ?? '',
        imageUrl,
        ...extracted,
      }),
    })
    if (res.ok) {
      setStep('done')
    } else {
      const { error } = await res.json()
      setError(error)
      setStep('review')
    }
  }

  if (step === 'done') {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-5xl">🎉</p>
        <p className="text-xl font-bold">제출 완료!</p>
        <p className="text-gray-500 text-sm">스폰서 승인 후 금액이 확정됩니다.</p>
        <button onClick={() => router.push('/')} className="bg-green-500 text-white px-6 py-2 rounded-full text-sm font-medium">
          리더보드 보기
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">달리기 기록 제출</h1>

      <RunnerSelect runners={runners} value={runnerId} onChange={v => { setRunnerId(v); setStep('upload') }} />

      {runnerId && (
        <ImageUpload onFile={handleImage} preview={imagePreview} />
      )}

      {step === 'upload' && (
        <div className="text-center text-sm text-gray-500 animate-pulse">AI가 기록을 분석 중입니다...</div>
      )}

      {step === 'manual' && (
        <ManualForm onSubmit={handleManual} />
      )}

      {step === 'review' && extracted && (
        <>
          {speedWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              ⚠️ 기준 속도(7~10분/km)를 벗어났습니다. 제출은 가능하지만 스폰서가 거절할 수 있습니다.
            </div>
          )}
          <ExtractResult
            data={extracted}
            onConfirm={handleSubmit}
            onManual={() => setStep('manual')}
          />
        </>
      )}

      {step === 'submitting' && (
        <div className="text-center text-sm text-gray-500">제출 중...</div>
      )}

      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: 로컬에서 제출 플로우 확인**

```bash
npm run dev
# http://localhost:3000/submit 에서 전체 플로우 확인
```

- [ ] **Step 7: 커밋**

```bash
git add .
git commit -m "feat: 기록 제출 화면 (이미지 업로드 + AI 추출 + 수동 입력 fallback)"
```

---

## Task 10: 내 기록 화면

**Files:**
- Create: `app/records/[runnerId]/page.tsx`

- [ ] **Step 1: `app/records/[runnerId]/page.tsx` 작성**

```tsx
import { adminDb } from '@/lib/firebase-admin'
import { Runner, Submission } from '@/types'
import { RunnerBadge } from '@/components/RunnerBadge'
import { formatDuration, formatPace } from '@/lib/pace'
import { notFound } from 'next/navigation'
import Link from 'next/link'

const STATUS_LABEL = {
  pending: '⏳ 대기',
  approved: '✅ 승인',
  rejected: '❌ 거절',
}
const STATUS_COLOR = {
  pending: 'text-yellow-600 bg-yellow-50',
  approved: 'text-green-600 bg-green-50',
  rejected: 'text-red-500 bg-red-50',
}

export default async function RecordsPage({ params }: { params: { runnerId: string } }) {
  const runnerDoc = await adminDb.doc(`runners/${params.runnerId}`).get()
  if (!runnerDoc.exists) notFound()
  const runner = { id: runnerDoc.id, ...runnerDoc.data() } as Runner

  const subsSnap = await adminDb.collection('submissions')
    .where('runnerId', '==', params.runnerId)
    .orderBy('submittedAt', 'desc')
    .get()
  const submissions = subsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Submission))
  const approvedTotal = submissions
    .filter(s => s.status === 'approved')
    .reduce((sum, s) => sum + s.amount, 0)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{runner.name}</h1>
            <RunnerBadge group={runner.group} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            총 {runner.totalKm.toFixed(1)} km · {approvedTotal.toLocaleString()}원 획득
          </p>
        </div>
        <Link href="/" className="text-sm text-green-600 font-medium">리더보드</Link>
      </div>

      <div className="space-y-2">
        {submissions.map(sub => (
          <div key={sub.id} className="bg-white rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {new Date(sub.submittedAt).toLocaleDateString('ko-KR')}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[sub.status]}`}>
                {STATUS_LABEL[sub.status]}
              </span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="font-semibold">{sub.distanceKm.toFixed(2)} km</span>
              <span className="text-gray-500">{formatDuration(sub.durationSec)}</span>
              <span className="text-gray-500">{formatPace(sub.paceMinPerKm)}/km</span>
            </div>
            {sub.status === 'approved' && (
              <p className="text-green-600 font-bold text-sm">+{sub.amount.toLocaleString()}원</p>
            )}
            {sub.status === 'rejected' && sub.memo && (
              <p className="text-red-400 text-xs">사유: {sub.memo}</p>
            )}
            {sub.imageUrl && (
              <a href={sub.imageUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-500 underline">인증 사진 보기</a>
            )}
          </div>
        ))}
        {submissions.length === 0 && (
          <div className="text-center py-8 text-gray-400">아직 제출한 기록이 없습니다</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add .
git commit -m "feat: 내 기록 화면 (러너별 제출 기록, 승인/거절 상태)"
```

---

## Task 11: 관리자 화면

**Files:**
- Create: `components/admin/AdminLogin.tsx`
- Create: `components/admin/RunnerList.tsx`
- Create: `components/admin/SubmissionCard.tsx`
- Create: `components/admin/AddRunnerForm.tsx`
- Create: `app/admin/page.tsx`

- [ ] **Step 1: `components/admin/AdminLogin.tsx` 작성**

```tsx
'use client'
import { useState } from 'react'

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    if (res.ok) {
      onLogin()
    } else {
      const data = await res.json()
      setError(data.error)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-xl font-bold">관리자 로그인</h1>
      <input
        type="password" value={pw} onChange={e => setPw(e.target.value)}
        placeholder="비밀번호" autoFocus
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {loading ? '확인 중...' : '로그인'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: `components/admin/AddRunnerForm.tsx` 작성**

```tsx
'use client'
import { useState } from 'react'

export function AddRunnerForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [group, setGroup] = useState<'highschool' | 'university'>('highschool')
  const [tossId, setTossId] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    setLoading(true)
    await fetch('/api/admin/runners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, group, tossId }),
    })
    setName(''); setTossId(''); setLoading(false)
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-700">러너 추가</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="이름 *"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      <select value={group} onChange={e => setGroup(e.target.value as typeof group)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <option value="highschool">고등학교 친구</option>
        <option value="university">대학교 친구</option>
      </select>
      <input value={tossId} onChange={e => setTossId(e.target.value)} placeholder="토스 아이디 (선택)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      <button type="submit" disabled={loading}
        className="w-full bg-green-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {loading ? '추가 중...' : '추가'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: `components/admin/SubmissionCard.tsx` 작성**

```tsx
'use client'
import { Submission } from '@/types'
import { formatDuration, formatPace, isSpeedValid } from '@/lib/pace'
import { makeTossLink } from '@/lib/toss'

export function SubmissionCard({
  submission, tossId, onApprove, onReject, speedMin, speedMax
}: {
  submission: Submission
  tossId?: string
  onApprove: () => void
  onReject: (memo: string) => void
  speedMin: number
  speedMax: number
}) {
  const outOfRange = !isSpeedValid(submission.paceMinPerKm, speedMin, speedMax)
  const tossLink = makeTossLink(tossId, submission.amount)

  const handleReject = () => {
    const memo = window.prompt('거절 사유 (선택):') ?? ''
    onReject(memo)
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {new Date(submission.submittedAt).toLocaleString('ko-KR')}
        </span>
        {outOfRange && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
            ⚠️ 속도 기준 외
          </span>
        )}
      </div>
      <div className="flex gap-4 text-sm font-medium">
        <span>{submission.distanceKm.toFixed(2)} km</span>
        <span className="text-gray-500">{formatDuration(submission.durationSec)}</span>
        <span className="text-gray-500">{formatPace(submission.paceMinPerKm)}/km</span>
        <span className="text-green-600 ml-auto font-bold">{submission.amount.toLocaleString()}원</span>
      </div>
      {submission.imageUrl && (
        <a href={submission.imageUrl} target="_blank" rel="noopener noreferrer"
          className="block text-xs text-blue-500 underline">인증 사진 보기</a>
      )}
      {submission.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={onApprove}
            className="flex-1 bg-green-500 text-white py-2 rounded-lg text-sm font-medium">
            승인
          </button>
          <button onClick={handleReject}
            className="flex-1 border border-red-300 text-red-500 py-2 rounded-lg text-sm">
            거절
          </button>
        </div>
      )}
      {submission.status === 'approved' && tossLink && (
        <a href={tossLink} target="_blank" rel="noopener noreferrer"
          className="block w-full text-center bg-blue-500 text-white py-2 rounded-lg text-sm font-medium">
          💸 토스로 {submission.amount.toLocaleString()}원 송금
        </a>
      )}
      {submission.status === 'approved' && !tossLink && (
        <p className="text-xs text-gray-400 text-center">토스 아이디 미등록 — 직접 송금하세요</p>
      )}
      {submission.status === 'rejected' && (
        <p className="text-xs text-gray-400">거절됨 {submission.memo ? `— ${submission.memo}` : ''}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `app/admin/page.tsx` 작성**

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { Runner, Submission, Config } from '@/types'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { AddRunnerForm } from '@/components/admin/AddRunnerForm'
import { SubmissionCard } from '@/components/admin/SubmissionCard'
import { RunnerBadge } from '@/components/RunnerBadge'
import { BudgetBar } from '@/components/BudgetBar'

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [runners, setRunners] = useState<Runner[]>([])
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const loadRunners = useCallback(async () => {
    const res = await fetch('/api/runners')
    setRunners(await res.json())
  }, [])

  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/config')
    if (res.ok) setConfig(await res.json())
  }, [])

  const loadSubmissions = useCallback(async (runnerId: string) => {
    const res = await fetch(`/api/submissions?runnerId=${runnerId}`)
    setSubmissions(await res.json())
  }, [])

  useEffect(() => {
    if (authed) { loadRunners(); loadConfig() }
  }, [authed, loadRunners, loadConfig])

  useEffect(() => {
    if (selectedRunner) loadSubmissions(selectedRunner.id)
  }, [selectedRunner, loadSubmissions])

  const handleApprove = async (submissionId: string) => {
    await fetch('/api/admin/submissions/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId }),
    })
    if (selectedRunner) loadSubmissions(selectedRunner.id)
    loadRunners(); loadConfig()
  }

  const handleReject = async (submissionId: string, memo: string) => {
    await fetch('/api/admin/submissions/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, memo }),
    })
    if (selectedRunner) loadSubmissions(selectedRunner.id)
    loadRunners()
  }

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />

  const pendingSubmissions = submissions.filter(s => s.status === 'pending')
  const otherSubmissions = submissions.filter(s => s.status !== 'pending')
  const isOverBudget = config && config.spentAmount >= config.totalBudget

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">관리자</h1>
        <button onClick={() => setShowAddForm(v => !v)} className="text-sm text-green-600 font-medium">
          {showAddForm ? '접기' : '+ 러너 추가'}
        </button>
      </div>

      {config && <BudgetBar total={config.totalBudget} spent={config.spentAmount} />}
      {isOverBudget && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠️ 예산이 소진되었습니다. 기존 대기 기록 승인은 가능하나 초과됩니다.
        </div>
      )}

      {showAddForm && (
        <AddRunnerForm onAdded={() => { loadRunners(); setShowAddForm(false) }} />
      )}

      {/* 러너 명단 */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">러너 명단</p>
        <div className="grid grid-cols-2 gap-2">
          {runners.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRunner(r)}
              className={`p-3 rounded-xl text-left border transition-colors ${
                selectedRunner?.id === r.id
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="font-medium text-sm">{r.name}</span>
                <RunnerBadge group={r.group} />
              </div>
              {r.pendingAmount > 0 && (
                <span className="text-xs text-yellow-600">대기 {r.pendingAmount.toLocaleString()}원</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 선택된 러너의 기록 */}
      {selectedRunner && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">{selectedRunner.name}의 기록</p>
          {pendingSubmissions.length === 0 && otherSubmissions.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">기록이 없습니다</p>
          )}
          {pendingSubmissions.map(sub => (
            <SubmissionCard
              key={sub.id}
              submission={sub}
              tossId={selectedRunner.tossId}
              onApprove={() => handleApprove(sub.id)}
              onReject={(memo) => handleReject(sub.id, memo)}
              speedMin={config?.speedMinMinPerKm ?? 7}
              speedMax={config?.speedMaxMinPerKm ?? 10}
            />
          ))}
          {otherSubmissions.map(sub => (
            <SubmissionCard
              key={sub.id}
              submission={sub}
              tossId={selectedRunner.tossId}
              onApprove={() => handleApprove(sub.id)}
              onReject={(memo) => handleReject(sub.id, memo)}
              speedMin={config?.speedMinMinPerKm ?? 7}
              speedMax={config?.speedMaxMinPerKm ?? 10}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: `app/api/config/route.ts` 작성 (관리자 전용 config 조회)**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  const doc = await adminDb.doc('settings/main').get()
  const data = doc.data()!
  // adminPassword 제외하고 반환
  const { adminPassword, ...safeConfig } = data
  return NextResponse.json(safeConfig)
}
```

- [ ] **Step 6: 커밋**

```bash
git add .
git commit -m "feat: 관리자 화면 (러너 명단, 기록 승인/거절, 토스 딥링크)"
```

---

## Task 12: 배포 설정

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: `next.config.ts` 확인**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    domains: ['storage.googleapis.com'],
  },
}

export default nextConfig
```

- [ ] **Step 2: Vercel 배포**

  1. [vercel.com](https://vercel.com)에서 GitHub 레포 연결
  2. 환경변수 설정: `.env.example`의 모든 키를 Vercel 대시보드 → Settings → Environment Variables에 입력
  3. `FIREBASE_PRIVATE_KEY`는 따옴표 포함하여 그대로 붙여넣기
  4. 배포 트리거 후 결과 URL 확인

- [ ] **Step 3: Firebase Storage CORS 설정 (모바일 업로드를 위해)**

  `cors.json` 파일 생성:
  ```json
  [{"origin": ["*"], "method": ["GET", "POST"], "maxAgeSeconds": 3600}]
  ```
  ```bash
  gsutil cors set cors.json gs://{YOUR_STORAGE_BUCKET}
  ```

- [ ] **Step 4: 최종 확인 체크리스트**

  - [ ] 리더보드 표시
  - [ ] 기록 제출 (AI 추출)
  - [ ] 기록 제출 (수동 입력)
  - [ ] 관리자 로그인
  - [ ] 기록 승인 + 토스 딥링크 이동
  - [ ] 기록 거절
  - [ ] 예산 소진 시 제출 차단

- [ ] **Step 5: 최종 커밋**

```bash
git add .
git commit -m "chore: Vercel 배포 설정, Storage CORS"
```

---

## 환경변수 설정 요약

| 변수 | 출처 |
|------|------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Console → 프로젝트 설정 → 웹 앱 |
| `FIREBASE_PROJECT_ID` | Firebase Console → 프로젝트 설정 |
| `FIREBASE_CLIENT_EMAIL` | Firebase Console → 서비스 계정 |
| `FIREBASE_PRIVATE_KEY` | Firebase Console → 서비스 계정 → 새 키 생성 |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |
| `JWT_SECRET` | `openssl rand -base64 32` 로 생성 |
