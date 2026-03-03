import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { colorBar } from './colorBar'
import type { Table } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import { allMaterials, at_2015_conversion, barsBase, barsIfcCategory, coordinatesScaleFactor, globalCentroid, groupColumn, normalizationHeight } from './parametersForGrouping'
import { formatNumber, getArrowLineValue, normalizeParamOne, valueToParamLabel } from './conversion'

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
 * @param paramEnvOne Environmental category used to retrieve impact coefficients for param one.
 * @param paramEnvTwo Environmental category used to retrieve impact coefficients for param two.
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
        paramEnvOne:string,
        paramEnvTwo:string,
        previousLoadedSuburbs:string[],
        paramOneFullNameLabel:string,
        paramTwoFullNameLabel:string,
        urbanTable:BUI.Table,
        historyTable:BUI.Table<any>|null,
        filterByName:string,
        nonNormalizedHeight:number,
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
    const nameList:string[]=[], suburbList:string[]=[]

    //getting the selected bar name
    const selection = highlighter.selection.select
    if (Object.entries(selection).length == 0) {
        addOverlay(BUI.html`<b>WARNING: Please select any UVL-1 bar to continue.</b>`,'warning')
        return false
    }
    const item = await fragments.getData(selection)
    for (const [model,it] of Object.entries(item)){
        if (fragments.list.get(model)?.isDeltaModel) continue
        if (!model.includes('LOD_1')) {
            addOverlay(BUI.html`<b>WARNING: ${model} bar can't be used to load UVL-1. It will be ignored.</b>`,'warning')
            continue
        }
        for (const i of it) {
            nameList.push((i['Name'] as FRAGS.ItemAttribute).value)
            suburbList.push((i['Suburb'] as FRAGS.ItemAttribute).value)
        }
    }
    
    const results = []
    for (let i = 0; i < nameList.length; i++) {
        const name = nameList[i]
        const suburb = suburbList[i]
        
        if (previousLoadedSuburbs.includes(`${name}_LOD_20`)) { 
            addOverlay(BUI.html`<b>WARNING</b>: UVL-2.0 of ${name} already loaded.`,'warning')
            continue
        } else {
            previousLoadedSuburbs.push(`${name}_LOD_20`) 
        }
        
        //init variables
        let dataForBars:{[key:string]:any}
        const impactOne = paramEnvOne!='weight' ? paramEnvOne : 'None'
        const impactTwo = paramEnvTwo!='weight' ? paramEnvTwo : 'None'

        //create new base model for geometries
        const bytes = FRAGS.EditUtils.newModel({ raw: true });
        const newModel = await fragments.core.load(bytes, {
            modelId: `LOD_${lod}_${name}`,
            camera: world.camera.three,
            raw: true,
        });
        world.scene.three.add(newModel.object);
        await fragments.core.update(true);
    
        let coeffOne = 1, coeffOneB = 1, coeffTwo = 1, coeffTwoB = 1
        const envMaterials = environmentalArrowData.getChild('Material category')
        if (paramEnvOne != 'weight'){ //se i parametri sono dei materiali (non serve fare il check sulla popolazione perche' e' gia fatto in precedenza e neanche si entra in questo componente)
            if (envMaterials?.includes(paramOne)){ //questo check serve per verificare che il parametro sia un materiale e non un dimensionale (gross floor area, net floor area, ecc..)
                coeffOne = Number(getArrowLineValue(environmentalArrowData,paramEnvOne,'Material category',paramOne))
                if (!coeffOne) addOverlay(BUI.html`<b>${paramOne}</b> environmental impact coefficient not found.`, 'warning')
            }
            if (envMaterials?.includes(paramOneB)){
                coeffOneB = Number(getArrowLineValue(environmentalArrowData,paramEnvOne,'Material category',paramOneB))
                if (!coeffOneB) addOverlay(BUI.html`<b>${paramOneB}</b> environmental impact coefficient not found.`, 'warning')
            }
        }
        if (paramEnvTwo != 'weight'){ //se i parametri sono dei materiali (non serve fare il check sulla popolazione perche' e' gia fatto in precedenza e neanche si entra in questo componente)
            if (envMaterials?.includes(paramTwo)){
                coeffTwo = Number(getArrowLineValue(environmentalArrowData,paramEnvTwo,'Material category',paramTwo))
                if (!coeffTwo) addOverlay(BUI.html`<b>${paramTwo}</b> environmental impact coefficient not found.`, 'warning')
            }
            if (envMaterials?.includes(paramTwoB)){
                coeffTwoB = Number(getArrowLineValue(environmentalArrowData,paramEnvTwo,'Material category',paramTwoB))
                if (!coeffTwoB) addOverlay(BUI.html`<b>${paramTwoB}</b> environmental impact coefficient not found.`, 'warning')
            }
        }
    
        //filter arrow data
        type buildingsDataType = {
            suburb? : string,
            section? : string,
            Id? : string,
            centroid_x? : number,
            centroid_y? : number,
            param_one? : number,
            param_one_normalized? : number,
            param_two? : number,
            [key:string]:unknown,
        }
        const dataOfBuildings: {[key:string] : buildingsDataType} = {}
        const col = arrowData.getChild(groupColumn.lod1);
        if (!col) throw new Error(`${groupColumn.lod1} column not found`);

        const convertedParamOne = `P1_${valueToParamLabel(paramOne)!}`
        const convertedParamOneB = `P1_${valueToParamLabel(paramOneB)!}`
        const convertedParamTwo = `P2_${valueToParamLabel(paramTwo)!}`
        const convertedParamTwoB = `P2_${valueToParamLabel(paramTwoB)!}`
        
        for (let i = 0; i < arrowData.numRows; i++) { // cicla su ogni riga, cioe' ogni edificio
            if (Number(col.get(i)).toString() === name) {
                const row = arrowData.get(i)
                if (!row) continue
                const buildingId = Number(row.Id).toString()
                if (!dataOfBuildings[buildingId]) dataOfBuildings[buildingId] = {}
                dataOfBuildings[buildingId].suburb = row[groupColumn.lod0]
                dataOfBuildings[buildingId].section = Number(row[groupColumn.lod1]).toString()
                dataOfBuildings[buildingId].Id = buildingId
                dataOfBuildings[buildingId].centroid_x = parseFloat(row.centroid_x)
                dataOfBuildings[buildingId].centroid_y = parseFloat(row.centroid_y)
                let allMaterialsImpactOne = 0, allMaterialsImpactTwo = 0
                if ([paramOne,paramOneB].includes('All materials')){ //se uno qualsiasi dei parametri e' all materials allora calcola:
                    // qui viene solo effettuata la somma, poi l'assegnazione al parametro corretto viene fatta sotto
                    for (const material of allMaterials) {
                        if (paramEnvOne!='weight'){ // l'impatto totale
                            allMaterialsImpactOne += Number(row[material]) * Number(getArrowLineValue(environmentalArrowData,paramEnvOne,'Material category',material))
                        } else { // oppure il peso totale
                            allMaterialsImpactOne += Number(row[material])
                        }
                    }
                }
                if ([paramTwo,paramTwoB].includes('All materials')){ //se uno qualsiasi dei parametri e' all materials allora calcola:
                    // qui viene solo effettuata la somma, poi l'assegnazione al parametro corretto viene fatta sotto
                    for (const material of allMaterials) {
                        if (paramEnvTwo!='weight'){ // l'impatto totale
                            allMaterialsImpactTwo += Number(row[material]) * Number(getArrowLineValue(environmentalArrowData,paramEnvTwo,'Material category',material))
                        } else { // oppure il peso totale
                            allMaterialsImpactTwo += Number(row[material])
                        }
                    }
                }
                // casi: parametro = All materials, oppure 1, oppure uno degli altri valori (materiale o dimensionale)
                const final_one = paramOne=='All materials' ? allMaterialsImpactOne : paramOne=='1' ? 1 : Number(row[paramOne] * coeffOne) //il coefficiente singolo gia' controlla se il paramEnv e' il weight o un impact e anche se il parametro e' un materiale o un dimensionale
                const final_oneB = paramOneB=='All materials' ? allMaterialsImpactOne : paramOneB=='1' ? 1 : Number(row[paramOneB] * coeffOneB)
                const final_two = paramTwo=='All materials' ? allMaterialsImpactTwo : paramTwo=='1' ? 1 : Number(row[paramTwo] * coeffTwo)
                const final_twoB = paramTwoB=='All materials' ? allMaterialsImpactTwo : paramTwoB=='1' ? 1 : Number(row[paramTwoB] * coeffTwoB)

                dataOfBuildings[buildingId].param_one = final_one / final_oneB
                dataOfBuildings[buildingId].param_two = final_two / final_twoB
                dataOfBuildings[buildingId][convertedParamOne] = final_one
                dataOfBuildings[buildingId][convertedParamOneB] = final_oneB
                dataOfBuildings[buildingId][convertedParamTwo] = final_two
                dataOfBuildings[buildingId][convertedParamTwoB] = final_twoB
            }
        }

        if (filterByName){
            const itemsToRemove = filterByName.split(',')
            for (const s of itemsToRemove){
                delete dataOfBuildings[s]
            }
        }

        dataForBars = normalizeParamOne(dataOfBuildings)
        //console.log(dataForBars!)
        
        // Bar geometry
        const barGeometry = new THREE.BufferGeometry();
        const normalizationCheckbox = document.getElementById('normalization-checkbox') as BUI.Checkbox
    
        // building generation logic
        let processing = false;
        const buildings: any[] = []
        const regenerateFragments = async () => {
            const elementsData: FRAGS.NewElementData[] = [];
            const pSets: {[key:string]:FRAGS.RawItemData} = {}
            const pSetsData: {[key:string]:FRAGS.RawItemData} = {}
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
                const bar_height = normalizationCheckbox.checked ? set.param_one_normalized*normalizationHeight.lod2 : set.param_one/nonNormalizedHeight
                const bar_position = new THREE.Vector3(centr_x,0,-centr_y)
                const bar_name = Number(set.Id).toString()
                
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
                        _category: { value: barsIfcCategory },
                        _guid: { value: generateUUID() },
                        Name: { value: bar_name },
                        Suburb: { value: set.suburb ? set.suburb : 'None' },
                        Section: { value: set.section ? set.section : 'None' },
                        Height: { value: formatNumber(bar_height) },
                        Function: { value: at_2015_conversion[getArrowLineValue(arrowData, 'at_2015', 'Id', Number(bar_name)) as string].explicit },
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
                
                pSets[bar_name] = { //object containing one pset per each suburb
                    category: "IFCPROPERTYSET",
                    guid: generateUUID(),
                    data: {
                        Name: { value: "EnvironmentalAnalysisData" },
                        BarHeight: { value: paramOneFullNameLabel },
                        BarColor: { value: paramTwoFullNameLabel },
                        Suburb: { value: bar_name },
                        [paramOneFullNameLabel]: { value: formatNumber(set.param_one) },
                        [paramTwoFullNameLabel]: { value: formatNumber(set.param_two) },
                        [convertedParamOne]: { value: formatNumber(set[convertedParamOne]) },
                        [convertedParamOneB]: { value: formatNumber(set[convertedParamOneB]) },
                        [convertedParamTwo]: { value: formatNumber(set[convertedParamTwo]) },
                        [convertedParamTwoB]: { value: formatNumber(set[convertedParamTwoB]) },
                    }
                }
                pSetsData[bar_name] = {
                    category: "IFCPROPERTYSET",
                    guid: generateUUID(),
                    data: {
                        Name: { value: "EnvironmentalData" },
                        Description: { value: "Original data" },
                        Suburb: { value: bar_name },
                        Building_height: { value: formatNumber(Number(getArrowLineValue(arrowData, 'A_H_AGL', 'Id', Number(bar_name)))) },
                        Building_footprintArea: { value: formatNumber(Number(getArrowLineValue(arrowData, 'grnd_fl', 'Id', Number(bar_name)))) },
                        Building_grossFloorArea: { value: formatNumber(Number(getArrowLineValue(arrowData, 'grs_fl', 'Id', Number(bar_name)))) },
                        Building_NetFloorArea: { value: formatNumber(Number(getArrowLineValue(arrowData, 'usbl_fl', 'Id', Number(bar_name)))) },
                        Building_weight: { value: formatNumber(Number(getArrowLineValue(arrowData, 'T_stock', 'Id', Number(bar_name)))) },
                        Aluminium: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Aluminm', 'Id', Number(bar_name)))) },
                        Bitumen: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Bitumen', 'Id', Number(bar_name)))) },
                        Carpet: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Carpet', 'Id', Number(bar_name)))) },
                        Ceramics: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Ceramcs', 'Id', Number(bar_name)))) },
                        Concrete: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Concret', 'Id', Number(bar_name)))) },
                        Copper: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Copper', 'Id', Number(bar_name)))) },
                        Glass: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Glass', 'Id', Number(bar_name)))) },
                        Insulation: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Insultn', 'Id', Number(bar_name)))) },
                        Paint: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Paint', 'Id', Number(bar_name)))) },
                        Plasterboard: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Plstrbr', 'Id', Number(bar_name)))) },
                        Plastics: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Plastcs', 'Id', Number(bar_name)))) },
                        SandAndStone: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Snd_nd_', 'Id', Number(bar_name)))) },
                        Steel: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Steel', 'Id', Number(bar_name)))) },
                        Timber: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Timber', 'Id', Number(bar_name)))) },
                    }
                }
            }
            
            const createdBars = await fragments.core.editor.createElements(newModel.modelId, elementsData);

            if (!createdBars) return [false,null]
            for (const bar of createdBars){
                const barData = await bar.getData()
                const suburb = (barData.Name as FRAGS.ItemAttribute).value
                const pSet = pSets[suburb]
                const pSetData = pSetsData[suburb]
                //--------------------------------- A T T E N Z I O N E ---------------------------------
                const pSetId = Number(fragments.core.editor.createItem(newModel.modelId,pSet)) + 1 //ATTENZIONE: non so perche' sia necessario questo + 1 --> serve per aumentare di uno il localId del pset
                const pSetDataId = Number(fragments.core.editor.createItem(newModel.modelId,pSetData)) + 1 //ATTENZIONE: non so perche' sia necessario questo + 1 --> serve per aumentare di uno il localId del pset
                await fragments.core.editor.relate(newModel.modelId, bar.localId, 'IsDefinedBy', [pSetId,pSetDataId])
            }

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
        addOverlay(BUI.html`Bars for <b><i>${name}</i></b> created in <b>${loadTime}</b> seconds.`)
    
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
                Impact1: impactOne,
                Param2: paramTwoFullNameLabel,
                Impact2: impactTwo,
                ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
                NormHeight: normalizationCheckbox.checked,
            }
        })
        historyTable?.requestUpdate()
        results.push(true)
    }
    return results.includes(true) ? true : false
}