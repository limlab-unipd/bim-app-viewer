import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { colorBar } from './colorBar'
import type { Table } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import { allMaterials, barsBase, coordinatesScaleFactor, globalCentroid, groupColumn, normalizationHeight } from './parametersForGrouping'
import { formatNumber, getArrowLineValue, normalizeParamOne, valueToParamLabel } from './conversion'
import { sa1Boundaries } from './suburbsBoundaries'
import { readArrow } from './readArrow'

/**
 * Generates LOD-1 suburb bars from a selected LOD-0 bar.
 * 
 * The function filters and aggregates data from Arrow and population tables,
 * applies environmental coefficients if needed, normalizes values, and creates
 * 3D extruded bars with FRAGS. Colors are applied based on parameter ranges,
 * and the urban table and history table are updated accordingly.
 *
 * @param world The SimpleWorld instance for rendering.
 * @param components FRAGS components and managers.
 * @param geometryEngine Geometry engine for extrusion.
 * @param arrowData Arrow table with suburb data.
 * @param populationArrowData Arrow table with population data.
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
export async function create_LOD1 (
        world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>,
        components:OBC.Components,
        geometryEngine:FRAGS.GeometryEngine,
        arrowData:Table<any>,
        populationArrowData:Table<any>,
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
    ): Promise<boolean> {

    
    if (!paramOne || !paramOneB || !paramTwo || !paramTwoB) {
        addOverlay(BUI.html`Please select all parameters`, 'warning')
        return false
    }

    //initialize variables
    const fragments = components.get(OBC.FragmentsManager)
    const highlighter = components.get(OBCF.Highlighter)
    const startTime = performance.now() // Start timer
    const lod: number = 1
    //let name = ''
    let impactOne:string='None', impactTwo:string='None'
    let nameList = []

    //getting the selected bar name
    const selection = highlighter.selection.select
    if (Object.entries(selection).length == 0) {
        addOverlay(BUI.html`<b>WARNING: Please select any UVL-0 bar to continue.</b>`,'warning')
        return false
    }
    const item = await fragments.getData(selection)
    for (const [model,it] of Object.entries(item)){
        if (fragments.list.get(model)?.isDeltaModel) continue
        if (!model.includes('LOD_0')) {
            addOverlay(BUI.html`<b>WARNING: ${model} bar can't be used to load UVL-1. It will be ignored.</b>`,'warning')
            continue
        }
        for (const i of it) {
            nameList.push((i['Name'] as FRAGS.ItemAttribute).value)
        }
    }
    
    const arrow = await readArrow('boundaries_sa1')

    const results = []
    for (const name of nameList) {
        //init variables
        let dataForBars:{[key:string]:any}
        const dataOfSuburb: {[key:string]:any} = {} //all buildings of single suburb
        const dataPopOfSuburb: {[key:string]:any} = {} //all buildings of single suburb
        interface sectionObject {
            suburb?: string;
            section?: string;
            param_one?: number;
            param_two?: number;
            centroid_x_local?:number;
            centroid_y_local?:number;
            [key:string]:unknown;
        }
        const dataSuburbBySection: {[key:string]:sectionObject} = {} //all buildings of single suburb

        if (previousLoadedSuburbs.includes(name)) {
            addOverlay(BUI.html`<b>WARNING: UVL-1 of ${name} already loaded.</b>`,'warning')
            continue
        } else { 
            previousLoadedSuburbs.push(name)
        }

        let sa1Centroids: {[key:string]:{centr_x:number, centr_y:number}} | undefined = {}
        if (arrow) {
            sa1Centroids = await sa1Boundaries(world, components, arrow, name)
        } else {
            console.log('SA1 boundaries not loaded.')
        }
        //console.log('sa1Centroids:',sa1Centroids)

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
        const col = arrowData.getChild(groupColumn.lod0)
        if (!col) throw new Error(`${groupColumn.lod0} column not found`)
        for (let i = 0; i < arrowData.numRows; i++) {
            if (col.get(i) === name) {
                const row = arrowData.get(i)
                dataOfSuburb[Number(row!.Id).toString()] = row
            }
        }
        const sum: { [key: string]: { sumOne:number; sumOneB:number; sumTwo:number; sumTwoB:number } } = {}
        for (const [,row] of Object.entries(dataOfSuburb)) {
            const section = row[groupColumn.lod1]
            if (!sum[section]) {
                sum[section] = { sumOne:0, sumOneB:0, sumTwo:0, sumTwoB:0 }
            }
            //row[paramOne] ? sum[section].sumOne += Number(row[paramOne]) : null
            row[paramOneB] ? sum[section].sumOneB += Number(row[paramOneB]) : null
            row[paramTwo] ? sum[section].sumTwo += Number(row[paramTwo]) : null
            row[paramTwoB] ? sum[section].sumTwoB += Number(row[paramTwoB]) : null
    
            dataSuburbBySection[section] ? '' : dataSuburbBySection[section] = {}
            dataSuburbBySection[section].suburb = name
            dataSuburbBySection[section].section = section
        }
        for (const [section,centroid] of Object.entries(sa1Centroids!)){
            if (!dataSuburbBySection[section]) continue //caso in cui non ci siano buildings in questa section
            dataSuburbBySection[section].centroid_x_local = centroid.centr_x
            dataSuburbBySection[section].centroid_y_local = centroid.centr_y
        }
        const colPop = populationArrowData.getChild(groupColumn.lod0_population)
        if (!colPop) throw new Error(`${groupColumn.lod0_population} column not found`)
        for (let i = 0; i < populationArrowData.numRows; i++) {
            if (colPop.get(i) === name) {
                const row = populationArrowData.get(i)
                dataPopOfSuburb[Number(row!.MB_CODE16).toString()] = row
            }
        }
        const sumPop: { [key: string]: { sumPerson: number; sumAREASQKM: number; one: number } } = {}
        for (const [,row] of Object.entries(dataPopOfSuburb)) {
            const section = row[groupColumn.lod1_population]
            if (!sumPop[section]) {
                sumPop[section] = { sumPerson: 0, sumAREASQKM: 0, one: 1 }
            }
            sumPop[section].sumPerson += Number(row.Person)
            sumPop[section].sumAREASQKM += Number(row.AREA_SQKM)
        }
    
        let sections = Object.keys(sum)
        if (Object.keys(sum).length > Object.keys(sumPop).length){
            sections = Object.keys(sumPop)
        }
    
        const dataOfSuburbSectionKey:{[key:string]:any}={}
        for (const [,row] of Object.entries(dataOfSuburb)) {
            dataOfSuburbSectionKey[row[groupColumn.lod1]] ? dataOfSuburbSectionKey[row[groupColumn.lod1]].push(row) : dataOfSuburbSectionKey[row[groupColumn.lod1]]=[]
        }

        const envMaterials = environmentalArrowData.getChild('Material category')
        const final: {[key:string]: { 'One':any; 'OneB':any; 'Two':any; 'TwoB':any }} = {}
        for (const section of sections) {
            final[section] ? '' : final[section]={'One':'', 'OneB':'', 'Two':'', 'TwoB':''}
            if (paramOne=='1'){
                final[section].One = sumPop[section].one
            } else if (paramOne.includes('Population')) {
                final[section].One = sumPop[section].sumPerson
            } else if (paramOne.includes('Urban')) {
                final[section].One = sumPop[section].sumAREASQKM
            } else {
                let listMaterials = [paramOne]
                if (paramOne=='All materials') {
                    listMaterials = allMaterials
                }
                for (const material of listMaterials) {
                    let coeff = 1
                    if (paramEnvOne!='weight' && envMaterials?.includes(material)){
                        coeff = Number(getArrowLineValue(environmentalArrowData,paramEnvOne,'Material category',material))
                        if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                        impactOne = paramEnvOne
                    }
                    for (const row of dataOfSuburbSectionKey[section]){
                        const value = Number(row[material]) * Number(coeff)
                        sum[section].sumOne ? sum[section].sumOne+=value : sum[section].sumOne=value
                    }
                }
                final[section].One = sum[section].sumOne
            }
            if (paramOneB=='1'){
                final[section].OneB = sumPop[section].one
            } else if (paramOneB.includes('Population')) {
                final[section].OneB = sumPop[section].sumPerson
            } else if (paramOneB.includes('Urban')) {
                final[section].OneB = sumPop[section].sumAREASQKM
            } else {
                let listMaterials = [paramOneB]
                if (paramOneB=='All materials') {
                    listMaterials = allMaterials
                }
                for (const material of listMaterials) {
                    let coeff = 1
                    if (paramEnvOne!='weight' && envMaterials?.includes(material)){
                        coeff = Number(getArrowLineValue(environmentalArrowData,paramEnvOne,'Material category',material))
                        if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                        impactOne = paramEnvOne
                    }
                    for (const row of dataOfSuburbSectionKey[section]){
                        const value = Number(row[material]) * Number(coeff)
                        sum[section].sumOneB ? sum[section].sumOneB+=value : sum[section].sumOneB=value
                    }
                }
                final[section].OneB = sum[section].sumOneB
            }
            if (paramTwo=='1'){
                final[section].Two = sumPop[section].one
            } else if (paramTwo.includes('Population')) {
                final[section].Two = sumPop[section].sumPerson
            } else if (paramTwo.includes('Urban')) {
                final[section].Two = sumPop[section].sumAREASQKM
            } else {
                let listMaterials = [paramTwo]
                if (paramTwo=='All materials') {
                    listMaterials = allMaterials
                }
                for (const material of listMaterials) {
                    let coeff = 1
                    if (paramEnvTwo!='weight' && envMaterials?.includes(material)){
                        coeff = Number(getArrowLineValue(environmentalArrowData,paramEnvTwo,'Material category',material))
                        if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                        impactTwo = paramEnvTwo
                    }
                    for (const row of dataOfSuburbSectionKey[section]){
                        const value = Number(row[material]) * Number(coeff)
                        sum[section].sumTwo ? sum[section].sumTwo+=value : sum[section].sumTwo=value
                    }
                }
                final[section].Two = sum[section].sumTwo
            }
            if (paramTwoB=='1'){
                final[section].TwoB = sumPop[section].one
            } else if (paramTwoB.includes('Population')) {
                final[section].TwoB = sumPop[section].sumPerson
            } else if (paramTwoB.includes('Urban')) {
                final[section].TwoB = sumPop[section].sumAREASQKM
            } else {
                let listMaterials = [paramTwoB]
                if (paramTwoB=='All materials') {
                    listMaterials = allMaterials
                }
                for (const material of listMaterials) {
                    let coeff = 1
                    if (paramEnvTwo!='weight' && envMaterials?.includes(material)){
                        coeff = Number(getArrowLineValue(environmentalArrowData,paramEnvTwo,'Material category',material))
                        if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                        impactTwo = paramEnvTwo
                    }
                    for (const row of dataOfSuburbSectionKey[section]){
                        const value = Number(row[material]) * Number(coeff)
                        sum[section].sumTwoB ? sum[section].sumTwoB+=value : sum[section].sumTwoB=value
                    }
                }
                final[section].TwoB = sum[section].sumTwoB
            }
        }
    
        const convertedParamOne = `P1_${valueToParamLabel(paramOne)!}`
        const convertedParamOneB = `P1_${valueToParamLabel(paramOneB)!}`
        const convertedParamTwo = `P2_${valueToParamLabel(paramTwo)!}`
        const convertedParamTwoB = `P2_${valueToParamLabel(paramTwoB)!}`
    
        for (const section of Object.keys(final)){
            dataSuburbBySection[section].param_one = final[section].One / final[section].OneB
            dataSuburbBySection[section].param_two = final[section].Two / final[section].TwoB
            dataSuburbBySection[section][convertedParamOne] = final[section].One
            dataSuburbBySection[section][convertedParamOneB] = final[section].OneB
            dataSuburbBySection[section][convertedParamTwo] = final[section].Two
            dataSuburbBySection[section][convertedParamTwoB] = final[section].TwoB
        }
    
        if (filterByName){
            const itemsToRemove = filterByName.split(',')
            for (const s of itemsToRemove){
                delete dataSuburbBySection[s]
            }
        }
        //add the column with the normalization always, then it is choosed below the normalized or the not normalized one
        dataForBars = normalizeParamOne(dataSuburbBySection)
        //console.log(dataForBars!)
        
        // Bar geometry
        const barGeometry = new THREE.BufferGeometry();
        const normalizationCheckbox = document.getElementById('normalization-checkbox') as BUI.Checkbox
    
        // building generation logic
        let processing = false;
        const blocks: any[] = []
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
                const bar_base_dim2 = barsBase.lod1
                const bar_base_dim1 = barsBase.lod1
                const bar_height = normalizationCheckbox.checked ? set.param_one_normalized*normalizationHeight.lod1 : Number(set.param_one)
                //const centr_x = (Math.max(...set.centroid_x_local)+Math.min(...set.centroid_x_local))/2 //centro degli edifici
                //const centr_y = (Math.max(...set.centroid_y_local)+Math.min(...set.centroid_y_local))/2
                const bar_name = Number(set.section).toString()
                const centr_x = set.centroid_x_local //centro del contorno
                const centr_y = set.centroid_y_local
                const bar_position = new THREE.Vector3(centr_x/coordinatesScaleFactor,0,-centr_y/coordinatesScaleFactor)
    
                blocks.push(
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
                        Suburb: { value: bar_name },
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
        addOverlay(BUI.html`Bars for <b><i>${name}</i></b> suburb created in <b>${loadTime}</b> seconds.`)
    
        for (const row of blocks){
            const section = row.data.Name
            const localId = Object.keys(map_id_name).filter(k => map_id_name[k as keyof typeof map_id_name] === section)
            row.data.localId = Number(localId[0])
            row.data.modelId = modelName
            switch (true) {
                case (map_color_ids['color_0_02'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get('LOD_1_color_0_02')?.color.getStyle()!
                    break;
                case (map_color_ids['color_02_04'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get('LOD_1_color_02_04')?.color.getStyle()!
                    break;
                case (map_color_ids['color_04_06'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get('LOD_1_color_04_06')?.color.getStyle()!
                    break;
                case (map_color_ids['color_06_08'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get('LOD_1_color_06_08')?.color.getStyle()!
                    break;
                case (map_color_ids['color_08_1'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get('LOD_1_color_08_1')?.color.getStyle()!
                    break;
            }
        }
    
        for (const [,data] of Object.entries(urbanTable.data)){
            if (data.data.Name != name) continue
            data.children = blocks
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