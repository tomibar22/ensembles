-- שיעור אלתור — סכמת הבסיס.
-- אפשר להריץ שוב: כל פקודה כאן היא "if not exists" או "on conflict do nothing".
--
-- עקרונות:
--  * כל המזהים הם טקסט שנוצר בלקוח (UUID), כדי שאפשר יהיה לכתוב גם בלי רשת
--    ולהעלות אחר כך בלי התנגשויות.
--  * הגישה לכל הטבלאות היא רק למי שהמייל שלו ברשימת owners.
--  * מה שעשוי להשתנות בלי שינוי קוד (סוגי פרויקטים, כלים, ערכי ציון, חוקי
--    חלוקה) הוא נתון בטבלה או ב-jsonb, לא קבוע.

create table if not exists owners (
  email text primary key
);
alter table owners enable row level security;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from owners where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- סוגי פרויקטים: כיתה בבית ספר, סדנה, הרכב… ניתנים להרחבה מהאפליקציה.
create table if not exists project_types (
  id text primary key,
  name text not null,
  has_grade boolean not null default false,      -- האם לסוג הזה יש "שכבה"
  features jsonb not null default '{}'::jsonb,   -- ברירת המחדל של היכולות
  fields jsonb not null default '[]'::jsonb,     -- מאפיינים נוספים לסוג (תוויות)
  sort int not null default 0,
  archived boolean not null default false
);

-- קטלוג הכלים: התפקיד של כל כלי בהרכב, והאם הוא יחיד בהרכב.
create table if not exists instruments (
  name text primary key,
  role text not null default 'melody' check (role in ('drums','bass','harmony','melody')),
  is_unique boolean not null default false,
  sort int not null default 99
);

create table if not exists projects (
  id text primary key,
  name text not null,
  type_id text not null references project_types(id),
  grade text,
  active boolean not null default true,
  features jsonb not null default '{}'::jsonb,   -- דריסות מעל ברירת המחדל של הסוג
  settings jsonb not null default '{}'::jsonb,   -- חוקי חלוקה, ערכי ציון, המורה
  attrs jsonb not null default '{}'::jsonb,      -- ערכי המאפיינים הנוספים של הסוג
  baseline jsonb not null default '{}'::jsonb,   -- צבירה שהועברה ממערכת קודמת
  drive jsonb not null default '{}'::jsonb,      -- מזהי התיקייה והמסמך ב-Drive
  notes text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists participants (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  instrument text not null default '',
  instrument2 text not null default '',
  notes text not null default '',
  active boolean not null default true,
  joined_on date,                                -- שיעורים שקדמו לתאריך לא נספרים לו
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists participants_project on participants(project_id);

-- שיעור: אחד לפרויקט ולתאריך. המזהה הוא "<project>:<date>" ולכן שני מכשירים
-- שפותחים את אותו שיעור כותבים לאותה שורה.
create table if not exists lessons (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  date date not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lessons_project on lessons(project_id, date);

-- משמעת: שורה רק למי שיש עליו מה לרשום בשיעור.
create table if not exists marks (
  lesson_id text not null references lessons(id) on delete cascade,
  participant_id text not null references participants(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  status text check (status in ('absent','late')),
  justified boolean not null default false,
  no_homework boolean not null default false,
  primary key (lesson_id, participant_id)
);
create index if not exists marks_project on marks(project_id);

-- החלוקה להרכבים של שיעור: ההרכבים עצמם נשמרים, לא רק הצבירה.
create table if not exists draws (
  lesson_id text primary key references lessons(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists draws_project on draws(project_id);

-- הבנקים: רפרטואר, תרגילים ושיעורי בית — משותפים לכל הפרויקטים.
create table if not exists bank_items (
  id text primary key,
  kind text not null check (kind in ('repertoire','exercise','homework')),
  title text not null,
  notes text not null default '',
  tags jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists lesson_items (
  id text primary key,
  lesson_id text not null references lessons(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  item_id text not null references bank_items(id) on delete cascade,
  kind text not null,
  position int not null default 0
);
create index if not exists lesson_items_lesson on lesson_items(lesson_id);
create index if not exists lesson_items_item on lesson_items(item_id);

-- סרטונים וקבצים ב-Drive שמחוברים לשיעור (ואולי לתרגיל).
create table if not exists media (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  lesson_id text references lessons(id) on delete set null,
  item_id text references bank_items(id) on delete set null,
  kind text not null default 'video',
  title text not null default '',
  filename text not null default '',
  drive_file_id text not null default '',
  url text not null default '',
  size bigint,
  created_at timestamptz not null default now()
);
create index if not exists media_project on media(project_id);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

-- הרשאות: רק בעלים מחוברים. anon לא רואה דבר.
do $$
declare t text;
begin
  foreach t in array array['project_types','instruments','projects','participants','lessons',
                           'marks','draws','bank_items','lesson_items','media','settings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
revoke all on owners from anon, authenticated;
grant execute on function is_owner() to authenticated;

-- נתוני פתיחה
insert into project_types (id, name, has_grade, features, fields, sort) values
  ('school_class', 'כיתה בבית ספר', true,
   '{"ensembles":true,"discipline":true,"journal":true,"videos":true}', '[]', 1),
  ('outside_group', 'קבוצה מחוץ לבית הספר', false,
   '{"ensembles":true,"discipline":false,"journal":true,"videos":true}', '["מקום","גיל"]', 2),
  ('workshop', 'סדנה', false,
   '{"ensembles":true,"discipline":false,"journal":true,"videos":true}', '["מקום","משך"]', 3),
  ('ensemble', 'הרכב', false,
   '{"ensembles":false,"discipline":false,"journal":true,"videos":true}', '[]', 4)
on conflict (id) do nothing;

insert into instruments (name, role, is_unique, sort) values
  ('תופים','drums',true,1), ('בס','bass',true,2), ('פסנתר','harmony',true,3), ('גיטרה','harmony',true,4),
  ('טרומבון','melody',false,5), ('טנור','melody',false,6), ('אלט','melody',false,7),
  ('חצוצרה','melody',false,8), ('חליל','melody',false,9), ('שירה','melody',false,10)
on conflict (name) do nothing;

insert into settings (key, value) values
  ('defaults', '{
     "grading": {"start":100,"absent":5,"late":3,"homework":5},
     "rules": {"required":["drums","bass","harmony","melody"],"maxGroup":7,"maxLoad":2,"maxGroups":5,"enrich":true,"teacher":true,"leader":false},
     "teacher": {"name":"תומר","instrument":"פסנתר"},
     "grades": ["ט","י","יא","יב"]
   }')
on conflict (key) do nothing;
