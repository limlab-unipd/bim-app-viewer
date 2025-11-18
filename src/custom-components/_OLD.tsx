import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'

async function translateModelSingleMeshes (model:FRAGS.FragmentsModel,barPosition:{x:number,y:number,z:number},components:OBC.Components,world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>) {
    const fragments = components.get(OBC.FragmentsManager)
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

const editGlobalTransforms = async (model:FRAGS.FragmentsModel,newPosition:{x:number,y:number,z:number},components:OBC.Components) => {
    const fragments = components.get(OBC.FragmentsManager)
    // Define edit requests
    const requests: FRAGS.EditRequest[] = []
    // Get all global transforms
    const gTransforms = await model.getGlobalTransforms()
    // Edit all global transforms by multiplying it's y position by 5
    // per essere veramente super precisi  sarebbe da computare il vettore di spostamento tra il centro geometrico del modello e la nuova posizione
    // così com'è ora sta usando un vettore di spostamento dato dalla posizione della barra rispetto a 0,0,0
    // (il che va bene perchè i modelli vengono caricati sempre al centro non essendo referenziati tra loro, ma se lo fossero non andrebbe bene)
    for (const [localId, globalTransform] of gTransforms) {
        globalTransform.position[0] = newPosition.x
        globalTransform.position[1] = newPosition.y //verso l'alto non va spostato
        globalTransform.position[2] = newPosition.z
        requests.push({
            type: FRAGS.EditRequestType.UPDATE_GLOBAL_TRANSFORM,
            localId,
            data: globalTransform,
        });
    }
    // Apply the edit requests to the model
    await fragments.core.editor.edit(model.modelId, requests);
    // Update the model to see the changes
    await fragments.core.update(true);
    await fragments.core.editor.save(model.modelId)
    return newPosition
}