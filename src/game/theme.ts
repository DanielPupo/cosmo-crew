import Phaser from 'phaser'

export const theme = {
    background: 0x070b19,
    surface: 0x111a2e,
    surfaceSoft: 0x18233b,
    ink: 0xf1f5ff,
    muted: 0xa2aec8,
    purple: 0x8b6cff,
    purpleDark: 0x7052da,
    lilac: 0x392d62,
    border: 0x34415e,
    gold: 0xf3c94b,
    pilot: 0x4287f5,
    engineer: 0x42b883,
    explorer: 0xf3c94b,
    gunner: 0xf05252,
    success: 0x42b883,
    danger: 0xf05252,
    cyan: 0x55d6e8,
}

const starColors = [0x8b6cff, 0x55d6e8, 0xf3c94b, 0xffffff]

export function drawSoftStars(scene: Phaser.Scene, count = 70) {
    const width = scene.scale.width
    const height = scene.scale.height

    for (let index = 0; index < count; index += 1) {
        const size = Phaser.Math.FloatBetween(0.7, 1.8)
        const star = scene.add.circle(
            Phaser.Math.Between(8, Math.max(8, width - 8)),
            Phaser.Math.Between(8, Math.max(8, height - 8)),
            size,
            Phaser.Utils.Array.GetRandom(starColors),
            Phaser.Math.FloatBetween(0.2, 0.72),
        ).setDepth(-10)

        scene.tweens.add({
            targets: star,
            alpha: Phaser.Math.FloatBetween(0.12, 0.85),
            y: star.y - Phaser.Math.Between(8, 28),
            duration: Phaser.Math.Between(1800, 4200),
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
            delay: Phaser.Math.Between(0, 2000),
        })
    }
}

export function glassPanel(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    depth = 0,
) {
    const panel = scene.add.rectangle(x, y, width, height, theme.surface, 0.9)
        .setStrokeStyle(1, theme.border, 0.95)
        .setDepth(depth)
    scene.add.rectangle(x - width * 0.34, y - height / 2 + 1, width * 0.28, 2, theme.cyan, 0.7)
        .setDepth(depth + 1)
    return panel
}
