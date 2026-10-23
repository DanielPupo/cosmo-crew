import Phaser from 'phaser'

export const theme = {
    background: 0xfaf8f2,
    surface: 0xfffefa,
    surfaceSoft: 0xf4eff8,
    ink: 0x352442,
    muted: 0x786d7f,
    purple: 0x8050a0,
    purpleDark: 0x684080,
    lilac: 0xe8ddf1,
    border: 0xe9e1e9,
    gold: 0xf4d783,
}

export function drawSoftStars(scene: Phaser.Scene, count = 55) {
    const width = scene.scale.width
    const height = scene.scale.height

    for (let index = 0; index < count; index += 1) {
        const size = Phaser.Math.FloatBetween(1, 2.2)
        const alpha = Phaser.Math.FloatBetween(0.12, 0.35)
        scene.add.circle(
            Phaser.Math.Between(12, Math.max(12, width - 12)),
            Phaser.Math.Between(12, Math.max(12, height - 12)),
            size,
            theme.purple,
            alpha,
        ).setDepth(-10)
    }
}
