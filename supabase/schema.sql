create table if not exists public.rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    host_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'waiting'
        check (status in ('waiting', 'playing', 'finished')),
    created_at timestamptz not null default now()
);

create table if not exists public.players (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    role text not null check (role in ('pilot', 'gunner', 'engineer', 'explorer')),
    color text not null,
    x double precision not null default 180,
    y double precision not null default 180,
    is_host boolean not null default false,
    joined_at timestamptz not null default now()
);

alter table public.rooms
    add column if not exists mission_state jsonb not null default
        '{"evidence":{"gravity":false,"mass":false,"formula":false},"repairContributors":[],"activators":[],"tasks":{"investigation":false,"repair":false,"activation":false}}'::jsonb,
    add column if not exists ends_at timestamptz,
    add column if not exists score integer not null default 0,
    add column if not exists started_at timestamptz,
    add column if not exists finished_at timestamptz;

create unique index if not exists players_room_user_unique
    on public.players (room_id, user_id);
create unique index if not exists players_room_role_unique
    on public.players (room_id, role);
create index if not exists players_room_joined_idx
    on public.players (room_id, joined_at);

create or replace function public.enforce_room_player_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    room_status text;
    room_host uuid;
    player_count integer;
begin
    select status, host_id into room_status, room_host
    from public.rooms
    where id = new.room_id
    for update;

    if room_status is distinct from 'waiting' then
        raise exception 'room_not_waiting';
    end if;

    if new.is_host and (new.user_id <> room_host or new.role <> 'pilot') then
        raise exception 'invalid_host_player';
    end if;
    if not new.is_host and new.user_id = room_host then
        raise exception 'host_player_must_be_pilot';
    end if;

    select count(*) into player_count
    from public.players
    where room_id = new.room_id;

    if player_count >= 4 then
        raise exception 'room_capacity_reached';
    end if;

    return new;
end;
$$;

drop trigger if exists players_enforce_room_capacity on public.players;
create trigger players_enforce_room_capacity
before insert on public.players
for each row execute function public.enforce_room_player_capacity();

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.players
        where room_id = p_room_id and user_id = (select auth.uid())
    );
$$;

