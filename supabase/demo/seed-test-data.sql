-- Test data: ~300 job applications with notes, status history and a few rate edits,
-- for trying the app by hand (ordering, search, details) and the "< 1 s search" NFR.
--
-- Run in the Supabase SQL Editor (as postgres; RLS does not apply there).
-- Targets the only user in the project; set v_email below if there are several.
-- Every company is prefixed with "[TEST] " — remove it all with cleanup-test-data.sql.

do $$
declare
  v_email text := null; -- e.g. 'you@example.com'; null = the only user in the project
  v_user uuid;
  v_count int := 300;

  companies text[] := array[
    'Acme Software House', 'Łódź Tech', 'Gdańsk Data Labs', 'Kraków Cloud', 'Wrocław Devs', 'Poznań FinTech',
    'Zielona Góra Systems', 'Żabka Tech', 'Allegro-like Marketplace', 'Bank Północny', 'Insurtech Śląsk',
    'Mobile Studio Białystok', 'HealthTech Lublin', 'GameDev Katowice', 'Logistics Szczecin', 'E-commerce Toruń',
    'AI Startup Warszawa', 'Consulting Rzeszów', 'Telco Olsztyn', 'Agencja Rekrutacyjna IT Hunters',
    'SaaS Kielce', 'Energy Opole', 'Retail Bydgoszcz', 'Security Gliwice', 'EdTech Sopot'
  ];
  positions text[] := array[
    'Junior Frontend Developer', 'Frontend Developer', 'Senior Frontend Developer', 'Fullstack Developer',
    'Senior Fullstack Developer', 'Backend Developer (Node.js)', 'React Developer', 'TypeScript Developer',
    'Tech Lead', 'QA Automation Engineer'
  ];
  first_names text[] := array['Anna', 'Katarzyna', 'Małgorzata', 'Agnieszka', 'Ewa', 'Paweł', 'Łukasz', 'Michał', 'Tomasz', 'Joanna', 'Żaneta', 'Grzegorz'];
  last_names text[] := array['Łukasik', 'Kowalska', 'Nowak', 'Wiśniewska', 'Zieliński', 'Wójcik', 'Kamińska', 'Lewandowski', 'Szymańska', 'Dąbrowski', 'Żak', 'Król'];
  call_notes text[] := array[
    'Pierwsza rozmowa z HR — podałem %s, bez negocjacji na razie.',
    'HR pytała o dostępność: od zaraz / 1 miesiąc wypowiedzenia.',
    'Ustalona rozmowa techniczna na przyszły tydzień, 60 min, live coding.',
    'Po rozmowie technicznej: feedback pozytywny, czekam na decyzję.',
    'HR potwierdziła widełki, praca hybrydowa 2 dni w biurze.',
    'Rekruter zewnętrzny — klient końcowy nieujawniony, stawka do %s.',
    'Oddzwonić w piątek po 14:00.'
  ];
  comments text[] := array[
    'Ciekawy projekt, ale stary stack.',
    'Sprawdzić opinie na GoWork.',
    'Znajomy tam pracuje — zapytać o zespół.',
    'Ogłoszenie wisi od miesiąca, może być problem.',
    'Benefity: prywatna opieka, karta sportowa.'
  ];
  pipeline public.application_status[] := array['sent', 'hr_contact', 'interviews', 'offer', 'accepted']::public.application_status[];

  i int;
  n int;
  v_app uuid;
  v_status public.application_status;
  v_final_idx int;
  v_closed public.application_status;
  v_applied date;
  v_at timestamptz;
  v_last timestamptz;
  v_rate_low int;
  v_rate text;
  v_phone text;
  r float;
