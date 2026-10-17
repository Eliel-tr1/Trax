// build-api-docs.mjs
// Generates the PUBLIC API documentation page (public/api-docs.html) and the
// shared schema module (src/lib/apiSchema.generated.json) from the ONE source
// of truth: the SCHEMA allow-list inside supabase/functions/api-v1/index.ts.
//
// Why generated and not hand-written: the old in-app "דוקומנטציה API" tab kept
// its own hard-coded copy of the schema and silently drifted behind the real
// function (it was missing every utm_* field). Generating from the function
// makes that drift impossible, and the build fails loudly if the schema can no
// longer be parsed, so a contract change can never ship undocumented.
//
// Runs as npm "prebuild" (see package.json) so every build refreshes the page.
// Run standalone: node scripts/build-api-docs.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FUNCTION_FILE = resolve(ROOT, "supabase/functions/api-v1/index.ts");
const OUT_HTML = resolve(ROOT, "public/api-docs.html");
const OUT_JSON = resolve(ROOT, "src/lib/apiSchema.generated.json");

const PROJECT_REF = "bkjqwroclpefwtyxjfkl";

// ---------------------------------------------------------------- schema read
// Pull the `const SCHEMA ... = { ... }` object literal out of the edge
// function and evaluate it. Balanced-brace scan (the literal contains no
// braces inside its string values), then strip the TypeScript type annotation.
function readSchema() {
  const src = readFileSync(FUNCTION_FILE, "utf8");
  const marker = "const SCHEMA";
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`SCHEMA not found in ${FUNCTION_FILE}`);
  const eq = src.indexOf("=", start);
  if (eq === -1) throw new Error("SCHEMA assignment not found");
  const braceStart = src.indexOf("{", eq);
  if (braceStart === -1) throw new Error("SCHEMA object literal not found");
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("SCHEMA object literal is not balanced");
  const literal = src.slice(braceStart, end + 1);
  const schema = vm.runInNewContext(`(${literal})`);
  if (!schema || typeof schema !== "object" || !Object.keys(schema).length) {
    throw new Error("parsed SCHEMA is empty");
  }
  for (const [name, def] of Object.entries(schema)) {
    if (!def.table || !Array.isArray(def.fields) || !def.fields.length) {
      throw new Error(`SCHEMA entry "${name}" is missing table/fields`);
    }
  }
  return schema;
}

const SCHEMA = readSchema();
const OBJECTS = Object.keys(SCHEMA);

// ---------------------------------------------------------------- helpers
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/api-v1`;

function codeBlock(id, code) {
  return `<div class="code">
  <div class="code-bar"><button class="copy" data-copy="${id}">העתקה</button></div>
  <pre id="${id}"><code>${esc(code)}</code></pre>
</div>`;
}

function curl(method, path, body) {
  const lines = [`curl -X ${method} \\`, `  "${BASE}${path}" \\`];
  lines.push(`  -H "Authorization: Bearer $TRAX_API_KEY" \\`);
  if (body) {
    lines.push(`  -H "content-type: application/json" \\`);
    lines.push(`  -d '${body}'`);
  } else {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- HTML build
function objectSection(name, def) {
  const id = `obj-${name}`;
  const sampleField = def.fields[0];
  const fieldRows = def.fields
    .map((f) => `<tr><td><code dir="ltr">${esc(f)}</code></td></tr>`)
    .join("\n");

  const endpoints = [
    ["רשימת רשומות", "GET", `/${name}?limit=20`, null],
    ["רשומה בודדת", "GET", `/${name}/{id}`, null],
    ["יצירה", "POST", `/${name}`, `{"${sampleField}": "..."}`],
    ["עדכון", "PATCH", `/${name}/{id}`, `{"${sampleField}": "..."}`],
    ["מחיקה (רכה)", "DELETE", `/${name}/{id}`, null],
  ]
    .map(([label, method, path, body]) => {
      const code = curl(method, path, body);
      return `<h4>${label} <span class="method ${method.toLowerCase()}">${method}</span> <code dir="ltr" class="path">${esc(path)}</code></h4>
${codeBlock(`${id}-${method}-${label.replace(/[^a-z]/gi, "")}`, code)}`;
    })
    .join("\n");

  return `<section class="object" id="${id}">
  <h3>${esc(name)} <span class="muted">/ ${esc(def.table)}</span></h3>
  ${endpoints}
  <h4>שדות הניתנים לכתיבה</h4>
  <table class="fields"><thead><tr><th>שדה</th></tr></thead><tbody>
${fieldRows}
  </tbody></table>
  <p class="muted small">שדות קריאה בלבד שמתווספים אוטומטית לכל רשומה: <code dir="ltr">id, created_at, updated_at, deleted_at, created_by, updated_by</code>.</p>
