import Phaser from 'phaser'
import {
    createRoom,
    joinRoom,
    leaveRoom,
    listPlayers,
    startRoom,
    watchRoom,
} from '../../lib/rooms'
import {
    isSupabaseConfigured,
    type PlayerRow,
    type RoomRow,
} from '../../lib/supabase'

const roleNames: Record<PlayerRow['role'], string> = {
    pilot: 'Piloto',
    gunner: 'Artilheiro',
    engineer: 'Engenheiro',
    explorer: 'Explorador',
}

export class LobbyScene extends Phaser.Scene {
    private room: RoomRow | null = null
    private player: PlayerRow | null = null
    private players: PlayerRow[] = []
    private stopWatching: (() => void) | null = null
    private statusText!: Phaser.GameObjects.Text
    private roomCodeText!: Phaser.GameObjects.Text
    private crewText!: Phaser.GameObjects.Text
    private startButton!: Phaser.GameObjects.Rectangle
    private startLabel!: Phaser.GameObjects.Text
    private busy = false
    private transitioning = false

    constructor() {
        super('LobbyScene')
    }

    create() {
        this.room = null
        this.player = null
        this.players = []
        this.busy = false
        this.transitioning = false
        this.stopWatching?.()
        this.stopWatching = null

        this.cameras.main.setBackgroundColor('#101a38')
        const centerX = this.cameras.main.centerX
        const centerY = this.cameras.main.centerY

        for (let i = 0; i < 90; i += 1) {
            this.add.circle(
                Phaser.Math.Between(0, this.cameras.main.width),
                Phaser.Math.Between(0, this.cameras.main.height),
                Phaser.Math.Between(1, 2),
                0xffffff,
                Phaser.Math.FloatBetween(0.25, 0.85),
            )
        }

        this.add.text(centerX, centerY - 210, 'SALA DA TRIPULAÇÃO', {
            fontFamily: 'Arial',
            fontSize: '38px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5)

        this.add.text(centerX, centerY - 160, 'Quatro funções. Uma missão em equipe.', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#a9c7ff',
        }).setOrigin(0.5)

        this.statusText = this.add.text(centerX, centerY - 118, '', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#55d6be',
            align: 'center',
            wordWrap: { width: Math.min(700, this.cameras.main.width - 40) },
        }).setOrigin(0.5)

        this.roomCodeText = this.add.text(centerX, centerY - 76, '', {
            fontFamily: 'Arial',
            fontSize: '26px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5)

        this.crewText = this.add.text(centerX, centerY - 15, this.formatCrew(), {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#e8efff',
            align: 'left',
            lineSpacing: 9,
        }).setOrigin(0.5)

        this.createButton(centerX - 170, centerY + 100, 'CRIAR SALA', 0x55d6be, () => this.onCreateRoom())
        this.createButton(centerX + 170, centerY + 100, 'ENTRAR EM SALA', 0x315ee8, () => this.onJoinRoom())
        this.createButton(centerX, centerY + 155, 'DEMO LOCAL', 0x526277, () => {
            this.scene.start('GameScene', { demo: true })
        })

        this.startButton = this.add.rectangle(centerX, centerY + 220, 290, 58, 0x526277)
        this.startLabel = this.add.text(centerX, centerY + 220, 'INICIAR MISSÃO (4/4)', {
            fontFamily: 'Arial',
            fontSize: '19px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5)
        this.startButton.setVisible(false)
        this.startLabel.setVisible(false)
        this.startButton.setInteractive({ useHandCursor: true })
        this.startButton.on('pointerdown', () => this.onStartMission())

        const back = this.add.text(30, 26, '← VOLTAR', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#ffffff',
        }).setInteractive({ useHandCursor: true })
        back.on('pointerdown', () => this.onBack())

        this.statusText.setText(
            isSupabaseConfigured()
                ? 'Multiplayer pronto. Crie uma sala ou informe um código.'
                : 'Multiplayer não configurado. Use DEMO LOCAL ou configure .env.local.',
        )
        if (!isSupabaseConfigured()) this.statusText.setColor('#ffd166')

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.stopWatching?.()
            this.stopWatching = null
        })
    }

    private createButton(
        x: number,
        y: number,
        label: string,
        color: number,
        action: () => void,
    ) {
        const rect = this.add.rectangle(x, y, 270, 58, color)
            .setInteractive({ useHandCursor: true })
        this.add.text(x, y, label, {
            fontFamily: 'Arial',
            fontSize: '19px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5)
        rect.on('pointerdown', action)
    }

    private async onCreateRoom() {
        if (this.busy) return
        if (!isSupabaseConfigured()) {
            this.setStatus('Configure URL e chave pública no .env.local para criar salas online.', true)
            return
        }

        const name = window.prompt('Nome do tripulante:', 'Tripulante Azul')
        if (!name) return
        this.busy = true
        this.setStatus('Conectando ao Supabase e criando sala...')
        try {
            const result = await createRoom(name)
            await this.enterRoom(result.room, result.player)
        } catch (error) {
            this.setStatus(this.errorMessage(error), true)
        } finally {
            this.busy = false
        }
    }

    private async onJoinRoom() {
        if (this.busy) return
        if (!isSupabaseConfigured()) {
            this.setStatus('Configure URL e chave pública no .env.local para entrar em salas online.', true)
            return
        }

        const code = window.prompt('Digite o código de cinco caracteres:')
        if (!code) return
        const name = window.prompt('Nome do tripulante:', 'Tripulante')
        if (!name) return
        this.busy = true
        this.setStatus('Procurando a sala...')
        try {
            const result = await joinRoom(code, name)
            await this.enterRoom(result.room, result.player)
        } catch (error) {
            this.setStatus(this.errorMessage(error), true)
        } finally {
            this.busy = false
        }
    }

    private async enterRoom(room: RoomRow, player: PlayerRow) {
        this.room = room
        this.player = player
        this.roomCodeText.setText(`CÓDIGO: ${room.code}`)
        this.players = [player]
        let rosterError = ''
        try {
            this.players = await listPlayers(room.id)
        } catch (error) {
            rosterError = this.errorMessage(error)
        }
        this.renderCrew()
        this.setStatus(rosterError
            ? `Sala criada/entrada concluída, mas o roster não carregou: ${rosterError}`
            : 'Compartilhe o código. A missão começa quando 4 tripulantes estiverem conectados.',
        Boolean(rosterError))
        this.stopWatching?.()
        this.stopWatching = watchRoom(
            room.id,
            (nextRoom) => {
                this.room = nextRoom
                if (nextRoom.status === 'playing' && !this.transitioning) {
                    this.launchGame()
                }
            },
            (players) => {
                this.players = players
                this.renderCrew()
            },
            (message) => this.setStatus(message, true),
        )
        this.renderCrew()
    }

    private formatCrew() {
        const roleOrder: PlayerRow['role'][] = ['pilot', 'gunner', 'engineer', 'explorer']
        return roleOrder.map((role, index) => {
            const player = this.players.find((member) => member.role === role)
            return player
                ? `${index + 1}. ${roleNames[role]} — ${player.name}${player.is_host ? ' (anfitrião)' : ''}`
                : `${index + 1}. ${roleNames[role]} — aguardando`
        }).join('\n')
    }

    private renderCrew() {
        if (!this.crewText || !this.startButton) return
        this.crewText.setText(this.formatCrew())
        const isHost = this.player?.is_host ?? false
        const isReady = this.players.length === 4
        const canTestMovement = this.players.length >= 2 && !isReady
        this.startButton.setVisible(isHost)
        this.startLabel.setVisible(isHost)
        this.startButton.setFillStyle(isReady ? 0x55d6be : canTestMovement ? 0xf3c94b : 0x526277)
        this.startLabel.setText(
            isReady
                ? 'INICIAR MISSÃO'
                : canTestMovement
                    ? `TESTAR MOVIMENTO (${this.players.length}/4)`
                    : `AGUARDANDO (${this.players.length}/4)`,
        )
        this.startLabel.setColor(isReady ? '#17243b' : canTestMovement ? '#17243b' : '#ffffff')
        if (isReady || canTestMovement) {
            this.startButton.setInteractive({ useHandCursor: true })
        } else {
            this.startButton.disableInteractive()
        }
    }

    private async onStartMission() {
        if (this.busy || !this.room || !this.player?.is_host) return
        const testMode = this.players.length >= 2 && this.players.length < 4
        if (this.players.length < 2) {
            this.setStatus('São necessários quatro tripulantes para a missão. Com dois, é possível testar o movimento remoto.', true)
            return
        }

        this.busy = true
        this.setStatus(testMode
            ? 'Iniciando teste de movimento remoto. A missão completa ainda requer quatro tripulantes...'
            : 'Iniciando missão para toda a tripulação...')
        try {
            await startRoom(this.room, this.player, testMode)
        } catch (error) {
            this.setStatus(this.errorMessage(error), true)
        } finally {
            this.busy = false
        }
    }

    private launchGame() {
        if (!this.room || !this.player || this.transitioning) return
        this.transitioning = true
        this.stopWatching?.()
        this.stopWatching = null
        this.scene.start('GameScene', {
            room: this.room,
            player: this.player,
        })
    }

    private async onBack() {
        if (this.busy) return
        if (this.room && this.player) {
            this.busy = true
            this.setStatus('Saindo da sala...')
            try {
                await leaveRoom(this.room, this.player)
            } catch (error) {
                this.setStatus(this.errorMessage(error), true)
                this.busy = false
                return
            }
        }
        this.stopWatching?.()
        this.stopWatching = null
        this.scene.start('MenuScene')
    }

    private setStatus(message: string, isError = false) {
        if (this.statusText) {
            this.statusText.setText(message)
            this.statusText.setColor(isError ? '#ff8e8e' : '#55d6be')
        }
    }

    private errorMessage(error: unknown) {
        return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
    }
}
