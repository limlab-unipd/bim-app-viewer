import * as THREE from 'three'
import { readArrow } from "./readArrow"
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { coordinatesScaleFactor, globalCentroid, groupColumn } from './parametersForGrouping'

// Funzione per parsing POLYGON da WKT
function parseWKTPolygon(wkt: string): number[][][] {
    const polygons: number[][][] = []

    if (wkt.startsWith('POLYGON')) {
        const match = wkt.match(/POLYGON\s*\(\((.+)\)\)/i)
        if (!match) return []

        const rings = match[1].split('),(')
        const polygon: number[][] = rings.map(ringStr =>
            ringStr.split(',').map(pt => pt.trim().split(/\s+/).map(Number))
        ).flat()

        polygons.push(polygon)
    } else if (wkt.startsWith('MULTIPOLYGON')) {
        // Estrapola ogni poligono
        const multipolyMatch = wkt.match(/MULTIPOLYGON\s*\(\(\((.+)\)\)\)/i)
        if (!multipolyMatch) return []

        const polyStrings = multipolyMatch[1].split(')), ((')
        polyStrings.forEach(polyStr => {
            const polygon: number[][] = polyStr.split(',').map(pt => pt.trim().split(/\s+/).map(Number))
            polygons.push(polygon)
        })
    }
    return polygons
}

// Funzione principale
export async function suburbsBoundaries(world:OBC.World, components:OBC.Components) {
    const scene = world.scene
    const arrow = await readArrow('suburbs-boundaries')
    const marker = components.get(OBCF.Marker)
    marker.threshold = 1;

    // Fattore di scala per adattare le coordinate a Three.js
    const scale = 1/coordinatesScaleFactor

    // Ciclo su tutte le righe del file Arrow
    for (let i = 0; i < arrow.numRows; i++) {
        const row = arrow.get(i)
        if (!row) continue
        try {
            const polygons = parseWKTPolygon(row.geometry_wkt)
            if (!polygons || polygons.length === 0) return

            polygons.forEach(polygon => {
                // Crea array di vertici con Y WKT → Z Three.js
                const vertices: number[] = []
                polygon.forEach(([x, y]) => {
                    const tx = (x - globalCentroid.x) * scale
                    const tz = (y - globalCentroid.y) * scale
                    vertices.push(tx, 0, tz) // Y=0
                })
                // Crea geometria
                const geometry = new THREE.BufferGeometry()
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
                // Se vuoi chiudere il poligono
                geometry.setIndex([...Array(polygon.length).keys(), 0])

                const element = BUI.Component.create(
                    () => BUI.html`<bim-label style="font-size: 0.5rem">${row[groupColumn.lod0]}</bim-label>`,
                );
                marker.create(world, element, new THREE.Vector3(row.centroid_x - globalCentroid.x, 0, row.centroid_y - globalCentroid.y));

                const material = new THREE.LineBasicMaterial({ color: 0xffffff })
                const line = new THREE.LineLoop(geometry, material)
                scene.three.add(line)
            })
        } catch (err) {
            console.warn('Errore nella riga', row, err)
        }
    }
}