begin
  if v_email is not null then
    select id into v_user from auth.users where email = v_email;
  elsif (select count(*) from auth.users) = 1 then
    select id into v_user from auth.users;
  end if;
  if v_user is null then
    raise exception 'Set v_email at the top of the script (found % users).', (select count(*) from auth.users);
  end if;

  perform setseed(0.42);

  for i in 1..v_count loop
    v_applied := current_date - (random() * 90)::int;
    v_rate_low := 12 + (random() * 14)::int;
    v_rate := (v_rate_low + 3 + (random() * 3)::int) || 'k netto';
    v_phone := case (i % 4)
      when 0 then '+48 ' || (500 + i % 300) || ' ' || lpad((i * 7 % 1000)::text, 3, '0') || ' ' || lpad((i * 13 % 1000)::text, 3, '0')
      when 1 then (500 + i % 300) || '-' || lpad((i * 7 % 1000)::text, 3, '0') || '-' || lpad((i * 13 % 1000)::text, 3, '0')
      when 2 then '0048' || (500 + i % 300) || lpad((i * 7 % 1000)::text, 3, '0') || lpad((i * 13 % 1000)::text, 3, '0')
      else null
    end;

    -- Final status: mostly early stages, a fifth closed, a couple accepted.
    r := random();
    v_closed := null;
    v_final_idx := case
      when r < 0.35 then 1
      when r < 0.50 then 2
      when r < 0.64 then 3
      when r < 0.70 then 4
      when r < 0.71 then 5
      else 1 + (random() * 2)::int -- will be closed from here
    end;
    if r >= 0.71 then
      v_closed := case when random() < 0.8 then 'rejected' else 'withdrawn' end;
    end if;
    v_status := coalesce(v_closed, pipeline[v_final_idx]);

    insert into public.applications (
      user_id, company, position, posting_url, salary_range, quoted_rate, hr_contact_name, hr_contact_phone,
      applied_on, employment_type, work_mode, status, created_at, updated_at, last_activity_at
    ) values (
      v_user,
      '[TEST] ' || companies[1 + (i - 1) % array_length(companies, 1)],
      positions[1 + ((i * 7) % array_length(positions, 1))],
      case when i % 3 = 0 then null else 'https://example.com/oferta/' || i end,
      v_rate_low || '–' || (v_rate_low + 6) || 'k netto ' || case when i % 2 = 0 then 'B2B' else 'UoP' end,
      case when i % 5 = 0 then null else v_rate end,
      case when v_final_idx >= 2 or i % 3 = 0 then first_names[1 + i % 12] || ' ' || last_names[1 + (i * 5) % 12] end,
      case when v_final_idx >= 2 or i % 3 = 0 then v_phone end,
      v_applied,
      (case when i % 2 = 0 then 'b2b' else 'employment_contract' end)::public.employment_type,
      (array['remote', 'hybrid', 'onsite'])[1 + i % 3]::public.work_mode,
      v_status,
      v_applied::timestamptz + interval '9 hours',
      v_applied::timestamptz + interval '9 hours',
      v_applied::timestamptz + interval '9 hours'
    ) returning id into v_app;

    -- Status history walking forward to the final stage, then closing if closed.
    v_at := v_applied::timestamptz + interval '9 hours';
    v_last := v_at;
    for n in 2..v_final_idx loop
      -- Clamp recent applications to the past, but keep steps strictly increasing.
      v_at := least(v_at + ((2 + random() * 6)::int || ' days')::interval, now() - interval '1 hour' + (n || ' minutes')::interval);
      insert into public.status_changes (application_id, user_id, from_status, to_status, changed_at)
      values (v_app, v_user, pipeline[n - 1], pipeline[n], v_at);
      v_last := v_at;
    end loop;
    if v_closed is not null then
      v_at := least(v_at + ((1 + random() * 5)::int || ' days')::interval, now() - interval '1 hour' + interval '10 minutes');
      insert into public.status_changes (application_id, user_id, from_status, to_status, changed_at)
      values (v_app, v_user, pipeline[v_final_idx], v_closed, v_at);
      v_last := v_at;
    end if;

    -- Notes: calls for later stages, the occasional comment.
    for n in 1..least(v_final_idx, 4) loop
      if n > 1 or v_final_idx >= 2 then
        v_at := least(v_applied::timestamptz + ((n * 3 + random() * 3)::int || ' days')::interval + interval '11 hours', now() - interval '30 minutes');
        insert into public.notes (application_id, user_id, kind, body, noted_at, created_at, updated_at)
        values (v_app, v_user, 'phone_call', format(call_notes[1 + (i + n) % array_length(call_notes, 1)], v_rate), v_at, v_at, v_at);
        v_last := greatest(v_last, v_at);
      end if;
    end loop;
    if i % 4 = 0 then
      v_at := least(v_applied::timestamptz + interval '1 day 20 hours', now() - interval '20 minutes');
      insert into public.notes (application_id, user_id, kind, body, noted_at, created_at, updated_at)
      values (v_app, v_user, 'comment', comments[1 + i % array_length(comments, 1)], v_at, v_at, v_at);
      v_last := greatest(v_last, v_at);
    end if;

    -- A few quoted-rate edits in the change log.
    if i % 10 = 0 and v_rate is not null then
      v_at := least(v_last + interval '1 day', now() - interval '10 minutes');
      insert into public.field_changes (application_id, user_id, field, old_value, new_value, changed_at)
      values (v_app, v_user, 'quoted_rate', (v_rate_low + 1) || 'k netto', v_rate, v_at);
    end if;

    update public.applications set last_activity_at = v_last, updated_at = v_last where id = v_app;
  end loop;

  raise notice 'Inserted % test applications for user %.', v_count, v_user;
end;
$$;
