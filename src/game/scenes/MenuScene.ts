import Phaser from 'phaser'
import { drawSoftStars, theme } from '../theme'

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene')
    }

    create() {
        this.cameras.main.setBackgroundColor(theme.background)
        drawSoftStars(this, 65)

        const width = this.scale.width
        const height = this.scale.height
        const centerX = width / 2
        const compact = width < 760
        const shortScreen = height < 620
        const headerY = Math.min(58, Math.max(38, height * 0.095))
        const headerWidth = Math.min(width - 40, 1120)

        this.add.rectangle(centerX, headerY, headerWidth, 68, theme.surface)
            .setStrokeStyle(1, theme.border)
        this.add.circle(centerX - headerWidth / 2 + 36, headerY, 16, theme.lilac)
        this.add.circle(centerX - headerWidth / 2 + 36, headerY, 6, theme.purple)
        this.add.ellipse(centerX - headerWidth / 2 + 36, headerY, 38, 14)
            .setStrokeStyle(1, theme.purple)
            .setAngle(-24)
        this.add.text(centerX - headerWidth / 2 + 65, headerY, 'AstroLearn', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#352442',
        }).setOrigin(0, 0.5)
        this.add.text(centerX + headerWidth / 2 - 24, headerY, compact || shortScreen ? 'JOGO STEAM' : 'JOGO STEAM  ·  COOPERATIVO', {
            fontFamily: 'Arial, sans-serif',
            fontSize: compact ? '10px' : '12px',
            fontStyle: 'bold',
            color: '#786d7f',
        }).setOrigin(1, 0.5)

        const heroTop = headerY + 90
        if (compact) {
            if (!shortScreen || height >= 500) {
                this.createPlanet(
                    centerX,
                    shortScreen ? headerY + 70 : heroTop + 50,
                    shortScreen ? Math.min(58, width * 0.15) : Math.min(80, width * 0.19),
                )
            }
            const copyY = shortScreen
                ? headerY + (height < 500 ? 145 : 240)
                : heroTop + Math.min(285, height * 0.42)
            this.createCopy(centerX, copyY, width, true)
        } else {
            const leftX = Math.max(50, width * 0.12)
            this.createCopy(leftX, shortScreen ? headerY + 100 : heroTop + 105, width * 0.48, false)
            this.createPlanet(
                width * 0.76,
                shortScreen ? headerY + height * 0.31 : heroTop + Math.min(220, height * 0.31),
                shortScreen ? Math.min(100, height * 0.2) : Math.min(170, height * 0.25),
            )
        }

        if (!compact || height > 680) {
            this.add.text(centerX, height - 28, 'CIÊNCIA  ·  TECNOLOGIA  ·  ENGENHARIA  ·  ARTES  ·  MATEMÁTICA', {
                fontFamily: 'Arial, sans-serif',
                fontSize: compact ? '9px' : '12px',
                color: '#968a9c',
                letterSpacing: 1,
            }).setOrigin(0.5)
        }
    }

    private createCopy(x: number, y: number, width: number, centered: boolean) {
        const originX = centered ? 0.5 : 0
        const textWidth = Math.min(width - 48, 530)
        const verticalScale = Math.min(1, Math.max(0.52, (this.scale.height - 110) / 630))
        const badge = this.add.rectangle(
            x + (centered ? 0 : 95),
            y - 92 * verticalScale,
            250,
            34,
            theme.surface,
        )
            .setStrokeStyle(1, theme.border)
        this.add.text(badge.x, badge.y, '✦  UMA MISSÃO STEAM EM EQUIPE', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#80638e',
            letterSpacing: 1,
        }).setOrigin(0.5)

        this.add.text(x, y - 30 * verticalScale, 'Aprender é', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.min(70, Math.max(42, this.scale.width * 0.052))}px`,
            fontStyle: 'bold',
            color: '#352442',
            wordWrap: { width: textWidth },
            align: centered ? 'center' : 'left',
        }).setOrigin(originX, 0.5)
        this.add.text(x, y + 42 * verticalScale, 'uma aventura.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.min(70, Math.max(42, this.scale.width * 0.052))}px`,
            fontStyle: 'bold',
            color: '#8050a0',
            wordWrap: { width: textWidth },
            align: centered ? 'center' : 'left',
        }).setOrigin(originX, 0.5)

        this.add.text(x, y + 112 * verticalScale, this.scale.height < 620
            ? 'Explore uma nave, encontre pistas e resolva desafios em equipe. Cada pista conta.'
            : 'Explore uma nave, encontre pistas e resolva desafios com sua tripulação. Aqui, cada pessoa tem uma parte importante da resposta.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: this.scale.height < 620 ? '16px' : '18px',
            color: '#786d7f',
            lineSpacing: 6,
            wordWrap: { width: textWidth },
            align: centered ? 'center' : 'left',
        }).setOrigin(originX, 0)

        const buttonX = centered ? x : x + 118
        const buttonY = y + (this.scale.height < 620 ? 280 : 216) * verticalScale
        const button = this.add.rectangle(buttonX, buttonY, 236, 58, theme.purple)
            .setInteractive({ useHandCursor: true })
        const buttonText = this.add.text(buttonX, buttonY, 'Começar missão  →', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffffff',
        }).setOrigin(0.5)
        button.on('pointerover', () => {
            button.setFillStyle(theme.purpleDark)
            button.setScale(1.03)
            buttonText.setScale(1.03)
        })
        button.on('pointerout', () => {
            button.setFillStyle(theme.purple)
            button.setScale(1)
            buttonText.setScale(1)
        })
        button.on('pointerdown', () => this.scene.start('LobbyScene'))

        this.add.circle(buttonX + 139, buttonY + (this.scale.height < 620 ? 92 : 67) * verticalScale, 4, theme.purple, 0.7)
        this.add.text(buttonX + 152, buttonY + (this.scale.height < 620 ? 92 : 67) * verticalScale, 'Partidas curtas  ·  Até 4 tripulantes', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '13px',
            color: '#786d7f',
        }).setOrigin(0, 0.5)

    }

    private createPlanet(x: number, y: number, radius: number) {
        this.add.circle(x, y, radius + 46, 0xf1eaf4, 0.76)
        this.add.circle(x, y, radius + 27, 0xf8edf0, 0.8)
        this.add.ellipse(x, y + 12, radius * 2.65, radius * 0.72)
            .setStrokeStyle(3, 0xc4a7d2, 0.85)
            .setAngle(-18)
            .setDepth(1)

        this.add.circle(x, y, radius, 0x8ebfd1)
            .setStrokeStyle(4, theme.surface)
            .setDepth(2)
        this.add.ellipse(x - radius * 0.28, y - radius * 0.25, radius * 0.72, radius * 0.43, 0xdceee1)
            .setAngle(-22)
            .setDepth(3)
        this.add.ellipse(x + radius * 0.25, y + radius * 0.08, radius * 0.63, radius * 0.37, 0x79aa91)
            .setAngle(28)
            .setDepth(3)
        this.add.ellipse(x - radius * 0.02, y + radius * 0.49, radius * 1.2, radius * 0.22, 0x6da5bd)
            .setAngle(-9)
            .setDepth(3)

        const crewColors = [0x8050a0, 0xf1c55b, 0x62ac88, 0xe78681]
        crewColors.forEach((color, index) => {
            const angle = (Math.PI * 2 * index) / crewColors.length - Math.PI / 2
            const dotX = x + Math.cos(angle) * (radius + 54)
            const dotY = y + Math.sin(angle) * (radius + 54)
            this.add.circle(dotX, dotY, 10, theme.surface)
                .setStrokeStyle(1, theme.border)
                .setDepth(5)
            this.add.circle(dotX, dotY, 5, color).setDepth(6)
        })

        this.add.text(x + radius * 0.76, y - radius * 0.76, '✦', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '28px',
            color: '#bd9acb',
        }).setDepth(7)
        this.add.text(x - radius * 0.9, y + radius * 0.75, '✧', {
            fontFamily: 'Arial, sans-serif',
            fontSize: '22px',
            color: '#c3a6cf',
        }).setDepth(7)
    }
}
