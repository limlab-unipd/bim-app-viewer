import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { addOverlay } from './addOverlay'

export async function LOD3_loadBIM (
    components:OBC.Components,
    loadFragmentFile:(path: string) => Promise<FRAGS.FragmentsModel>,
    world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>
): Promise<[boolean,{x:number,y:number,z:number}|undefined]> {

    const highlighter = components.get(OBCF.Highlighter)
    const fragments = components.get(OBC.FragmentsManager)

    let result = false
    let newPosition
    const selection = highlighter.selection.select
    for (const [modelId,entries] of Object.entries(selection)){
        if (!modelId.includes('LOD_2')) {
            addOverlay(BUI.html`Pleae select UVL-2 bar to load UVL-3`)
            continue
        }
        result = true
        for (const localId of entries){
            const modelIdMap: OBC.ModelIdMap = {[modelId]:new Set<number>([localId])}
            const barData = await fragments.getData(modelIdMap)
            const [position] = await fragments.getPositions(modelIdMap)
            const loadedModel = await loadFragmentFile("/FRAG/ACT/ACT_AHR.frag")
            loadedModel.object.position.set(position.x,position.y,position.z)
            newPosition = position
        }
    }

    return [result,newPosition]
}