# AI Smart Browser — Hybrid Edition

একটি নতুন Electron desktop source project: বাম পাশে AI assistant, ডান পাশে Chrome-style browser।

## কী আছে
- Split-screen AI chat + embedded browser
- Address bar, back, forward, reload, quick links
- OpenAI অথবা Gemini API দিয়ে AI chat
- AI-এর browser action proposal; চালানোর আগে user approval
- Navigate, Google search, page scroll, visible page text extract
- বাংলা voice-to-text (কম্পিউটারের speech recognition সমর্থন সাপেক্ষে)
- Local task list এবং activity history
- Local persistent browser session (`persist:smart-browser`)

## যা এখনো production feature নয়
- Scheduled Tasks এখন সংরক্ষণ হয়; নির্ধারিত সময়ে নিজে থেকে চালানোর scheduler এই MVP-তে নেই।
- একাধিক tab-এর UI placeholder আছে; পূর্ণ tab lifecycle / tab switching পরবর্তী ধাপ।
- Voice input Speech Recognition API-এর ওপর নির্ভর করে; সব OS/ভাষায় সমানভাবে কাজ নাও করতে পারে।
- AI-এর API ব্যবহার করতে API key ও ইন্টারনেট প্রয়োজন।
- ওয়েবসাইটের login, CAPTCHA, MFA বা security restrictions বাইপাস করার ব্যবস্থা নেই।
- AI স্বয়ংক্রিয়ভাবে purchase, payment, message send বা destructive action করে না।

## Windows-এ চালানোর নিয়ম

### 1. প্রয়োজনীয় সফটওয়্যার
- Node.js LTS (https://nodejs.org/)
- Windows 10/11
- Internet connection

### 2. ZIP Extract
ZIP ফাইলের ওপর Right-click → Extract All… → একটি folder নির্বাচন করুন।

### 3. Terminal খুলুন
Extract করা `AI-Smart-Browser-Hybrid` folder খুলে address bar-এ `cmd` লিখে Enter চাপুন।
অথবা VS Code → File → Open Folder → Terminal → New Terminal।

### 4. Dependency install
```bash
npm install
```

### 5. API key যোগ করুন
`.env.example` ফাইল কপি করে একই folder-এ `.env` নামে রাখুন।

OpenAI ব্যবহার করলে:
```env
AI_PROVIDER=openai
OPENAI_API_KEY=আপনার_API_KEY
OPENAI_MODEL=gpt-4o-mini
```

Gemini ব্যবহার করলে:
```env
AI_PROVIDER=gemini
GEMINI_API_KEY=আপনার_API_KEY
GEMINI_MODEL=gemini-2.0-flash
```

API key কাউকে দেবেন না এবং GitHub-এ `.env` upload করবেন না। API usage অনুযায়ী provider-এর খরচ হতে পারে।

### 6. অ্যাপ চালু
```bash
npm start
```

## Windows installer তৈরি
```bash
npm run dist
```
সফল হলে `release` folder-এ installer তৈরি হবে। প্রথমবার build করতে internet লাগবে।

## ব্যবহার
1. ডান পাশের address bar-এ ওয়েবসাইট লিখে Go চাপুন।
2. বাম পাশের Chat-এ বাংলায় নির্দেশ দিন।
3. AI যদি browser action প্রস্তাব করে, `Review & approve` চাপুন।
4. প্রস্তাবটি দেখে `Approve & run` দিলে কাজটি চলবে।
5. Tasks-এ task সংরক্ষণ এবং History-তে কার্যক্রম দেখুন।

## নিরাপত্তা
- পরিচিত/বিশ্বস্ত ওয়েবসাইট ব্যবহার করুন।
- AI-কে password, OTP, recovery code বা payment details দেবেন না।
- লগইন করা অবস্থায় অচেনা ওয়েবসাইটে automation চালাবেন না।
- AI action চালানোর আগে প্রস্তাবটি যাচাই করুন।
