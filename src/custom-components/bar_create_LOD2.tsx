import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { colorBar } from './colorBar'
import type { Table } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import { barsBase, coordinatesScaleFactor, globalCentroid, groupColumn, normalizationHeight } from './parametersForGrouping'

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
    let suburb = ''
    const urbanTable = document.getElementById('urban-table') as BUI.Table

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
        suburb = (it[0]['Suburb'] as FRAGS.ItemAttribute).value
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
    const col = arrowData.getChild(groupColumn.lod1);
    if (!col) throw new Error(`${groupColumn.lod1} column not found`);
    for (let i = 0; i < arrowData.numRows; i++) {
        if (Number(col.get(i)).toString() === name) {
            const row = arrowData.get(i)
            dataBySection[Number(row!.identfr).toString()] = row
        }
    }
    function normalizeParamOne(data: Record<string, any>): Record<string, any> {
        const values = Object.values(data).map(d => d[paramOne]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return Object.fromEntries(
            Object.entries(data).map(([key, obj]) => [
            key,
            {
                ...obj,
                param_one_normalized: (obj[paramOne] - min) / (max - min),
            },
            ])
        )
    }
    dataForBars = normalizeParamOne(dataBySection)
    //console.log(dataForBars!)
    
    // Bar geometry
    const barGeometry = new THREE.BufferGeometry();
    const normalizationCheckbox = document.getElementById('normalization-checkbox') as BUI.Checkbox

    // building generation logic
    let processing = false;
    const buildings: any[] = []
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
            const bar_base_dim2 = barsBase.lod2
            const bar_base_dim1 = barsBase.lod2
            const centr_x = (parseFloat(set.centroid_x) - globalCentroid.x)/coordinatesScaleFactor
            const centr_y = (parseFloat(set.centroid_y) - globalCentroid.y)/coordinatesScaleFactor
            const bar_height = normalizationCheckbox ? set.param_one_normalized*normalizationHeight.lod2 : Number(set[paramOne])/normalizationHeight.notNormalized
            const bar_position = new THREE.Vector3(centr_x,0,centr_y)
            const bar_name = Number(set.identfr).toString()
            
            buildings.push(
                {
                    data: {
                        Suburb: bar_name,
                        Param1: Math.round(Number(set[paramOne])*1000)/1000,
                        Param2: Math.round(Number(set[paramTwo])*1000)/1000,
                        Color: 'blue',
                    },
                }
            )

            //estrusione
            geometryEngine.getExtrusion(barGeometry, {
                profilePoints: [ //punti di base X,Z,Y (forse, oppure Y,Z,X)
                    -bar_base_dim1, 0, -bar_base_dim1,
                    -bar_base_dim1, 0, bar_base_dim1,
                    bar_base_dim1, 0, bar_base_dim1,
                    bar_base_dim1, 0, -bar_base_dim1,
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

    const [map_color_ids,map_id_name,modelName]: any[] = await colorBar(components,dataForBars!,lod,name,paramTwo)
    
    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Bars created in ${loadTime} seconds`)
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> suburb created in <b>${loadTime}</b> seconds.`)

    for (const row of buildings){
        const block = row.data.Suburb
        const localId = Object.keys(map_id_name).filter(k => map_id_name[k as keyof typeof map_id_name] === block)
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
        if (data.data.Suburb != suburb) continue
        if (!data.children) continue
        for (const childrenData of data.children){
            if (childrenData.data.Suburb != name) continue
            childrenData.children = buildings
        }
    }
    urbanTable.requestUpdate()

    const colorScaleDropdown = document.getElementById('color-scale-dropdown') as BUI.Dropdown
    const historyTable = document.getElementById('history-table') as BUI.Table
    historyTable?.data.push({
        data: {
            UVL: lod,
            Suburb: name,
            Param1: paramOne,
            Param2: paramTwo,
            ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
            Normalization: normalizationCheckbox.checked,
        }
    })
    historyTable.requestUpdate()

    return true
}