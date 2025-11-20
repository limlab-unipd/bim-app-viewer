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
        populationArrowData:Table<any>,
        environmentalArrowData:Table<any>,
        paramOne:string='Concret',
        paramOneB:string='1',
        paramTwo:string='Glass',
        paramTwoB:string='1',
        paramEnv:string,
        panelRight:BUI.Panel,
        paramOneFullNameLabel:string,
        paramTwoFullNameLabel:string,
    ): Promise<boolean> {

    paramOne = paramOne.toString()
    paramOneB = paramOneB.toString()
    paramTwo = paramTwo.toString()
    paramTwoB = paramTwoB.toString()

    if (!arrowData) {
        addOverlay(BUI.html`Please load any samples before.`,'warning')
        return false
    }
    
    //initialize variables
    const fragments = components.get(OBC.FragmentsManager)

    for (const [modelId,] of fragments.list){
        if (modelId.includes('LOD_0')) {
            addOverlay(BUI.html`UVL-0 model already exists. Please reload the browser page to do a new analysis.`,'warning')
            return false
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

    if ([paramOnePopCheck,paramOnePopCheck,paramOneBPopCheck,paramTwoBPopCheck].includes(true) || [paramOneUrbanCheck,paramOneUrbanCheck,paramOneBUrbanCheck,paramTwoBUrbanCheck].includes(true)){
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

    const getArrowLineValue = ((arrowFile:Table<any>, columnToGetValue:string, ColumnForFilter:string, valueForFilter:string): typeof result => {
        const col = arrowFile.getChild(columnToGetValue)
        const colFilter = arrowFile.getChild(ColumnForFilter)
        if (!col || !colFilter) return
        let result: number|string|undefined = undefined
        for (let i = 0; i < colFilter.length; i++) {
            if (colFilter.get(i) === valueForFilter) {
                result = col.get(i); // otteniamo il valore corrispondente
                return result
            }
        }
    })

    if (paramOne=='1'){
        for (const suburb of suburbsUnique){
            sumOne[suburb] = 1
        }
    } else if (paramOnePopCheck) {
        sumOne = sumPerson
    } else if (paramOneUrbanCheck) {
        sumOne = sumAreaSQKM
    } else {
        const col = arrowData.getChild(paramOne)
        let coeff = getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramOne)
        if (!coeff || paramEnv=='weight'){
            coeff = 1
        } else {
            impact = paramEnv
        }
        for (let i = 0; i < arrowData.numRows; i++) {
            const suburb = colSuburbs.get(i)
            const value = Number(col?.get(i)) * Number(coeff)
            if (col) sumOne[suburb] ? sumOne[suburb]+=value : sumOne[suburb]=value
        }
    }
    if (paramOneB=='1'){
        for (const suburb of suburbsUnique){
            sumOneB[suburb] = 1
        }
    } else if (paramOneBPopCheck) {
        sumOneB = sumPerson
    } else if (paramOneBUrbanCheck) {
        sumOneB = sumAreaSQKM
    } else {
        const col = arrowData.getChild(paramOneB)
        let coeff = getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramOneB)
        if (!coeff || paramEnv=='weight'){
            coeff = 1
        } else {
            impact = paramEnv
        }
        for (let i = 0; i < arrowData.numRows; i++) {
            const suburb = colSuburbs.get(i)
            const value = Number(col?.get(i)) * Number(coeff)
            if (col) sumOneB[suburb] ? sumOneB[suburb]+=value : sumOneB[suburb]=value
        }
    }
    if (paramTwo=='1'){
        for (const suburb of suburbsUnique){
            sumTwo[suburb] = 1
        }
    } else if (paramTwoPopCheck) {
        sumTwo = sumPerson
    } else if (paramTwoUrbanCheck) {
        sumTwo = sumAreaSQKM
    } else {
        const col = arrowData.getChild(paramTwo)
        let coeff = getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramTwo)
        if (!coeff || paramEnv=='weight'){
            coeff = 1
        } else {
            impact = paramEnv
        }
        for (let i = 0; i < arrowData.numRows; i++) {
            const suburb = colSuburbs.get(i)
            const value = Number(col?.get(i)) * Number(coeff)
            if (col) sumTwo[suburb] ? sumTwo[suburb]+=value : sumTwo[suburb]=value
        }
    }
    if (paramTwoB=='1'){
        for (const suburb of suburbsUnique){
            sumTwoB[suburb] = 1
        }
    } else if (paramTwoBUrbanCheck) {
        sumTwoB = sumPerson
    } else if (paramTwoB.includes('Urban')) {
        sumTwoB = sumAreaSQKM
    } else {
        const col = arrowData.getChild(paramTwoB)
        let coeff = getArrowLineValue(environmentalArrowData,paramEnv,'Material category',paramTwoB)
        if (!coeff || paramEnv=='weight'){
            coeff = 1
        } else {
            impact = paramEnv
        }
        for (let i = 0; i < arrowData.numRows; i++) {
            const suburb = colSuburbs.get(i)
            const value = Number(col?.get(i)) * Number(coeff)
            if (col) sumTwoB[suburb] ? sumTwoB[suburb]+=value : sumTwoB[suburb]=value
        }
    }

    for (const suburb of suburbsUnique){
        if (!dataCity[suburb]) dataCity[suburb] = {suburb:suburb}
        dataCity[suburb].param_one = sumOne[suburb] / sumOneB[suburb]
        dataCity[suburb].param_two = sumTwo[suburb] / sumTwoB[suburb]
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
    
    const arrowData_suburbsCentroids = await readArrow('boundaries')
    if (!arrowData_suburbsCentroids) return false
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
                    //Suburb: { value: bar_name },
                    //BarHeight: { value: paramOneFullNameLabel },
                    //BarColor: { value: paramTwoFullNameLabel },
                    //[paramOneFullNameLabel]: { value: Math.round(set.param_one*1000)/1000 },
                    //[paramTwoFullNameLabel]: { value: Math.round(set.param_two*1000)/1000 },
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
            //         [paramOneFullNameLabel]: { value: Math.round(set.param_one*1000)/1000 },
            //         [paramTwoFullNameLabel]: { value: Math.round(set.param_two*1000)/1000 },
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
                    [paramOneFullNameLabel]: { value: Math.round(set.param_one*1000)/1000 },
                    [paramTwoFullNameLabel]: { value: Math.round(set.param_two*1000)/1000 },
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
        if (!createdBars) return false
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

        // // creazione item per pset nel modello
        // const createdPsetsIds: number[] = []
        // for (const pset of propertySets){
        //     createdPsetsIds.push(Number(fragments.core.editor.createItem(newModel.modelId,pset))) //crea gli item per i pset nel modello
        // }
        // await fragments.core.editor.applyChanges(newModel.modelId)
        // await fragments.core.editor.save(newModel.modelId)
        // await fragments.core.update(true);

        // // crea la relazione tra barra e pset, entrambi sono array ordinati con gli elementi nella stessa posizione
        // for (const bar of createdBars){
        //     const barData = await bar.getData()
        //     const suburb = (barData.Name as FRAGS.ItemAttribute).value
        //     finder.create('pset', [
        //         {
        //             categories: [/PROPERTYSET/],
        //             attributes: { queries: [
        //                 { name: /Name/, value: /EnvironmentalAnalysisData/ },
        //                 { name: /Suburb/, value: new RegExp(suburb.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&")) },
        //             ] },
        //         },
        //     ])
        //     const pset_id = await finder.list.get('pset')?.test()
        //     console.log(pset_id)
        //     if (!pset_id) continue
        //     console.log([[...pset_id['LOD_0_CANBERRA']][0]])
        //     // --------------------------------- A T T E N Z I O N E ---------------------------------
        //     //await fragments.core.editor.relate(newModel.modelId, bar.localId, 'IsDefinedBy', [[...psets_ids['LOD_0_CANBERRA']][i]]) //ATTENZIONE: non so perche' sia necessario questo + 1 --> serve per aumentare di uno il localId del pset
        //     await fragments.core.editor.relate(newModel.modelId, bar.localId, 'IsDefinedBy', [[...pset_id['LOD_0_CANBERRA']][0]])
        // }

        // await fragments.core.editor.applyChanges(newModel.modelId)
        // await fragments.core.editor.save(newModel.modelId)
        // await fragments.core.update(true);
    };
    
    await regenerateFragments();

    await colorBar(components,dataForBars!,lod,name,paramTwoFullNameLabel)

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
        Impact: string,
        ColorScale:any,
        Normalization:boolean,
    }
    const historyTable = document.createElement("bim-table") as BUI.Table<historyTableType>
    historyTable.id = 'history-table'
    historyTable.data = [{
        data: {
            UVL: lod,
            Suburb: name,
            Param1: paramOneFullNameLabel,
            Param2: paramTwoFullNameLabel,
            Impact: impact,
            ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
            Normalization: normalizationCheckbox.checked,
        }
    }]
    const columns: (keyof historyTableType | BUI.ColumnData)[] = [
        { name:'UVL', width:'3rem'},
        { name:'Suburb', width:'5rem'},
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
    
    return true
}