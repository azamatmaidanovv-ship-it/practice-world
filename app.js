/* =========================================================
   Practice World — қосымша логикасы
   Деректер localStorage-те сақталады (сервер қажет емес).
   ========================================================= */
"use strict";

const STORE = {
  users: "pw_users_v1",
  session: "pw_session_v1",
  results: "pw_results_v1",
  theme: "pw_theme_v1"
};

const TEST_SIZE = 50;
const SECONDS_PER_QUESTION = 60;

const GROUPS = [
  { id: "all", name: "Барлығы" },
  { id: "stem", name: "Нақты ғылымдар" },
  { id: "hum", name: "Гуманитарлық" },
  { id: "lang", name: "Тілдер" }
];

const MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым",
  "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];

const state = {
  user: null,
  screen: "auth",
  authTab: "login",
  filter: "all",
  quiz: null,
  lastResult: null
};

/* ------------------------- көмекшілер ------------------------- */

const $ = (sel) => document.querySelector(sel);

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

/* -------------------------- тақырып -------------------------- */

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function toggleTheme() {
  const next = currentTheme() === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  writeStore(STORE.theme, next);
  const label = next === "light" ? "Қараңғы тақырыпқа ауысу" : "Ашық тақырыпқа ауысу";
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.setAttribute("title", label);
    btn.setAttribute("aria-label", label);
  });
}

