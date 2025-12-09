/*
TypeScript module to integrate a static raster map (OSM/XYZ tiles) as a georeferenced
background layer into a Three.js scene, keeping your project CRS in EPSG:28355.

Key points implemented:
- Accepts a center point in EPSG:28355 and a square AOI (10km side in your case).
- Converts corners EPSG:28355 -> EPSG:4326 (lat/lon) via proj4js.
- Computes tile XYZ range for a chosen zoom (default z = 15).
- Downloads the tiles (configurable tile URL template), composes a mosaic in an offscreen canvas.
- Produces a THREE.Mesh (PlaneGeometry) sized in real meters (width=10000m, height=10000m),
with the mosaic applied as a texture.
- Positions the mesh in the scene using the same translation you apply to bring `globalCentroidCoordinates` to (0,0,0).
- Uses Y-up convention (mesh lies on XZ plane).
*/

import * as THREE from 'three'
import proj4 from 'proj4'
import * as OBC from '@thatopen/components'
import { globalCentroid } from './parametersForGrouping'

// Define EPSG:28355 (GDA94 / MGA zone 55). This proj4 string is standard for UTM zone 55S
// using GRS80 ellipsoid (GDA94). If you need GDA2020 or a different datum, substitute accordingly.
proj4.defs('EPSG:28355', '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs')
// EPSG:4326 and EPSG:3857 are typically defined in proj4 by default, but ensure they exist
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs')

export type MapLayerOptions = {
    globalCentroidCoordinates?: { x: number; y: number } // in EPSG:28355
    sideMetersX?: number // default 10000 (10km)
    sideMetersY?: number // default 10000 (10km)
    zoom?: number // tile zoom level, default 15
    tileSize?: number // in px, default 256
    tileUrlTemplate?: string // e.g. 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    localUrlTemplate?: string
    maxConcurrency?: number // concurrent fetches
}

// Helper: convert EPSG:28355 (meters) -> EPSG:4326 (lon, lat)
function epsg28355ToLonLat(pt: { x: number; y: number }): [number, number] {
    // proj4 expects [x, y]
    const [lon, lat] = proj4('EPSG:28355', 'EPSG:4326', [pt.x, pt.y])
    return [lon as number, lat as number]
}

// Helper: lon/lat -> tile X/Y at zoom z (slippy map)
function lonLatToTileXY(lon: number, lat: number, z: number) {
    const n = Math.pow(2, z)
    const xtile = Math.floor(((lon + 180) / 360) * n)
    const latRad = (lat * Math.PI) / 180
    const ytile = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
    return { x: xtile, y: ytile }
}

// Helper: tile XY to bbox in lon/lat
function tileXYToBBox(x: number, y: number, z: number) {
    const n = Math.pow(2, z)
    const lon_deg_min = (x / n) * 360 - 180
    const lon_deg_max = ((x + 1) / n) * 360 - 180
    const lat_rad_min = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)))
    const lat_rad_max = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
    const lat_deg_min = (lat_rad_min * 180) / Math.PI
    const lat_deg_max = (lat_rad_max * 180) / Math.PI
    return [lon_deg_min, lat_deg_min, lon_deg_max, lat_deg_max] as [number, number, number, number]
}

    // Fetch image as HTMLImageElement with CORS allowed
async function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = (e) => reject(new Error(`Image load error: ${url}`))
        img.src = url
    })
}

function downloadCanvasAsPNG(canvas: HTMLCanvasElement, filename = "map-cache.png") {
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    });
}

    // Compose tiles into a single canvas mosaic
