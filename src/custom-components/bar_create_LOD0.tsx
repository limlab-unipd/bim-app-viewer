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
import { barsBase, coordinatesScaleFactor, globalCentroid, groupColumn, normalizationHeight } from './parametersForGrouping'

/**
 * Create bar according to values.
 * @param world the world instance used to render the scene
 * @param fragments the FragmentsManager instance
 * @param geometryEngine the GeoemtryEngine instance
 * @param LOD the LOD you want to load
 * @param name the name of the bar to load the next LOD
 * @returns if the function correctly found the bar and created the next LOD or not
 */
export async function bar_create_LOD0 (
        world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>,
        components:OBC.Components,
        geometryEngine:FRAGS.GeometryEngine,
        arrowData:Table<any>,
        paramOne:string='Concret',
        paramTwo:string='Glass',
        panelRight:BUI.Panel,
    ): Promise<boolean> {

    if (!arrowData) {
        addOverlay(BUI.html`Please load any samples before.`,'warning')
        return false
    }
    
    //initialize variables
    const fragments = components.get(OBC.FragmentsManager)
    const startTime = performance.now() // Start timer
    const lod: number = 0
    const name: string = 'CANBERRA'
    let dataForBars:{[key:string]:any}
    interface cityObject {
        suburb: string;
        param_one: number;
        param_two?: number;
        centroid_x_local?:number;
        centroid_y_local?:number;
    }
    const dataCity: {[key:string]:cityObject} = {}
    const dataSuburbsCentroid: {[key:string]:{centroid_x_local:number,centroid_y_local:number}} = {}

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
    const colSuburbs = arrowData.getChild(groupColumn.lod0);
    if (!colSuburbs) throw new Error(`${groupColumn.lod0} column not found`);
    const colParamOne = arrowData.getChild(paramOne)
    const colParamTwo = arrowData.getChild(paramTwo)

    for (let i = 0; i < arrowData.numRows; i++) {
        const suburb = colSuburbs.get(i)
        //const row = arrowData.get(i)
        //dataCity[suburb] ? dataCity[suburb].push(row) : dataCity[suburb] = [row]
        const rowOne = Number(colParamOne?.get(i))
        const rowTwo = Number(colParamTwo?.get(i))
        dataCity[suburb] ? 
            (dataCity[suburb].param_one+=rowOne,dataCity[suburb].param_two!+=rowTwo) : 
            dataCity[suburb] = {suburb:suburb, param_one:rowOne, param_two:rowTwo}
    }
    function normalizeParamOne(data: Record<string, any>): Record<string, any> {
        const values = Object.values(data).map(d => d.param_one);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return Object.fromEntries(
            Object.entries(data).map(([key, obj]) => [
            key,
            {
                ...obj,
                param_one_normalized: (obj.param_one - min) / (max - min),
            },
            ])
        )
    }
    dataForBars = normalizeParamOne(dataCity)
    //console.log(dataForBars!)
    
    const arrowData_suburbsCentroids = await readArrow('suburbs')
    const suburbsCentroids_colSuburbs = arrowData_suburbsCentroids.getChild(groupColumn.lod0_boundaries)
    const suburbsCentroids_centroid_x = arrowData_suburbsCentroids.getChild("centroid_x")
    const suburbsCentroids_centroid_y = arrowData_suburbsCentroids.getChild("centroid_y")
    for (let i = 0; i < arrowData_suburbsCentroids.numRows; i++) {
        const suburb = suburbsCentroids_colSuburbs!.get(i)
        const centroid_x_local = (suburbsCentroids_centroid_x?.get(i) - globalCentroid.x) / coordinatesScaleFactor
        const centroid_y_local = (suburbsCentroids_centroid_y?.get(i) - globalCentroid.y) / coordinatesScaleFactor
        dataSuburbsCentroid[suburb] = { centroid_x_local:centroid_x_local, centroid_y_local:centroid_y_local }
    }
    
    // Bar geometry
    const barGeometry = new THREE.BufferGeometry();
    const normalizationCheckbox = document.getElementById('normalization-checkbox') as BUI.Checkbox

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
        for (const [key,set] of Object.entries(dataForBars)) {
            const bar_base_dim1 = barsBase.lod0
            const bar_base_dim2 = barsBase.lod0
            const bar_height = normalizationCheckbox.checked ? set.param_one_normalized*normalizationHeight.lod0 : set.param_one/normalizationHeight.notNormalized
            const bar_name = set.suburb
            let bar_position
            try {
                bar_position = new THREE.Vector3(dataSuburbsCentroid[bar_name].centroid_x_local,0,dataSuburbsCentroid[bar_name].centroid_y_local)
            } catch (error) {
                continue
            }
            
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
                        value: "IfcBar",
                    },
                    _guid: { value: generateUUID() },
                    Name: { value: bar_name },
                    Suburb: { value: set[groupColumn.lod0] ? set[groupColumn.lod0] : bar_name },
                    BarHeight: { value: paramOne },
                    BarColor: { value: paramTwo },
                    [paramOne]: { value: Math.round(set.param_one*1000)/1000 },
                    [paramTwo]: { value: Math.round(set.param_two*1000)/1000 },
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
        await fragments.core.editor.applyChanges(newModel.modelId)
        await fragments.core.editor.save(newModel.modelId)
        await fragments.core.update(true);
        processing = false;
    };
    
    await regenerateFragments();

    await colorBar(components,dataForBars!,lod,name,paramTwo)

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Bars created in ${loadTime} seconds`)
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> created in <b>${loadTime}</b> seconds.`)

    //HISTORY TABLE
    panelRight.innerHTML=''
    const colorScaleDropdown = document.getElementById('color-scale-dropdown') as BUI.Dropdown
    type historyTableType = {
        UVL: number,
        Suburb: string,
        Param1: string,
        Param2: string,
        ColorScale:any,
        Normalization:boolean,
    }
    const historyTable = document.createElement("bim-table") as BUI.Table<historyTableType>
    historyTable.id = 'history-table'
    historyTable.data = [{
        data: {
            UVL: lod,
            Suburb: name,
            Param1: paramOne,
            Param2: paramTwo,
            ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
            Normalization: normalizationCheckbox.checked,
        }
    }]
    historyTable.preserveStructureOnFilter = true
    //historyTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
    historyTable.hiddenColumns = []
    panelRight?.appendChild(historyTable)
    
    return true
}