-- ============================================================
-- Sistema Turnazione Guardia Medica — schema iniziale
-- ============================================================
create extension if not exists pgcrypto;

-- ─── TABELLE ────────────────────────────────────────────────
create table if not exists turnisti (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text unique not null,
  livello    text not null check (livello in ('admin','turnista','esterno')),
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

create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from turnisti
    where email = (select email from auth.users where id = auth.uid())
      and livello = 'admin'
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
create policy turnisti_select on turnisti for select
  using (email = (select email from auth.users where id = auth.uid()) or is_admin());
create policy turnisti_insert on turnisti for insert with check (is_admin());
create policy turnisti_update on turnisti for update using (is_admin());
create policy turnisti_delete on turnisti for delete using (is_admin());

drop policy if exists schema_select on schema_turni;
drop policy if exists schema_modify on schema_turni;
create policy schema_select on schema_turni for select using (is_utente_attivo());
create policy schema_modify on schema_turni for all using (is_admin()) with check (is_admin());

-- ─── Protezione admin permanente ────────────────────────────
create or replace function proteggi_admin() returns trigger as $$
begin
  if (tg_op = 'DELETE') then
    if old.email = 'marabelli.s@gmail.com' then
      raise exception 'Admin permanente: non eliminabile';
    end if;
    return old;
  end if;
  if old.email = 'marabelli.s@gmail.com' and (new.livello <> 'admin' or new.email <> old.email) then
    raise exception 'Admin permanente: email e livello non modificabili';
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
