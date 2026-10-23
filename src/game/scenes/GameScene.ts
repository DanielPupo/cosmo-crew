import Phaser from 'phaser'
import {
    emptyMissionState,
    leaveRoom,
    listPlayers,
    openGameChannel,
    startRoom,
    submitMissionAction,
    watchRoom,
    type GameChannel,
    type PositionUpdate,
} from '../../lib/rooms'
import {
    type CrewRole,
    type MissionState,
    type PlayerRow,
    type RoomRow,
} from '../../lib/supabase'
import { drawSoftStars, theme } from '../theme'

interface GameSceneData {
    demo?: boolean
    room?: RoomRow
    player?: PlayerRow
}

interface OtherPlayer {
    circle: Phaser.GameObjects.Arc
    label: Phaser.GameObjects.Text
    targetX: number
    targetY: number
}

type StationName = 'archive' | 'repair' | 'terminal' | 'reactor'

interface Station {
    name: StationName
    label: string
    x: number
    y: number
}

const roleNames: Record<CrewRole, string> = {
    pilot: 'Piloto',
    gunner: 'Artilheiro',
    engineer: 'Engenheiro',
    explorer: 'Explorador',
}

const roleClues: Partial<Record<CrewRole, { evidence: 'gravity' | 'mass' | 'formula'; text: string }>> = {
    pilot: { evidence: 'formula', text: 'Fórmula: P = m × g.' },
    engineer: { evidence: 'mass', text: 'Massa do equipamento: 10 kg.' },
    explorer: { evidence: 'gravity', text: 'Gravidade de Marte: 3,71 m/s².' },
}

export class GameScene extends Phaser.Scene {
    private player!: Phaser.GameObjects.Arc
    private body!: Phaser.Physics.Arcade.Body
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
    private wasd!: {
        W: Phaser.Input.Keyboard.Key
        A: Phaser.Input.Keyboard.Key
        S: Phaser.Input.Keyboard.Key
        D: Phaser.Input.Keyboard.Key
    }
    private keyHandler!: (event: KeyboardEvent) => void
    private statusText!: Phaser.GameObjects.Text
    private interactionHint!: Phaser.GameObjects.Text
    private taskText!: Phaser.GameObjects.Text
    private timerText!: Phaser.GameObjects.Text
    private answerPanel!: Phaser.GameObjects.Text
    private answerText!: Phaser.GameObjects.Text
    private resultsPanel!: Phaser.GameObjects.Container
    private mission: MissionState = emptyMissionState()
    private room: RoomRow | null = null
    private crewPlayer: PlayerRow | null = null
    private isDemo = false
    private answerOpen = false
    private answer = ''
    private stations: Station[] = []
    private remotePlayers = new Map<string, OtherPlayer>()
    private gameChannel: GameChannel | null = null
    private stopWatching: (() => void) | null = null
    private lastBroadcastAt = 0
    private endsAt = 0
    private expirationSent = false
    private score = 0
    private finished = false
    private messageTimer?: Phaser.Time.TimerEvent
    private noticeSequence = 0
    private actionBusy = false

    constructor() {
        super('GameScene')
    }

    init(data: GameSceneData) {
        this.isDemo = data.demo ?? false
        this.room = data.room ?? null
        this.crewPlayer = data.player ?? null
        this.mission = this.room?.mission_state ?? emptyMissionState()
        this.endsAt = this.room?.ends_at ? Date.parse(this.room.ends_at) : Date.now() + 180_000
        this.score = this.room?.score ?? 0
        this.finished = false
        this.expirationSent = false
        this.answerOpen = false
        this.answer = ''
        this.remotePlayers.clear()
        this.gameChannel?.unsubscribe()
        this.stopWatching?.()
        this.gameChannel = null
        this.stopWatching = null
    }

    create() {
        const width = this.cameras.main.width
        const height = this.cameras.main.height
        const centerX = width / 2
        const centerY = height / 2
        this.cameras.main.setBackgroundColor(theme.background)
        drawSoftStars(this, 70)
        this.physics.world.setBounds(20, 74, width - 40, height - 92)

        this.add.rectangle(centerX, centerY, width - 42, height - 92, 0xf7f3fa)
            .setStrokeStyle(2, theme.border)
            .setDepth(-2)

        this.add.rectangle(centerX, 34, Math.min(width - 40, 760), 54, theme.surface)
            .setStrokeStyle(1, theme.border)
            .setDepth(8)
        this.add.text(centerX, 34, 'AstroLearn  ·  COSMO CREW', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#352442',
        }).setOrigin(0.5).setDepth(9)

