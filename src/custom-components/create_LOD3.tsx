import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { addOverlay } from './addOverlay'

export async function create_LOD3 (
    components:OBC.Components,
    loadFragmentFile:(path:string, id?:string) => Promise<FRAGS.FragmentsModel>,
    world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>
): Promise<[boolean,{x:number,y:number,z:number}|undefined,number|undefined]> {

    const highlighter = components.get(OBCF.Highlighter)
    const fragments = components.get(OBC.FragmentsManager)

    let result = false
    let newPosition, uvlUsed
    const selection = highlighter.selection.select

    for (const [modelId,entries] of Object.entries(selection)){
        const model = fragments.list.get(modelId)
        if (model?.isDeltaModel) continue
        if (!modelId.includes('LOD_2')) {
            addOverlay(BUI.html`<b>WARNING</b>: The selected bar can't be used to load UVL-3. Please select any UVL-2 bar to continue.`,'warning')
            continue
        }
        uvlUsed = modelId.includes('LOD_2_') ? 2 : 21
        result = true
        for (const localId of entries){
            const modelIdMap: OBC.ModelIdMap = {[modelId]:new Set<number>([localId])}
            const barData = await fragments.getData(modelIdMap)
            const barName = (barData[modelId][0]['Name'] as FRAGS.ItemAttribute).value
            const barFunction = (barData[modelId][0]['Function'] as FRAGS.ItemAttribute).value
            let modelPath = ''
            switch (true) {
                case ['Single House','Semi-Detached House'].includes(barFunction):
                    modelPath = "/FRAG/ACT/ACT_OSH.frag"
                    break
                case ['Flat - Ground Level'].includes(barFunction):
                    modelPath = "/FRAG/ACT/ACT_ALR.frag"
                    break
                case ['Flat - 3 Storey','Community Facility - 1-3 Storey','Commercial - 1-3 Storey','Designated Use - 1-3 Storey'].includes(barFunction):
                    modelPath = "/FRAG/ACT/ACT_AMR.frag"
                    break
                case ['Flat - 4+ Storey'].includes(barFunction):
                    modelPath = "/FRAG/ACT/ACT_AHR.frag"
                    break
                case ['Community Facility - 4-7 Storey','Commercial - 3-6 Storey','Commercial - 4-7 Storey','Commercial - 8-35 Storey','Designated Use - 1-3 Storey','Designated Use - 4-7 Storey','Designated Use - 8-35 Storey'].includes(barFunction):
                    modelPath = "/FRAG/ACT/ACT_MHR.frag"
                    break
                case ['Industrial - Type 1','Industrial - Type 2'].includes(barFunction):
                    modelPath = "/FRAG/ACT/ACT_WH.frag"
                    break
                default:
                    modelPath = "/FRAG/ACT/ACT_OSH.frag"
                    continue
            }

            const [position] = await fragments.getPositions(modelIdMap)
            const loadedModel = await loadFragmentFile(modelPath, `LOD_3_${barName}`)
            loadedModel.object.position.set(position.x,position.y,position.z)

            newPosition = position
        }
    }

    return [result,newPosition,uvlUsed]
}