function themeButton(extraClass) {
  const label = currentTheme() === "light" ? "Қараңғы тақырыпқа ауысу" : "Ашық тақырыпқа ауысу";
  return `
    <button class="icon-btn theme-btn ${extraClass || ""}" data-theme-toggle title="${label}" aria-label="${label}">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
      </svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </button>`;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function fmtTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() +
    ", " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("");
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function hashPassword(password, salt) {
  const input = salt + "::" + password + "::practice-world";
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return h1.toString(36) + "." + h2.toString(36) + "." + input.length.toString(36);
}

function totalQuestionCount() {
  return SUBJECTS.reduce((sum, subject) => sum + subject.questions.length, 0);
}

let toastTimer = null;
function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ------------------------- аккаунттар ------------------------- */

function getUsers() {
  return readStore(STORE.users, []);
}

function saveUsers(users) {
  writeStore(STORE.users, users);
}

function getResults(userId) {
  const all = readStore(STORE.results, {});
  return all[userId] || [];
}

function addResult(userId, result) {
  const all = readStore(STORE.results, {});
  const list = all[userId] || [];
  list.unshift(result);
  all[userId] = list.slice(0, 300);
  writeStore(STORE.results, all);
}

function clearResults(userId) {
  const all = readStore(STORE.results, {});
  delete all[userId];
  writeStore(STORE.results, all);
}

/* -------------------------- header -------------------------- */

function header(active) {
  const user = state.user;
  if (!user) return "";
  const links = [
    { id: "subjects", label: "Пәндер" },
    { id: "leaderboard", label: "Рейтинг" },
    { id: "profile", label: "Профиль" }
  ];
  return `
    <header class="topbar">
      <div class="topbar-inner">
        <button class="brand" data-nav="subjects" aria-label="Басты бет">
          <span class="brand-mark">PW</span>
          <span class="brand-name">Practice World</span>
        </button>
        <nav class="nav">
          ${links.map((link) => `
            <button class="nav-link ${active === link.id ? "active" : ""}" data-nav="${link.id}">${link.label}</button>
          `).join("")}
        </nav>
        ${themeButton()}
        <div class="user-chip">
          <span class="avatar">${esc(initials(user.name))}</span>
          <span class="user-name">${esc(user.name)}</span>
          <button class="icon-btn" data-logout title="Аккаунттан шығу" aria-label="Аккаунттан шығу">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </header>`;
}

/* --------------------------- auth --------------------------- */

function authView() {
  const isRegister = state.authTab === "register";
  return `
    <div class="auth-shell">
      ${themeButton("auth-theme")}
      <section class="hero">
        <div class="brand">
          <span class="brand-mark">PW</span>
          <span class="brand-name">Practice World</span>
        </div>
        <span class="badge">✦ ҰБТ-ға дайындық платформасы</span>
        <h1>Біліміңді <span class="grad">шыңда</span>,<br>арманыңа жет.</h1>
        <p class="hero-sub">
          Мектеп пәндері бойынша ҰБТ сұрақтары, нақты уақыттағы таймер,
          әр жауаптың талдауы және жеке рейтинг — бәрі бір платформада.
        </p>
        <ul class="hero-list">
          <li><span class="tick">✓</span> 12 мектеп пәні — математикадан бастап тарихқа дейін</li>
          <li><span class="tick">✓</span> Әр тестте 50 сұрақ және 50 минут уақыт</li>
          <li><span class="tick">✓</span> Нәтижелер мен қателерді толық талдау</li>
        </ul>
        <div class="hero-stats">
          <div>
            <div class="stat-num grad">${totalQuestionCount()}</div>
            <div class="stat-label">тест сұрағы</div>
          </div>
          <div>
            <div class="stat-num grad">${SUBJECTS.length}</div>
            <div class="stat-label">мектеп пәні</div>
          </div>
          <div>
            <div class="stat-num grad">50</div>
            <div class="stat-label">минут / тест</div>
          </div>
        </div>
      </section>

      <section class="auth-card">
        <h2>${isRegister ? "Аккаунт құру" : "Қайта оралуыңызбен!"}</h2>
        <p class="auth-sub">${isRegister
          ? "Тіркеліп, ҰБТ-ға дайындықты бүгін бастаңыз."
          : "Жалғастыру үшін аккаунтыңызға кіріңіз."}</p>

        <div class="tabs" role="tablist">
          <button class="${!isRegister ? "active" : ""}" data-tab="login" role="tab">Кіру</button>
          <button class="${isRegister ? "active" : ""}" data-tab="register" role="tab">Тіркелу</button>
        </div>

        <form id="auth-form" novalidate>
          ${isRegister ? `
            <div class="field">
              <label for="reg-name">Аты-жөніңіз</label>
              <input id="reg-name" name="name" type="text" placeholder="Мысалы: Айгерім Серікқызы" autocomplete="name">
            </div>` : ""}
          <div class="field">
            <label for="auth-email">Электрондық пошта</label>
            <input id="auth-email" name="email" type="email" placeholder="student@mail.kz" autocomplete="email">
          </div>
          <div class="field">
            <label for="auth-password">Құпия сөз</label>
            <input id="auth-password" name="password" type="password" placeholder="Кемінде 6 таңба" autocomplete="${isRegister ? "new-password" : "current-password"}">
          </div>
          ${isRegister ? `
            <div class="field">
              <label for="reg-confirm">Құпия сөзді қайталаңыз</label>
              <input id="reg-confirm" name="confirm" type="password" placeholder="Құпия сөзді қайта енгізіңіз" autocomplete="new-password">
            </div>` : ""}

          <p class="form-error" id="auth-error" role="alert"></p>

          <button class="btn primary block lg" type="submit">
            ${isRegister ? "Тіркелу" : "Кіру"}
          </button>
        </form>
        <p class="auth-note">
          Деректеріңіз тек осы құрылғыда сақталады.<br>
          Жалғастыру арқылы сіз тегін оқу режиміне келісесіз.
        </p>
      </section>
    </div>`;
}

function bindAuth() {
  const form = $("#auth-form");
  if (!form) return;
  form.addEventListener("submit", handleAuthSubmit);
  const first = form.querySelector("input");
  if (first) first.focus();
}

function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const errorEl = $("#auth-error");
  const fail = (message) => {
    errorEl.textContent = message;
    toast(message);
  };

  const email = String(data.email || "").trim().toLowerCase();
  const password = String(data.password || "");
  const isRegister = state.authTab === "register";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return fail("Дұрыс электрондық пошта енгізіңіз.");
  }
  if (password.length < 6) {
    return fail("Құпия сөз кемінде 6 таңбадан тұруы керек.");
  }

  const users = getUsers();

  if (isRegister) {
    const name = String(data.name || "").trim();
    const confirm = String(data.confirm || "");
    if (name.length < 3) {
      return fail("Аты-жөніңізді толық енгізіңіз (кемінде 3 таңба).");
    }
    if (password !== confirm) {
      return fail("Құпия сөздер сәйкес келмейді.");
    }
    if (users.some((user) => user.email === email)) {
      return fail("Бұл поштамен аккаунт бұрын тіркелген. Кіру бөлімін қолданыңыз.");
    }

    const salt = uid("s");
    const user = {
      id: uid("u"),
      name: name,
      email: email,
      salt: salt,
      hash: hashPassword(password, salt),
      created: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);
    writeStore(STORE.session, user.id);
    state.user = user;
    state.screen = "subjects";
    toast("Қош келдіңіз, " + user.name.split(" ")[0] + "! Аккаунт сәтті құрылды.");
    render();
    return;
  }

  const user = users.find((item) => item.email === email);
  if (!user || user.hash !== hashPassword(password, user.salt)) {
    return fail("Пошта немесе құпия сөз дұрыс емес.");
  }

  writeStore(STORE.session, user.id);
  state.user = user;
  state.screen = "subjects";
  toast("Қайта оралуыңызбен, " + user.name.split(" ")[0] + "!");
  render();
}