</section>`;
}

const nav = OBJECTS.map(
  (o) => `<a href="#obj-${o}">${esc(o)}</a>`
).join(" | ");

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="all" />
<title>TRAX CRM - דוקומנטציית API</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#fff; --ink:#1c2027; --muted:#6b7280; --line:#e5e7eb;
    --brand:#4b2e83; --accent:#f3f0fa; --ok:#0f766e; --code-bg:#1e2430; --code-ink:#e8ecf4;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Rubik,Arial,sans-serif;line-height:1.6}
  header{background:var(--brand);color:#fff;padding:28px 20px}
  .wrap{max-width:960px;margin:0 auto;padding:0 20px}
  header h1{margin:0 0 4px;font-size:1.5rem}
  header p{margin:0;opacity:.85;font-size:.9rem}
  main{max-width:960px;margin:0 auto;padding:24px 20px 80px}
  section{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:20px 22px;margin-bottom:20px}
  h2{font-size:1.2rem;margin:0 0 12px;border-bottom:2px solid var(--accent);padding-bottom:8px}
  h3{font-size:1.05rem;margin:22px 0 10px}
  h4{font-size:.92rem;margin:16px 0 6px;font-weight:700}
  code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:.85em;
    background:var(--accent);padding:1px 6px;border-radius:5px}
  .path{background:#eef0f4}
  .muted{color:var(--muted);font-weight:400}
  .small{font-size:.85rem}
  .method{font-size:.72rem;font-weight:700;padding:2px 7px;border-radius:5px;color:#fff;vertical-align:middle}
  .method.get{background:#2563eb}.method.post{background:#0f766e}
  .method.patch{background:#b45309}.method.delete{background:#b91c1c}
  table{width:100%;border-collapse:collapse;font-size:.9rem;margin-top:6px}
  th,td{text-align:right;padding:7px 10px;border-bottom:1px solid var(--line)}
  th{background:var(--accent);font-weight:700}
  .fields td code{background:transparent;padding:0}
  .code{position:relative;margin:6px 0 4px}
  .code-bar{display:flex;justify-content:flex-end;margin-bottom:5px}
  pre{background:var(--code-bg);color:var(--code-ink);padding:14px 16px;border-radius:9px;
    overflow-x:auto;margin:0;direction:ltr;text-align:left}
  pre code{background:transparent;color:inherit;padding:0;font-size:.8rem}
  .copy{background:var(--accent);color:var(--brand);border:1px solid var(--line);
    border-radius:6px;padding:2px 12px;font-size:.72rem;cursor:pointer;font-family:inherit}
  .copy:hover{background:#e7e0f5}
  .note{background:var(--accent);border-inline-start:4px solid var(--brand);
    padding:10px 14px;border-radius:8px;margin:12px 0;font-size:.9rem}
  .nav{margin:12px 0 0;font-size:.9rem;color:rgba(255,255,255,.75)}
  .nav a{color:#fff;text-decoration:none;font-weight:600;opacity:.92}
  .nav a:hover{text-decoration:underline;opacity:1}
  footer{text-align:center;color:var(--muted);font-size:.8rem;padding:20px}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <h1>TRAX CRM - דוקומנטציית API</h1>
    <p>ממשק REST אחיד לכל האובייקטים במערכת. נוצר אוטומטית מתוך קוד ה-API עצמו, תמיד מעודכן.</p>
    <div class="nav">אובייקטים: ${nav}</div>
  </div>
</header>
<main>

  <section id="overview">
    <h2>סקירה כללית</h2>
    <p>ה-API חושף פעולות CRUD על כל אובייקט במערכת בכתובת אחת, לפי התבנית
      <code dir="ltr">/api-v1/{object}/{id}</code>. כל אובייקט תומך בחמש פעולות:
      רשימה, רשומה בודדת, יצירה, עדכון ומחיקה (מחיקה היא מחיקה רכה, הרשומה מסומנת
      כ-<code dir="ltr">deleted_at</code> ואינה נמחקת פיזית).</p>
    <p><b>כתובת בסיס:</b></p>
    ${codeBlock("base", BASE)}
    <div class="note">כל התעבורה ב-HTTPS. אין צורך בהרשאות נוספות מעבר למפתח ה-API.</div>
  </section>

  <section id="auth">
    <h2>אימות (Authentication)</h2>
    <p>כל בקשה חייבת לשאת מפתח API בכותרת <code dir="ltr">Authorization</code>:</p>
    ${codeBlock("auth", `Authorization: Bearer <YOUR_API_KEY>\ncontent-type: application/json`)}
    <p>מפיקים מפתח במערכת: <b>הגדרות ← מפתחות API ← הפקת מפתח</b>. המפתח המלא מוצג
      פעם אחת בלבד בעת ההפקה, יש לשמור אותו במקום מאובטח. במערכת נשמר רק ה-hash שלו.</p>
    <p>לכל מפתח יש תפקיד (<code dir="ltr">role</code>):</p>
    <table><thead><tr><th>תפקיד</th><th>מיועד ל</th></tr></thead><tbody>
      <tr><td><code dir="ltr">read</code></td><td>אינטגרציות בקריאה בלבד</td></tr>
      <tr><td><code dir="ltr">write</code></td><td>אינטגרציות שקוראות וכותבות</td></tr>
      <tr><td><code dir="ltr">internal</code></td><td>שימוש פנימי של המערכת</td></tr>
    </tbody></table>
    <p class="muted small">מפתח לא תקין או לא פעיל מחזיר <code dir="ltr">401</code> עם
      <code dir="ltr">{"error":"invalid or inactive API key"}</code>.</p>
  </section>

  <section id="endpoints">
    <h2>נקודות קצה ופרמטרים</h2>
    <table>
      <thead><tr><th>פעולה</th><th>מתודה</th><th>נתיב</th></tr></thead>
      <tbody>
        <tr><td>רשימה</td><td><span class="method get">GET</span></td><td><code dir="ltr">/api-v1/{object}</code></td></tr>
        <tr><td>רשומה בודדת</td><td><span class="method get">GET</span></td><td><code dir="ltr">/api-v1/{object}/{id}</code></td></tr>
        <tr><td>יצירה</td><td><span class="method post">POST</span></td><td><code dir="ltr">/api-v1/{object}</code></td></tr>
        <tr><td>עדכון</td><td><span class="method patch">PATCH</span></td><td><code dir="ltr">/api-v1/{object}/{id}</code></td></tr>
        <tr><td>מחיקה (רכה)</td><td><span class="method delete">DELETE</span></td><td><code dir="ltr">/api-v1/{object}/{id}</code></td></tr>
      </tbody>
    </table>

    <h4>פרמטרים לשאילתת רשימה (GET)</h4>
    <table>
      <thead><tr><th>פרמטר</th><th>משמעות</th><th>ברירת מחדל</th></tr></thead>
      <tbody>
        <tr><td><code dir="ltr">limit</code></td><td>מספר רשומות מקסימלי (עד 200)</td><td><code dir="ltr">50</code></td></tr>
        <tr><td><code dir="ltr">offset</code></td><td>דילוג על רשומות (עימוד)</td><td><code dir="ltr">0</code></td></tr>
        <tr><td><code dir="ltr">sort</code></td><td>מיון לפי שדה; <code dir="ltr">-field</code> למיון יורד</td><td>לפי הסדר הטבעי</td></tr>
        <tr><td><code dir="ltr">&lt;field&gt;=value</code></td><td>סינון לפי כל שדה של האובייקט (התאמה מדויקת)</td><td>-</td></tr>
      </tbody>
    </table>
    <p class="muted small">סינון לפי שדה שאינו קיים באובייקט מחזיר
      <code dir="ltr">400 unknown filter field</code>.</p>

    <h4>דוגמת רשימה עם סינון, מיון ועימוד</h4>
    ${codeBlock("listq", curl("GET", "/customers?status=%D7%9C%D7%99%D7%93%20%D7%97%D7%93%D7%A9&sort=-created_at&limit=20&offset=0", null))}
  </section>

  <section id="responses">
    <h2>מבנה תשובה ושגיאות</h2>
    <p><b>הצלחה:</b> גוף JSON עם מפתח <code dir="ltr">data</code>. ברשימה מתווסף גם
      <code dir="ltr">count</code> (המספר הכולל, לפני עימוד).</p>
    ${codeBlock("resp-ok", `{ "data": [ { "id": "...", "first_name": "..." } ], "count": 128 }`)}
    <p><b>שגיאה:</b> גוף JSON עם <code dir="ltr">error</code>, ולעיתים גם
      <code dir="ltr">code</code> (קוד Postgres).</p>
    ${codeBlock("resp-err", `{ "error": "unknown field(s): foo", "code": "PGRST204" }`)}
    <table>
      <thead><tr><th>קוד</th><th>מתי</th></tr></thead>
      <tbody>
        <tr><td><code dir="ltr">400</code></td><td>גוף JSON לא תקין, שדה לא מוכר בגוף, או שדה סינון לא מוכר</td></tr>
        <tr><td><code dir="ltr">401</code></td><td>חסר מפתח API, או מפתח לא תקין / לא פעיל</td></tr>
        <tr><td><code dir="ltr">404</code></td><td>אובייקט לא מוכר, או רשומה לא נמצאה</td></tr>
        <tr><td><code dir="ltr">405</code></td><td>מתודה לא נתמכת לנתיב (למשל POST ל-<code dir="ltr">/{id}</code>)</td></tr>
        <tr><td><code dir="ltr">409</code></td><td>הפרת ייחודיות (<code dir="ltr">23505</code>)</td></tr>
        <tr><td><code dir="ltr">422</code></td><td>הפרת אילוץ תקינות (<code dir="ltr">23514</code>, למשל ערך לא ברשימה מותרת)</td></tr>
        <tr><td><code dir="ltr">500</code></td><td>שגיאה פנימית</td></tr>
      </tbody>
    </table>
  </section>

  <section id="objects">
    <h2>האובייקטים (${OBJECTS.length})</h2>
    <p class="muted small">לכל אובייקט: דוגמאות לכל חמש הפעולות, ורשימת השדות הניתנים לכתיבה.</p>
  </section>

  ${OBJECTS.map((o) => objectSection(o, SCHEMA[o])).join("\n\n  ")}

  <section id="lead-intake">
    <h2>נספח: קליטת לידים מהטפסים</h2>
    <p>נקודת קצה נפרדת לקליטת ליד מטופס באתר, דף נחיתה או Xcon. היא מבצעת
      נירמול טלפון, זיהוי לקוח קיים, פתיחת עסקה חדשה ורישום הערת הטופס,
      ואז כותבת דרך אותו API. אינה דורשת מפתח API (משמשת אתרי טפסים).</p>
    <h4>יצירת ליד <span class="method post">POST</span> <code dir="ltr" class="path">/functions/v1/lead-intake</code></h4>
    ${codeBlock(
      "lead-intake",
      `curl -X POST \\\n  "https://${PROJECT_REF}.supabase.co/functions/v1/lead-intake" \\\n  -H "content-type: application/json" \\\n  -d '{\n    "full_name": "ישראל ישראלי",\n    "phone": "050-1234567",\n    "email": "israel@example.com",\n    "message": "מתעניין בטיול",\n    "form_id": "site",\n    "utm_source": "facebook"\n  }'`
    )}
    <table>
      <thead><tr><th>שדה</th><th>חובה</th><th>הערות</th></tr></thead>
      <tbody>
        <tr><td><code dir="ltr">full_name</code></td><td>כן</td><td>שם מלא</td></tr>
        <tr><td><code dir="ltr">phone</code></td><td>כן</td><td>מנורמל אוטומטית</td></tr>
        <tr><td><code dir="ltr">email</code></td><td>לא</td><td>-</td></tr>
        <tr><td><code dir="ltr">message</code></td><td>לא</td><td>נשמר כהערה על הלקוח ועל העסקה</td></tr>
        <tr><td><code dir="ltr">form_id</code></td><td>כן</td><td><code dir="ltr">site</code> | <code dir="ltr">landing</code> | <code dir="ltr">xcon</code></td></tr>
        <tr><td><code dir="ltr">utm_source, utm_medium, utm_campaign, utm_content, utm_term</code></td><td>לא</td><td>שיוך מקור</td></tr>
        <tr><td><code dir="ltr">page_url</code></td><td>לא</td><td>כתובת העמוד ששלח</td></tr>
      </tbody>
    </table>
    <p class="muted small">תשובה בהצלחה: <code dir="ltr">201</code> עם
      <code dir="ltr">{"success":true,"customer_id":"...","sale_id":"..."}</code>.</p>
  </section>

</main>
<footer>נוצר אוטומטית מ-<code dir="ltr">supabase/functions/api-v1/index.ts</code> · TRAX CRM</footer>
<script>
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise(function (resolve, reject) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) { reject(e); }
  });
}
document.querySelectorAll(".copy").forEach(function (b) {
  b.addEventListener("click", function () {
    var pre = document.getElementById(b.dataset.copy);
    if (!pre) return;
    copyText(pre.innerText).then(function () {
      var t = b.textContent;
      b.textContent = "הועתק";
      setTimeout(function () { b.textContent = t; }, 1200);
    }).catch(function () {});
  });
});
</script>
</body>
</html>
`;

mkdirSync(dirname(OUT_HTML), { recursive: true });
mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_HTML, html, "utf8");
writeFileSync(
  OUT_JSON,
  JSON.stringify(
    { base_url: BASE, objects: SCHEMA, read_only_fields: ["id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by"] },
    null,
    2
  ) + "\n",
  "utf8"
);
console.log(
  `api-docs: ${OBJECTS.length} objects, ${OBJECTS.reduce((n, o) => n + SCHEMA[o].fields.length, 0)} fields -> ${OUT_HTML}`
);
