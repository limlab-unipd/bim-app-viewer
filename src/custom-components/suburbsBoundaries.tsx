import * as THREE from 'three'
import { readArrow } from "./readArrow"
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import type { Table } from 'apache-arrow'
import { coordinatesScaleFactor, globalCentroid, groupColumn } from './parametersForGrouping'
import { parseWKTPolygon } from './conversion'

// Funzione principale
export async function suburbsBoundaries(world:OBC.World, components:OBC.Components, arrowData:Table<any>) {
    const scene = world.scene
    const arrow = await readArrow('boundaries')
    if (!arrow) return
    const marker = components.get(OBCF.Marker)
    marker.threshold = 1;
    const data_suburbs_names = arrowData.getChild(groupColumn.lod0)

    // Fattore di scala per adattare le coordinate a Three.js
    const scale = 1/coordinatesScaleFactor

    const group = new THREE.Group()
    // Ciclo su tutte le righe del file Arrow
    for (let i = 0; i < arrow.numRows; i++) {
        let lineColor = 'rgba(142, 142, 142, 1)'
        let lineRenderOrder = 1
        const row = arrow.get(i)
        if (!row || row.geometry_wkt=='') continue
        const suburbName = row[groupColumn.lod0_boundaries]

        try {
            const polygons = parseWKTPolygon(row.geometry_wkt)
            if (!polygons || polygons.length === 0) continue

            const isLake = suburbName.includes('Lake')
            const isAnalyzed = data_suburbs_names!.includes(suburbName)

            if (!isAnalyzed){
                lineColor = 'rgba(76, 76, 76, 1)'
                lineRenderOrder = 0
                //continue
            }

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

                // Riempimento solo se è Lake
                if (isLake) {
                    const shape = new THREE.Shape(shapePoints)
                    const shapeGeometry = new THREE.ShapeGeometry(shape)
                    const fillMaterial = new THREE.MeshBasicMaterial({
                        color: 'rgba(86, 178, 209, 1)',
                        side: THREE.DoubleSide,
                        opacity: 0.4,
                        transparent: true,
                    })
                    const mesh = new THREE.Mesh(shapeGeometry, fillMaterial)
                    // Porta la mesh allo stesso livello Z della linea
                    mesh.position.y = 0
                    mesh.rotation.x = Math.PI / 2
                    scene.three.add(mesh)
                } else {
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
                }

                //MARKER PER IL NOME
                const element = BUI.Component.create(
                    () => BUI.html`<bim-label style="font-size: 0.7rem; color:${lineColor}">${suburbName}</bim-label>`,
                );
                marker.create(world, element, new THREE.Vector3(row.centroid_x - globalCentroid.x, 0, -(row.centroid_y - globalCentroid.y)));
            })
        } catch (err) {
            console.warn('Errore nella riga', row, err)
        }
    }
    scene.three.add(group) //aggiunge tutte le linee alla scena, invece di aggiungerle una per volta
    window.dispatchEvent(new Event('resize'))
} 