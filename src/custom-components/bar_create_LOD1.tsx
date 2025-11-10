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
export async function bar_create_LOD1 (
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
    const lod: number = 1
    let dataForBars:{[key:string]:any}
    const dataBySuburb: {[key:string]:any} = {} //all buildings of single suburb
    interface sectionObject {
        suburb?: string;
        section?: string;
        param_one?: number;
        param_two?: number;
        centroid_x_local?:number[];
        centroid_y_local?:number[];
    }
    const dataBySection: {[key:string]:sectionObject} = {} //all buildings of single suburb
    let name = ''
    const urbanTable = document.getElementById('urban-table') as BUI.Table

    //getting the selected bar name
    const selection = highlighter.selection.select
    if (Object.entries(selection).length == 0) {
        addOverlay(BUI.html`<b>WARNING: Please select any UVL-0 bar to proceed.</b>`,'warning')
        return false
    }
    const item = await fragments.getData(selection)
    for (const [model,it] of Object.entries(item)){
        if (!model.includes('LOD_0')) {
            addOverlay(BUI.html`<b>WARNING: The selected bar can't be used to load UVL-1. Please select any UVL-0 bar to proceed.</b>`,'warning')
            return false
        }
        if (!(it[0]['_category'] as FRAGS.ItemAttribute).value) continue
        name = (it[0]['Name'] as FRAGS.ItemAttribute).value
    }
    if (previousLoadedSuburbs.includes(name)) {
        addOverlay(BUI.html`<b>WARNING: UVL-1 of ${name} already loaded.</b>`,'warning')
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
    const col = arrowData.getChild("DIVISION_N");
    if (!col) throw new Error("DIVISION_N column not found");
    for (let i = 0; i < arrowData.numRows; i++) {
        if (col.get(i) === name) {
            const row = arrowData.get(i)
            dataBySuburb[Number(row!.identfr).toString()] = row
        }
    }
    for (const [identfr,row] of Object.entries(dataBySuburb)) {
        const section = Number(row!.MB_CODE).toString()
        //dataBySection[section] ? dataBySection[section].push(row) : dataBySection[section] = [row]
        dataBySection[section] ? '' : dataBySection[section] = {}
        dataBySection[section].suburb = name
        dataBySection[section].section = section
        const rowOne = Number(row[paramOne])
        const rowTwo = Number(row[paramTwo])
        dataBySection[section].param_one ? dataBySection[section].param_one+=rowOne : dataBySection[section].param_one = rowOne
        dataBySection[section].param_two ? dataBySection[section].param_two+=rowTwo : dataBySection[section].param_two = rowTwo
        dataBySection[section].centroid_x_local ? dataBySection[section].centroid_x_local.push(row.centroid_x_local) : dataBySection[section].centroid_x_local = [row.centroid_x_local]
        dataBySection[section].centroid_y_local ? dataBySection[section].centroid_y_local.push(row.centroid_y_local) : dataBySection[section].centroid_y_local = [row.centroid_y_local]
    }
    dataForBars = dataBySection
    //console.log(dataForBars!)
    //return [true,'']
    
    // Bar geometry
    const barGeometry = new THREE.BufferGeometry();

    // building generation logic
    let processing = false;
    const blocks: any[] = []
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
        for (const [key,set] of Object.entries(dataForBars)) {
            const bar_base_dim2 = 5
            const bar_base_dim1 = 5
            const bar_height = Number(set.param_one)/1000
            const centr_x = (Math.max(...set.centroid_x_local)+Math.min(...set.centroid_x_local))/2
            const centr_y = (Math.max(...set.centroid_y_local)+Math.min(...set.centroid_y_local))/2
            const bar_position = new THREE.Vector3(centr_x/20,0,centr_y/20)
            const bar_name = Number(set.section).toString()

            blocks.push(
                {
                    data: {
                        Suburb: bar_name,
                        Param1: set.param_one,
                        Param2: set.param_two,
                        Color: 'blue',
                    },
                }
            )
            
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
                    Suburb: { value: set.suburb },
                    Height: { value: bar_height },
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

    const [map_color_ids,map_id_name,modelName]: any[] = await colorBar(components,dataForBars!,lod,name,paramTwo)

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Bars created in ${loadTime} seconds`)
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> suburb created in <b>${loadTime}</b> seconds.`)

    console.log(map_color_ids)
    for (const row of blocks){
        const section = row.data.Suburb
        const localId = Object.keys(map_id_name).filter(k => map_id_name[k as keyof typeof map_id_name] === section)
        row.data.localId = Number(localId[0])
        row.data.model = modelName
        switch (true) {
            case (map_color_ids['color_0_02'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('color_0_02')?.color.getStyle()!
                break;
            case (map_color_ids['color_02_04'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('color_02_04')?.color.getStyle()!
                break;
            case (map_color_ids['color_04_06'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('color_04_06')?.color.getStyle()!
                break;
            case (map_color_ids['color_06_08'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('color_06_08')?.color.getStyle()!
                break;
            case (map_color_ids['color_08_1'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('color_08_1')?.color.getStyle()!
                break;
        }
    }

    for (const [,data] of Object.entries(urbanTable.data)){
        if (data.data.Suburb != name) continue
        data.children = blocks
    }
    urbanTable.requestUpdate()

    return true
}