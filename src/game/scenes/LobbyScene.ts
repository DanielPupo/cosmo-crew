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
import { drawSoftStars, glassPanel, theme } from '../theme'

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
    private crewSlots: Phaser.GameObjects.Text[] = []
    private startButton!: Phaser.GameObjects.Rectangle
    private startLabel!: Phaser.GameObjects.Text
    private dialogContainer: Phaser.GameObjects.Container | null = null
    private dialogHandler: ((event: KeyboardEvent) => void) | null = null
    private closeDialog: ((value: string | null) => void) | null = null
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

        this.cameras.main.setBackgroundColor(theme.background)
        this.cameras.main.fadeIn(220, 7, 11, 25)
        const centerX = this.cameras.main.centerX
        const width = this.scale.width
        const height = this.scale.height
        const compact = width < 680 || height < 620
        const panelWidth = Math.min(width - 32, 850)
        const headerWidth = Math.min(width - 32, 1120)
        const headerY = Math.max(36, Math.min(58, height * 0.09))
        const top = compact ? headerY + 50 : 120
        const panelHeight = Math.min(height - top - 18, 570)
        const compactScale = compact ? Math.max(0.68, Math.min(1, panelHeight / 480)) : 1
        const rowGap = compact ? 40 * compactScale : 72
        const cardWidth = Math.min(compact ? 420 : 340, (panelWidth - 60) / (compact ? 1 : 2))
        const columns = compact ? 1 : 2

        drawSoftStars(this, 45)

        glassPanel(this, centerX, headerY, headerWidth, 64, 2)
        this.add.circle(centerX - headerWidth / 2 + 120, headerY, 14, theme.lilac)
        this.add.circle(centerX - headerWidth / 2 + 120, headerY, 5, theme.purple)
        this.add.text(centerX - headerWidth / 2 + 146, headerY, 'AstroLearn', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: '20px',
            fontStyle: 'bold',
            color: '#f1f5ff',
        }).setOrigin(0, 0.5)
        this.add.text(centerX + headerWidth / 2 - 20, headerY, compact ? 'COSMO CREW' : 'COSMO CREW  ·  JOGO STEAM', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: compact ? '10px' : '12px',
            fontStyle: 'bold',
            color: '#55d6e8',
        }).setOrigin(1, 0.5)

        const panelCenterY = top + panelHeight / 2
        this.add.rectangle(centerX + 3, panelCenterY + 5, panelWidth, panelHeight, 0x02050d, 0.6)
        glassPanel(this, centerX, panelCenterY, panelWidth, panelHeight)

        this.add.text(centerX, top + (compact ? 27 : 34) * compactScale, 'Vamos montar a tripulação?', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: compact ? `${Math.max(18, 24 * compactScale)}px` : '31px',
            fontStyle: 'bold',
            color: '#f1f5ff',
        }).setOrigin(0.5)
        this.add.text(centerX, top + (compact ? 49 : 64) * compactScale, 'Cada pessoa tem uma pista importante para a missão.', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: compact ? `${Math.max(10, 13 * compactScale)}px` : '16px',
            color: '#a2aec8',
        }).setOrigin(0.5)

        this.statusText = this.add.text(centerX, top + (compact ? 68 : 94) * compactScale, '', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: compact ? `${Math.max(10, 12 * compactScale)}px` : '14px',
            color: '#55d6e8',
            align: 'center',
            wordWrap: { width: panelWidth - 48 },
            backgroundColor: '#111a2e',
            padding: { x: 10, y: 5 },
        }).setOrigin(0.5)

        const rosterY = top + (compact ? 126 * compactScale : 175)
        const rosterStartY = rosterY - rowGap / 2
        const roleOrder: PlayerRow['role'][] = ['pilot', 'gunner', 'engineer', 'explorer']
        const roleColors = [theme.pilot, theme.gunner, theme.engineer, theme.explorer]
        this.crewSlots = roleOrder.map((role, index) => {
            const column = index % columns
            const row = Math.floor(index / columns)
            const x = centerX + (columns === 1 ? 0 : column === 0 ? -(cardWidth / 2 + 10) : cardWidth / 2 + 10)
            const y = rosterStartY + row * rowGap
            this.add.rectangle(x, y, cardWidth, compact ? 36 * compactScale : 58, theme.surfaceSoft, 0.92)
                .setStrokeStyle(1, roleColors[index], 0.6)
            this.add.circle(x - cardWidth / 2 + 20, y, compact ? 9 * compactScale : 12, roleColors[index])
            this.add.text(x - cardWidth / 2 + (compact ? 20 : 23), y, roleNames[role][0], {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: compact ? `${Math.max(8, 9 * compactScale)}px` : '11px',
                fontStyle: 'bold',
                color: '#ffffff',
            }).setOrigin(0.5)
            return this.add.text(x - cardWidth / 2 + (compact ? 38 : 44), y, '', {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: compact ? `${Math.max(9, 12 * compactScale)}px` : '14px',
                color: '#a2aec8',
                wordWrap: { width: cardWidth - 58 },
            }).setOrigin(0, 0.5)
        })

        this.roomCodeText = this.add.text(centerX, top + (compact ? 250 * compactScale : 268), '', {
            fontFamily: 'Arial, sans-serif',
            fontSize: compact ? `${Math.max(12, 16 * compactScale)}px` : '20px',
            fontStyle: 'bold',
            color: '#55d6e8',
        }).setOrigin(0.5)

        const buttonsY = top + (compact ? 278 * compactScale : 319)
        const buttonWidth = Math.min(270, (panelWidth - 56) / 2)
        const buttonHeight = compact ? 38 : 48
        this.createButton(centerX - buttonWidth / 2 - 10, buttonsY, 'CRIAR SALA', theme.purple, () => this.onCreateRoom(), buttonWidth, 0xffffff, buttonHeight)
        this.createButton(centerX + buttonWidth / 2 + 10, buttonsY, 'ENTRAR NA SALA', theme.surfaceSoft, () => this.onJoinRoom(), buttonWidth, theme.purpleDark, buttonHeight)
        this.createButton(centerX, top + (compact ? 345 * compactScale : 370), 'EXPLORAR DEMO LOCAL', theme.surfaceSoft, () => {
            this.transitionToGame({ demo: true })
        }, 250, theme.muted, buttonHeight)

        const startY = top + panelHeight - (compact ? 26 * compactScale : 32)
        this.startButton = this.add.rectangle(centerX, startY, Math.min(panelWidth - 60, 300), 46, theme.purple)
            .setStrokeStyle(1, theme.purple)
        this.startLabel = this.add.text(centerX, startY, 'INICIAR MISSÃO · 4/4', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5)
        this.startButton.setVisible(false)
        this.startLabel.setVisible(false)
        this.startButton.setInteractive({ useHandCursor: true })
        this.startButton.on('pointerdown', () => this.onStartMission())

        const back = this.add.text(30, headerY, '←  Início', {
            fontFamily: 'Segoe UI, sans-serif',
            fontSize: '14px',
            color: '#a2aec8',
            backgroundColor: '#111a2e',
            padding: { x: 12, y: 8 },
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
        back.on('pointerdown', () => this.onBack())

        this.statusText.setText(
            isSupabaseConfigured()
                ? 'Multiplayer pronto. Crie uma sala ou entre com um código.'
                : 'Demo disponível · Multiplayer online não configurado.',
        )
        if (!isSupabaseConfigured()) this.statusText.setColor('#f3c94b')
        this.renderCrew()

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.closeDialog?.(null)
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
        width = 270,
        textColor = 0xffffff,
        height = 48,
    ) {
        const rect = this.add.rectangle(x, y, width, height, color)
            .setInteractive({ useHandCursor: true })
        this.add.text(x, y, label, {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: `#${textColor.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5)
        rect.on('pointerover', () => rect.setAlpha(0.86))
        rect.on('pointerout', () => rect.setAlpha(1))
        rect.on('pointerdown', action)
    }

    private async onCreateRoom() {
        if (this.busy) return
        if (!isSupabaseConfigured()) {
            this.setStatus('Configure URL e chave pública no .env.local para criar salas online.', true)
            return
        }

        const name = await this.requestText('Qual é o seu nome, astronauta?', 'Tripulante Azul', 20)
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

        const code = await this.requestText('Qual é o código da sala?', 'ABCDE', 5, true)
        if (!code) return
        const name = await this.requestText('Como podemos chamar você?', 'Tripulante', 20)
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
        return roleOrder.map((role) => {
            const player = this.players.find((member) => member.role === role)
            return player
                ? `${roleNames[role]}   ·   ${player.name}${player.is_host ? '  (anfitrião)' : ''}`
                : `${roleNames[role]}   ·   aguardando tripulante`
        })
    }

    private requestText(
        title: string,
        placeholder: string,
        maxLength: number,
        uppercase = false,
    ): Promise<string | null> {
        if (this.dialogContainer) return Promise.resolve(null)

        return new Promise((resolve) => {
            const centerX = this.scale.width / 2
            const centerY = this.scale.height / 2
            const container = this.add.container(0, 0).setDepth(100)
            const backdrop = this.add.rectangle(
                centerX,
                centerY,
                this.scale.width,
                this.scale.height,
                theme.ink,
                0.78,
            ).setInteractive()
            const panel = this.add.rectangle(centerX, centerY, Math.min(this.scale.width - 40, 440), 244, theme.surface, 0.98)
                .setStrokeStyle(1, theme.cyan, 0.75)
            const titleText = this.add.text(centerX, centerY - 72, title, {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: '22px',
                fontStyle: 'bold',
                color: '#f1f5ff',
                align: 'center',
                wordWrap: { width: 360 },
            }).setOrigin(0.5)
            const hintText = this.add.text(centerX, centerY - 38, 'Pressione Enter para continuar · Esc para cancelar', {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: '12px',
                color: '#a2aec8',
            }).setOrigin(0.5)
            const field = this.add.rectangle(centerX, centerY + 5, Math.min(this.scale.width - 84, 350), 48, theme.surfaceSoft)
                .setStrokeStyle(1, theme.cyan, 0.7)
            let value = ''
            const valueText = this.add.text(centerX, centerY + 5, placeholder, {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: '17px',
                color: '#71809f',
            }).setOrigin(0.5)
            const cancelButton = this.add.rectangle(centerX - 90, centerY + 78, 142, 42, theme.surfaceSoft)
                .setInteractive({ useHandCursor: true })
            const cancelLabel = this.add.text(cancelButton.x, cancelButton.y, 'Cancelar', {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#f1f5ff',
            }).setOrigin(0.5)
            const submitButton = this.add.rectangle(centerX + 90, centerY + 78, 142, 42, theme.purple)
                .setInteractive({ useHandCursor: true })
            const submitLabel = this.add.text(submitButton.x, submitButton.y, 'Continuar', {
                fontFamily: 'Segoe UI, sans-serif',
                fontSize: '14px',
                fontStyle: 'bold',
                color: '#ffffff',
            }).setOrigin(0.5)

            container.add([
                backdrop,
                panel,
                titleText,
                hintText,
                field,
                valueText,
                cancelButton,
                cancelLabel,
                submitButton,
                submitLabel,
            ])
            this.dialogContainer = container

            let complete = false
            const finish = (result: string | null) => {
                if (complete) return
                complete = true
                if (this.dialogHandler) {
                    this.input.keyboard?.off('keydown', this.dialogHandler)
                }
                this.dialogHandler = null
                this.dialogContainer?.removeAll(true)
                this.dialogContainer?.destroy()
                this.dialogContainer = null
                this.closeDialog = null
                resolve(result)
            }
            const submit = () => {
                const cleaned = value.trim()
                if (cleaned) finish(uppercase ? cleaned.toUpperCase() : cleaned)
                else {
                    valueText.setText('Digite uma informação para continuar.')
                    valueText.setColor('#b74a66')
                }
            }

            this.closeDialog = finish
            this.dialogHandler = (event) => {
                if (event.key === 'Escape') {
                    finish(null)
                } else if (event.key === 'Enter') {
                    submit()
                } else if (event.key === 'Backspace') {
                    value = value.slice(0, -1)
                } else if (event.key.length === 1 && !/[\u0000-\u001f]/.test(event.key)) {
                    if (!uppercase || /^[a-zA-Z0-9]$/.test(event.key)) {
                        value = (uppercase ? value.toUpperCase() : value) + event.key
                    }
                }

                if (!complete && event.key !== 'Enter' && event.key !== 'Escape') {
                    value = value.slice(0, maxLength)
                    valueText
                        .setText(value || placeholder)
                        .setColor(value ? '#f1f5ff' : '#71809f')
                }
            }
            this.input.keyboard?.on('keydown', this.dialogHandler)
            cancelButton.on('pointerdown', () => finish(null))
            submitButton.on('pointerdown', submit)
            backdrop.on('pointerdown', () => finish(null))
        })
    }

    private renderCrew() {
        if (!this.crewSlots.length || !this.startButton) return
        const roleOrder: PlayerRow['role'][] = ['pilot', 'gunner', 'engineer', 'explorer']
        this.formatCrew().forEach((label, index) => {
            this.crewSlots[index]?.setText(label)
            this.crewSlots[index]?.setColor(
                this.players.some((member) => member.role === roleOrder[index])
                    ? '#f1f5ff'
                    : '#71809f',
            )
        })
        const isHost = this.player?.is_host ?? false
        const isReady = this.players.length === 4
        const canTestMovement = this.players.length >= 2 && !isReady
        this.startButton.setVisible(isHost)
        this.startLabel.setVisible(isHost)
        this.startButton.setFillStyle(isReady ? theme.purple : canTestMovement ? theme.gold : theme.border)
        this.startLabel.setText(
            isReady
                ? 'INICIAR MISSÃO'
                : canTestMovement
                    ? `TESTAR MOVIMENTO (${this.players.length}/4)`
                    : `AGUARDANDO (${this.players.length}/4)`,
        )
        this.startLabel.setColor('#ffffff')
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
        this.stopWatching?.()
        this.stopWatching = null
        this.transitionToGame({
            room: this.room,
            player: this.player,
        })
    }

    private transitionToGame(data: { demo: true } | { room: RoomRow; player: PlayerRow }) {
        if (this.transitioning) return
        this.transitioning = true
        this.cameras.main.fadeOut(220, 7, 11, 25)
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('GameScene', data)
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
        this.cameras.main.fadeOut(220, 7, 11, 25)
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.start('MenuScene')
        })
    }

    private setStatus(message: string, isError = false) {
        if (this.statusText) {
            this.statusText.setText(message)
            this.statusText.setColor(isError ? '#ff8e9a' : '#55d6e8')
            this.statusText.setBackgroundColor(isError ? '#351b2b' : '#111a2e')
        }
    }

    private errorMessage(error: unknown) {
        return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
    }
}
