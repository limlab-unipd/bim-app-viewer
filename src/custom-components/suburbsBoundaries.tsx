import * as THREE from 'three'
import { readArrow } from "./readArrow"
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import type { Table } from 'apache-arrow'
import { coordinatesScaleFactor, globalCentroid, groupColumn } from './parametersForGrouping'
import { parseWKTPolygon } from './conversion'
import { mapLayer } from './mapLayer'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Esporta mesh/gruppo in GLB binario
function exportGroupToGLB(group: THREE.Group, groupNotAnalyzed: THREE.Group) {
    const fullGroup = new THREE.Group()
    fullGroup.add(groupNotAnalyzed.clone(true))
    fullGroup.add(group.clone(true))
    const exporter = new GLTFExporter()
    // Non bloccare, il callback è asincrono
    exporter.parse(
        fullGroup,
        (result) => {
            if (result instanceof ArrayBuffer) {
                const blob = new Blob([result], { type: 'application/octet-stream' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = 'suburbs_boundaries.glb'
                a.click()
                URL.revokeObjectURL(a.href)
            }
        },
        (error) => console.error('Errore esportazione GLB:', error),
        { binary: true } // 'as any' se TypeScript da errore
    )
}

export async function loadSuburbsFromGLB(url: string) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const fullGroup = gltf.scene
    return fullGroup
}

// Funzione principale
export async function suburbsBoundaries(world: OBC.World, components: OBC.Components, arrowData: Table<any>) {
    const scene = world.scene
    const arrow = await readArrow('boundaries')
    if (!arrow) return
    const marker = components.get(OBCF.Marker)
    marker.threshold = 1;
    const data_suburbs_names = arrowData.getChild(groupColumn.lod0)

    // CARICAMENTO 1
    try {
        // caricamento boundaries precreati
        const fullGroup = await loadSuburbsFromGLB('/MAP/boundaries-sa2.glb')
        console.log('Geometrie boundaries caricate da public.')
        // Aggiungi tutto alla scena
        world.scene.three.add(fullGroup)
        // li rende visibili
        window.dispatchEvent(new Event('resize'))
        // crea i marker
        for (let i = 0; i < arrow.numRows; i++) {
            let lineColor = 'rgba(142, 142, 142, 1)'
            const row = arrow.get(i)
            if (!row) continue
            const suburbName = row[groupColumn.lod0_boundaries]
            const isAnalyzed = data_suburbs_names!.includes(suburbName)
            if (!isAnalyzed) {
                lineColor = 'rgba(98, 98, 98, 1)'
            }
            const element = BUI.Component.create(
                () => BUI.html`<bim-label style="font-size: 0.7rem; color:${lineColor}">${suburbName}</bim-label>`,
            )
            marker.create(world, element, new THREE.Vector3(row.centroid_x - globalCentroid.x, 0, -(row.centroid_y - globalCentroid.y)))
        }
        // aggiunge la mappa alla scena
        const meshMapLayer = await mapLayer(world)
        // ritorna la mappa
        return meshMapLayer
    } catch {
        console.log('Public non trovata, generazione geometrie...')
    }

    // CARICAMENTO 2 (SOLO SE 1 NON FUNZIONA)
    // Fattore di scala
    const scale = 1 / coordinatesScaleFactor
    const materialLake = new THREE.MeshBasicMaterial({
        color: 0x56b2d1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4
    })
    // se il caricamento dei boundaries precreati non funziona li rigenera
    const group = new THREE.Group()
    const groupNotAnalyzed = new THREE.Group()
    // Ciclo su tutte le righe del file Arrow
    for (let i = 0; i < arrow.numRows; i++) {
        let lineColor = 'rgba(142, 142, 142, 1)'
        let lineRenderOrder = 1
        const row = arrow.get(i)
        if (!row || row.geometry_wkt == '') continue
        const suburbName = row[groupColumn.lod0_boundaries]
        const isLake = suburbName.includes('Lake')
        const isAnalyzed = data_suburbs_names!.includes(suburbName)

        try {
            const polygons = parseWKTPolygon(row.geometry_wkt)
            if (!polygons || polygons.length === 0) continue

            if (!isAnalyzed) {
                lineColor = 'rgba(98, 98, 98, 1)'
                lineRenderOrder = 0
            }

            polygons.forEach(polygon => {
                const vertices: number[] = []
                const shapePoints: THREE.Vector2[] = []
                polygon.forEach(([x, y]) => {
                    const tx = (x - globalCentroid.x) * scale
                    const tz = - (y - globalCentroid.y) * scale
                    vertices.push(tx, 0, tz)
                    shapePoints.push(new THREE.Vector2(tx, tz))
                })

                if (isLake) {
                    const shape = new THREE.Shape(shapePoints)
                    const shapeGeometry = new THREE.ShapeGeometry(shape)
                    const mesh = new THREE.Mesh(shapeGeometry, materialLake)
                    mesh.position.y = 0
                    mesh.rotation.x = Math.PI / 2
                    group.add(mesh)
                } else {
                    const geometry = new THREE.BufferGeometry()
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
                    try {
                        geometry.computeBoundingSphere()
                        geometry.setIndex([...Array(polygon.length).keys(), 0])
                        const material = new THREE.MeshStandardMaterial({ color: lineColor })
                        const line = new THREE.LineLoop(geometry, material)
                        line.renderOrder = lineRenderOrder
                        if (!Number.isNaN(line.geometry.boundingSphere?.radius)) {
                            isAnalyzed ? group.add(line) : groupNotAnalyzed.add(line)
                        }
                    } catch {}
                }

                const element = BUI.Component.create(
                    () => BUI.html`<bim-label style="font-size: 0.7rem; color:${lineColor}">${suburbName}</bim-label>`,
                )
                marker.create(world, element, new THREE.Vector3(row.centroid_x - globalCentroid.x, 0, -(row.centroid_y - globalCentroid.y)))
            })
        } catch (err) {
            console.warn('Errore nella riga', row, err)
        }
    }
    scene.three.add(groupNotAnalyzed)
    scene.three.add(group)
    window.dispatchEvent(new Event('resize'))
    // Download dei boundaries se necessario
    //setTimeout(() => exportGroupToGLB(group, groupNotAnalyzed), 100)
    const meshMapLayer = await mapLayer(world)
    return meshMapLayer
}


// Funzione principale
export async function sa1Boundaries(world:OBC.World, components:OBC.Components, arrow:Table<any>, selectedSuburb:string='') {
    const scene = world.scene
    if (!arrow) return
    const marker = components.get(OBCF.Marker)
    marker.threshold = 1
    const sa1Centroids: {[key:string]:{centr_x:number, centr_y:number}} = {}

    // Fattore di scala per adattare le coordinate a Three.js
    const scale = 1/coordinatesScaleFactor

    const group = new THREE.Group()
    // Ciclo su tutte le righe del file Arrow
    for (let i = 0; i < arrow.numRows; i++) {
        let lineColor = 'rgba(225, 225, 225, 1)'
        let markerColor = 'rgba(142, 142, 142, 1)'
        let lineRenderOrder = 1
        const row = arrow.get(i)
        if (!row || row.geometry_wkt=='') continue
        const suburb = row[groupColumn.lod0_boundaries]
        if (suburb != selectedSuburb) continue
        const sa1_name = Number(row[groupColumn.lod1_boundaries]).toString()

        try {
            const polygons = parseWKTPolygon(row.geometry_wkt)
            if (!polygons || polygons.length === 0) continue

            polygons.forEach(polygon => {
                // Crea array di vertici con Y WKT → Z Three.js
                const vertices: number[] = []
                const shapePoints: THREE.Vector2[] = []
                polygon.forEach(([x, y]) => {
                    const tx = (x - globalCentroid.x) * scale
                    const tz = - (y - globalCentroid.y) * scale
                    vertices.push(tx, 0, tz) // Y=0
                    shapePoints.push(new THREE.Vector2(tx, tz))
                })

                // Crea geometria
                const geometry = new THREE.BufferGeometry()
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
                try {
                    geometry.computeBoundingSphere() //serve per controllare alcune geometrie che non vanno bene, in questo modo crea la sfera e se non ci riesce non aggiunge la geometria al gruppo da mettere nella scena
                    // se quello sopra non funziona si interrompe qui
                    // Se vuoi chiudere il poligono
                    geometry.setIndex([...Array(polygon.length).keys(), 0])
                    const material = new THREE.LineBasicMaterial({ color: lineColor })
                    const line = new THREE.LineLoop(geometry, material)
                    line.renderOrder = lineRenderOrder
                    if (!Number.isNaN(line.geometry.boundingSphere?.radius)){
                        group.add(line)
                    }
                } catch (error) {
                    //console.warn(error)
                }

                //MARKER PER IL NOME
                const element = BUI.Component.create(
                    () => BUI.html`<bim-label style="font-size: 0.6rem; color:${markerColor}">${sa1_name}</bim-label>`,
                );
                marker.create(world, element, new THREE.Vector3(row.centroid_x - globalCentroid.x, 0, -(row.centroid_y - globalCentroid.y)));
                sa1Centroids[sa1_name] = { centr_x: row.centroid_x - globalCentroid.x, centr_y: row.centroid_y - globalCentroid.y}
            })
        } catch (err) {
            console.warn('Errore nella riga', row, err)
        }
    }
    scene.three.add(group) //aggiunge tutte le linee alla scena, invece di aggiungerle una per volta
    window.dispatchEvent(new Event('resize'))
    return sa1Centroids
} 