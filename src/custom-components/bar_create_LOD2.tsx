import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { colorBar } from './colorBar'
import type { Table } from 'apache-arrow'
import { addOverlay } from './addOverlay'

/**
 * Create bar according to values.
 * @param world the world instance used to render the scene
 * @param fragments the FragmentsManager instance
 * @param geometryEngine the GeoemtryEngine instance
 * @param lod the lod you want to load
 * @param name the name of the bar to load the next lod
 * @returns if the function correctly found the bar and created the next lod or not
 */
export async function bar_create_LOD2 (
        world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>,
        components:OBC.Components,
        geometryEngine:FRAGS.GeometryEngine,
        arrowData:Table<any>,
        paramOne:string='Concret',
        paramTwo:string='Glass',
        previousLoadedSuburbs:string[],
    ): Promise<boolean> {

    //initialize variables
    const fragments = components.get(OBC.FragmentsManager)
    const highlighter = components.get(OBCF.Highlighter)
    const startTime = performance.now() // Start timer
    const lod: number = 2
    let dataForBars:{[key:string]:any}
    const dataBySection: {[key:string]:any} = {} //all buildings of single suburb
    let name = ''

    //getting the selected bar name
    const selection = highlighter.selection.select
    if (Object.entries(selection).length == 0) {
        addOverlay(BUI.html`<b>WARNING: Please select any UVL-1 bar to proceed.</b>`,'warning')
        return false
    }
    const item = await fragments.getData(selection)
    for (const [model,it] of Object.entries(item)){ 
        if (!model.includes('LOD_1')) {
            addOverlay(BUI.html`<b>WARNING: The selected bar can't be used to load UVL-2. Please select any UVL-1 bar to proceed.</b>`,'warning')
            return false
        }
        if (!(it[0]['_category'] as FRAGS.ItemAttribute).value) continue
        name = (it[0]['Name'] as FRAGS.ItemAttribute).value
    }
    if (previousLoadedSuburbs.includes(name)) { 
        addOverlay(BUI.html`<b>WARNING: UVL-2 of ${name} already loaded.</b>`,'warning')
        return false 
    } else {
        previousLoadedSuburbs.push(name) 
    }

    //create new base model for geometries
    const bytes = FRAGS.EditUtils.newModel({ raw: true });
    const newModel = await fragments.core.load(bytes, {
        modelId: `LOD_${lod}_${name}`,
        camera: world.camera.three,
        raw: true,
    });
    world.scene.three.add(newModel.object);
    await fragments.core.update(true);

    //filter arrow data
    const col = arrowData.getChild("MB_CODE");
    if (!col) throw new Error("MB_CODE column not found");
    for (let i = 0; i < arrowData.numRows; i++) {
        if (Number(col.get(i)).toString() === name) {
            const row = arrowData.get(i)
            dataBySection[Number(row!.identfr).toString()] = row
        }
    }
    dataForBars = dataBySection
    //console.log(dataForBars!)
    //return [true,'']
    
    // Bar geometry
    const barGeometry = new THREE.BufferGeometry();

    // building generation logic
    let processing = false;
    const regenerateFragments = async () => {
        const elementsData: FRAGS.NewElementData[] = [];
        await fragments.core.editor.reset(newModel.modelId)
        // Create base items
        const matId = fragments.core.editor.createMaterial(
            newModel.modelId,
            new THREE.MeshLambertMaterial({ //materiale
                color: new THREE.Color(1, 1, 1),
                side: THREE.DoubleSide,
            }),
        );
        const ltId = fragments.core.editor.createLocalTransform(
            newModel.modelId,
            new THREE.Matrix4().identity(),
        );

        // Bars
        const tempObject = new THREE.Object3D();
        //creation of each bar
        let x=0
        let y = 0
        for (const [key,set] of Object.entries(dataForBars)) {
            const bar_base_dim2 = 1
            const bar_base_dim1 = 1
            const bar_height = Number(set[paramOne])
            const bar_position = new THREE.Vector3(parseFloat(set.centroid_x_local)/20,0,parseFloat(set.centroid_y_local)/20)
            const bar_name = Number(set.identfr).toString()
            
            //estrusione
            geometryEngine.getExtrusion(barGeometry, {
                profilePoints: [ //punti di base X,Z,Y (forse, oppure Y,Z,X)
                    0, 0, 0,
                    0, 0, bar_base_dim1,
                    bar_base_dim2, 0, bar_base_dim1,
                    bar_base_dim2, 0, 0,
                ],
                direction: [0, 1, 0], //vettore direzione
                cap: true,
                length: bar_height, //estrusione
            });
            //creazione shell
            const barGeoId = fragments.core.editor.createShell(
                newModel.modelId,
                barGeometry,
            );

            //sposta l'oggetto in posizione
            tempObject.position.copy(bar_position);
            tempObject.updateMatrix();

            //proprietà dell'oggetto appena creato (qui andranno inserite le eventuali proprietà IFC)
            elementsData.push({
                attributes: {
                    _category: {
                        value: "IfcBuildingElementProxy",
                    },
                    _guid: { value: generateUUID() },
                    Name: { value: bar_name },
                    Suburb: { value: set.DIVISION_N ? set.DIVISION_N : bar_name },
                    Height: { value: bar_height },
                    Aluminium: { value: set.Aluminm ? set.Aluminm : 0 },
                    Concrete: { value: set.Concret ? set.Concret : 0 },
                    Steel: { value: set.Steel ? set.Steel : 0 },
                },
                globalTransform: tempObject.matrix.clone(),
                samples: [
                    {
                        localTransform: ltId,
                        representation: barGeoId,
                        material: matId,
                    },
                ],
            });
        }
        await fragments.core.editor.createElements(newModel.modelId, elementsData);
        await fragments.core.update(true);
        processing = false;
    };
    
    await regenerateFragments();

    await colorBar(components,dataForBars!,lod,name,paramTwo)
    
    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Bars created in ${loadTime} seconds`)
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> suburb created in <b>${loadTime}</b> seconds.`)
    return true
}