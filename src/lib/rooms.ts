import type { RealtimeChannel } from '@supabase/supabase-js'
import {
    ensureAnonymousSession,
    getSupabase,
    type CrewRole,
    type MissionState,
    type PlayerRow,
    type RoomRow,
} from './supabase'

const roles: { role: CrewRole; color: string }[] = [
    { role: 'pilot', color: '#4287f5' },
    { role: 'gunner', color: '#f05252' },
    { role: 'engineer', color: '#42b883' },
    { role: 'explorer', color: '#f3c94b' },
]

const codeCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newRoomCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(5))
    return Array.from(
        bytes,
        (byte) => codeCharacters[byte % codeCharacters.length],
    ).join('')
}

function cleanName(name: string) {
    const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 20)
    if (!cleaned) {
        throw new Error('Informe um nome para a tripulação.')
    }
    return cleaned
}

export function emptyMissionState(): MissionState {
    return {
        testMode: false,
        evidence: { gravity: false, mass: false, formula: false },
        repairContributors: [],
        activators: [],
        tasks: {
            investigation: false,
            repair: false,
            activation: false,
        },
    }
}

async function addPlayer(
    room: RoomRow,
    userId: string,
    name: string,
    isHost: boolean,
) {
    const supabase = getSupabase()
    const { data: members, error: membersError } = await supabase
        .from('players')
        .select('role')
        .eq('room_id', room.id)

    if (membersError) {
        throw new Error(`Não foi possível consultar a tripulação: ${membersError.message}`)
    }

    if (members.length >= 4) {
        throw new Error('Esta sala já está completa (4/4).')
    }

    const roleSlot = isHost
        ? roles[0]
        : roles.find((slot) => !members.some((member) => member.role === slot.role))

    if (!roleSlot) {
        throw new Error('Não há uma função disponível nesta sala.')
    }

    const { data, error } = await supabase
        .from('players')
        .insert({
            room_id: room.id,
            user_id: userId,
            name,
            role: roleSlot.role,
            color: roleSlot.color,
            x: 180 + members.length * 70,
            y: 180,
            is_host: isHost,
        })
        .select('*')
        .single()

    if (error) {
        if (error.code === '23505') {
            throw new Error('A função foi ocupada ao mesmo tempo. Tente entrar novamente.')
        }
        if (error.message.toLowerCase().includes('capacity')) {
            throw new Error('Esta sala acabou de ficar completa (4/4).')
        }
        throw new Error(`Não foi possível entrar na sala: ${error.message}`)
    }

    return data as PlayerRow
}

export async function createRoom(name: string) {
    const supabase = getSupabase()
    const userId = await ensureAnonymousSession()
    let room: RoomRow | null = null

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data, error } = await supabase
            .from('rooms')
            .insert({
                code: newRoomCode(),
                host_id: userId,
                status: 'waiting',
                mission_state: emptyMissionState(),
                score: 0,
            })
            .select('*')
            .single()

        if (!error) {
            room = data as RoomRow
            break
        }

        if (error.code !== '23505') {
            throw new Error(`Não foi possível criar a sala: ${error.message}`)
        }
    }

    if (!room) {
        throw new Error('Não foi possível gerar um código exclusivo. Tente novamente.')
    }

    try {
        const player = await addPlayer(room, userId, cleanName(name), true)
        return { room, player }
    } catch (error) {
        const { error: cleanupError } = await supabase
            .from('rooms')
            .delete()
            .eq('id', room.id)
            .eq('host_id', userId)

        if (cleanupError) {
            console.error('Falha ao limpar a sala após erro ao criar anfitrião:', cleanupError)
        }
        throw error
    }
}

export async function joinRoom(code: string, name: string) {
    const supabase = getSupabase()
    await ensureAnonymousSession()
    const normalizedCode = code.trim().toUpperCase()

    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(normalizedCode)) {
        throw new Error('O código da sala deve ter cinco caracteres.')
    }

    const { data, error } = await supabase.rpc('join_room', {
        p_code: normalizedCode,
        p_name: cleanName(name),
    })

    if (error) {
        const message = error.message.toLowerCase()
        if (message.includes('room_not_found')) {
            throw new Error('Sala não encontrada. Confira o código e tente novamente.')
        }
        if (message.includes('room_not_waiting')) {
            throw new Error('Esta partida já começou ou foi encerrada.')
        }
        if (message.includes('room_capacity_reached')) {
            throw new Error('Esta sala acabou de ficar completa (4/4).')
        }
        if (message.includes('already_joined')) {
            throw new Error('Esta sessão já está conectada à sala.')
        }
        throw new Error(`Não foi possível entrar na sala: ${error.message}`)
    }
    if (!data || typeof data !== 'object') {
        throw new Error('O Supabase não retornou os dados da sala.')
    }

    const joined = data as { room?: RoomRow; player?: PlayerRow }
    if (!joined.room || !joined.player) {
        throw new Error('Resposta inválida ao entrar na sala.')
    }
    return { room: joined.room, player: joined.player }
}

