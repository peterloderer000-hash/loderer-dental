-- =====================================================
-- Loderer Dental App — Supabase Schema
-- Spustiť v: Supabase Dashboard → SQL Editor
-- =====================================================

-- ─── 1. PROFILES ─────────────────────────────────────
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('patient', 'doctor')),
  full_name     text,
  phone_number  text,
  created_at    timestamptz default now()
);

-- POZNÁMKA: Profil vytvára setup-role.tsx cez upsert.
-- Automatický trigger NIE JE potrebný.

-- RLS
alter table profiles enable row level security;

-- Každý prihlásený používateľ vidí vlastný profil
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

-- Každý prihlásený môže vytvoriť vlastný profil (pre setup-role)
drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Každý prihlásený môže aktualizovať vlastný profil
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Pacienti môžu vidieť doktorov (pre rezerváciu)
drop policy if exists "Anyone can view doctors" on profiles;
create policy "Anyone can view doctors"
  on profiles for select using (role = 'doctor');

-- Doktori môžu vidieť pacientov (pre zobrazenie mena v termínoch)
drop policy if exists "Doctors can view patients" on profiles;
create policy "Doctors can view patients"
  on profiles for select
  using (
    role = 'patient' and
    exists (
      select 1 from profiles p2 where p2.id = auth.uid() and p2.role = 'doctor'
    )
  );


-- ─── 2. APPOINTMENTS ─────────────────────────────────
create table if not exists appointments (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references profiles(id) on delete cascade,
  doctor_id        uuid not null references profiles(id) on delete cascade,
  appointment_date timestamptz not null,
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'completed', 'cancelled')),
  notes            text,
  created_at       timestamptz default now()
);

create index if not exists idx_appointments_patient on appointments(patient_id);
create index if not exists idx_appointments_doctor  on appointments(doctor_id);
create index if not exists idx_appointments_date    on appointments(appointment_date);

alter table appointments enable row level security;

drop policy if exists "Patients see own appointments" on appointments;
create policy "Patients see own appointments"
  on appointments for select
  using (patient_id = auth.uid());

drop policy if exists "Doctors see own appointments" on appointments;
create policy "Doctors see own appointments"
  on appointments for select
  using (doctor_id = auth.uid());

drop policy if exists "Patients can book" on appointments;
create policy "Patients can book"
  on appointments for insert
  with check (patient_id = auth.uid());

drop policy if exists "Patients can cancel own" on appointments;
create policy "Patients can cancel own"
  on appointments for update
  using (patient_id = auth.uid());

drop policy if exists "Doctors can update status" on appointments;
create policy "Doctors can update status"
  on appointments for update
  using (doctor_id = auth.uid());


-- ─── 3. DENTAL CHARTS ────────────────────────────────
create table if not exists dental_charts (
  patient_id   uuid not null references profiles(id) on delete cascade,
  doctor_id    uuid references profiles(id),
  tooth_number integer not null check (tooth_number between 11 and 48),
  status       text not null default 'healthy'
               check (status in ('healthy','cavity','filled','crown','extracted','missing','root_canal')),
  notes        text,
  updated_at   timestamptz default now(),
  primary key (patient_id, tooth_number)
);

create index if not exists idx_dental_charts_patient on dental_charts(patient_id);

alter table dental_charts enable row level security;

drop policy if exists "Doctors can manage dental charts" on dental_charts;
create policy "Doctors can manage dental charts"
  on dental_charts for all
  using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'doctor'
    )
  );

drop policy if exists "Patients can view own chart" on dental_charts;
create policy "Patients can view own chart"
  on dental_charts for select
  using (patient_id = auth.uid());


-- ─── 4. HEALTH PASSPORTS ─────────────────────────────
create table if not exists health_passports (
  patient_id              uuid primary key references profiles(id) on delete cascade,
  main_reasons            text[],
  medical_history         text[],
  allergies               text,
  medications             text,
  dental_history          text,
  fear_level              text,
  comfort_preferences     text[],
  aesthetic_expectations  text[],
  lifestyle_habits        text[],
  investment_preference   text,
  open_question           text,
  created_at              timestamptz default now()
);

alter table health_passports enable row level security;

drop policy if exists "Patients manage own passport" on health_passports;
create policy "Patients manage own passport"
  on health_passports for all
  using (patient_id = auth.uid());

drop policy if exists "Doctors can view patient passports" on health_passports;
create policy "Doctors can view patient passports"
  on health_passports for select
  using (
    exists (
      select 1 from profiles where id = auth.uid() and role = 'doctor'
    )
  );


-- ─── HOTOVO ───────────────────────────────────────────
-- Po spustení over v: Authentication → Users, Table Editor
-- Nastav rolu doktora ručne:
--   update profiles set role = 'doctor', full_name = 'MDDr. Loderer'
--   where id = '<doctor-user-id>';