        this.taskText = this.add.text(34, 78, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '15px',
            color: '#352442',
            backgroundColor: '#fffefa',
            padding: { x: 15, y: 12 },
            lineSpacing: 6,
        }).setDepth(10)

        this.timerText = this.add.text(width - 34, 83, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '21px',
            fontStyle: 'bold',
            color: '#352442',
            backgroundColor: '#fffefa',
            padding: { x: 15, y: 10 },
        }).setOrigin(1, 0).setDepth(10)

        this.stations = [
            { name: 'archive', label: 'ARQUIVO\nDE DADOS', x: centerX - 250, y: centerY - 35 },
            { name: 'repair', label: 'PAINEL DE\nREPARO', x: centerX + 250, y: centerY - 35 },
            { name: 'terminal', label: 'TERMINAL\nCIENTÍFICO', x: centerX, y: centerY + 125 },
            { name: 'reactor', label: 'REATIVAR\nA NAVE', x: centerX, y: centerY - 155 },
        ]
        const startX = this.crewPlayer?.x ?? centerX
        const startY = this.crewPlayer?.y ?? centerY + 195
        this.player = this.add.circle(startX, startY, 22, this.playerColor())
            .setStrokeStyle(3, 0xffffff)
            .setDepth(6)
        this.physics.add.existing(this.player)
        this.body = this.player.body as Phaser.Physics.Arcade.Body
        this.body.setCollideWorldBounds(true)

        this.createStationObjects()
        this.createWall(centerX, centerY + 20, 210, 28)
        this.createWall(centerX - 180, centerY + 145, 100, 22)
        this.createWall(centerX + 180, centerY + 145, 100, 22)

        const roleLabel = this.crewPlayer
            ? `${this.crewPlayer.name} — ${roleNames[this.crewPlayer.role]}`
            : 'Tripulante de demonstração'
        this.add.rectangle(centerX, height - 28, Math.min(width - 40, 760), 38, theme.surface)
            .setStrokeStyle(1, theme.border)
            .setDepth(8)
        this.add.text(centerX, height - 28, `${roleLabel}  ·  WASD / setas para mover  ·  E para interagir`, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            color: '#786d7f',
        }).setOrigin(0.5).setDepth(10)

        this.statusText = this.add.text(centerX, height - 63, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '16px',
            color: '#352442',
            backgroundColor: '#fffefa',
            padding: { x: 14, y: 8 },
            align: 'center',
            wordWrap: { width: Math.min(width - 60, 700) },
        }).setOrigin(0.5).setDepth(15)

        this.interactionHint = this.add.text(centerX, height - 95, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#684080',
            backgroundColor: '#f4eff8',
            padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(14).setVisible(false)

        this.answerPanel = this.add.text(centerX, centerY, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '23px',
            color: '#352442',
            backgroundColor: '#fffefa',
            padding: { x: 28, y: 20 },
            align: 'center',
            wordWrap: { width: Math.min(width - 80, 600) },
        }).setOrigin(0.5).setDepth(30).setVisible(false)

        this.answerText = this.add.text(centerX, centerY + 92, '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            color: '#352442',
            backgroundColor: '#f4eff8',
            padding: { x: 16, y: 10 },
        }).setOrigin(0.5).setDepth(31).setVisible(false)

        this.resultsPanel = this.add.container(centerX, centerY).setDepth(50).setVisible(false)
        this.cursors = this.input.keyboard!.createCursorKeys()
        this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd
        this.keyHandler = (event) => this.onKeyDown(event)
        this.input.keyboard!.on('keydown', this.keyHandler)

        this.refreshHud()
        this.showStatus(this.isDemo
            ? 'DEMO LOCAL: explore as todas as funções no mesmo navegador.'
            : this.mission.testMode
                ? 'TESTE REMOTO: movimento sincronizado. São necessários quatro tripulantes para concluir a missão.'
            : `Conectado à sala ${this.room?.code ?? ''}. Encontrem as pistas e trabalhem em equipe.`)

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup())

        if (this.room && this.crewPlayer) {
            void this.connectMultiplayer()
        }
    }

    update(time: number) {
        if (!this.body || this.finished) return
        this.body.setVelocity(0)

        if (!this.answerOpen) {
            const speed = 190
            if (this.cursors.left.isDown || this.wasd.A.isDown) this.body.setVelocityX(-speed)
            if (this.cursors.right.isDown || this.wasd.D.isDown) this.body.setVelocityX(speed)
            if (this.cursors.up.isDown || this.wasd.W.isDown) this.body.setVelocityY(-speed)
            if (this.cursors.down.isDown || this.wasd.S.isDown) this.body.setVelocityY(speed)
            if (this.body.velocity.length() > 0) {
                this.body.velocity.normalize().scale(speed)
            }
        }

        for (const remote of this.remotePlayers.values()) {
            remote.circle.x = Phaser.Math.Linear(remote.circle.x, remote.targetX, 0.28)
            remote.circle.y = Phaser.Math.Linear(remote.circle.y, remote.targetY, 0.28)
            remote.label.setPosition(remote.circle.x, remote.circle.y - 31)
        }

        const station = this.answerOpen ? null : this.nearestStation()
        this.interactionHint
            .setText(station ? `Pressione E para ${this.stationActionLabel(station.name)}` : '')
            .setVisible(Boolean(station))

        this.updateTimer()
        if (this.gameChannel && this.crewPlayer && time - this.lastBroadcastAt >= 100) {
            this.lastBroadcastAt = time
            this.gameChannel.sendPosition({
                playerId: this.crewPlayer.id,
                x: this.player.x,
                y: this.player.y,
            })
        }
    }

    private createStationObjects() {
        const colors: Record<StationName, number> = {
            archive: 0xf4e2a8,
            repair: 0xcde8d9,
            terminal: 0xd8e9f3,
            reactor: 0xe8ddf1,
        }

        for (const station of this.stations) {
            const marker = this.add.rectangle(station.x, station.y, 112, 78, colors[station.name])
                .setStrokeStyle(2, theme.border)
                .setDepth(2)
            this.add.text(station.x, station.y, station.label, {
                fontFamily: 'Arial, sans-serif',
                fontSize: '12px',
                fontStyle: 'bold',
                color: '#493b50',
                align: 'center',
            }).setOrigin(0.5).setDepth(3)
            this.physics.add.existing(marker, true)
            this.physics.add.collider(this.player, marker)
        }
    }

    private createWall(x: number, y: number, width: number, height: number) {
        const wall = this.add.rectangle(x, y, width, height, 0xc8bdd0).setDepth(1)
        this.physics.add.existing(wall, true)
        this.physics.add.collider(this.player, wall)
    }

    private async connectMultiplayer() {
        if (!this.room || !this.crewPlayer) return
        try {
            const members = await listPlayers(this.room.id)
            for (const member of members) {
                if (member.id !== this.crewPlayer.id) this.addRemotePlayer(member)
            }

            this.stopWatching = watchRoom(
                this.room.id,
                (updatedRoom) => this.onRoomUpdated(updatedRoom),
                (players) => {
                    const activeIds = new Set(players.map((member) => member.id))
                    for (const [playerId, remote] of this.remotePlayers) {
                        if (!activeIds.has(playerId)) {
                            remote.circle.destroy()
                            remote.label.destroy()
                            this.remotePlayers.delete(playerId)
                        }
                    }
                    for (const member of players) {
                        if (member.id !== this.crewPlayer?.id) this.addRemotePlayer(member)
                    }
                },
                (message) => this.showStatus(message, true),
            )

            this.gameChannel = await openGameChannel(
                this.room.id,
                (position) => this.onPosition(position),
                (message) => this.showStatus(message, true),
            )
        } catch (error) {
            this.showStatus(error instanceof Error ? error.message : 'Falha ao conectar a partida.', true)
        }
    }

    private addRemotePlayer(member: PlayerRow) {
        if (this.remotePlayers.has(member.id)) return
        const color = Number.parseInt(member.color.replace('#', ''), 16)
        const circle = this.add.circle(member.x, member.y, 22, color || 0x91a1b5)
            .setStrokeStyle(3, 0xffffff)
            .setDepth(5)
        const label = this.add.text(member.x, member.y - 31, member.name, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#17243b',
            backgroundColor: '#ffffff',
            padding: { x: 4, y: 3 },
        }).setOrigin(0.5).setDepth(6)
        this.remotePlayers.set(member.id, {
            circle,
            label,
            targetX: member.x,
            targetY: member.y,
        })
    }

    private onPosition(position: PositionUpdate) {
        if (position.playerId === this.crewPlayer?.id) return
        const remote = this.remotePlayers.get(position.playerId)
        if (!remote) return
        const bounds = this.physics.world.bounds
        remote.targetX = Phaser.Math.Clamp(position.x, bounds.x, bounds.right)
        remote.targetY = Phaser.Math.Clamp(position.y, bounds.y, bounds.bottom)
    }

    private onRoomUpdated(room: RoomRow) {
        const previousStatus = this.room?.status
        this.room = room
        this.mission = room.mission_state ?? emptyMissionState()
        this.score = room.score ?? 0
        if (room.ends_at) this.endsAt = Date.parse(room.ends_at)
        this.refreshHud()

        if (room.status === 'finished') {
            this.showResults(this.mission.tasks.activation)
        } else if (room.status === 'playing' && previousStatus === 'finished') {
            this.finished = false
            this.expirationSent = false
            this.resultsPanel.setVisible(false)
            this.answerOpen = false
            this.answerPanel.setVisible(false)
            this.answerText.setVisible(false)
            this.showStatus('Nova missão iniciada! Compartilhem as informações da tripulação.')
        }
    }

    private onKeyDown(event: KeyboardEvent) {
        if (this.finished) return
        if (this.answerOpen) {
            if (event.key >= '0' && event.key <= '9') this.answer += event.key
            if ((event.key === '.' || event.key === ',') && !/[.,]/.test(this.answer)) {
                this.answer += ','
            }
            if (event.key === 'Backspace') this.answer = this.answer.slice(0, -1)
            this.answerText.setText(`Resposta: ${this.answer || '_'}   •   Enter confirma   •   E cancela`)

            if (event.key === 'Enter') {
                void this.submitCalculation()
            } else if (event.key === 'Escape' || event.key.toLowerCase() === 'e') {
                this.closeAnswer()
            }
            return
        }

        if (event.key.toLowerCase() === 'e') {
            const station = this.nearestStation()
            if (station) void this.interact(station)
        }
    }

    private nearestStation() {
        let nearest: Station | null = null
        let nearestDistance = 92
        for (const station of this.stations) {
            const distance = Phaser.Math.Distance.Between(
                this.player.x,
                this.player.y,
                station.x,
                station.y,
            )
            if (distance < nearestDistance) {
                nearest = station
                nearestDistance = distance
            }
        }
        return nearest
    }

    private stationActionLabel(station: StationName) {
        const labels: Record<StationName, string> = {
            archive: 'consultar o arquivo',
            repair: 'trabalhar no reparo',
            terminal: 'usar o terminal',
            reactor: 'ativar a nave',
        }
        return labels[station]
    }

    private async interact(station: Station) {
        if (this.isDemo) {
            this.interactInDemo(station)
            return
        }

        if (!this.room || !this.crewPlayer || this.actionBusy) return
        this.actionBusy = true
        try {
            if (station.name === 'archive') {
                const clue = roleClues[this.crewPlayer.role]
                if (!clue) {
                    this.showStatus('O arquivo está vazio para sua função. Converse com piloto, engenheiro e explorador.')
                    return
                }
                const result = await submitMissionAction(this.room.id, 'collect_evidence', { evidence: clue.evidence })
                this.applyActionResult(result)
                this.showStatus(`Pista registrada para a equipe: ${clue.text}`)
                return
            }
            if (station.name === 'terminal') {
                if (!this.mission.evidence.gravity || !this.mission.evidence.mass || !this.mission.evidence.formula) {
                    this.showStatus('O terminal exige as três pistas. Pergunte à equipe a gravidade, massa e fórmula.')
                    return
                }
                this.openAnswer()
                return
            }
            if (station.name === 'repair') {
                const result = await submitMissionAction(this.room.id, 'repair_contribute')
                this.applyActionResult(result)
                this.showStatus(this.mission.tasks.repair
                    ? 'Reparo concluído pela engenharia e artilharia!'
                    : `Contribuição registrada. Faltam as duas funções no painel (${this.mission.repairContributors.length}/2).`)
                return
            }
            const result = await submitMissionAction(this.room.id, 'activate')
            this.applyActionResult(result)
            this.showStatus(this.mission.tasks.activation
                ? 'Nave reativada! Missão concluída.'
                : `Tripulante na ativação final (${this.mission.activators.length}/4).`)
        } catch (error) {
            this.showStatus(this.actionError(error), true)
        } finally {
            this.actionBusy = false
        }
    }

    private interactInDemo(station: Station) {
        if (station.name === 'archive') {
            this.mission.evidence = { gravity: true, mass: true, formula: true }
            this.showStatus('DEMO: pistas — gravidade 3,71 m/s²; massa 10 kg; fórmula P = m × g.')
        } else if (station.name === 'terminal') {
            if (!this.mission.evidence.gravity) {
                this.showStatus('Leia as pistas no arquivo antes de usar o terminal.')
                return
            }
            this.openAnswer()
        } else if (station.name === 'repair') {
            this.mission.repairContributors = ['engineer', 'gunner']
            this.mission.tasks.repair = true
            this.showStatus('DEMO: reparo concluído pelas funções engenharia e artilharia.')
        } else {
            if (!this.mission.tasks.investigation || !this.mission.tasks.repair) {
                this.showStatus('Conclua investigação e reparo antes da ativação final.')
                return
            }
            this.mission.tasks.activation = true
            this.score = 1200
            this.showResults(true)
        }
        this.refreshHud()
    }

    private openAnswer() {
        this.answerOpen = true
        this.answer = ''
        this.answerPanel
            .setText('TERMINAL CIENTÍFICO\n\nUse P = m × g com as pistas da tripulação.\nDigite o peso em Marte e pressione Enter.')
            .setVisible(true)
        this.answerText.setText('Resposta: _   •   Enter confirma   •   E cancela')
            .setVisible(true)
    }

    private closeAnswer() {
        this.answerOpen = false
        this.answerPanel.setVisible(false)
        this.answerText.setVisible(false)
    }

    private async submitCalculation() {
        if (this.actionBusy) return
        const normalized = this.answer.replace(',', '.')
        if (Number(normalized) !== 37.1) {
            this.showStatus('Resposta incorreta. Reconfiram as pistas: 10 × 3,71.', true)
            return
        }

        if (this.isDemo) {
            this.mission.tasks.investigation = true
            this.refreshHud()
            this.closeAnswer()
            this.showStatus('Investigação concluída! Agora façam o reparo cooperativo.')
            return
        }

        if (!this.room) return
        this.actionBusy = true
        try {
            const result = await submitMissionAction(this.room.id, 'submit_calculation', {
                answer: normalized,
            })
            this.applyActionResult(result)
            this.closeAnswer()
            this.showStatus('Investigação científica concluída! Próxima etapa: reparo.')
        } catch (error) {
            this.showStatus(this.actionError(error), true)
        } finally {
            this.actionBusy = false
        }
    }

    private applyActionResult(result: { status: string; mission_state: MissionState; score: number }) {
        this.mission = result.mission_state
        this.score = result.score
        this.refreshHud()
        if (result.status === 'finished') {
            this.showResults(this.mission.tasks.activation)
        }
    }

    private actionError(error: unknown) {
        const message = error instanceof Error ? error.message : 'Não foi possível concluir a ação.'
        const lower = message.toLowerCase()
        if (lower.includes('wrong_role')) return 'Essa pista pertence a outra função da tripulação.'
        if (lower.includes('team_evidence_incomplete')) return 'Ainda faltam pistas. Compartilhem as informações entre todos.'
        if (lower.includes('incorrect_answer')) return 'Resposta incorreta. A equipe deve calcular 10 × 3,71.'
        if (lower.includes('engineer_or_gunner')) return 'O reparo precisa da engenharia ou da artilharia.'
        if (lower.includes('complete_previous_tasks')) return 'Concluam investigação e reparo antes de ativar a nave.'
        if (lower.includes('mission_not_running')) return 'A partida não está ativa. Voltem ao lobby ou aguardem o anfitrião.'
        return message
    }

    private refreshHud() {
        if (!this.taskText) return
        const completed = Object.values(this.mission.tasks).filter(Boolean).length
        this.taskText.setText([
            `TAREFAS ${completed}/3`,
            `${this.mission.tasks.investigation ? '[✓]' : '[ ]'} Investigação científica`,
            `${this.mission.tasks.repair ? '[✓]' : '[ ]'} Reparo cooperativo`,
            `${this.mission.tasks.activation ? '[✓]' : '[ ]'} Ativação da nave`,
        ].join('\n'))
    }

    private updateTimer() {
        if (!this.timerText || this.finished) return
        const remaining = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000))
        const minutes = Math.floor(remaining / 60)
        const seconds = remaining % 60
        this.timerText.setText(`O₂  ${minutes}:${seconds.toString().padStart(2, '0')}`)
        this.timerText.setColor(remaining <= 30 ? '#c62828' : '#17243b')
        if (remaining === 0 && !this.expirationSent) {
            this.expirationSent = true
            if (this.isDemo) {
                this.showResults(false)
            } else if (this.room) {
                void submitMissionAction(this.room.id, 'expire')
                    .then((result) => {
                        if (result.ends_at && result.status === 'playing') {
                            this.endsAt = Date.parse(result.ends_at)
                            this.expirationSent = false
                        }
                        this.applyActionResult(result)
                    })
                    .catch((error: Error) => this.showStatus(error.message, true))
            }
        }
    }

    private showResults(victory: boolean) {
        if (this.finished) return
        this.finished = true
        this.resultsPanel.removeAll(true)
        const backdrop = this.add.rectangle(
            0,
            0,
            this.scale.width,
            this.scale.height,
            theme.ink,
            0.28,
        )
        const card = this.add.rectangle(0, 0, Math.min(480, this.scale.width - 32), 260, theme.surface)
            .setStrokeStyle(1, theme.border)
        const title = this.add.text(0, -45, victory ? 'MISSÃO CONCLUÍDA!' : 'OXIGÊNIO ESGOTADO', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: victory ? '#4d966e' : '#ae5264',
        }).setOrigin(0.5)
        const score = this.add.text(0, 2, `Pontuação da tripulação: ${this.score}`, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            color: '#352442',
        }).setOrigin(0.5)
        const replay = this.add.text(0, 54, 'JOGAR NOVAMENTE', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: this.crewPlayer?.is_host ? '#684080' : '#998da0',
            backgroundColor: '#f4eff8',
            padding: { x: 16, y: 10 },
        }).setOrigin(0.5)
        if (this.mission.testMode) replay.setText('REPETIR TESTE')
        if (this.crewPlayer?.is_host && this.room) {
            replay.setInteractive({ useHandCursor: true })
            replay.on('pointerdown', () => this.replay())
        }
        const exit = this.add.text(0, 105, 'SAIR PARA O LOBBY', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            color: '#684080',
            backgroundColor: '#f4eff8',
            padding: { x: 15, y: 9 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true })
        exit.on('pointerdown', () => this.exitToLobby())
        this.resultsPanel.add([backdrop, card, title, score, replay, exit])
        this.resultsPanel.setVisible(true)
        this.statusText.setVisible(false)
    }

    private async replay() {
        if (!this.room || !this.crewPlayer?.is_host || !this.finished) return
        try {
            await startRoom(this.room, this.crewPlayer, this.mission.testMode ?? false)
        } catch (error) {
            this.showStatus(error instanceof Error ? error.message : 'Não foi possível reiniciar.', true)
        }
    }

    private async exitToLobby() {
        if (this.room && this.crewPlayer) {
            try {
                await leaveRoom(this.room, this.crewPlayer)
            } catch (error) {
                this.showStatus(error instanceof Error ? error.message : 'Não foi possível sair da sala.', true)
                return
            }
        }
        this.scene.start('LobbyScene')
    }

    private playerColor() {
        if (!this.crewPlayer) return 0x55d6be
        return Number.parseInt(this.crewPlayer.color.replace('#', ''), 16) || 0x55d6be
    }

    private showStatus(message: string, isError = false) {
        if (!this.statusText) return
        const sequence = ++this.noticeSequence
        this.statusText.setText(message)
        this.statusText.setColor(isError ? '#ae5264' : '#352442')
        this.statusText.setVisible(true)
        this.messageTimer?.remove(false)
        this.messageTimer = this.time.delayedCall(6000, () => {
            if (sequence === this.noticeSequence && !this.finished) {
                this.statusText.setText('')
            }
        })
    }

    private cleanup() {
        this.input.keyboard?.off('keydown', this.keyHandler)
        this.stopWatching?.()
        this.stopWatching = null
        this.gameChannel?.unsubscribe()
        this.gameChannel = null
        this.messageTimer?.remove(false)
    }
}