function logout() {
  if (state.quiz && !confirm("Белсенді тест бар. Шығуды растайсыз ба? Нәтиже сақталмайды.")) return;
  if (state.quiz) {
    clearInterval(state.quiz.timer);
    state.quiz = null;
  }
  writeStore(STORE.session, null);
  state.user = null;
  state.lastResult = null;
  state.screen = "auth";
  state.authTab = "login";
  render();
}

/* -------------------------- пәндер -------------------------- */

function subjectsView() {
  const results = state.user ? getResults(state.user.id) : [];
  const best = {};
  const testsBySubject = {};
  results.forEach((result) => {
    best[result.subjectId] = Math.max(best[result.subjectId] || 0, Math.round((result.correct / result.total) * 100));
    testsBySubject[result.subjectId] = (testsBySubject[result.subjectId] || 0) + 1;
  });

  const answered = results.reduce((sum, r) => sum + r.total, 0);
  const correct = results.reduce((sum, r) => sum + r.correct, 0);
  const average = answered ? Math.round((correct / answered) * 100) : 0;

  const list = state.filter === "all" ? SUBJECTS : SUBJECTS.filter((subject) => subject.group === state.filter);

  return `
    ${header("subjects")}
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Сәлем, <span class="grad">${esc(state.user.name.split(" ")[0])}</span> 👋</h1>
          <p>Пәнді таңдап, ҰБТ форматындағы тестті бастаңыз. Әр тест — 50 сұрақ, 50 минут.</p>
        </div>
        <div class="quick-stats">
          <div class="qstat"><b>${results.length}</b><span>тапсырылған тест</span></div>
          <div class="qstat"><b>${average}%</b><span>орташа нәтиже</span></div>
          <div class="qstat"><b>${SUBJECTS.length}</b><span>пән қолжетімді</span></div>
        </div>
      </div>

      <div class="filters">
        ${GROUPS.map((group) => `
          <button class="chip ${state.filter === group.id ? "active" : ""}" data-filter="${group.id}">${group.name}</button>
        `).join("")}
      </div>

      <div class="subject-grid">
        ${list.map((subject) => `
          <button class="subject-card" data-subject="${subject.id}" style="--c:${subject.color}">
            <span class="s-icon" style="--c:${subject.color}">${subject.icon}</span>
            <span class="s-body">
              <span class="s-name">${subject.name}</span>
              <span class="s-desc">${subject.desc}</span>
              <span class="s-meta">
                <span class="tag">${subject.questions.length} сұрақ</span>
                ${best[subject.id] !== undefined
                  ? `<span class="tag best">Үздік: ${best[subject.id]}%</span>`
                  : `<span class="tag">Әлі тапсырылмаған</span>`}
                ${testsBySubject[subject.id] ? `<span class="tag">${testsBySubject[subject.id]} рет</span>` : ""}
              </span>
            </span>
            <span class="s-arrow">→</span>
          </button>
        `).join("")}
      </div>
    </div>
    <footer class="footer">Practice World © ${new Date().getFullYear()} — ҰБТ-ға дайындыққа арналған тегін платформа</footer>`;
}
/* --------------------------- тест --------------------------- */

function startQuiz(subjectId) {
  const subject = SUBJECTS.find((item) => item.id === subjectId);
  if (!subject) return;

  const count = Math.min(TEST_SIZE, subject.questions.length);
  const questions = shuffle(subject.questions).slice(0, count).map((item) => {
    const options = shuffle(item.o);
    const answerIndexes = (item.a && item.a.length ? item.a : [0])
      .map((idx) => options.indexOf(item.o[idx]))
      .filter((idx) => idx >= 0);
    return {
      text: item.q,
      options: options,
      correct: answerIndexes,
      multi: answerIndexes.length > 1
    };
  });

  state.quiz = {
    subject: subject,
    questions: questions,
    answers: new Array(count).fill(null),
    index: 0,
    secondsLeft: count * SECONDS_PER_QUESTION,
    timer: null
  };
  state.screen = "quiz";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  state.quiz.timer = setInterval(tickQuiz, 1000);
}

function tickQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  quiz.secondsLeft -= 1;
  const timerEl = $("#quiz-timer");
  if (timerEl) {
    timerEl.textContent = fmtTime(quiz.secondsLeft);
    timerEl.classList.toggle("danger", quiz.secondsLeft <= 60);
  }
  if (quiz.secondsLeft <= 0) finishQuiz(true);
}

function renderQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  $("#app").innerHTML = `
    ${header("quiz")}
    <section class="quiz-wrap">
      <div class="quiz-top">
        <div class="quiz-title">
          <span class="s-icon small" style="--c:${quiz.subject.color}">${quiz.subject.icon}</span>
          <div>
            <h2>${quiz.subject.name}</h2>
            <p>ҰБТ форматы · ${quiz.questions.length} сұрақ · ${quiz.questions.length} минут</p>
          </div>
        </div>
        <div class="timer ${quiz.secondsLeft <= 60 ? "danger" : ""}" id="quiz-timer">${fmtTime(quiz.secondsLeft)}</div>
      </div>
      <div class="progress"><div class="progress-fill" id="quiz-progress"></div></div>
      <div id="quiz-stage"></div>
      <div class="quiz-actions">
        <button class="btn ghost" id="quit-quiz">← Шығу</button>
        <button class="btn primary" id="finish-quiz">Тестті аяқтау</button>
      </div>
    </section>`;
  paintQuiz();
}

function paintQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  const question = quiz.questions[quiz.index];
  const picked = quiz.answers[quiz.index] || [];
  const stage = $("#quiz-stage");
  if (!stage) return;

  stage.innerHTML = `
    <div class="quiz-card">
      <div class="q-meta">
        <span>Сұрақ ${quiz.index + 1} / ${quiz.questions.length}</span>
        <span class="q-tag ${question.multi ? "multi" : ""}">${question.multi ? "Бірнеше жауап" : "Бір жауап"}</span>
      </div>
      <h3 class="q-text">${esc(question.text)}</h3>
      ${question.multi ? `<p class="q-hint">Бірнеше дұрыс жауапты таңдауға болады. Толық дұрыс таңдағанда ғана жауап есептеледі.</p>` : ""}
      <div class="options">
        ${question.options.map((option, i) => `
          <button class="option ${picked.includes(i) ? "selected" : ""}" data-pick="${i}">
            <span class="option-key">${"ABCDE"[i]}</span>
            <span class="option-text">${esc(option)}</span>
          </button>
        `).join("")}
      </div>
      <div class="q-nav">
        <button class="btn ghost" id="prev-q" ${quiz.index === 0 ? "disabled" : ""}>← Артқа</button>
        <button class="btn primary" id="next-q">${quiz.index === quiz.questions.length - 1 ? "Аяқтау →" : "Келесі →"}</button>
      </div>
    </div>

    <div class="palette-card">
      <p class="palette-title">Сұрақтарға шолу</p>
      <div class="palette">
        ${quiz.questions.map((_, i) => `
          <button class="pal ${i === quiz.index ? "current" : ""} ${quiz.answers[i] !== null ? "answered" : ""}" data-jump="${i}">${i + 1}</button>
        `).join("")}
      </div>
      <p class="palette-legend">
        <span class="dot answered"></span> жауап берілді
        <span class="dot current" style="margin-left:12px"></span> ағымдағы сұрақ
      </p>
    </div>`;

  updateQuizProgress();
}

function updateQuizProgress() {
  const quiz = state.quiz;
  if (!quiz) return;
  const fill = $("#quiz-progress");
  if (fill) {
    const ratio = ((quiz.index + 1) / quiz.questions.length) * 100;
    fill.style.width = ratio + "%";
  }
}