async function composeTilesToCanvas(
    tileUrls: string[][],
    tileSize: number,
    concurrency = 8
    ): Promise<HTMLCanvasElement> {
    const cols = tileUrls[0].length
    const rows = tileUrls.length
    const canvas = document.createElement('canvas')
    canvas.width = cols * tileSize
    canvas.height = rows * tileSize
    const ctx = canvas.getContext('2d')!

    // Flatten URLs with coordinates
    type TileInfo = { url: string; col: number; row: number }
    const tasks: TileInfo[] = []
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
        tasks.push({ url: tileUrls[r][c], col: c, row: r })
        }
    }

    // Controlled concurrency
    const results: Promise<void>[] = []
    const worker = async (tile: TileInfo) => {
        try {
        const img = await loadImage(tile.url)
        ctx.drawImage(img, tile.col * tileSize, tile.row * tileSize, tileSize, tileSize)
        } catch (e) {
        // If a tile fails, leave transparent/blank - optionally you can draw placeholder
        console.warn('Tile failed', tile.url)
        }
    }

    let i = 0
    async function runner() {
        while (i < tasks.length) {
        const t = tasks[i++]!
        await worker(t)
        }
    }

    // Start concurrency runners
    for (let k = 0; k < concurrency; k++) {
        results.push(runner())
    }
    await Promise.all(results)

    return canvas
}

    // Main exported function
async function createStaticMapLayer(opts: MapLayerOptions): Promise<THREE.Mesh> {
    const globalCentroidCoordinates = opts.globalCentroidCoordinates ?? globalCentroid
    const sideMetersX = opts.sideMetersX ?? 25000
    const sideMetersY = opts.sideMetersY ?? 40000
    const zoom = opts.zoom ?? 15
    const tileSize = opts.tileSize ?? 256
    const tileUrlTemplate = opts.tileUrlTemplate ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    const localUrlTemplate = opts.localUrlTemplate ?? '/MAP/urban-map.png'
    const concurrency = opts.maxConcurrency ?? 8

    // 1) compute extents in EPSG:28355 (we already have center, so build corners)
    const xmin = globalCentroidCoordinates.x - (sideMetersX / 2)
    const xmax = globalCentroidCoordinates.x + (sideMetersX / 2)
    const ymin = globalCentroidCoordinates.y - (sideMetersY / 2)
    const ymax = globalCentroidCoordinates.y + (sideMetersY / 2)

    // 2) convert corners to lon/lat (EPSG:4326)
    const [lonMin, latMin] = epsg28355ToLonLat({ x: xmin, y: ymin })
    const [lonMax, latMax] = epsg28355ToLonLat({ x: xmax, y: ymax })

    // Enforce correct ordering
    const west = Math.min(lonMin, lonMax)
    const east = Math.max(lonMin, lonMax)
    const south = Math.min(latMin, latMax)
    const north = Math.max(latMin, latMax)

    // 3) compute tile ranges for chosen zoom
    const tileMin = lonLatToTileXY(west, north, zoom) // note: north for minY
    const tileMax = lonLatToTileXY(east, south, zoom)

    const xMin = tileMin.x
    const xMax = tileMax.x
    const yMin = tileMin.y
    const yMax = tileMax.y

    const numTilesX = xMax - xMin + 1
    const numTilesY = yMax - yMin + 1

    // Defensive check
    if (numTilesX <= 0 || numTilesY <= 0) {
        throw new Error('Computed tile range is empty — check coordinate transforms/zoom')
    }

    // Build tile URL grid (row-major: 0..numTilesY-1 rows from yMin..yMax)
    const tileUrls: string[][] = []
    for (let j = 0; j < numTilesY; j++) {
        const row: string[] = []
        for (let i = 0; i < numTilesX; i++) {
            const tx = xMin + i
            const ty = yMin + j
            const url = tileUrlTemplate.replace('{z}', String(zoom)).replace('{x}', String(tx)).replace('{y}', String(ty))
            row.push(url)
        }
        tileUrls.push(row)
    }

    // path verso public/map-cache.png
    const loader = new THREE.TextureLoader()
    let texture: THREE.Texture
    try {
        texture = await new Promise((resolve, reject) => {
            loader.load(
                localUrlTemplate,
                (tex) => resolve(tex),
                undefined,
                () => reject("not found")
            )
        })
        console.log("Mappa caricata da public.")
    } catch {
        console.log("Public non trovata → download e generazione mappa...")
        // 4) compose tiles into canvas
        const mosaicCanvas = await composeTilesToCanvas(tileUrls, tileSize, concurrency)

        // salva nella cartella public come file
        downloadCanvasAsPNG(mosaicCanvas)

        // 5) Create Three.js texture from canvas
        texture = new THREE.CanvasTexture(mosaicCanvas)
    }

    texture.flipY = false // important: canvas y orientation vs UVs
    texture.needsUpdate = true
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter

    // 6) Create plane geometry in real world meters (width = sideMeters, height = sideMeters)
    const geometry = new THREE.PlaneGeometry(sideMetersX, sideMetersY, 1, 1)
    // Default PlaneGeometry lies on the XY plane; we want it horizontal on XZ with Y up.
    // We'll rotate it and position it correctly.
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true, // abilita trasparenza
        opacity: 1 // scegli tu (0=trasparente, 1=opaco)
    })
    const mesh = new THREE.Mesh(geometry, material)

    // Rotate so the plane is horizontal (XZ) with normal up (Y)
    mesh.rotateX(Math.PI / 2)

    // Compute actual width/height covered by tiles in EPSG:28355
    const [tileLonWest, tileLatNorth] = [west, north]
    const [tileLonEast, tileLatSouth] = [east, south]
    const [tileXMinMeters, tileYMaxMeters] = proj4('EPSG:4326', 'EPSG:28355', [tileLonWest, tileLatNorth])
    const [tileXMaxMeters, tileYMinMeters] = proj4('EPSG:4326', 'EPSG:28355', [tileLonEast, tileLatSouth])

    const actualWidth = tileXMaxMeters - tileXMinMeters
    const actualHeight = tileYMaxMeters - tileYMinMeters

    mesh.scale.set(actualWidth / sideMetersX, 1, actualHeight / sideMetersY)
    
    // Position the mesh using translation to bring globalCentroid to origin
    const centerX = (xmin + xmax) / 2
    const centerY = (ymin + ymax) / 2
    const Tx = -globalCentroid.x
    const Ty = -globalCentroid.y
    const meshPosX = centerX + Tx
    const meshPosZ = centerY + Ty
    mesh.position.set(meshPosX - 130, -5, meshPosZ + 22)
    mesh.rotateZ(Math.PI / 180 * 1.218261)
    mesh.scale.x *= 1.07568
    mesh.scale.y *= 1.04516

    // 8) Optional: prevent receiving shadows and raycast interactions by default
    mesh.receiveShadow = false
    mesh.castShadow = false
    mesh.renderOrder = -1
    // Optionally disable raycast by setting userData flag; integration code can check it
    // mesh.userData.isMapLayer = true
    return mesh
}