create or replace function public.join_room(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_room public.rooms%rowtype;
    selected_player public.players%rowtype;
    selected_role text;
    selected_color text;
begin
    if (select auth.uid()) is null then
        raise exception 'authentication_required';
    end if;
    if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 20 then
        raise exception 'invalid_player_name';
    end if;

    select * into selected_room
    from public.rooms
    where code = upper(trim(p_code))
    for update;

    if not found then
        raise exception 'room_not_found';
    end if;
    if selected_room.status <> 'waiting' then
        raise exception 'room_not_waiting';
    end if;
    if exists (
        select 1 from public.players
        where room_id = selected_room.id and user_id = (select auth.uid())
    ) then
        raise exception 'already_joined';
    end if;

    select slot.role, slot.color
    into selected_role, selected_color
    from (values
        ('pilot', '#4287f5', 1),
        ('gunner', '#f05252', 2),
        ('engineer', '#42b883', 3),
        ('explorer', '#f3c94b', 4)
    ) as slot(role, color, position)
    where not exists (
        select 1 from public.players p
        where p.room_id = selected_room.id and p.role = slot.role
    )
    order by slot.position
    limit 1;

    if selected_role is null then
        raise exception 'room_capacity_reached';
    end if;

    insert into public.players (
        room_id, user_id, name, role, color, x, y, is_host
    )
    values (
        selected_room.id,
        (select auth.uid()),
        trim(p_name),
        selected_role,
        selected_color,
        180 + (select count(*) from public.players where room_id = selected_room.id) * 70,
        180,
        false
    )
    returning * into selected_player;

    return jsonb_build_object(
        'room', to_jsonb(selected_room),
        'player', to_jsonb(selected_player)
    );
end;
$$;

alter table public.rooms enable row level security;
alter table public.players enable row level security;

do $$
declare
    existing_policy record;
begin
    for existing_policy in
        select tablename, policyname
        from pg_policies
        where schemaname = 'public' and tablename in ('rooms', 'players')
    loop
        execute format(
            'drop policy if exists %I on public.%I',
            existing_policy.policyname,
            existing_policy.tablename
        );
    end loop;
end;
$$;

create policy rooms_read_authenticated on public.rooms
for select to authenticated
using (host_id = (select auth.uid()) or public.is_room_member(id));

create policy rooms_create_as_host on public.rooms
for insert to authenticated with check (host_id = (select auth.uid()));

create policy rooms_update_as_host on public.rooms
for update to authenticated
using (host_id = (select auth.uid()))
with check (host_id = (select auth.uid()));

create policy rooms_delete_as_host on public.rooms
for delete to authenticated using (host_id = (select auth.uid()));

create policy players_read_authenticated on public.players
for select to authenticated using (public.is_room_member(room_id));

create policy players_join_as_self on public.players
for insert to authenticated
with check (
    user_id = (select auth.uid())
    and (
        not is_host
        or exists (
            select 1 from public.rooms
            where id = room_id and host_id = (select auth.uid())
        )
    )
);



create policy players_leave_as_self on public.players
for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.start_room(
    p_room_id uuid,
    p_test_mode boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_room public.rooms%rowtype;
    player_count integer;
    initial_state jsonb := '{"testMode":false,"evidence":{"gravity":false,"mass":false,"formula":false},"repairContributors":[],"activators":[],"tasks":{"investigation":false,"repair":false,"activation":false}}'::jsonb;
begin
    select * into selected_room
    from public.rooms
    where id = p_room_id
    for update;

    if not found or selected_room.host_id <> (select auth.uid()) then
        raise exception 'only_host_can_start';
    end if;

    if selected_room.status not in ('waiting', 'finished') then
        raise exception 'room_already_started';
    end if;

    select count(*) into player_count
    from public.players
    where room_id = p_room_id;

    if p_test_mode and player_count < 2 then
        raise exception 'at_least_two_players_required';
    elsif not p_test_mode and player_count <> 4 then
        raise exception 'exactly_four_players_required';
    end if;

    initial_state := jsonb_set(initial_state, '{testMode}', to_jsonb(p_test_mode), true);

    update public.rooms
    set status = 'playing',
        mission_state = initial_state,
        score = 0,
        started_at = now(),
        finished_at = null,
        ends_at = now() + interval '180 seconds'
    where id = p_room_id;

    return jsonb_build_object(
        'status', 'playing',
        'mission_state', initial_state,
        'score', 0,
        'ends_at', now() + interval '180 seconds'
    );
end;
$$;

create or replace function public.submit_mission_action(
    p_room_id uuid,
    p_action text,
    p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_room public.rooms%rowtype;
    player_role text;
    state jsonb;
    evidence jsonb;
    contributors jsonb;
    activators jsonb;
    tasks jsonb;
    evidence_key text;
    submitted_answer text;
    next_status text;
    next_score integer;
begin
    select * into selected_room
    from public.rooms
    where id = p_room_id
    for update;

    if not found then
        raise exception 'room_not_found';
    end if;

    if not exists (
        select 1 from public.players
        where room_id = p_room_id and user_id = (select auth.uid())
    ) then
        raise exception 'player_not_in_room';
    end if;

    if selected_room.status <> 'playing' then
        if p_action = 'expire' and selected_room.status = 'finished' then
            return jsonb_build_object(
                'status', selected_room.status,
                'mission_state', selected_room.mission_state,
                'score', selected_room.score
            );
        end if;
        raise exception 'mission_not_running';
    end if;

    state := selected_room.mission_state;
    evidence := state->'evidence';
    contributors := state->'repairContributors';
    activators := state->'activators';
    tasks := state->'tasks';
    next_status := 'playing';
    next_score := selected_room.score;

    if now() >= selected_room.ends_at and p_action <> 'expire' then
        next_status := 'finished';
        next_score := 0;
    elsif p_action = 'expire' then
        if now() < selected_room.ends_at then
            return jsonb_build_object(
                'status', selected_room.status,
                'mission_state', selected_room.mission_state,
                'score', selected_room.score,
                'ends_at', selected_room.ends_at
            );
        end if;
        next_status := 'finished';
        next_score := 0;
    elsif p_action = 'collect_evidence' then
        select role into player_role
        from public.players
        where room_id = p_room_id and user_id = (select auth.uid());

        evidence_key := p_payload->>'evidence';
        if evidence_key is null
            or (evidence_key = 'gravity' and player_role <> 'explorer')
            or (evidence_key = 'mass' and player_role <> 'engineer')
            or (evidence_key = 'formula' and player_role <> 'pilot')
            or evidence_key not in ('gravity', 'mass', 'formula') then
            raise exception 'wrong_role_for_evidence';
        end if;

        evidence := jsonb_set(evidence, array[evidence_key], 'true'::jsonb, true);
        state := jsonb_set(state, '{evidence}', evidence, true);
    elsif p_action = 'submit_calculation' then
        submitted_answer := replace(p_payload->>'answer', ',', '.');
        if evidence->>'gravity' <> 'true'
            or evidence->>'mass' <> 'true'
            or evidence->>'formula' <> 'true' then
            raise exception 'team_evidence_incomplete';
        end if;
        if submitted_answer is null
            or submitted_answer !~ '^[0-9]+([.][0-9]+)?$'
            or submitted_answer::numeric <> 37.1 then
            raise exception 'incorrect_answer';
        end if;

        tasks := jsonb_set(tasks, '{investigation}', 'true'::jsonb, true);
        state := jsonb_set(state, '{tasks}', tasks, true);
    elsif p_action = 'repair_contribute' then
        select role into player_role
        from public.players
        where room_id = p_room_id and user_id = (select auth.uid());

        if player_role not in ('engineer', 'gunner') then
            raise exception 'engineer_or_gunner_required';
        end if;
        if not (contributors ? player_role) then
            contributors := contributors || to_jsonb(player_role);
        end if;
        state := jsonb_set(state, '{repairContributors}', contributors, true);

        if contributors ? 'engineer' and contributors ? 'gunner' then
            tasks := jsonb_set(tasks, '{repair}', 'true'::jsonb, true);
            state := jsonb_set(state, '{tasks}', tasks, true);
        end if;
    elsif p_action = 'activate' then
        if tasks->>'investigation' <> 'true' or tasks->>'repair' <> 'true' then
            raise exception 'complete_previous_tasks_first';
        end if;

        if not (activators ? (select auth.uid())::text) then
            activators := activators || to_jsonb((select auth.uid())::text);
        end if;
        state := jsonb_set(state, '{activators}', activators, true);

        if jsonb_array_length(activators) = 4 then
            tasks := jsonb_set(tasks, '{activation}', 'true'::jsonb, true);
            state := jsonb_set(state, '{tasks}', tasks, true);
            next_status := 'finished';
            next_score := 300 + greatest(
                0,
                floor(extract(epoch from (selected_room.ends_at - now())))::integer
            ) * 5;
        end if;
    else
        raise exception 'unknown_mission_action';
    end if;

    update public.rooms
    set mission_state = state,
        status = next_status,
        score = next_score,
        finished_at = case when next_status = 'finished' then now() else null end
    where id = p_room_id;

    return jsonb_build_object(
        'status', next_status,
        'mission_state', state,
        'score', next_score
    );
end;
$$;

revoke all on function public.start_room(uuid, boolean) from public;
revoke all on function public.submit_mission_action(uuid, text, jsonb) from public;
revoke all on function public.is_room_member(uuid) from public;
revoke all on function public.join_room(text, text) from public;
grant execute on function public.start_room(uuid, boolean) to authenticated;
grant execute on function public.submit_mission_action(uuid, text, jsonb) to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
    ) then
        alter publication supabase_realtime add table public.rooms;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
    ) then
        alter publication supabase_realtime add table public.players;
    end if;
end;
$$;