function answerQuestion(optionIndex) {
  const quiz = state.quiz;
  if (!quiz) return;

  const question = quiz.questions[quiz.index];
  if (question.multi) {
    const current = (quiz.answers[quiz.index] || []).slice();
    const position = current.indexOf(optionIndex);
    if (position >= 0) current.splice(position, 1);
    else current.push(optionIndex);
    current.sort((a, b) => a - b);
    quiz.answers[quiz.index] = current.length ? current : null;
  } else {
    quiz.answers[quiz.index] = [optionIndex];
  }

  const picked = quiz.answers[quiz.index] || [];
  const stage = $("#quiz-stage");
  if (stage) {
    stage.querySelectorAll(".option").forEach((btn, i) => {
      btn.classList.toggle("selected", picked.includes(i));
    });
    stage.querySelectorAll(".pal").forEach((btn, i) => {
      btn.classList.toggle("answered", quiz.answers[i] !== null);
      btn.classList.toggle("current", i === quiz.index);
    });
  }
}

function moveQuestion(delta) {
  const quiz = state.quiz;
  if (!quiz) return;
  const next = quiz.index + delta;
  if (next < 0 || next >= quiz.questions.length) return;
  quiz.index = next;
  paintQuiz();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function finishQuiz(timedOut) {
  const quiz = state.quiz;
  if (!quiz) return;

  clearInterval(quiz.timer);

  const correct = quiz.questions.reduce((sum, question, i) => {
    const picked = quiz.answers[i] || [];
    const isCorrect = picked.length === question.correct.length &&
      question.correct.every((idx) => picked.includes(idx));
    return sum + (isCorrect ? 1 : 0);
  }, 0);

  const spent = Math.max(1, quiz.questions.length * SECONDS_PER_QUESTION - quiz.secondsLeft);

  const result = {
    id: uid("r"),
    subjectId: quiz.subject.id,
    subjectName: quiz.subject.name,
    subjectIcon: quiz.subject.icon,
    correct: correct,
    total: quiz.questions.length,
    seconds: spent,
    date: new Date().toISOString(),
    timedOut: !!timedOut,
    questions: quiz.questions,
    answers: quiz.answers.slice()
  };

  const summary = {
    id: result.id,
    subjectId: result.subjectId,
    correct: result.correct,
    total: result.total,
    seconds: result.seconds,
    date: result.date
  };

  if (state.user) addResult(state.user.id, summary);

  state.lastResult = result;
  state.quiz = null;
  state.screen = "result";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function quitQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  if (!confirm("Тестті тоқтатып, пәндерге оралғыңыз келе ме? Нәтиже сақталмайды.")) return;
  clearInterval(quiz.timer);
  state.quiz = null;
  state.screen = "subjects";
  render();
}

function confirmFinish() {
  const quiz = state.quiz;
  if (!quiz) return;
  const unanswered = quiz.answers.filter((answer) => answer === null).length;
  if (unanswered > 0 && !confirm(unanswered + " сұраққа жауап берілмеді. Тестті аяқтайсыз ба?")) return;
  finishQuiz(false);
}

/* -------------------------- нәтиже -------------------------- */

function scoreMessage(percent) {
  if (percent >= 90) return { title: "Керемет нәтиже! 🎉", text: "Сіз бұл пәнді тамаша меңгергенсіз. ҰБТ-да осындай деңгейде жауап беруге дайынсыз!" };
  if (percent >= 70) return { title: "Жақсы нәтиже! 👏", text: "Біліміңіз берік. Қателескен сұрақтарды қайталап, нәтижені одан әрі жақсартуға болады." };
  if (percent >= 50) return { title: "Орташа нәтиже 🙂", text: "Негізді меңгергенсіз, бірақ әлі де жетілдіретін тұстар бар. Төмендегі талдауды мұқият қарап шығыңыз." };
  return { title: "Қайталау қажет 📘", text: "Бұл пән бойынша тақырыптарды қайталап, тестті қайта тапсырып көріңіз. Әр әрекет — жаңа мүмкіндік!" };
}

function resultView() {
  const result = state.lastResult;
  if (!result) return "";
  const percent = Math.round((result.correct / result.total) * 100);
  const tone = percent >= 70 ? "var(--green)" : percent >= 50 ? "var(--yellow)" : "var(--red)";
  const message = scoreMessage(percent);

  const letter = (idx) => "ABCDE"[idx] || "?";
  const review = result.questions.map((question, i) => {
    const picked = result.answers[i] || [];
    const isCorrect = picked.length === question.correct.length &&
      question.correct.every((idx) => picked.includes(idx));
    const correctText = question.correct
      .map((idx) => letter(idx) + ") " + question.options[idx]).join("; ");
    const pickedText = picked
      .map((idx) => letter(idx) + ") " + question.options[idx]).join("; ");
    return `
      <div class="review-item ${isCorrect ? "ok" : "bad"}">
        <div class="review-head">
          <span class="review-num">${i + 1}</span>
          <span class="review-q">${esc(question.text)}</span>
        </div>
        <div class="review-answers">
          <div class="line"><span class="lbl">${question.multi ? "Дұрыс жауаптар:" : "Дұрыс жауап:"}</span><span class="right">${esc(correctText)}</span></div>
          <div class="line"><span class="lbl">Сіздің жауабыңыз:</span>
            ${picked.length === 0
              ? `<span class="none">жауап берілмеді</span>`
              : isCorrect
                ? `<span class="right">${esc(pickedText)} ✓</span>`
                : `<span class="wrong">${esc(pickedText)}</span>`}
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    ${header("subjects")}
    <div class="page">
      <div class="result-hero">
        <div class="donut" style="--p:${percent};--dc:${tone}">
          <div class="donut-inner">
            <div class="donut-value">${percent}<span>%</span></div>
            <div class="donut-label">дұрыс жауап</div>
          </div>
        </div>
        <div class="result-info">
          <h2>${message.title}</h2>
          <p>${message.text}</p>
          ${result.timedOut ? `<p style="color:var(--yellow);margin-top:8px;font-size:0.85rem">⏱ Уақыт бітті — тест автоматты түрде аяқталды.</p>` : ""}
          <div class="result-stats">
            <div class="rstat"><b>${escapeHtml(result.subjectName)}</b><span>пән</span></div>
            <div class="rstat"><b>${result.correct} / ${result.total}</b><span>дұрыс жауап</span></div>
            <div class="rstat"><b>${fmtTime(result.seconds)}</b><span>жұмсалған уақыт</span></div>
          </div>
          <div class="result-actions">
            <button class="btn primary" data-retry="${result.subjectId}">Қайта тапсыру</button>
            <button class="btn ghost" data-nav="subjects">Пәндерге оралу</button>
            <button class="btn ghost" data-nav="profile">Профилім</button>
          </div>
        </div>
      </div>

      <h3 class="review-title">Жауаптарды талдау</h3>
      <div class="review-list">${review}</div>
    </div>
    <footer class="footer">Practice World © ${new Date().getFullYear()}</footer>`;
}

function escapeHtml(value) {
  return esc(value);
}
/* -------------------------- профиль -------------------------- */

function profileView() {
  const user = state.user;
  const results = getResults(user.id);
  const answered = results.reduce((sum, r) => sum + r.total, 0);
  const correct = results.reduce((sum, r) => sum + r.correct, 0);
  const average = answered ? Math.round((correct / answered) * 100) : 0;

  const bySubject = {};
  results.forEach((r) => {
    const entry = bySubject[r.subjectId] || { best: 0, tests: 0 };
    entry.best = Math.max(entry.best, Math.round((r.correct / r.total) * 100));
    entry.tests += 1;
    bySubject[r.subjectId] = entry;
  });

  const subjectRows = Object.keys(bySubject).map((id) => {
    const subject = SUBJECTS.find((s) => s.id === id);
    return subject ? { subject: subject, ...bySubject[id] } : null;
  }).filter(Boolean).sort((a, b) => b.best - a.best);

  const history = results.slice(0, 12).map((r) => {
    const subject = SUBJECTS.find((s) => s.id === r.subjectId);
    const percent = Math.round((r.correct / r.total) * 100);
    const color = percent >= 70 ? "var(--green)" : percent >= 50 ? "var(--yellow)" : "var(--red)";
    return `
      <div class="history-item">
        <span class="hi-icon">${subject ? subject.icon : "📝"}</span>
        <span class="hi-body">
          <span class="hi-name">${esc(subject ? subject.name : "Тест")}</span>
          <span class="hi-date">${fmtDate(r.date)} · ${fmtTime(r.seconds)}</span>
        </span>
        <span class="hi-score" style="color:${color}">${r.correct}/${r.total} · ${percent}%</span>
      </div>`;
  }).join("");

  const subjectCards = subjectRows.map((row) => `
    <div class="history-item">
      <span class="hi-icon">${row.subject.icon}</span>
      <span class="hi-body">
        <span class="hi-name">${esc(row.subject.name)}</span>
        <span class="hi-date">${row.tests} тест тапсырылды</span>
      </span>
      <span class="hi-score" style="color:var(--green)">${row.best}%</span>
    </div>`).join("");

  return `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Менің профилім</h1>
          <p>Оқу жетістіктеріңіз, тест тарихы және пәндер бойынша үздік нәтижелер.</p>
        </div>
      </div>

      <div class="profile-grid">
        <div>
          <div class="panel profile-card">
            <div class="avatar big">${esc(initials(user.name))}</div>
            <h2>${esc(user.name)}</h2>
            <p class="email">${esc(user.email)}</p>
            <div class="profile-stats">
              <div class="pstat"><b>${results.length}</b><span>тест</span></div>
              <div class="pstat"><b>${average}%</b><span>орташа</span></div>
              <div class="pstat"><b>${correct}</b><span>дұрыс жауап</span></div>
              <div class="pstat"><b>${answered}</b><span>жалпы сұрақ</span></div>
            </div>
            <p class="joined">Тіркелген күні: ${fmtDate(user.created)}</p>
            <div class="result-actions" style="justify-content:center;margin-top:16px">
              <button class="btn ghost" data-nav="subjects">Тест бастау</button>
            </div>
          </div>
        </div>

        <div>
          <div class="panel">
            <div class="panel-head">
              <div>
                <h3>Тест тарихы</h3>
                <p>Соңғы ${Math.min(results.length, 12)} нәтиже</p>
              </div>
              ${results.length ? `<button class="btn ghost" data-clear-history style="padding:8px 14px;font-size:0.82rem">Тарихты тазалау</button>` : ""}
            </div>
            ${results.length
              ? `<div class="history-list">${history}</div>`
              : `<div class="empty" style="margin-top:14px"><span class="em">📝</span>Әзірге тест тапсырылмаған.<br>Пән таңдап, алғашқы тестіңізді бастаңыз!</div>`}
          </div>

          <div class="panel" style="margin-top:16px">
            <div class="panel-head">
              <div>
                <h3>Пәндер бойынша үздік нәтиже</h3>
                <p>Әр пәндегі ең жоғары көрсеткіш</p>
              </div>
            </div>
            ${subjectRows.length
              ? `<div class="history-list">${subjectCards}</div>`
              : `<div class="empty" style="margin-top:14px"><span class="em">📊</span>Статистика тест тапсырғаннан кейін пайда болады.</div>`}
          </div>
        </div>
      </div>
    </div>
    <footer class="footer">Practice World © ${new Date().getFullYear()}</footer>`;
}

/* -------------------------- рейтинг -------------------------- */

function leaderboardView() {
  const users = getUsers();
  const all = readStore(STORE.results, {});

  const rows = users.map((user) => {
    const list = all[user.id] || [];
    const answered = list.reduce((sum, r) => sum + r.total, 0);
    const correct = list.reduce((sum, r) => sum + r.correct, 0);
    const best = list.reduce((max, r) => Math.max(max, Math.round((r.correct / r.total) * 100)), 0);
    return {
      user: user,
      tests: list.length,
      answered: answered,
      correct: correct,
      best: best,
      average: answered ? Math.round((correct / answered) * 100) : 0
    };
  }).filter((row) => row.tests > 0)
    .sort((a, b) => b.average - a.average || b.tests - a.tests || b.correct - a.correct);

  const myIndex = rows.findIndex((row) => state.user && row.user.id === state.user.id);

  const board = rows.length
    ? rows.map((row, i) => `
        <div class="board-row ${state.user && row.user.id === state.user.id ? "me" : ""}">
          <span class="board-rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
          <span class="avatar">${esc(initials(row.user.name))}</span>
          <span class="board-body">
            <span class="board-name">${esc(row.user.name)}${state.user && row.user.id === state.user.id ? " (сіз)" : ""}</span>
            <span class="board-sub">${row.tests} тест · ${row.correct}/${row.answered} дұрыс жауап</span>
          </span>
          <span class="board-score"><b>${row.average}%</b><span>орташа</span></span>
        </div>`).join("")
    : `<div class="empty"><span class="em">🏆</span>Рейтинг әзірге бос.<br>Алғашқы тесті тапсырып, көшбасшылар қатарына қосылыңыз!</div>`;

  return `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Көшбасшылар тақтасы</h1>
          <p>Осы құрылғыдағы барлық оқушылардың орташа нәтижесі бойынша рейтинг.</p>
        </div>
        ${myIndex >= 0 ? `<div class="qstat"><b>#${myIndex + 1}</b><span>сіздің орныңыз</span></div>` : ""}
      </div>
      <div class="panel">
        <div class="board">${board}</div>
      </div>
    </div>
    <footer class="footer">Practice World © ${new Date().getFullYear()}</footer>`;
}

/* --------------------------- render --------------------------- */

function render() {
  const app = $("#app");
  if (!app) return;

  if (!state.user) {
    app.innerHTML = authView();
    bindAuth();
    return;
  }

  switch (state.screen) {
    case "quiz":
      renderQuiz();
      break;
    case "result":
      app.innerHTML = resultView();
      break;
    case "profile":
      app.innerHTML = header("profile") + profileView();
      break;
    case "leaderboard":
      app.innerHTML = header("leaderboard") + leaderboardView();
      break;
    default:
      app.innerHTML = subjectsView();
  }
  closeOpenStateIfNeeded();
}

function closeOpenStateIfNeeded() {
  if (state.screen !== "quiz" && state.quiz) {
    clearInterval(state.quiz.timer);
    state.quiz = null;
  }
}

function go(screen) {
  if (state.quiz) {
    if (!confirm("Белсенді тест бар. Одан шығып, басқа бетке өтуді растайсыз ба? Нәтиже сақталмайды.")) return;
    clearInterval(state.quiz.timer);
    state.quiz = null;
  }
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* --------------------------- оқиғалар --------------------------- */

document.addEventListener("click", (event) => {
  const target = event.target;

  if (target.closest("[data-theme-toggle]")) {
    toggleTheme();
    return;
  }

  const navBtn = target.closest("[data-nav]");
  if (navBtn) {
    go(navBtn.dataset.nav);
    return;
  }

  if (target.closest("[data-logout]")) {
    logout();
    return;
  }

  const tabBtn = target.closest("[data-tab]");
  if (tabBtn) {
    state.authTab = tabBtn.dataset.tab;
    render();
    return;
  }

  const subjectBtn = target.closest("[data-subject]");
  if (subjectBtn) {
    startQuiz(subjectBtn.dataset.subject);
    return;
  }

  const filterBtn = target.closest("[data-filter]");
  if (filterBtn) {
    state.filter = filterBtn.dataset.filter;
    render();
    return;
  }

  const retryBtn = target.closest("[data-retry]");
  if (retryBtn) {
    startQuiz(retryBtn.dataset.retry);
    return;
  }

  if (target.closest("[data-clear-history]")) {
    if (confirm("Барлық тест тарихы мен статистика өшіріледі. Жалғастырасыз ба?")) {
      clearResults(state.user.id);
      toast("Тест тарихы тазаланды.");
      render();
    }
    return;
  }

  const pickBtn = target.closest("[data-pick]");
  if (pickBtn && state.quiz) {
    answerQuestion(Number(pickBtn.dataset.pick));
    return;
  }

  const jumpBtn = target.closest("[data-jump]");
  if (jumpBtn && state.quiz) {
    state.quiz.index = Number(jumpBtn.dataset.jump);
    paintQuiz();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (target.closest("#prev-q") && state.quiz) {
    moveQuestion(-1);
    return;
  }

  if (target.closest("#next-q") && state.quiz) {
    if (state.quiz.index === state.quiz.questions.length - 1) {
      confirmFinish();
    } else {
      moveQuestion(1);
    }
    return;
  }

  if (target.closest("#finish-quiz")) {
    confirmFinish();
    return;
  }

  if (target.closest("#quit-quiz")) {
    quitQuiz();
  }
});

document.addEventListener("keydown", (event) => {
  if (!state.quiz) return;
  if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;

  if (/^[1-5]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    if (index < state.quiz.questions[state.quiz.index].options.length) {
      answerQuestion(index);
    }
    return;
  }
  if (event.key === "ArrowRight") {
    if (state.quiz.index < state.quiz.questions.length - 1) moveQuestion(1);
    return;
  }
  if (event.key === "ArrowLeft") {
    moveQuestion(-1);
  }
});

/* --------------------------- іске қосу --------------------------- */

function boot() {
  const sessionId = readStore(STORE.session, null);
  const users = getUsers();
  const user = users.find((item) => item.id === sessionId) || null;
  state.user = user;
  state.screen = user ? "subjects" : "auth";
  render();
}

document.addEventListener("DOMContentLoaded", boot);