export async function mapLayer (world:OBC.World) {
    const mapList = {
        urban: {
            localUrl: '/MAP/urban.png',
            webUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        },
        territory: {
            localUrl: '/MAP/territory.png',
            webUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        },
        toner: {
            localUrl: '/MAP/toner.png',
            webUrl: 'https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png'
        },
        positron: {
            localUrl: '/MAP/positron.png',
            webUrl: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        },
        darkMatter: {
            localUrl: '/MAP/dark-matter.png',
            webUrl: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        }
    }
    
    const urbanMap = await createStaticMapLayer({ localUrlTemplate: mapList.urban.localUrl, tileUrlTemplate: mapList.urban.webUrl})
    const territoryMap = await createStaticMapLayer({ localUrlTemplate: mapList.territory.localUrl, tileUrlTemplate: mapList.territory.webUrl})
    const tonerMap = await createStaticMapLayer({ localUrlTemplate: mapList.toner.localUrl, tileUrlTemplate: mapList.toner.webUrl})
    const positronMap = await createStaticMapLayer({ localUrlTemplate: mapList.positron.localUrl, tileUrlTemplate: mapList.positron.webUrl})
    const darkMatterMap = await createStaticMapLayer({ localUrlTemplate: mapList.darkMatter.localUrl, tileUrlTemplate: mapList.darkMatter.webUrl})

    world.scene.three.add(urbanMap)
    world.scene.three.add(territoryMap)
    world.scene.three.add(tonerMap)
    world.scene.three.add(positronMap)
    world.scene.three.add(darkMatterMap)

    urbanMap.visible = true
    territoryMap.visible = false
    tonerMap.visible = false
    positronMap.visible = false
    darkMatterMap.visible = false
    
    return { urbanMap:urbanMap, territoryMap:territoryMap, tonerMap:tonerMap, positronMap:positronMap, darkMatterMap:darkMatterMap }
}