export async function listPlayers(roomId: string) {
    const { data, error } = await getSupabase()
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true })

    if (error) {
        throw new Error(`Não foi possível carregar a tripulação: ${error.message}`)
    }

    return data as PlayerRow[]
}

export function watchRoom(
    roomId: string,
    onRoom: (room: RoomRow) => void,
    onPlayers: (players: PlayerRow[]) => void,
    onError: (message: string) => void,
) {
    const supabase = getSupabase()
    let active = true
    const refreshRoster = () => {
        if (!active) return
        void listPlayers(roomId).then(onPlayers).catch((error: Error) => {
            if (active) onError(error.message)
        })
    }
    const channel = supabase
        .channel(`room:${roomId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
            (payload) => {
                if (active && payload.new) {
                    onRoom(payload.new as RoomRow)
                } else if (active && payload.eventType === 'DELETE') {
                    onError('A sala foi encerrada pelo anfitrião.')
                }
            },
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
            refreshRoster,
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
            refreshRoster,
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'players' },
            refreshRoster,
        )
        .subscribe((status, error) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                onError(`Realtime indisponível (${status}): ${error?.message ?? 'verifique a publicação supabase_realtime.'}`)
            }
        })

    return () => {
        active = false
        void supabase.removeChannel(channel)
    }
}

export async function startRoom(
    room: RoomRow,
    player: PlayerRow,
    testMode = false,
) {
    if (!player.is_host) {
        throw new Error('Somente o anfitrião pode iniciar a missão.')
    }

    const { error } = await getSupabase().rpc('start_room', {
        p_room_id: room.id,
        p_test_mode: testMode,
    })
    if (error) {
        const message = error.message.toLowerCase()
        if (message.includes('exactly_four_players_required')) {
            throw new Error('A missão oficial precisa de exatamente quatro tripulantes conectados.')
        }
        if (message.includes('at_least_two_players_required')) {
            throw new Error('O teste de movimento precisa de pelo menos dois tripulantes.')
        }
        if (message.includes('only_host_can_start')) {
            throw new Error('Somente o anfitrião da sala pode iniciar.')
        }
        throw new Error(`Não foi possível iniciar: ${error.message}`)
    }
}

export async function leaveRoom(room: RoomRow, player: PlayerRow) {
    const supabase = getSupabase()
    if (player.is_host) {
        const { error } = await supabase
            .from('rooms')
            .delete()
            .eq('id', room.id)

        if (error) {
            throw new Error(`Não foi possível encerrar a sala: ${error.message}`)
        }
        return
    }

    const { error } = await supabase
        .from('players')
        .delete()
        .eq('id', player.id)
        .eq('user_id', player.user_id)

    if (error) {
        throw new Error(`Não foi possível sair da sala: ${error.message}`)
    }
}

export async function submitMissionAction(
    roomId: string,
    action: 'collect_evidence' | 'submit_calculation' | 'repair_contribute' | 'activate' | 'expire',
    payload: Record<string, string> = {},
) {
    const { data, error } = await getSupabase().rpc('submit_mission_action', {
        p_room_id: roomId,
        p_action: action,
        p_payload: payload,
    })
    if (error) {
        throw new Error(error.message)
    }
    return data as {
        status: string
        mission_state: MissionState
        score: number
        ends_at?: string
    }
}

export interface PositionUpdate {
    playerId: string
    x: number
    y: number
}

export interface GameChannel {
    sendPosition(position: PositionUpdate): void
    unsubscribe(): void
}

export function openGameChannel(
    roomId: string,
    onPosition: (position: PositionUpdate) => void,
    onStatus: (message: string) => void,
): Promise<GameChannel> {
    const supabase = getSupabase()
    let active = true
    let isSubscribed = false
    let isSending = false
    const channel: RealtimeChannel = supabase
        .channel(`game:${roomId}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'position' }, ({ payload }) => {
            if (
                typeof payload?.playerId === 'string' &&
                typeof payload?.x === 'number' &&
                typeof payload?.y === 'number'
            ) {
                onPosition(payload as PositionUpdate)
            }
        })
        .subscribe((status, error) => {
            if (status === 'SUBSCRIBED') {
                isSubscribed = true
                onStatus('Movimento sincronizado')
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                onStatus(`Sincronização indisponível: ${error?.message ?? status}`)
            }
        })

    return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
            if (!isSubscribed) {
                onStatus('Aguardando canal de movimento; confira o Realtime no Supabase.')
            }
            resolve({
                sendPosition(position) {
                    if (!active || !isSubscribed || isSending) return
                    isSending = true
                    void channel.send({ type: 'broadcast', event: 'position', payload: position })
                        .then((result) => {
                            if (result !== 'ok') {
                                onStatus(`Não foi possível transmitir movimento: ${result}`)
                            }
                        })
                        .catch((error: Error) => onStatus(error.message))
                        .finally(() => {
                            isSending = false
                        })
                },
                unsubscribe() {
                    active = false
                    window.clearTimeout(timeout)
                    void supabase.removeChannel(channel)
                },
            })
        }, 500)
    })
}
