import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CrewRole = 'pilot' | 'gunner' | 'engineer' | 'explorer'
export type RoomStatus = 'waiting' | 'playing' | 'finished'

export interface RoomRow {
    id: string
    code: string
    host_id: string
    status: RoomStatus
    mission_state: MissionState
    ends_at: string | null
    score: number
}

export interface PlayerRow {
    id: string
    room_id: string
    user_id: string
    name: string
    role: CrewRole
    color: string
    x: number
    y: number
    is_host: boolean
    joined_at: string
}

export interface MissionState {
    testMode?: boolean
    evidence: {
        gravity: boolean
        mass: boolean
        formula: boolean
    }
    repairContributors: CrewRole[]
    activators: string[]
    tasks: {
        investigation: boolean
        repair: boolean
        activation: boolean
    }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
const isConfigured = Boolean(supabaseUrl && supabaseKey)

let client: SupabaseClient | null = null

export function isSupabaseConfigured() {
    return isConfigured
}

export function getSupabase() {
    if (!isConfigured) {
        throw new Error(
            'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local.',
        )
    }

    if (!client) {
        client = createClient(supabaseUrl!, supabaseKey!, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false,
            },
        })
    }

    return client
}

export async function ensureAnonymousSession() {
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.getSession()

    if (error) {
        throw new Error(`Não foi possível verificar a sessão: ${error.message}`)
    }

    if (data.session) {
        return data.session.user.id
    }

    const { data: signInData, error: signInError } =
        await supabase.auth.signInAnonymously()

    if (signInError) {
        throw new Error(
            `Não foi possível entrar anonimamente. Confirme se Anonymous Sign-Ins está ativado no Supabase: ${signInError.message}`,
        )
    }

    if (!signInData.user) {
        throw new Error('O Supabase não retornou um usuário autenticado.')
    }

    return signInData.user.id
}
