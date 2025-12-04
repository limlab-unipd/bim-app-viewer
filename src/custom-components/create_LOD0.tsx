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
import { allMaterials, barsBase, coordinatesScaleFactor, globalCentroid, groupColumn, normalizationHeight } from './parametersForGrouping'
import { formatNumber, getArrowLineValue, normalizeParamOne } from './conversion'

/**
 * Generates a complete Level of Detail 0 (LOD0) model composed of extruded bar
 * geometries representing aggregated environmental and demographic indicators
 * at the suburb level.  
 *
 * The function loads Arrow datasets, aggregates parameters (materials,
 * population, area), computes ratios between numerator and denominator
 * parameters, normalizes the primary parameter, retrieves centroid coordinates,
 * and generates a new fragment-based model in the scene. Each bar is extruded,
 * positioned according to its suburb centroid, assigned properties (including
 * IFC-style property sets), and finally color-mapped.  
 *
 * A history entry is appended to the UI summarizing the performed analysis.
 *
 * @param world Rendering world instance containing camera and scene.
 * @param components OBC components registry giving access to fragments and utils.
 * @param geometryEngine Engine used to extrude geometries for bar generation.
 * @param arrowData Arrow table containing material-based data per suburb.
 * @param populationArrowData Arrow table containing population and area data.
 * @param environmentalArrowData Arrow table containing environmental coefficients.
 * @param paramOne Main numerator parameter used to compute bar height.
 * @param paramOneB Denominator parameter used for normalizing `paramOne`.
 * @param paramTwo Secondary numerator parameter used for color mapping.
 * @param paramTwoB Denominator parameter used for normalizing `paramTwo`.
 * @param paramEnv Environmental category used to retrieve impact coefficients.
 * @param panelRight UI panel where the analysis history table will be appended.
 * @param paramOneFullNameLabel Full descriptive label of the first parameter.
 * @param paramTwoFullNameLabel Full descriptive label of the second parameter.
 * @returns A promise resolving to `true` if the model is created successfully, otherwise `false`.
 */
