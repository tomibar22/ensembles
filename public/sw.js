/* Service worker: האפליקציה נפתחת גם בלי רשת.

   בכיתה הרשת לא תמיד שם, והנתונים ממילא שמורים במכשיר — אבל בלי זה הדף
   עצמו לא נטען. שלושה כללים:

   - הדף (ניווט): רשת קודם, ומהמטמון רק כשאין רשת. כך גרסה חדשה מגיעה
     תמיד כשיש חיבור, ואין מצב של גרסה ישנה שנתקעת.
   - קבצי assets ופונטים: מהמטמון. שמם כולל hash, ולכן הם לא משתנים.
   - Supabase ו-Google: לא נוגעים. הם חייבים רשת חיה; הנתונים עצמם
     נשמרים במכשיר על ידי האפליקציה (src/data/store.ts). */

const CACHE = "shiur-iltur-v1";
const FONTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
// שרת שמחזיר Vary: Origin היה גורם לכך שקובץ שנשמר לא יימצא בבקשה הבאה
const find = (req) => caches.match(req, { ignoreVary: true });
const ours = (url) => url.origin === self.location.origin || FONTS.includes(url.hostname);

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = async (req, res) => {
  if (res && (res.ok || res.type === "opaque")) (await caches.open(CACHE)).put(req, res.clone());
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!ours(url)) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => keep("/", res))
        .catch(() => find("/"))
    );
    return;
  }
  const fixed = url.pathname.startsWith("/assets/") || FONTS.includes(url.hostname);
  e.respondWith(
    fixed
      ? find(req).then((hit) => hit || fetch(req).then((res) => keep(req, res)))
      : fetch(req)
          .then((res) => keep(req, res))
          .catch(() => find(req))
  );
});

/* בביקור הראשון הדף נטען לפני שה-worker התחיל לשלוט, ולכן הקבצים שלו לא
   עברו דרכו. הדף שולח את רשימתם, והם נשמרים — כך די בביקור אחד עם רשת.
   בבקשה רגילה ולא no-cors: תשובה אטומה אינה יכולה לשרת <script type="module">. */
self.addEventListener("message", (e) => {
  const urls = ((e.data && e.data.cache) || []).filter((u) => ours(new URL(u)));
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        urls.map((u) =>
          c.match(u).then((hit) => hit || fetch(u).then((res) => res.ok && c.put(u, res)).catch(() => {}))
        )
      )
    )
  );
});
