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
import { formatNumber, getArrowLineValue, parseWKTPolygon } from './conversion'
import { readArrow } from './readArrow'
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
        paramEnv:string,
        previousLoadedSuburbs:string[],
        paramOneFullNameLabel:string,
        paramTwoFullNameLabel:string,
        urbanTable:BUI.Table,
        historyTable:BUI.Table<any>|null,
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
    let name = ''
    let suburb = ''
    const pChoice = paramChoice=='Param1' ? 'param_one' : 'param_two'
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
        shape? : string,
        shapeHeight? : number,
    }
    const dataOfBuildings: {[key:string] : buildingsDataType} = {}
    let dataForBars: {[key:string] : buildingsDataType}
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
            dataOfBuildings[buildingIdentfr].param_one = (paramOne=='1' ? 1 : Number(row[paramOne])) * coeffOne / (paramOneB=='1' ? 1 : Number(row[paramOneB])) * coeffOneB
            dataOfBuildings[buildingIdentfr].param_two = (paramTwo=='1' ? 1 : Number(row[paramTwo])) * coeffTwo / (paramTwoB=='1' ? 1 : Number(row[paramTwoB])) * coeffTwoB
            dataOfBuildings[buildingIdentfr].shape = row.geometry_wkt
            dataOfBuildings[buildingIdentfr].shapeHeight = row.BLDGHEI
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
            const building_position = new THREE.Vector3(0,0,0)
            const building_name = set.identfr
            const building_height = set.shapeHeight

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
                    (x - globalCentroid.x) * scale, // X
                    0,                              // Y=0
                    -(y - globalCentroid.y) * scale // Z
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
                    ParamName: { value: paramOneFullNameLabel },
                    ParamValue: { value: set[pChoice] },
                    //Aluminium: { value: getArrowLineValue(arrowData, 'Aluminm', 'identfr', set.identfr!) },
                    //Concrete: { value: getArrowLineValue(arrowData, 'Concret', 'identfr', set.identfr!) },
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
        }
        await fragments.core.editor.createElements(newModel.modelId, elementsData);
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
    addOverlay(BUI.html`Bars for <b><i>${name}</i></b> suburb created in <b>${loadTime}</b> seconds.`)

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
            Param1: paramOneFullNameLabel,
            Param2: paramTwoFullNameLabel,
            Impact: impact,
            ColorScale: colorScaleDropdown.value[0] ? colorScaleDropdown.value[0] : 'gnylrd',
            Normalization: false,
        }
    })
    historyTable?.requestUpdate()

    return true
}