export async function create_LOD0 (
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
        paramEnv:string,
        panelRight:BUI.Panel,
        paramOneFullNameLabel:string,
        paramTwoFullNameLabel:string,
    ): Promise<[boolean,BUI.Table<any>|null]> {

    if (!paramOne || !paramOneB || !paramTwo || !paramTwoB) {
        addOverlay(BUI.html`Please select all parameters`, 'warning')
        return [false,null]
    }
    
    paramOne = paramOne.toString()
    paramOneB = paramOneB.toString()
    paramTwo = paramTwo.toString()
    paramTwoB = paramTwoB.toString()

    if (!arrowData) {
        addOverlay(BUI.html`Please load any samples before.`,'warning')
        return [false,null]
    }
    
    //initialize variables
    const fragments = components.get(OBC.FragmentsManager)

    for (const [modelId,model] of fragments.list){
        if (model.isDeltaModel) continue
        if (modelId.includes('LOD_0')) {
            addOverlay(BUI.html`UVL-0 model already exists. Please reload the browser page to do a new analysis.`,'warning')
            return [false,null]
        }
    }

    const startTime = performance.now() // Start timer
    const lod: number = 0
    const name: string = 'CANBERRA'
    let dataForBars:{[key:string]:any}
    interface cityObject {
        suburb: string;
        param_one?: number;
        param_two?: number;
        centroid_x_local?:number;
        centroid_y_local?:number;
    }
    const dataCityBySuburb: {[key:string]:cityObject} = {}
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

    //suburbs from materials arrow
    const colSuburbs = arrowData.getChild(groupColumn.lod0);
    if (!colSuburbs) throw new Error(`${groupColumn.lod0} column not found`)
    const suburbsUnique = new Set<string>(colSuburbs.toArray())

    //population arrow data
    let popArrow_AREA_SQKM, popArrow_Person, popArrow_Suburb: any
    let sumPerson:{[key:string]:number}={}, sumAreaSQKM:{[key:string]:number}={}
    let sumOne:{[key:string]:number}={}, sumOneB:{[key:string]:number}={}, sumTwo:{[key:string]:number}={}, sumTwoB:{[key:string]:number}={}
    let impact:string='None'
    const paramOnePopCheck = paramOne.includes('Population')
    const paramOneBPopCheck = paramOneB.includes('Population')
    const paramTwoPopCheck = paramTwo.includes('Population')
    const paramTwoBPopCheck = paramTwoB.includes('Population')
    const paramOneUrbanCheck = paramOne.includes('Urban')
    const paramOneBUrbanCheck = paramOneB.includes('Urban')
    const paramTwoUrbanCheck = paramTwo.includes('Urban')
    const paramTwoBUrbanCheck = paramTwoB.includes('Urban')

    if ([paramOnePopCheck,paramOneBPopCheck,paramTwoPopCheck,paramTwoBPopCheck].includes(true) || [paramOneUrbanCheck,paramOneBUrbanCheck,paramTwoUrbanCheck,paramTwoBUrbanCheck].includes(true)){
        popArrow_Person = populationArrowData.getChild('Person')
        popArrow_AREA_SQKM = populationArrowData.getChild('AREA_SQKM')
        popArrow_Suburb = populationArrowData.getChild(groupColumn.lod0_population)
        for (let i = 0; i < popArrow_Suburb!.length; i++) {
            const suburb = popArrow_Suburb.get(i)
            if (!suburbsUnique.has(suburb)) continue
            sumPerson[suburb] ? sumPerson[suburb]+= Number(popArrow_Person?.get(i)) : sumPerson[suburb]=Number(popArrow_Person?.get(i))
            sumAreaSQKM[suburb] ? sumAreaSQKM[suburb]+= Number(popArrow_AREA_SQKM?.get(i)) : sumAreaSQKM[suburb]=Number(popArrow_AREA_SQKM?.get(i))
        }
    }

    const envMaterials = environmentalArrowData.getChild('Material category')
    //check paramOne
    if (paramOne=='1'){
        for (const suburb of suburbsUnique){
            sumOne[suburb] = 1
        }
    } else if (paramOnePopCheck) {
        sumOne = sumPerson
    } else if (paramOneUrbanCheck) {
        sumOne = sumAreaSQKM
    } else {
        let listMaterials = [paramOne]
        if (paramOne=='All materials') {
            listMaterials = allMaterials
        }
        for (const material of listMaterials){
            const col = arrowData.getChild(material)
            let coeff = 1
            if (paramEnv!='weight' && envMaterials?.includes(material)){ //se il paramEnv non è weight e il paramOne è nella lista dei materiali nel file dei coefficienti => prendi il coefficiente
                coeff = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',material))
                if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                impact = paramEnv
            }
            for (let i = 0; i < arrowData.numRows; i++) {
                const suburb = colSuburbs.get(i)
                const value = Number(col?.get(i)) * Number(coeff)
                if (col) sumOne[suburb] ? sumOne[suburb]+=value : sumOne[suburb]=value
            }
        }
    }

    //check paramOneB
    if (paramOneB=='1'){
        for (const suburb of suburbsUnique){
            sumOneB[suburb] = 1
        }
    } else if (paramOneBPopCheck) {
        sumOneB = sumPerson
    } else if (paramOneBUrbanCheck) {
        sumOneB = sumAreaSQKM
    } else {
        let listMaterials = [paramOneB]
        if (paramOneB=='All materials') {
            listMaterials = allMaterials
        }
        for (const material of listMaterials){
            const col = arrowData.getChild(material)
            let coeff = 1
            if (paramEnv!='weight' && envMaterials?.includes(material)){
                coeff = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',material))
                if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                impact = paramEnv
            }
            for (let i = 0; i < arrowData.numRows; i++) {
                const suburb = colSuburbs.get(i)
                const value = Number(col?.get(i)) * Number(coeff)
                if (col) sumOneB[suburb] ? sumOneB[suburb]+=value : sumOneB[suburb]=value
            }
        }
    }

    //check paramTwo
    if (paramTwo=='1'){
        for (const suburb of suburbsUnique){
            sumTwo[suburb] = 1
        }
    } else if (paramTwoPopCheck) {
        sumTwo = sumPerson
    } else if (paramTwoUrbanCheck) {
        sumTwo = sumAreaSQKM
    } else {
        let listMaterials = [paramTwo]
        if (paramTwo=='All materials') {
            listMaterials = allMaterials
        }
        for (const material of listMaterials){
            const col = arrowData.getChild(material)
            let coeff = 1
            if (paramEnv!='weight' && envMaterials?.includes(material)){
                coeff = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',material))
                if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                impact = paramEnv
            }
            for (let i = 0; i < arrowData.numRows; i++) {
                const suburb = colSuburbs.get(i)
                const value = Number(col?.get(i)) * Number(coeff)
                if (col) sumTwo[suburb] ? sumTwo[suburb]+=value : sumTwo[suburb]=value
            }
        }
    }

    //check paramTwoB
    if (paramTwoB=='1'){
        for (const suburb of suburbsUnique){
            sumTwoB[suburb] = 1
        }
    } else if (paramTwoBPopCheck) {
        sumTwoB = sumPerson
    } else if (paramTwoBUrbanCheck) {
        sumTwoB = sumAreaSQKM
    } else {
        let listMaterials = [paramTwoB]
        if (paramTwoB=='All materials') {
            listMaterials = allMaterials
        }
        for (const material of listMaterials) {
            const col = arrowData.getChild(material)
            let coeff = 1
            if (paramEnv!='weight' && envMaterials?.includes(material)){
                coeff = Number(getArrowLineValue(environmentalArrowData,paramEnv,'Material category',material))
                if (!coeff) addOverlay(BUI.html`<b>${material}</b> environmental impact coefficient not found.`, 'warning')
                impact = paramEnv
            }
            for (let i = 0; i < arrowData.numRows; i++) {
                const suburb = colSuburbs.get(i)
                const value = Number(col?.get(i)) * Number(coeff)
                if (col) sumTwoB[suburb] ? sumTwoB[suburb]+=value : sumTwoB[suburb]=value
            }
        }
    }

    // const dataCityTotals: {[key: string]: {suburb: string; param_one: number; param_two: number;}} = 
    // { 'Canberra' : {
    //         suburb: 'Canberra',
    //         param_one: 0,
    //         param_two: 0,
    //     }
    // } //calculated but not used. The totals are calculated directly from the createTable component.
    //console.log(dataCityTotals)

    for (const suburb of suburbsUnique){
        if (!dataCityBySuburb[suburb]) dataCityBySuburb[suburb] = {suburb:suburb}
        dataCityBySuburb[suburb].param_one = sumOne[suburb] / sumOneB[suburb]
        dataCityBySuburb[suburb].param_two = sumTwo[suburb] / sumTwoB[suburb]
        // dataCityTotals['Canberra'].param_one += dataCityBySuburb[suburb].param_one
        // dataCityTotals['Canberra'].param_two += dataCityBySuburb[suburb].param_two
    }

    dataForBars = normalizeParamOne(dataCityBySuburb)
    //console.log(dataForBars!)
    
    const arrowData_suburbsCentroids = await readArrow('boundaries')
    if (!arrowData_suburbsCentroids) return [false,null]
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
    const regenerateFragments = async () => {
        const elementsData: FRAGS.NewElementData[] = [];
        //const propertySets: FRAGS.RawItemData[] = [];
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
            const bar_base_dim1 = barsBase.lod0
            const bar_base_dim2 = barsBase.lod0
            const bar_height = normalizationCheckbox.checked ? set.param_one_normalized*normalizationHeight.lod0 : set.param_one/normalizationHeight.notNormalized
            const bar_name = set.suburb
            let bar_position
            try {
                bar_position = new THREE.Vector3(dataSuburbsCentroid[bar_name].centroid_x_local,0,-dataSuburbsCentroid[bar_name].centroid_y_local)
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
                    _category: { value: "IfcBar" },
                    _guid: { value: generateUUID() },
                    Name: { value: bar_name },
                },
                globalTransform: tempObject.matrix.clone(),
                samples: [
                    {
                        localTransform: ltId,
                        representation: barGeoId,
                        material: matId,
                    },
                ],
            })
            //aggiunge il pset alla lista
            // propertySets.push({
            //     category: "IFCPROPERTYSET",
            //     guid: generateUUID(),
            //     data: {
            //         Name: { value: "EnvironmentalAnalysisData" },
            //         BarHeight: { value: paramOneFullNameLabel },
            //         BarColor: { value: paramTwoFullNameLabel },
            //         Suburb: { value: bar_name },
            //         [paramOneFullNameLabel]: { value: Math.round(set.param_one*10000000)/10000000 },
            //         [paramTwoFullNameLabel]: { value: Math.round(set.param_two*10000000)/10000000 },
            //     }
            // })
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
        const createdBars = await fragments.core.editor.createElements(newModel.modelId, elementsData) //crea la geometria delle barre
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
        await fragments.core.update(true)
    };
    
    await regenerateFragments();

    await colorBar(components,dataForBars!,lod,name)

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Bars created in ${loadTime} seconds`)
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> created in <b>${loadTime}</b> seconds.`)

    //HISTORY TABLE
    panelRight.innerHTML=''
    const colorScaleDropdown = document.getElementById('color-scale-dropdown') as BUI.Dropdown
    type historyTableType = {
        UVL: number,
        Name: string,
        Param1: string,
        Param2: string,
        Impact: string,
        ColorScale:any,
        Normalization:boolean,
    }
    const historyTable = document.createElement("bim-table") as BUI.Table<historyTableType>
    historyTable.id = 'history-table'
    historyTable.data = [{
        data: {
            UVL: lod,
            Name: name,
            Param1: paramOneFullNameLabel,
            Param2: paramTwoFullNameLabel,
            Impact: impact,
            ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
            Normalization: normalizationCheckbox.checked,
        }
    }]
    const columns: (keyof historyTableType | BUI.ColumnData)[] = [
        { name:'UVL', width:'3rem'},
        { name:'Name', width:'5rem'},
        { name:'Param1', width:'5rem'},
        { name:'Param2', width:'5rem'},
        { name:'Impact', width:'5rem'},
        { name:'ColorScale', width:'5rem'},
        { name:'Normalization', width:'5rem'},
    ]
    historyTable.columns = columns;
    historyTable.preserveStructureOnFilter = true
    //historyTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
    historyTable.hiddenColumns = []
    panelRight?.appendChild(historyTable)
    
    return [true,historyTable]
}