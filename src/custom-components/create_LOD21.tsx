import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { colorBar } from './colorBar'
import type { Table } from 'apache-arrow'
import { addOverlay } from './addOverlay'
import { allMaterials, at_2015_conversion, barsBase, coordinatesScaleFactor, globalCentroid, groupColumn, normalizationHeight } from './parametersForGrouping'
import { formatNumber, getArrowLineValue, normalizeParamOne, parseWKTPolygon, valueToParamLabel } from './conversion'
import polygonClipping from 'polygon-clipping'

export async function create_LOD21 (
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
        paramChoice:string,
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
    const lod: number = 21
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
        
        if (previousLoadedSuburbs.includes(`${name}_LOD_21`)) { 
            addOverlay(BUI.html`<b>WARNING</b>: UVL-2.1 of ${name} already loaded.`,'warning')
            continue
        } else {
            previousLoadedSuburbs.push(`${name}_LOD_21`)
        }
        
        //init variables
        const pChoice = paramChoice=='Param1' ? 'param_one' : 'param_two'
        const paramChoiceFullNameLabel = paramChoice=='Param1' ? paramOneFullNameLabel : paramTwoFullNameLabel
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
            shape? : string,
            shapeHeight? : number,
            [key:string]:unknown,
        }
        const dataOfBuildings: {[key:string] : buildingsDataType} = {}
        let dataForBars: {[key:string] : any}
        const col = arrowData.getChild(groupColumn.lod1);
        if (!col) throw new Error(`${groupColumn.lod1} column not found`);

        const convertedParamOne = `P1_${valueToParamLabel(paramOne)!}`
        const convertedParamOneB = `P1_${valueToParamLabel(paramOneB)!}`
        const convertedParamTwo = `P2_${valueToParamLabel(paramTwo)!}`
        const convertedParamTwoB = `P2_${valueToParamLabel(paramTwoB)!}`

        for (let i = 0; i < arrowData.numRows; i++) { //effettua la moltiplicazione per ogni riga
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
                dataOfBuildings[buildingId].shape = row.geometry_wkt
                dataOfBuildings[buildingId].shapeHeight = row.A_H_AGL
                
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
        
        function appendGeometry(target: THREE.BufferGeometry, source: THREE.BufferGeometry) {
            // --- 1) Raccogli gli attributi esistenti ---
            const targetPos = target.getAttribute("position");
            const targetNorm = target.getAttribute("normal");
            const targetUV = target.getAttribute("uv");
    
            const targetIndex = target.getIndex();
    
            const tPos = targetPos ? Array.from(targetPos.array) : [];
            const tNorm = targetNorm ? Array.from(targetNorm.array) : [];
            const tUV = targetUV ? Array.from(targetUV.array) : [];
            const tIdx = targetIndex ? Array.from(targetIndex.array) : [];
    
            // --- 2) Raccogli attributi della nuova geometria ---
            const srcPos = source.getAttribute("position");
            const srcNorm = source.getAttribute("normal");
            const srcUV = source.getAttribute("uv");
    
            const srcIndex = source.getIndex();
    
            const sPos = Array.from(srcPos.array);
            const sNorm = srcNorm ? Array.from(srcNorm.array) : [];
            const sUV = srcUV ? Array.from(srcUV.array) : [];
    
            const sIdx = srcIndex ? Array.from(srcIndex.array) : [];
    
            // --- 3) Offset dei vertici esistenti ---
            const vertexOffset = tPos.length / 3;
    
            // --- 4) Aggiorna gli indici della sorgente ---
            const newIdx = sIdx.map(i => i + vertexOffset);
    
            // --- 5) Concatena tutti gli arrays ---
            const finalPos = new Float32Array([...tPos, ...sPos]);
            const finalNorm = new Float32Array([...tNorm, ...sNorm]);
            const finalUV = new Float32Array([...tUV, ...sUV]);
            const finalIdx = new (tIdx.length + sIdx.length > 65535 ? Uint32Array : Uint16Array)([
                ...tIdx,
                ...newIdx
            ]);
    
            // --- 6) Aggiorna attributi nella geometria finale ---
            target.setAttribute("position", new THREE.BufferAttribute(finalPos, 3));
            if (sNorm.length > 0) {
                target.setAttribute("normal", new THREE.BufferAttribute(finalNorm, 3));
            }
            if (sUV.length > 0) {
                target.setAttribute("uv", new THREE.BufferAttribute(finalUV, 2));
            }
    
            target.setIndex(new THREE.BufferAttribute(finalIdx, 1));
            target.computeBoundingBox();
            target.computeBoundingSphere();
        }// Funzione per assicurarsi che il profilo sia chiuso
        /**
         * Chiude un poligono aggiungendo l'ultimo punto uguale al primo
         */
        function closePolygon(polygon: [number, number][]): [number, number][] {
            if (polygon.length === 0) return polygon;
            const first = polygon[0];
            const last = polygon[polygon.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
                polygon.push([first[0], first[1]]);
            }
            return polygon;
        }
        /**
         * Assicura che il poligono sia in senso orario CCW (counter-clockwise)
         */
        function ensureCCW(polygon: [number, number][]): [number, number][] {
            if (polygon.length < 3) return polygon; // un poligono non valido
            const pts = polygon.map(p => new THREE.Vector2(p[0], p[1]));
            const isCW = THREE.ShapeUtils.isClockWise(pts);
            return isCW ? [...polygon].reverse() : polygon;
        }
    
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
    
            // Buildings
            const tempObject = new THREE.Object3D();
    
            // Fattore di scala per adattare le coordinate a Three.js
            const scale = 1/coordinatesScaleFactor
    
            //creation of each building
            for (const [key,set] of Object.entries(dataForBars)) {
                //const building_position = new THREE.Vector3(0,0,0)
                const building_name = Number(set.Id).toString()
                const building_height = set.shapeHeight
                const centr_x = set.centroid_x! - globalCentroid.x / coordinatesScaleFactor
                const centr_y = set.centroid_y! - globalCentroid.y / coordinatesScaleFactor
                const building_position = new THREE.Vector3(centr_x,0,-centr_y)
    
                if (!set.shape) continue
                const buildingGeometry = new THREE.BufferGeometry();
                const polygons = parseWKTPolygon(set.shape);
                if (!polygons || polygons.length === 0) continue;
    
                // Estrudi ogni poligono *separatamente*
                for (let polygon of polygons) {
                    // 1) Chiudi il poligono (aggiunge l'ultimo punto uguale al primo)
                    polygon = closePolygon(polygon);
                    // 2) Assicura orientamento CCW
                    polygon = ensureCCW(polygon);
                    // 3) Pulizia auto-intersezioni con polygon-clipping
                    polygon.filter((pt, i, arr) => i === 0 || pt[0] !== arr[i-1][0] || pt[1] !== arr[i-1][1])
                    // wrap per ottenere un Polygon valido
                    const polygonForClipping: [ [number, number][] ] = [polygon];
                    const cleaned = polygonClipping.union([polygonForClipping]);
                    // Se il poligono pulito è vuoto, salta
                    if (!cleaned.length || !cleaned[0].length) continue;
                    // Prendi il primo anello del primo poligono pulito
                    const outer: [number, number][] = cleaned[0][0] as [number, number][];
                    // 4) Genera il profilo 3D per l'estrusione
                    const profile: number[] = outer.map(([x, y]) => [
                        ((x - globalCentroid.x) * scale - centr_x), // X
                        0,                              // Y=0
                        - ((y - globalCentroid.y) * scale - centr_y)// Z
                    ]).flat();
                    // 5) Crea geometria temporanea e estrudi
                    const tempGeometry = new THREE.BufferGeometry();
                    geometryEngine.getExtrusion(tempGeometry, {
                        profilePoints: profile,
                        direction: [0, 1, 0],
                        cap: true,
                        length: building_height
                    });
                    // 6) Append alla geometria finale del building
                    appendGeometry(buildingGeometry, tempGeometry);
                }
    
                //creazione shell
                const buildingGeoId = fragments.core.editor.createShell(
                    newModel.modelId,
                    buildingGeometry,
                );
                
                //sposta l'oggetto in posizione
                tempObject.position.copy(building_position);
                tempObject.updateMatrix();
                
                //array per l'inserimento dei dati nella urban table
                buildings.push(
                    {
                        data: {
                            Name: building_name,
                            Param1: formatNumber(set.param_one!),
                            Param2: formatNumber(set.param_two!),
                            Color: 'blue',
                        },
                    }
                )
                //proprietà dell'oggetto appena creato (qui andranno inserite le eventuali proprietà IFC)
                elementsData.push({
                    attributes: {
                        _category: {
                            value: "IfcBuildingElementProxy",
                        },
                        _guid: { value: generateUUID() },
                        Name: { value: building_name },
                        Suburb: { value: set.suburb ? set.suburb : 'None' },
                        Section: { value: set.section ? set.section : 'None' },
                        Function: { value: at_2015_conversion[getArrowLineValue(arrowData, 'at_2015', 'Id', Number(building_name)) as string].explicit },
                        ParamName: { value: paramChoiceFullNameLabel },
                        ParamValue: { value: set[pChoice] },
                    },
                    globalTransform: tempObject.matrix.clone(),
                    samples: [
                        {
                            localTransform: ltId,
                            representation: buildingGeoId,
                            material: matId,
                        },
                    ],
                });
                
                pSets[building_name] = { //object containing one pset per each suburb
                    category: "IFCPROPERTYSET",
                    guid: generateUUID(),
                    data: {
                        Name: { value: "EnvironmentalAnalysisData" },
                        Suburb: { value: building_name },
                        BuildingColor: { value: paramChoiceFullNameLabel },
                        [paramChoiceFullNameLabel]: { value: formatNumber(Number(set[pChoice])) },
                        [convertedParamOne]: { value: formatNumber(set[convertedParamOne]) },
                        [convertedParamOneB]: { value: formatNumber(set[convertedParamOneB]) },
                        [convertedParamTwo]: { value: formatNumber(set[convertedParamTwo]) },
                        [convertedParamTwoB]: { value: formatNumber(set[convertedParamTwoB]) },
                    }
                }
                pSetsData[building_name] = {
                    category: "IFCPROPERTYSET",
                    guid: generateUUID(),
                    data: {
                        Name: { value: "EnvironmentalData" },
                        Description: { value: "Original data" },
                        Suburb: { value: building_name },
                        Building_height: { value: formatNumber(Number(getArrowLineValue(arrowData, 'A_H_AGL', 'Id', Number(building_name)))) },
                        Building_footprintArea: { value: formatNumber(Number(getArrowLineValue(arrowData, 'grnd_fl', 'Id', Number(building_name)))) },
                        Building_grossFloorArea: { value: formatNumber(Number(getArrowLineValue(arrowData, 'grs_fl', 'Id', Number(building_name)))) },
                        Building_NetFloorArea: { value: formatNumber(Number(getArrowLineValue(arrowData, 'usbl_fl', 'Id', Number(building_name)))) },
                        Building_weight: { value: formatNumber(Number(getArrowLineValue(arrowData, 'T_stock', 'Id', Number(building_name)))) },
                        Aluminium: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Aluminm', 'Id', Number(building_name)))) },
                        Bitumen: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Bitumen', 'Id', Number(building_name)))) },
                        Carpet: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Carpet', 'Id', Number(building_name)))) },
                        Ceramics: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Ceramcs', 'Id', Number(building_name)))) },
                        Concrete: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Concret', 'Id', Number(building_name)))) },
                        Copper: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Copper', 'Id', Number(building_name)))) },
                        Glass: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Glass', 'Id', Number(building_name)))) },
                        Insulation: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Insultn', 'Id', Number(building_name)))) },
                        Paint: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Paint', 'Id', Number(building_name)))) },
                        Plasterboard: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Plstrbr', 'Id', Number(building_name)))) },
                        Plastics: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Plastcs', 'Id', Number(building_name)))) },
                        SandAndStone: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Snd_nd_', 'Id', Number(building_name)))) },
                        Steel: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Steel', 'Id', Number(building_name)))) },
                        Timber: { value: formatNumber(Number(getArrowLineValue(arrowData, 'Timber', 'Id', Number(building_name)))) },
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
    
        const [map_color_ids,map_id_name,modelName]: any[] = await colorBar(components,dataForBars!,lod,name,pChoice)
        
        const endTime = performance.now() // End timer
        const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
        console.log(`Bars created in ${loadTime} seconds`)
        addOverlay(BUI.html`Shape of buildings for <b><i>${name}</i></b> created in <b>${loadTime}</b> seconds.`)
    
        for (const row of buildings){
            const block = row.data.Name
            const localId = Object.keys(map_id_name).filter(k => map_id_name[k as keyof typeof map_id_name] === block)
            row.data.localId = Number(localId[0])
            row.data.modelId = modelName
            switch (true) {
                case (map_color_ids['color_0_02'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get(`LOD_${lod}_color_0_02`)?.color.getStyle()!
                    break;
                case (map_color_ids['color_02_04'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get(`LOD_${lod}_color_02_04`)?.color.getStyle()!
                    break;
                case (map_color_ids['color_04_06'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get(`LOD_${lod}_color_04_06`)?.color.getStyle()!
                    break;
                case (map_color_ids['color_06_08'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get(`LOD_${lod}_color_06_08`)?.color.getStyle()!
                    break;
                case (map_color_ids['color_08_1'] as string[])?.includes(localId[0]):
                    row.data.Color = highlighter.styles.get(`LOD_${lod}_color_08_1`)?.color.getStyle()!
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
                Param1: pChoice=='param_one' ? paramOneFullNameLabel : '',
                Impact1: pChoice=='param_one' ? impactOne : '',
                Param2: pChoice=='param_two' ? paramTwoFullNameLabel : '',
                Impact2: pChoice=='param_two' ? impactTwo : '',
                ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
                NormHeight: false,
            }
        })
        historyTable?.requestUpdate()
        results.push(true)
    }
    return results.includes(true) ? true : false
}