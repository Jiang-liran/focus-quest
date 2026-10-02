import AppKit

// A code-drawn crystal compass. All artwork is original vector geometry.
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func color(_ hex: Int, alpha: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: alpha)
}

func polygon(_ points: [NSPoint]) -> NSBezierPath {
    let path = NSBezierPath()
    path.move(to: points[0])
    for point in points.dropFirst() { path.line(to: point) }
    path.close()
    return path
}

func drawIcon(pixels: Int) -> Data {
    let image = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                               isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: image)!
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    let transform = NSAffineTransform()
    transform.scale(by: CGFloat(pixels) / 1024)
    transform.concat()

    let background = NSBezierPath(roundedRect: NSRect(x: 80, y: 80, width: 864, height: 864), xRadius: 196, yRadius: 196)
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = color(0x09081C, alpha: 0.45)
    shadow.shadowBlurRadius = 35
    shadow.shadowOffset = NSSize(width: 0, height: -14)
    shadow.set()
    color(0x211B42).setFill()
    background.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGradient(colors: [color(0x1A1632), color(0x2B225A), color(0x514485)])!.draw(in: background, angle: 120)

    NSGraphicsContext.saveGraphicsState()
    background.addClip()
    let aura = NSBezierPath(ovalIn: NSRect(x: 122, y: 515, width: 800, height: 650))
    NSGradient(starting: color(0xB8A9FF, alpha: 0.12), ending: color(0xB8A9FF, alpha: 0))!
        .draw(in: aura, relativeCenterPosition: .zero)
    let rim = NSBezierPath(roundedRect: NSRect(x: 87, y: 87, width: 850, height: 850), xRadius: 190, yRadius: 190)
    color(0xFFFFFF, alpha: 0.13).setStroke()
    rim.lineWidth = 3
    rim.stroke()

    let center = NSPoint(x: 512, y: 526)
    let orbit = NSBezierPath(ovalIn: NSRect(x: 278, y: 292, width: 468, height: 468))
    color(0xC4B7FF, alpha: 0.23).setStroke()
    orbit.lineWidth = 13
    orbit.stroke()
    let outerOrbit = NSBezierPath(ovalIn: NSRect(x: 243, y: 257, width: 538, height: 538))
    color(0xC4B7FF, alpha: 0.09).setStroke()
    outerOrbit.lineWidth = 2
    outerOrbit.stroke()

    // Four diagonal notches support the compass silhouette at small sizes.
    for angle in [45.0, 135.0, 225.0, 315.0] {
        let radians = angle * Double.pi / 180
        let mark = NSBezierPath()
        mark.move(to: NSPoint(x: center.x + CGFloat(cos(radians)) * 219, y: center.y + CGFloat(sin(radians)) * 219))
        mark.line(to: NSPoint(x: center.x + CGFloat(cos(radians)) * 248, y: center.y + CGFloat(sin(radians)) * 248))
        mark.lineWidth = 9
        mark.lineCapStyle = .round
        color(0xD1C7FF, alpha: 0.52).setStroke()
        mark.stroke()
    }

    let north = NSPoint(x: 512, y: 815)
    let east = NSPoint(x: 702, y: 525)
    let south = NSPoint(x: 512, y: 252)
    let west = NSPoint(x: 322, y: 525)
    let crystal = polygon([north, east, south, west])
    NSGraphicsContext.saveGraphicsState()
    let crystalShadow = NSShadow()
    crystalShadow.shadowColor = color(0x070511, alpha: 0.65)
    crystalShadow.shadowBlurRadius = 36
    crystalShadow.shadowOffset = NSSize(width: 0, height: -16)
    crystalShadow.set()
    color(0xAC91FF).setFill()
    crystal.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGradient(starting: color(0xF5EEFF), ending: color(0xBA9BFF))!.draw(in: polygon([north, west, center]), angle: 80)
    NSGradient(starting: color(0xB196FF), ending: color(0x8563EE))!.draw(in: polygon([north, center, east]), angle: -60)
    NSGradient(starting: color(0x9F7BEE), ending: color(0x6E48BB))!.draw(in: polygon([west, south, center]), angle: -75)
    NSGradient(starting: color(0x6347B6), ending: color(0xAF8AFC))!.draw(in: polygon([center, south, east]), angle: 95)
    let seam = NSBezierPath()
    seam.move(to: south)
    seam.line(to: north)
    seam.lineWidth = 2.5
    color(0xF9F3FF, alpha: 0.45).setStroke()
    seam.stroke()

    let core = polygon([NSPoint(x: 512, y: 563), NSPoint(x: 538, y: 526),
                        NSPoint(x: 512, y: 489), NSPoint(x: 486, y: 526)])
    color(0xF0E7FF, alpha: 0.96).setFill()
    core.fill()

    // A single mint spark adds a progress/reward accent without visual clutter.
    let spark = polygon([NSPoint(x: 760, y: 824), NSPoint(x: 773, y: 789),
                         NSPoint(x: 808, y: 776), NSPoint(x: 773, y: 763),
                         NSPoint(x: 760, y: 728), NSPoint(x: 747, y: 763),
                         NSPoint(x: 712, y: 776), NSPoint(x: 747, y: 789)])
    color(0x9AF0D1).setFill()
    spark.fill()
    color(0xD2C5FF, alpha: 0.65).setFill()
    NSBezierPath(ovalIn: NSRect(x: 235, y: 304, width: 10, height: 10)).fill()
    NSBezierPath(ovalIn: NSRect(x: 739, y: 249, width: 7, height: 7)).fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.restoreGraphicsState()
    return image.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
    try drawIcon(pixels: size).write(to: output.appendingPathComponent("icon_\(size)x\(size).png"))
    try drawIcon(pixels: size * 2).write(to: output.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
print(output.path)
