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
import { formatNumber, getArrowLineValue } from './conversion'

/**
 * Generates LOD-2 building bars for a selected LOD-1 section.
 * 
 * The function filters and computes building-level parameters from Arrow tables,
 * applies environmental coefficients if needed, normalizes values, and creates
 * 3D extruded bars with FRAGS. Colors are applied based on parameter ranges,
 * and the urban table and history table are updated accordingly.
 *
 * @param world The SimpleWorld instance for rendering.
 * @param components FRAGS components and managers.
 * @param geometryEngine Geometry engine for extrusion.
 * @param arrowData Arrow table with building data.
 * @param environmentalArrowData Arrow table with environmental coefficients.
 * @param paramOne Primary parameter for bar height.
 * @param paramOneB Normalization parameter for paramOne.
 * @param paramTwo Secondary parameter.
 * @param paramTwoB Normalization parameter for paramTwo.
 * @param paramEnv Environmental category for coefficients.
 * @param previousLoadedSuburbs Tracks already loaded suburbs to avoid duplicates.
 * @param paramOneFullNameLabel Label for paramOne in the UI.
 * @param paramTwoFullNameLabel Label for paramTwo in the UI.
 * @param urbanTable The table used to store the data.
 * @param historyTable The table used to store the history of analysis.
 * @returns Promise resolving to true if bars are created successfully, false otherwise.
 */
