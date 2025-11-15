import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { colorBar } from './colorBar'
import type { Table } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import { readArrow } from './readArrow'

export async function LOD3_loadBIM (
    components:OBC.Components,
    loadFragmentFile:(path: string) => Promise<FRAGS.FragmentsModel>,
    world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>
) {

    const highlighter = components.get(OBCF.Highlighter)
    const fragments = components.get(OBC.FragmentsManager)

    async function translateModel (model:FRAGS.FragmentsModel,barPosition:{x:number,y:number,z:number}) {
        const modelId = model?.modelId
        const editedModels = []
        if (!model) return
        if (model.isDeltaModel || modelId.includes('LOD')) return //potenzialmente si può anche togliere, serve se si itera su tutti i modelli di fragments.list
        editedModels.push(modelId)
        const allItems = await model.getItems()
        const totalRequests: FRAGS.EditRequest[] = []
        const elements = await fragments.core.editor.getElements(modelId, [...allItems.keys()])
        for (const elem of elements) {
            const meshes = await elem.getMeshes()
            world.scene.three.add(meshes)
            const matrix = new THREE.Matrix4()
            matrix.makeTranslation(barPosition.x,barPosition.y,barPosition.z)
            meshes.applyMatrix4(matrix)
            await elem.setMeshes(meshes)
            elem.disposeMeshes(meshes)
            const requests = elem.getRequests()
            if (requests) {
                totalRequests.push(...requests)
            }
        }
        await fragments.core.editor.edit(modelId,totalRequests)
        await fragments.core.update(true)
        editedModels.forEach(async (modelId) => await fragments.core.editor.save(modelId))
    }

    const selection = highlighter.selection.select
    for (const [modelId,entries] of Object.entries(selection)){
        if (!modelId.includes('LOD_2')) {
            addOverlay(BUI.html`Pleae select UVL-2 bar to load UVL-3`)
            continue
        }
        for (const localId of entries){
            const modelIdMap: OBC.ModelIdMap = {[modelId]:new Set<number>([localId])}
            const barData = await fragments.getData(modelIdMap)
            const [position] = await fragments.getPositions(modelIdMap)
            const loadedModel = await loadFragmentFile("/FRAG/Sample_one-story-house.frag")
            await translateModel(loadedModel,{x:position.x,y:position.y,z:position.z})
        }
    }
}