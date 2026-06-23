-- ============================================================
-- Sistema Turnazione Guardia Medica — schema iniziale
-- ============================================================
create extension if not exists pgcrypto;

-- ─── TABELLE ────────────────────────────────────────────────
create table if not exists turnisti (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text unique not null,
  livello    text not null check (livello in ('admin','responsabile','turnista','esterno')),
  created_at timestamptz default now()
);

create table if not exists schema_turni (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null default '',
  ora_inizio    text not null default '08:00',
  ora_fine      text not null default '20:00',
  n_turnisti    int  not null default 1 check (n_turnisti >= 1),
  ricorrenza    text not null default 'tutti'
                check (ricorrenza in ('tutti','feriali','weekend','prefestivi','festivi','custom')),
  giorni_custom int[] not null default '{}'::int[],
  ordine        int  not null default 0,
  created_at    timestamptz default now()
);

-- ─── HELPER (SECURITY DEFINER → bypassano la RLS) ───────────
create or replace function is_utente_attivo() returns boolean as $$
  select exists (
    select 1 from turnisti
    where email = (select email from auth.users where id = auth.uid())
  )
$$ language sql security definer stable;

-- "Admin" nel codice = poteri di gestione: admin (proprietario) + responsabile
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from turnisti
    where email = (select email from auth.users where id = auth.uid())
      and livello in ('admin','responsabile')
  )
$$ language sql security definer stable;

-- Profilo dell'utente loggato (usato dall'app per il login/whitelist)
create or replace function get_my_profile()
returns table (id uuid, email text, livello text, nome text) as $$
  select t.id, t.email, t.livello, t.nome
  from turnisti t
  where t.email = (select email from auth.users where id = auth.uid())
$$ language sql security definer stable;

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────
alter table turnisti     enable row level security;
alter table schema_turni enable row level security;

drop policy if exists turnisti_select on turnisti;
drop policy if exists turnisti_insert on turnisti;
drop policy if exists turnisti_update on turnisti;
drop policy if exists turnisti_delete on turnisti;
-- NB: nelle policy NON usare (select email from auth.users ...): il ruolo
-- 'authenticated' non ha accesso ad auth.users → la query va in errore.
-- Usare l'email dal JWT: (auth.jwt() ->> 'email').
create policy turnisti_select on turnisti for select
  using (email = (auth.jwt() ->> 'email') or is_admin());
create policy turnisti_insert on turnisti for insert with check (is_admin());
create policy turnisti_update on turnisti for update using (is_admin());
create policy turnisti_delete on turnisti for delete using (is_admin());

drop policy if exists schema_select on schema_turni;
drop policy if exists schema_modify on schema_turni;
create policy schema_select on schema_turni for select using (is_utente_attivo());
create policy schema_modify on schema_turni for all using (is_admin()) with check (is_admin());

-- ─── Protezione admin permanente ────────────────────────────
-- NB: NON leggere auth.users qui (il ruolo authenticated non vi ha accesso):
-- l'email dell'utente corrente si prende dal JWT con auth.jwt() ->> 'email'.
create or replace function proteggi_admin() returns trigger as $$
declare
  current_email text;
begin
  if tg_op = 'DELETE' then
    if old.email = 'marabelli.s@gmail.com' then
      raise exception 'Admin permanente: non eliminabile';
    end if;
    return old;
  end if;
  if old.email = 'marabelli.s@gmail.com' then
    current_email := auth.jwt() ->> 'email';
    if current_email is distinct from 'marabelli.s@gmail.com' then
      raise exception 'Admin permanente: modificabile solo da te stesso';
    end if;
    if new.email <> old.email or new.livello <> old.livello then
      raise exception 'Admin permanente: email e livello non modificabili';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_proteggi_admin on turnisti;
create trigger trg_proteggi_admin before update or delete on turnisti
  for each row execute function proteggi_admin();

-- ─── GRANT espliciti (compatibile con la policy Data API 30/10/2026) ──
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on turnisti     to authenticated;
grant select, insert, update, delete on schema_turni to authenticated;
grant execute on function get_my_profile()  to authenticated, anon;
grant execute on function is_admin()        to authenticated, anon;
grant execute on function is_utente_attivo() to authenticated, anon;

-- ─── SEED admin permanente ──────────────────────────────────
insert into turnisti (nome, email, livello)
values ('Stefano Marabelli', 'marabelli.s@gmail.com', 'admin')
on conflict (email) do nothing;

-- ─── TURNI ASSEGNATI (giorno + tipo turno + slot → turnista) ────────
create table if not exists turni (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  turno_schema_id uuid not null references schema_turni(id) on delete cascade,
  slot int not null default 0,
  turnista_id uuid references turnisti(id) on delete set null,
  created_at timestamptz default now(),
  unique (data, turno_schema_id, slot)
);
alter table turni enable row level security;
drop policy if exists turni_select on turni;
drop policy if exists turni_modify on turni;
create policy turni_select on turni for select using (is_utente_attivo());
create policy turni_modify on turni for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on turni to authenticated;
create index if not exists idx_turni_data on turni(data);

-- ─── DESIDERATA / INDISPONIBILITÀ ───────────────────────────────────
-- Una riga per (data, turno, turnista): tipo = 'desiderata' (lo vorrebbe)
-- oppure 'indisponibilita' (non può). Un turnista sta in una sola colonna
-- per turno (unique sul terzetto).
create table if not exists desiderata (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  turno_schema_id uuid not null references schema_turni(id) on delete cascade,
  turnista_id uuid not null references turnisti(id) on delete cascade,
  tipo text not null check (tipo in ('desiderata','indisponibilita')),
  created_at timestamptz default now(),
  unique (data, turno_schema_id, turnista_id)
);
alter table desiderata enable row level security;
drop policy if exists des_select on desiderata;
drop policy if exists des_modify on desiderata;
create policy des_select on desiderata for select using (is_utente_attivo());
create policy des_modify on desiderata for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on desiderata to authenticated;
create index if not exists idx_desiderata_data on desiderata(data);

-- Finestra (per mese) in cui la raccolta è aperta ai turnisti.
create table if not exists desiderata_finestra (
  mese text primary key,
  aperta_da date,
  aperta_a date,
  created_at timestamptz default now()
);
alter table desiderata_finestra enable row level security;
drop policy if exists df_select on desiderata_finestra;
drop policy if exists df_modify on desiderata_finestra;
create policy df_select on desiderata_finestra for select using (is_utente_attivo());
create policy df_modify on desiderata_finestra for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on desiderata_finestra to authenticated;