export async function create_LOD20 (
        world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>,
        components:OBC.Components,
        geometryEngine:FRAGS.GeometryEngine,
        arrowData:Table<any>,
        environmentalArrowData:Table<any>,
        paramOne:string|undefined,
        paramOneB:string|undefined,
        paramTwo:string|undefined,
        paramTwoB:string|undefined,
        paramEnv:string,
        previousLoadedSuburbs:string[],
        paramOneFullNameLabel:string,
        paramTwoFullNameLabel:string,
        urbanTable:BUI.Table,
        historyTable:BUI.Table<any>|null,
    ): Promise<boolean> {

    
    if (!paramOne || !paramOneB || !paramTwo || !paramTwoB) {
        addOverlay(BUI.html`Please select all parameters`, 'warning')
        return false
    }

    paramOne = paramOne.toString()
    paramOneB = paramOneB.toString()
    paramTwo = paramTwo.toString()
    paramTwoB = paramTwoB.toString()
    if (paramOne.includes('Population')||paramOne.includes('Urban')||
        paramOneB.includes('Population')||paramOneB.includes('Urban')||
        paramTwo.includes('Population')||paramTwo.includes('Urban')||
        paramTwoB.includes('Population')||paramTwoB.includes('Urban')) {
        
        addOverlay(BUI.html`<b>WARNING</b>: UVL-2 does not have any data about <b><i>Population</i></b> or <b><i>Urban Area (km²)</i></b>. Please select other parameters to continue!`,'warning')
        return false
    }

    //initialize variables
    const fragments = components.get(OBC.FragmentsManager)
    const highlighter = components.get(OBCF.Highlighter)
    const startTime = performance.now() // Start timer
    const lod: number = 2
    let dataForBars:{[key:string]:any}
    let name = ''
    let suburb = ''
    const impact = paramEnv!='weight' ? paramEnv : 'None'

    //getting the selected bar name
    const selection = highlighter.selection.select
    if (Object.entries(selection).length == 0) {
        addOverlay(BUI.html`<b>WARNING</b>: Please select any UVL-1 bar to continue.`,'warning')
        return false
    }
    
    const item = await fragments.getData(selection)
    for (const [model,it] of Object.entries(item)){ 
        if (!model.includes('LOD_1')) {
            addOverlay(BUI.html`<b>WARNING</b>: The selected bar can't be used to load UVL-2. Please select any UVL-1 bar to continue.`,'warning')
            return false
        }
        if (!(it[0]['_category'] as FRAGS.ItemAttribute).value) continue
        name = (it[0]['Name'] as FRAGS.ItemAttribute).value
        suburb = (it[0]['Suburb'] as FRAGS.ItemAttribute).value
    }
    if (previousLoadedSuburbs.includes(name)) { 
        addOverlay(BUI.html`<b>WARNING</b>: UVL-2 of ${name} already loaded.`,'warning')
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

    let coeffOne = 1,coeffOneB = 1,coeffTwo = 1,coeffTwoB = 1
    const envMaterials = environmentalArrowData.getChild('Material category')
    if (paramEnv != 'weight'){ //se i parametri sono dei materiali (non serve fare il check sulla popolazione perche' e' gia fatto in precedenza e neanche si entra in questo componente)
        if (envMaterials?.includes(paramOne)){
            coeffOne = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramOne))
            if (!coeffOne) addOverlay(BUI.html`<b>${paramOne}</b> environmental impact coefficient not found.`, 'warning')
        }
        if (envMaterials?.includes(paramOneB)){
            coeffOneB = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramOneB))
            if (!coeffOneB) addOverlay(BUI.html`<b>${paramOneB}</b> environmental impact coefficient not found.`, 'warning')
        }
        if (envMaterials?.includes(paramTwo)){
            coeffTwo = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramTwo))
            if (!coeffTwo) addOverlay(BUI.html`<b>${paramTwo}</b> environmental impact coefficient not found.`, 'warning')
        }
        if (envMaterials?.includes(paramTwoB)){
            coeffTwoB = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramTwoB))
            if (!coeffTwoB) addOverlay(BUI.html`<b>${paramTwoB}</b> environmental impact coefficient not found.`, 'warning')
        }
    }
    console.log(coeffOne,coeffOneB,coeffTwo,coeffTwoB)

    //filter arrow data
    type buildingsDataType = {
        suburb? : string,
        section? : string,
        identfr? : string,
        centroid_x? : number,
        centroid_y? : number,
        param_one? : number,
        param_one_normalized? : number,
        param_two? : number,
        paramOne? : number,
        paramOneB? : number,
        paramTwo? : number,
        paramTwoB? : number,
    }
    const dataOfBuildings: {[key:string] : buildingsDataType} = {}
    const col = arrowData.getChild(groupColumn.lod1);
    if (!col) throw new Error(`${groupColumn.lod1} column not found`);
    for (let i = 0; i < arrowData.numRows; i++) { //effettua la moltiplicazione per ogni riga
        if (Number(col.get(i)).toString() === name) {
            const row = arrowData.get(i)
            if (!row) continue
            const buildingIdentfr = Number(row.identfr).toString()
            if (!dataOfBuildings[buildingIdentfr]) dataOfBuildings[buildingIdentfr] = {}
            dataOfBuildings[buildingIdentfr].suburb = row[groupColumn.lod0]
            dataOfBuildings[buildingIdentfr].section = Number(row[groupColumn.lod1]).toString()
            dataOfBuildings[buildingIdentfr].identfr = buildingIdentfr
            dataOfBuildings[buildingIdentfr].centroid_x = parseFloat(row.centroid_x)
            dataOfBuildings[buildingIdentfr].centroid_y = parseFloat(row.centroid_y)
            dataOfBuildings[buildingIdentfr].paramOne = Number(row[paramOne])
            dataOfBuildings[buildingIdentfr].paramOneB = Number(row[paramOneB])
            dataOfBuildings[buildingIdentfr].paramTwo = Number(row[paramTwo])
            dataOfBuildings[buildingIdentfr].paramTwoB = Number(row[paramTwoB])
            dataOfBuildings[buildingIdentfr].param_one = ((paramOne=='1' ? 1 : Number(row[paramOne])) * coeffOne) / ((paramOneB=='1' ? 1 : Number(row[paramOneB])) * coeffOneB)
            dataOfBuildings[buildingIdentfr].param_two = ((paramTwo=='1' ? 1 : Number(row[paramTwo])) * coeffTwo) / ((paramTwoB=='1' ? 1 : Number(row[paramTwoB])) * coeffTwoB)
        }
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
    dataForBars = normalizeParamOne(dataOfBuildings)
    console.log(dataForBars!)
    
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
        for (const [key,set] of Object.entries(dataForBars)) {
            //const bar_base_dim2 = barsBase.lod2
            const bar_base_dim1 = barsBase.lod2
            const centr_x = set.centroid_x - globalCentroid.x / coordinatesScaleFactor
            const centr_y = set.centroid_y - globalCentroid.y / coordinatesScaleFactor
            const bar_height = normalizationCheckbox ? set.param_one_normalized*normalizationHeight.lod2 : set.param_one
            const bar_position = new THREE.Vector3(centr_x,0,-centr_y)
            const bar_name = Number(set.identfr).toString()
            
            buildings.push(
                {
                    data: {
                        Name: bar_name,
                        Param1: formatNumber(set.param_one),
                        Param2: formatNumber(set.param_two),
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
                    Suburb: { value: set.suburb ? set.suburb : 'None' },
                    Section: { value: set.section ? set.section : 'None' },
                    Height: { value: bar_height },
                    Aluminium: { value: getArrowLineValue(arrowData, 'Aluminm', 'identfr', set.identfr) },
                    Concrete: { value: getArrowLineValue(arrowData, 'Concret', 'identfr', set.identfr) },
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

    const [map_color_ids,map_id_name,modelName]: any[] = await colorBar(components,dataForBars!,lod,name)
    
    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Bars created in ${loadTime} seconds`)
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> suburb created in <b>${loadTime}</b> seconds.`)

    for (const row of buildings){
        const block = row.data.Name
        const localId = Object.keys(map_id_name).filter(k => map_id_name[k as keyof typeof map_id_name] === block)
        row.data.localId = Number(localId[0])
        row.data.modelId = modelName
        switch (true) {
            case (map_color_ids['color_0_02'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('LOD_2_color_0_02')?.color.getStyle()!
                break;
            case (map_color_ids['color_02_04'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('LOD_2_color_02_04')?.color.getStyle()!
                break;
            case (map_color_ids['color_04_06'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('LOD_2_color_04_06')?.color.getStyle()!
                break;
            case (map_color_ids['color_06_08'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('LOD_2_color_06_08')?.color.getStyle()!
                break;
            case (map_color_ids['color_08_1'] as string[])?.includes(localId[0]):
                row.data.Color = highlighter.styles.get('LOD_2_color_08_1')?.color.getStyle()!
                break;
        }
    }

    for (const [,data] of Object.entries(urbanTable.data)){
        if (data.data.Name != suburb) continue
        if (!data.children) continue
        for (const childrenData of data.children){
            if (childrenData.data.Name != name) continue
            childrenData.children = buildings
        }
    }
    urbanTable.requestUpdate()

    const colorScaleDropdown = document.getElementById('color-scale-dropdown') as BUI.Dropdown
    historyTable?.data.push({
        data: {
            UVL: lod,
            Name: name,
            Param1: paramOneFullNameLabel,
            Param2: paramTwoFullNameLabel,
            Impact: impact,
            ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
            Normalization: normalizationCheckbox.checked,
        }
    })
    historyTable?.requestUpdate()

    return true
}