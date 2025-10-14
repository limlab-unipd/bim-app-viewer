import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as FRAGS from '@thatopen/fragments'
import * as BUIC from '@thatopen/ui-obc'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import Stats, { Panel } from 'stats.js'


export function MainViewer () {

    // #region GENERAL START
    //BUI.Manager.init()
    const components = new OBC.Components()
    // #endregion
    
    const setViewer = async (devMode:boolean=false) => {
        //SETTING DEV MODE
        const devElementsVisibility = devMode ? '' : 'none' 
        //VIEWER COMPONENTS
        const finder = components.get(OBC.ItemsFinder)
        const highlighter = components.get(OBCF.Highlighter)
        const ifcLoader = components.get(OBC.IfcLoader)
        const fragments = components.get(OBC.FragmentsManager)
        const hider = components.get(OBC.Hider)
        
        let previousSelection: OBC.ModelIdMap

        // #region SET THREE VIEWER
        //SINGLE VIEWER
        const worlds = components.get(OBC.Worlds)
        const world = worlds.create<
            OBC.SimpleScene,
            OBC.OrthoPerspectiveCamera,
            //OBC.SimpleRenderer
            OBCF.PostproductionRenderer
        >()
        //SCENE
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = null
        //RENDERER
        const container = document.getElementById("main-viewer")! as HTMLElement
        world.renderer = new OBCF.PostproductionRenderer(components, container)
        //world.renderer = new OBC.SimpleRenderer(components, container)
        //CAMERA
        world.camera = new OBC.OrthoPerspectiveCamera(components)
        await world.camera.controls.setLookAt(30,30,30,0,0,0) // convenient position for the model we will load
        // #endregion

        // #region COPONENTS GENERAL SETUP
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('rgba(28, 28, 28, 1)')
        
        world.renderer.postproduction.enabled = true
        world.dynamicAnchor = false

        components.get(OBC.Raycasters).get(world);

        highlighter.zoomToSelection = true;
        highlighter.setup({
            world,
            selectMaterialDefinition: {
                // you can change this to define the color of your highligthing
                color: new THREE.Color("rgba(36, 241, 234, 1)"),
                opacity: 1,
                transparent: false,
                renderedFaces: 0,
            },
        })
        highlighter.events.select.onHighlight.add((modelIdMap) => {
            previousSelection = structuredClone(modelIdMap)
        });
        highlighter.styles.set('transparent', {
            // you can change this to define the color of your highligthing
            color: new THREE.Color("rgba(123, 123, 123, 1)"),
            opacity: 0.3,
            transparent: true,
            renderedFaces: 0, //render only front side
        })

        await ifcLoader.setup({
            autoSetWasm: false,
            wasm: {
                path: "https://unpkg.com/web-ifc@0.0.69/",
                absolute: true,
            },
        });
        const workerUrl ="/Worker/worker.mjs";
        const fetchedUrl = await fetch(workerUrl);
        const workerBlob = await fetchedUrl.blob();
        const workerFile = new File([workerBlob], "worker.mjs", {
            type: "text/javascript",
        });
        const workerURL = URL.createObjectURL(workerFile);
        fragments.init(workerURL);
    
        world.camera.controls?.addEventListener("rest", () =>
            fragments.core.update(true),
        );
    
        fragments.list.onItemSet.add(({ value: model }) => {
            model.useCamera(world.camera.three)
            world.scene.three.add(model.object)
            fragments.core.update(true)
        })
        fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
            const isLodMaterial = "isLodMaterial" in material && material.isLodMaterial
            if (isLodMaterial) {
                world.renderer!.postproduction.basePass.isolatedMaterials.push(material)
            }
            const isShadowMaterial = "isShadowMaterial" in material && material.isShadowMaterial
            if (isShadowMaterial) {
                world.renderer!.postproduction.basePass.isolatedMaterials.push(material)
            }
        })
        // #endregion

        //postproduction parameters
        const { aoPass, outlinePass, edgesPass } = world.renderer.postproduction
        const aoParameters = {
            radius: 0.25,
            distanceExponent: 1,
            thickness: 1,
            scale: 1,
            samples: 16,
            distanceFallOff: 1,
            screenSpaceRadius: true,
        }
        const pdParameters = {
            lumaPhi: 10,
            depthPhi: 2,
            normalPhi: 3,
            radius: 4,
            radiusExponent: 1,
            rings: 2,
            samples: 16,
        }
        aoPass.updateGtaoMaterial(aoParameters)
        aoPass.updatePdMaterial(pdParameters)
        const setAmbientOcclusionParameters = (value:number) => {
            aoPass.blendIntensity = value
            aoParameters.radius = value
            aoParameters.distanceExponent = value*4
            aoParameters.thickness = value*10
            aoParameters.distanceFallOff = value
            aoParameters.scale = value*2
            aoParameters.samples = Math.floor(value*32)
            aoPass.updateGtaoMaterial(aoParameters)
        }

        //start the viewer with the postproduction set but not enabled
        world.renderer.postproduction.enabled = false
    
        // #region LOGIC FUNCTIONS
        //function to load the IFC file
        const loadIfcFile = async (path: string) => {
            const name = path.split('/').pop()?.split('.ifc')[0] || path.split('/').pop() || path
            const file = await fetch(path);
            const data = await file.arrayBuffer();
            const buffer = new Uint8Array(data);
            const startTime = performance.now(); // Start timer

            //THIS IS THE MOST FUNDAMENTAL THING FOR ADDING CLASSES TO IMPORT.
            //FRAGMENTS 2.0 DOES NOT IMPORT BY DEFAULT ALL THE IFC CLASSES
            await ifcLoader.load(
                buffer,
                false,
                name,
                {instanceCallback(importer) {
                    //ADDING NEW CLASSES TO IMPORT
                    importer.classes['abstract'].add(
                        WEBIFC.IFCCOSTITEM, 
                        WEBIFC.IFCCOSTVALUE,
                        WEBIFC.IFCMEASUREWITHUNIT,
                        WEBIFC.IFCMONETARYUNIT,
                        WEBIFC.IFCSIUNIT,
                        WEBIFC.IFCCONVERSIONBASEDUNIT,
                        WEBIFC.IFCCONTEXTDEPENDENTUNIT,
                        WEBIFC.IFCRELASSIGNSTOCONTROL,
                        WEBIFC.IFCRELNESTS,
                    )
                    //ADDING NEW RELATIONS TO IMPORT
                    importer.relations.set(WEBIFC.IFCRELASSIGNSTOCONTROL, {
                        forRelated: "HasAssignments",
                        forRelating: "Controls"
                    })
                    importer.relations.set(WEBIFC.IFCRELNESTS, {
                        forRelated: "Nests",
                        forRelating: "IsNestedBy"
                    })
                }
            });

            const endTime = performance.now(); // End timer
            const loadTime = ((endTime - startTime) / 1000).toFixed(2); // seconds
            console.log(`${name} IFC model loaded in ${loadTime} seconds`);
            const overlay = document.getElementById("overlay");
            if (overlay) {
                const label = BUI.Component.create<HTMLDivElement>(() => {
                    return BUI.html`
                    <div style="text-align:center; padding:10px; background:rgba(0,0,0,0.2); border-radius: 10px; margin: 5px">
                        <i><b>${name}</i></b> loaded in <b>${loadTime}</b> seconds.
                    </div>
                    `
                })
                overlay.appendChild(label)
                setTimeout(() => {
                    label.style.display = "none";
                }, 5000); // Nasconde dopo 4 secondi
            }
        }        
        // Function to load an IFC file triggered by the button
        const onLoadIfc = async ({target}:{target:BUI.Button}) => {
            //methods to open the file dialog and select an IFC file
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".ifc";
            input.onchange = async (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (file) {
                    const url = URL.createObjectURL(file);
                    target.loading = true; // Set loading state
                    target.label = "Loading IFC...";
                    await loadIfcFile(url);
                    target.loading = false; // Set loading state
                    target.label = ""
                    URL.revokeObjectURL(url);
                }
            };
            input.click();
        }

        // handle fragment files
        const loadFragmentFile = async (path:string) => {
            const startTime = performance.now() // Start timer
            const modelId = path.split("/").pop()?.split(".").shift()
            if (modelId) {
            const file = await fetch(path)
            const buffer = await file.arrayBuffer()
            await fragments.core.load(buffer, { modelId: modelId })
            }
            const endTime = performance.now() // End timer
            const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
            console.log(`Fragments loaded in ${loadTime} seconds`)
            const overlay = document.getElementById("overlay");
            if (overlay) {
                const label = BUI.Component.create<HTMLDivElement>(() => {
                    return BUI.html`
                    <div style="text-align:center; padding:10px; background:rgba(0,0,0,0.2); border-radius: 10px; margin: 5px">
                        <b><i>${modelId}</i></b> model loaded in <b>${loadTime}</b> seconds.
                    </div>
                    `
                })
                overlay.appendChild(label)
                setTimeout(() => {
                    label.style.display = "none";
                }, 5000); // Nasconde dopo 5 secondi
            }
        }
        const onFragmentsExport = async () => {
            for (const [, model] of fragments.list) {
                const fragsBuffer = await model.getBuffer(false);
                const file = new File([fragsBuffer], `${model.modelId}.frag`)
                const link = document.createElement("a")
                link.href = URL.createObjectURL(file)
                link.download = file.name
                link.click()
                URL.revokeObjectURL(link.href)
            }
        }
        const onFragmentsImport = async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.multiple = true
            input.accept = '.frag'
            const fragPaths: string[] = []
            const fragNames: {[key:string]:string} = {}
            input.onchange = async (event) => {
                const files = (event.target as HTMLInputElement).files
                if (!files) return
                for (const file of files){
                    const path = URL.createObjectURL(file)
                    fragPaths.push(path)
                    fragNames[path] = file.name.split('.')[0]
                }
                // Promise.all loads models concurrently for faster execution.
                await Promise.all(
                    fragPaths.map(async (path) => {
                        loadFragmentFile(path)
                    }),
                )
            }
            input.click()
        }
        const onFragmentsPrint = async () => { //test function on fragments
            //it doesn't work with non geometric elements (IfcCostItem)
            const selection = highlighter.selection.select //modelIdMap -> association to exp id
            console.log("ModelIdMap: ", selection)
            const itemdata = await fragments.getData(selection) //frags.itemdata -> attributes, guid and expid (localId)
            console.log("ItemData: ", itemdata)
        }

        //generic functions
        //Visibility
        const onHide = async () => {
            hider.set(false, highlighter.selection.select)
        }
        const onIsolate = () => {
            hider.isolate(highlighter.selection.select)
        }
        const onResetVisibility = () => {
            hider.set(true) //show all items
            fragments.resetHighlight() //reset colors or other overrides
            highlighter.clear()
        }
        const onInvertVisibility = async () => {
            for (const [,model] of fragments.list){
                const visible = await model.getItemsByVisibility(true)
                const hidden = await model.getItemsByVisibility(false)
                model.toggleVisible([...visible,...hidden])
            }
        }
        const onSetTransparency = (modelIdMap?:OBC.ModelIdMap|null) => {
            if (!modelIdMap) { modelIdMap = highlighter.selection.select }
            highlighter.highlightByID('transparent', modelIdMap, false, false)
        }
        const onSetTransparencyToNotSelectedElements = async () => {
            const allItems = await getAllItems()
            const selectedItems = highlighter.selection.select
            highlighter.highlightByID('transparent', allItems, true, false, selectedItems)
        }
        const onSetTransparencyToCostColor = async () => {
            const selectedItems = highlighter.selection.select

            if (highlighter.selection.color_02_04){
                highlighter.highlightByID('color_0_02', highlighter.selection.color_0_02_transparent, false, false)
                highlighter.highlightByID('color_02_04', highlighter.selection.color_02_04_transparent, false, false)
                highlighter.highlightByID('color_04_06', highlighter.selection.color_04_06_transparent, false, false)
                highlighter.highlightByID('color_06_08', highlighter.selection.color_06_08_transparent, false, false)
                highlighter.highlightByID('color_08_1', highlighter.selection.color_08_1_transparent, false, false)
    
                if (!isModelIdMapEmpty(selectedItems)) {
                    highlighter.highlightByID('color_0_02_transparent', highlighter.selection.color_0_02, true, false, selectedItems)
                    highlighter.highlightByID('color_02_04_transparent', highlighter.selection.color_02_04, true, false, selectedItems)
                    highlighter.highlightByID('color_04_06_transparent', highlighter.selection.color_04_06, true, false, selectedItems)
                    highlighter.highlightByID('color_06_08_transparent', highlighter.selection.color_06_08, true, false, selectedItems)
                    highlighter.highlightByID('color_08_1_transparent', highlighter.selection.color_08_1, true, false, selectedItems)
                }
            } else {
                console.log('Analysis still not performed.')
            }
        }
        
        const isModelIdMapEmpty = (modelIdMap: OBC.ModelIdMap): boolean => {
            return Object.values(modelIdMap).every(set => set.size === 0);
        }
        const getAllItems = async () => {
            const frMap: OBC.ModelIdMap = {}
            for (const [entry,entryfr] of fragments.list.entries()){
                const localids = await entryfr.getLocalIds()
                const singleFrMap: OBC.ModelIdMap = {
                    [entry] : new Set<number>([...localids])
                }
                Object.assign(frMap, singleFrMap)
            }
            return frMap
        }
        const getAllCategories = async () => {
            const list: string[][] = []
            for (const [entry,entryfr] of fragments.list.entries()){
                const categories = await entryfr.getCategories()
                list.push(categories)
            }
            return [...new Set(list.flat())]
        }        
        let previousLayout: string = 'main'
        const onSetLayout = ({target}: {target: BUI.Button | string}) => {
            const btn = typeof target==='string' ? target : target.id
            let currentLayout = floatingGrid.layout as any
            if (!currentLayout) return
            if (currentLayout == btn) {
                if (btn == 'world') {
                    floatingGrid.layout = previousLayout as any
                } else {
                    floatingGrid.layout = "main" as any
                }
            } else if (currentLayout == 'main') {
                floatingGrid.layout = btn as any
            } else {
                if (btn == 'world') {
                    floatingGrid.layout = 'world' as any
                    previousLayout = currentLayout
                } else {
                    if (currentLayout == 'world') {
                        currentLayout = ''
                    }
                    currentLayout.includes(btn) ? floatingGrid.layout = currentLayout.replace(btn, "") : floatingGrid.layout = currentLayout + btn as any
                }
            }
        }
        const onExpandTable = (e: Event, table:BUI.Table<any>) => {
            const button = e.target as BUI.Button;
            table.expanded = !table.expanded;
            button.label = table.expanded ? "Collapse" : "Expand";
        }
        const onSortTable = (e: Event, table:BUI.Table<any>) => {
            function parseValue(value: string): number | string {
                const numericPart = value.split(' ')[0]
                const parsed = Number(numericPart)
                // Se il valore è numerico e la stringa inizia con quel numero, trattalo come numero
                if (!isNaN(parsed) && value.trim().startsWith(numericPart)) { return parsed }
                // Altrimenti trattalo come stringa (case-insensitive)
                return value.toLowerCase()
            }

            function sortTable(table: BUI.Table<any>,ascending: boolean = true,field: string) {
                const direction = ascending ? 1 : -1
                table.data.sort((a, b) => {
                    const valA = parseValue(a.data[field] || '')
                    const valB = parseValue(b.data[field] || '')
                    // Se entrambi sono numeri
                    if (typeof valA === 'number' && typeof valB === 'number') {
                        return (valA - valB) * direction
                    }
                    // Ordinamento alfabetico
                    return valA.toString().localeCompare(valB.toString()) * direction
                })
            }


            if (!e.target) return
            const target = (e.target as any).value[0]
            const field = target.split(" ")[0]
            const direction = target.split(' ')[1]
            let ascending: boolean = true
            ascending = direction == '(up)' ? false : true
            sortTable(table,ascending,field)
            table.requestUpdate()
        }
        let originalDataWithCategories: any = null //needed here otherwise within the function will be initilized each time so will be impossibile to store the previous value
        const onChangeLevelTable = (e: Event, table:BUI.Table<any>) => {
            const button = e.target as BUI.Button
            if (button.label == 'Item'){
                if (!originalDataWithCategories){
                    originalDataWithCategories = structuredClone(table.data)
                }
                const flattenedData: BUI.TableGroupData<any>[] = []
                for (const categoryRow of table.data) {
                    if (!categoryRow.children) continue
                    for (const elementRow of categoryRow.children) {
                        // ogni elementRow è già nel formato giusto (con eventuali children)
                        flattenedData.push(elementRow)
                    }
                }
                table.data = flattenedData
                button.label = 'Category'
            } else if (button.label == 'Category') {
                if (originalDataWithCategories){
                    table.data = structuredClone(originalDataWithCategories)
                    originalDataWithCategories = null
                }
                button.label = 'Item'
            }
        }
        const onLoadTable = (updateFunction:BUI.UpdateFunction<any>) => {
            updateFunction({ modelIdMap: highlighter.selection.select })
        }
        const onSearch = (e: Event, table:BUI.Table<any>) => {
            const input = e.target as BUI.TextInput;
            table.queryString = input.value !== "" ? input.value : null
        }
        const onClearPanel = (panel: BUI.Panel, title:string='Void Panel') => {
            panel.innerHTML = ''
            panel.label = title
        }
        const flattenModelMap = (map:{[key:string]:{[key:string|number]:any}}) => {
            const flatten_map = Object.values(map).reduce((acc, curr) => {
                Object.entries(curr).forEach(([k, v]) => {
                    acc[k] = acc[k] ? {...acc[k],...v} : v
                    return acc[k]
                })
                return acc},
                {} as { [key: number|string]: any }
            )
            return flatten_map
        }

        //advanced functions
        const getVolume = async () => {
            const models = fragments.list.values()
            for (const model of models) {
                const selection = await model.getHighlightItemIds()
                if (!selection) continue
                const volumes = await model.getItemsVolume(selection)
                console.log(volumes)
            }
        }
        const convertCurrency = (currency:string) => {
            if (currency == 'EUR'){
                currency = '€'
            } else if (currency == 'USD'){
                currency = '$'
            }
            return currency            
        }        
        const convertUnits = (unitMeasure: string) => {
            //this is only to convert predefined IFC unit measures, but if there are personalized such as kg, ton, cad will be automatically used as they are
            if (unitMeasure == 'METRE'){
                unitMeasure = 'm'
            } else if (unitMeasure == 'SQUARE_METRE'){
                unitMeasure = 'm²'
            } else if (unitMeasure == 'CUBIC_METRE'){
                unitMeasure = 'm³'
            } else if (unitMeasure == '') {
                unitMeasure = 'nd'
            }
            return unitMeasure
        }

        
        // Funzione per assegnare il colore discreto
        const colorForValue = (value: number): ColorRangeKey => {
            if (value >= 0 && value < 0.20) return "color_0_02";
            if (value >= 0.20 && value < 0.40) return "color_02_04";
            if (value >= 0.40 && value < 0.60) return "color_04_06";
            if (value >= 0.60 && value < 0.80) return "color_06_08";
            if (value >= 0.80 && value <= 1.00) return "color_08_1";
            return "color_08_1"
        }
        const normalizeAndMapToColor = (
            map: Record<string, number>,
            colorscale: string = 'gnylrd',
            rangeMin: number,
            rangeMax: number
        ): [Record<string, string>, Record<string, number>] => {
            const colorScale = colorScaleList[colorscale];

            // Normalizzazione dei valori
            const values = Object.values(map);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min || 1;

            const result: Record<string, string> = {};
            const temporaryResultNormalized: Record<string, number> = {};
            const resultNormalized: Record<string, number> = {};

            for (const [key, value] of Object.entries(map)) {
                // Normalizzazione globale iniziale
                temporaryResultNormalized[key] = (value - min) / range;
            }

            // Filtra solo i valori normalizzati nel range specificato
            const filteredEntries = Object.entries(temporaryResultNormalized).filter(
                ([, normalized]) => normalized >= rangeMin && normalized <= rangeMax
            );

            if (filteredEntries.length === 0) return [{}, {}];

            // Trova il minimo e massimo dei valori filtrati (per la seconda normalizzazione)
            const filteredValues = filteredEntries.map(([, normalized]) => normalized);
            const fMin = Math.min(...filteredValues);
            const fMax = Math.max(...filteredValues);
            const fRange = fMax - fMin || 1;

            for (const [key, normalized] of filteredEntries) {
                // Seconda normalizzazione tra 0 e 1 sui valori filtrati
                const renormalized = (normalized - fMin) / fRange;
                resultNormalized[key] = renormalized;

                // Determina il colore in base al valore normalizzato finale
                const colorRange = colorForValue(renormalized);
                switch (colorRange) {
                    case "color_0_02":
                        result[key] = colorScale.find(([v]) => v === 0)?.[1] as string;
                        break;
                    case "color_02_04":
                        result[key] = colorScale.find(([v]) => v === 0.25)?.[1] as string;
                        break;
                    case "color_04_06":
                        result[key] = colorScale.find(([v]) => v === 0.5)?.[1] as string;
                        break;
                    case "color_06_08":
                        result[key] = colorScale.find(([v]) => v === 0.75)?.[1] as string;
                        break;
                    case "color_08_1":
                        result[key] = colorScale.find(([v]) => v === 1)?.[1] as string;
                        break;
                }
            }
            return [result, resultNormalized];
        };

        
        type ColorRangeKey = "color_0_02" | "color_02_04" | "color_04_06" | "color_06_08" | "color_08_1";
        type GroupedData = Record<ColorRangeKey, string[]>;
        type PerModelInput = Record<string, Record<string, any>>;
        type PerModelGrouped = Record<string, GroupedData>;
        const colorScaleList: {[key:string]:[number, string][]} = {
            gnylrd: [
                [0,'rgba(26, 150, 65, 1)'],
                [1/4,'rgba(166, 217, 106, 1)'],
                [2/4,'rgba(255, 255, 0, 1)'],
                [3/4,'rgba(253, 174, 97, 1)'],
                [1,'rgba(215, 25, 28, 1)']
            ],
            viridis: [
                [0,'rgba(68, 1, 84, 1)'],
                [1/4,'rgba(59, 82, 139, 1)'],
                [2/4,'rgba(33, 144, 141, 1)'],
                [3/4,'rgba(94, 201, 98, 1)'],
                [1,'rgba(253, 231, 37, 1)']
            ],
            ylgnbu: [
                [0, 'rgba(255, 255, 204, 1)'],
                [1/4, 'rgba(194, 230, 153, 1)'],
                [2/4, 'rgba(120, 198, 121, 1)'],
                [3/4, 'rgba(49, 163, 84, 1)'],
                [1, 'rgba(0, 104, 55, 1)']
            ],
            blues: [
                [0, 'rgba(239, 243, 255, 1)'],
                [1/4, 'rgba(189, 215, 231, 1)'],
                [2/4, 'rgba(107, 174, 214, 1)'],
                [3/4, 'rgba(33, 113, 181, 1)'],
                [1, 'rgba(8, 69, 148, 1)']
            ],
            orrd: [
                [0, 'rgba(254, 240, 217, 1)'],
                [1/4, 'rgba(253, 212, 158, 1)'],
                [2/4, 'rgba(253, 187, 132, 1)'],
                [3/4, 'rgba(253, 141, 60, 1)'],
                [1, 'rgba(217, 72, 1, 1)']
            ],
            cividis: [
                [0, 'rgba(0, 32, 76, 1)'],
                [1/4, 'rgba(55, 64, 129, 1)'],
                [2/4, 'rgba(94, 109, 171, 1)'],
                [3/4, 'rgba(145, 158, 203, 1)'],
                [1, 'rgba(253, 231, 37, 1)']
            ],
        }

        function groupIdsByNormalizedValuePerModel(normalizedData: Record<string, number>, perModelData: PerModelInput, colorscale:string='gnylrd'): PerModelGrouped {

            const result: PerModelGrouped = {}
            for (const [modelName, elements] of Object.entries(perModelData)) {
                const grouped: GroupedData = {
                    color_0_02: [],
                    color_02_04: [],
                    color_04_06: [],
                    color_06_08: [],
                    color_08_1: []
                }
                for (const id of Object.keys(elements)) {
                const value = normalizedData[id];
                    if (value !== undefined) {
                        const color = colorForValue(value);
                        if (color) {
                            grouped[color].push(id);
                        }
                    }
                }
                result[modelName] = grouped;
            }
            
            highlighter.styles.set('color_0_02', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_02_04', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_04_06', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_06_08', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_08_1', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 1,transparent: false,renderedFaces: 0,})

            highlighter.styles.set('color_0_02_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_02_04_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.25)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_04_06_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.5)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_06_08_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 0.75)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})
            highlighter.styles.set('color_08_1_transparent', {color: new THREE.Color(colorScaleList[colorscale].find(([pos]) => pos === 1)?.[1]),opacity: 0.3,transparent: false,renderedFaces: 0,})

            return result;
        }

        const onColorByCost = async ({target}: {target: BUI.Button | string}) => {
            const startTime_tot = performance.now(); // Start timer
            updateCountLabel({countItems:'loading...', countCostItems:'loading...', countResources:'loading...'})
            const btn = typeof target === 'string' ? target : target.label //read if the clicked button is "color" or "select"
            let [resource] = resourcesDropdown.value //read the value of the resource dropdown menu (single choice)
            let category = categoriesDropdown.value.includes('ALL CATEGORIES') ? categories : categoriesDropdown.value //read the value of category dropdown menu, list is kept because multiple choices are accepted
            const [normalization] = unitMeasureDropdown.value //read the value of normalization by button (single choice)
            const [colorscale] = colorScaleDropdown.value ? colorScaleDropdown.value : 'gnylrd'
            const rangeMin = rangeInputMin.value
            const rangeMax = rangeInputMax.value

            resource = resource == undefined ? 'TotalCost' : resource //if any resource selected use TotalCost as default
            category = category.length == 0 ? categories : category  //if any category selected use al categories as default
            
            if (!resource || !category) {
                updateCountLabel({countItems:0, countCostItems:0, countResources:0})
                return //if one of the two is not selected return the function (nothing will be done)
            }
            
            onClearPanel(panelDown) //clear down panel
            onClearPanel(panelRight)
            panelDown.appendChild(loadingLabel)
            resource!='TotalCost' ? panelDown.label = `${resource} Resource Cost X Elements` : panelDown.label = 'Elements Total Cost' //change the title of the panel
            const gridLayout = floatingGrid.layout as any //change the grid layout
            if (!gridLayout.includes('down')){
                onSetLayout({target:'down'})
            }

            //table type for resource table
            type ResourceTableData = {
                itemModel?: string,
                itemId?: number, //optional because it is not needed in the first row
                Name: string,
                ResourceCost: string,
                NormalizedValue: string,
                ResourceUnitCost: string,
                ElementQuantity: string,
            }
            //resource table
            const resourceTable = document.createElement("bim-table") as BUI.Table<ResourceTableData>
            resourceTable.data = [{
                data: {
                    Name: '',
                    ResourceCost: '',
                    NormalizedValue: '',
                    ResourceUnitCost: '',
                    ElementQuantity: '',
                }
            }]
            resourceTable.data = [] //initialize the table and some settings
            resourceTable.preserveStructureOnFilter = true
            resourceTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
            resourceTable.hiddenColumns = ['itemId','itemModel']

            //step 1: find all cost items ids related to all object of the selected category
            //here query is only created
            finder.create('COSTITEM_REL_CATEGORY', [
                {
                    categories: [/COSTITEM/],
                    relation: { 
                        name: "Controls",
                        query: {
                            categories: Array.isArray(category) ? category.map(c => new RegExp(`^${c}$`)) : [new RegExp(`^${category}$`)]
                        }
                    }
                },
            ])
            //here query is executed
            const startTime_1 = performance.now(); // Start timer
            const costitem_rel_category_ids = await finder.list.get('COSTITEM_REL_CATEGORY')?.test()
            const endTime_1 = performance.now(); // End timer
            const loadTime_1 = ((endTime_1 - startTime_1) / 1000).toFixed(2); // seconds
            console.log(`TIME ${loadTime_1} s: find localIds of all cost items related to selected categories`);
            
            for (const key in costitem_rel_category_ids) { //remove models if there is any founded cost item
                if (costitem_rel_category_ids[key] instanceof Set && costitem_rel_category_ids[key].size === 0) {
                    delete costitem_rel_category_ids[key];
                }
            }
            if (!costitem_rel_category_ids || Object.keys(costitem_rel_category_ids).length == 0) { //return the function if any cost item is found and print the message in the panel
                panelDown.innerHTML = `<bim-label style="padding:15px">Any COST ITEM related to ${category} category.</bim-label>`
                updateCountLabel({countItems:0, countCostItems:0, countResources:0})
                return
            }

            //step 2: get data of found cost items
            const startTime_2 = performance.now(); // Start timer
            const filteredCostItems = await fragments.getData(costitem_rel_category_ids, {
                attributesDefault: false,
                attributes: ['ObjectType'],
                relations: {
                    'Controls': {attributes:true,relations:false},
                    'CostValues': {attributes:true,relations:false}
                    }
                })
            const endTime_2 = performance.now(); // End timer
            const loadTime_2 = ((endTime_2 - startTime_2) / 1000).toFixed(2); // seconds
            console.log(`TIME ${loadTime_2} s: get data of previous cost items localIds`)

            if (resource != 'TotalCost'){ //this means that a resource is selected
                //initialize some maps needed for the process
                const model_resources_Map: {[key:string]:{[key:number]:number}} = {} //map per each model
                const model_costCount_Map: {[key:string]:{[key:number]:number}} = {} //map per each model
                const category_elements_map: {[key:string]:any} = {} //map to associate to each category the related elements
                const elem_resourcesDetails_Map: {[key:number]:{resourceUnitCost:string, elemQuantity:string, resourceDescription:string}[]} = {} //resource details object

                for (const [model,costItems] of Object.entries(filteredCostItems)){ //loop over each model
                    let resourceCurrency = 'nd' //default value, here because is supposed that is used always the same currency in the same project
                    const elem_resources_Map: {[key:number]:number} = {} //map to associate to each element id the related sum of ALL costs of the choosen resource category
                    const elem_costCount_Map: {[key:number]:number} = {} //map to associate to each element id the number of related cost items
                    for (const ci of costItems) { //loop over each filtered cost item (cost items are not ordered)
                        // --> pay attention: multiple cost items could be related to the same object and moreover each cost item could have more than one unit cost of the same category
                        // example: one column with 5 cost items related and each cost item has 1,2,3 or more unit costs of the same category
                        const elemId = (((ci['Controls'] as any)[0] as FRAGS.ItemData)['_localId'] as FRAGS.ItemAttribute).value as number //localId of filtered elements
                        //const elemName = (ci['Controls'] as any)[0]['Name'].value //name of the element
                        //const elemCategory = (ci['Controls'] as any)[0]['_category'].value //category of the element
                        
                        //get cost values
                        const cvId = (ci['CostValues'] as any)[0]._localId.value ? (ci['CostValues'] as any)[0]._localId.value : 'nd'
                        const costValue_Record = await fragments.getData({[model]:new Set<number>([cvId])},{
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: true //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                            }
                        })
                        const costValue = costValue_Record[model][0] as any

                        const elemQuantity = costValue['UnitBasis'][0]['ValueComponent'].value //quantity of the element used to calculate its cost
                        const elemQuantityUnitMeasure = convertUnits(costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value) //quantity of the element used to calculate its cost
                        
                        if (!costValue['Components']) continue //check if there is unit cost --> if no unit cost means no price analysis means go to the nex cot item

                        const priceAnalysisComponents = costValue['Components'][0]['Components'] //components per each unit cost
                        if (priceAnalysisComponents == undefined) continue //check if there is price analysis related to unit cost --> if no price analysis means go to the next cost item

                        elem_resourcesDetails_Map[elemId] = elem_resourcesDetails_Map[elemId] || [] //initialize the array if it does not exist
                        
                        const resourceValuesArray: any[] = [] //array is needed if there are more then one components with the same resource category within the same unitary cost item
                        for (const pac of priceAnalysisComponents){ //loop over each component of single cost item --> so to keep together the more unit costs related to the same resource category
                            if (!pac['Category']) continue //checks if the component has a category
                            if (pac['Category'].value == resource){ //checks the correspondance between components resource category and the one selected
                                const resourceDescription = pac['Description'].value //description of the resource
                                const resourceUnitCost = pac['AppliedValue'][0]['ValueComponent'].value //unit cost of the resource
                                resourceCurrency = convertCurrency(pac['AppliedValue'][0]['UnitComponent'][0]['Currency'].value) //currency of the resource unit cost
                                resourceValuesArray.push(resourceUnitCost*elemQuantity) //multiply the single resource with the quantity to obtain the element specific resource cost
                                elem_resourcesDetails_Map[elemId].push({ //save in the object the details of the single resource
                                    resourceUnitCost: `${resourceUnitCost} ${resourceCurrency}`,
                                    elemQuantity: `${Math.round(elemQuantity*100)/100} ${elemQuantityUnitMeasure}`, //round the quantity to 2 decimal places
                                    resourceDescription: resourceDescription,
                                })
                            }
                        }
                        if (resourceValuesArray.length !== 0){ //checks if the array is not empty (empty = no resources found)
                            //case 1a: more than one resource of the choosen category within the same unit cost item: sums all of the values
                            const resourceCost = resourceValuesArray.length>1 ? resourceValuesArray.reduce((s,v)=>s+v,0) : resourceValuesArray[0]
                            //case 1b: more than one cost item related to the same element: sums all the resources values across them
                            elem_resources_Map[elemId] ? elem_resources_Map[elemId] += resourceCost : elem_resources_Map[elemId] = resourceCost
                            //update cost items count
                            elem_costCount_Map[elemId] ? elem_costCount_Map[elemId] += 1 : elem_costCount_Map[elemId] = 1
                        }
                        //it does not have any sense to add here object to organize elements because until the end of costitems loops could always be new cost items related to the same element
                    }
                    //step 3: organize elements by category in a new object
                    // this map is needed only for creating the table
                    for (const [elemId,resourceCost] of Object.entries(elem_resources_Map)){ //loop over each element id and its total resource cost
                        const item = await fragments.list.get(model)?.getItemsData([Number(elemId)])
                        if (!item) continue //checks if the item exists
                        const elemData = {
                            elemModel: model,
                            elemId: Number(elemId),
                            elemName: (item as any)[0]['Name'].value,
                            totalResourceCost: resourceCost,
                            currency: resourceCurrency,
                        }
                        category_elements_map[(item as any)[0]['_category'].value] ? category_elements_map[(item as any)[0]['_category'].value].push(elemData) : category_elements_map[(item as any)[0]['_category'].value] = [elemData]
                    }
                    //step 4: associate to each model the map of element id and total resource cost
                    //category map is not needed here, because this one is used for selecting and color elements
                    model_resources_Map[model] = elem_resources_Map
                    model_costCount_Map[model] = elem_costCount_Map
                }
    
                //this step is moved here to handle with ranges, in this way the colorMap contains only item within the range
                //step 5.0 flatten map removing models level
                const model_resources_Map_flat = flattenModelMap(model_resources_Map)
                const model_costCount_Map_flat = flattenModelMap(model_costCount_Map) //not properly correct because you can have multiple items with same id, but this is needed to sum count items count
                //step 5.0.1: normalize total resource cost to color across models
                const [colorMap, normalizedValue] = normalizeAndMapToColor(model_resources_Map_flat,colorscale,rangeMin,rangeMax) //use this function to normalize values between 0 and 1 and return color and normalized value

                //step 5: create the table as:
                // category
                //    |--- elements
                //            |--- resources
                //initialize also NormalizedValue column which will be populated after
                let countItems = 0, countResources = 0, countCostItems = 0
                //this works with more models because this map does not divide items by model
                //so the table is correctly created
                for (const [cat,elements] of Object.entries(category_elements_map)) {
                    const tempChildren = []
                    let totalCategoryCost = 0
                    let totalCategoryCurrency = 'nd'
                    for (const elem of elements) {
                        if (!Object.keys(colorMap).includes(elem.elemId.toString())) continue //checks if the item id is outside of the selected form the range or not
                        countItems += 1
                        countCostItems += model_costCount_Map_flat[elem.elemId] //sum all the count of cost items only of the items within the range
                        const tempResourceDetailsChildren = []
                        for (const resourceDetails of elem_resourcesDetails_Map[elem.elemId]){
                            countResources += 1
                            tempResourceDetailsChildren.push({
                                data: {
                                    Name: resourceDetails.resourceDescription,
                                    ResourceUnitCost: resourceDetails.resourceUnitCost,
                                    ElementQuantity: resourceDetails.elemQuantity,
                                }
                            })
                        }
                        const row: BUI.TableGroupData<ResourceTableData> = {
                            data: {
                                itemModel: elem.elemModel,
                                itemId: elem.elemId,
                                Name: elem.elemName,
                                ResourceCost: `${Math.round(elem.totalResourceCost*100)/100} ${elem.currency}`,
                                NormalizedValue: '',
                            },
                            children: tempResourceDetailsChildren
                        }
                        tempChildren.push(row)
                        totalCategoryCost += elem.totalResourceCost
                        totalCategoryCurrency = elem.currency
                    }
                    if (totalCategoryCost==0) continue
                    resourceTable.data.push({
                        data: {
                            Name: cat,
                            ResourceCost: `${Math.round(totalCategoryCost*100)/100} ${totalCategoryCurrency}`,
                        },
                        children: tempChildren
                    })
                }

                const allSelectedItemsModelIdMap = Object.fromEntries(
                    Object.entries(model_resources_Map).map(([k, v]) => [k, new Set(Object.keys(v).map(Number))])
                )

                await highlighter.clear() //reset previous selections of highlighter
                updateCountLabel({countItems:Object.entries(colorMap).length, countCostItems:countCostItems, countResources:countResources})

                //step 6: highlight or color element
                //color rows indipendentely from models
                if (btn == 'Color'){
                    //step 6.2: add the normalized value to the table, pay attention: it is only a render value, it will not be saved in the table
                    //changing this value here is independent from model
                    resourceTable.dataTransform.NormalizedValue = (value, rowData) => {
                        const { itemId } = rowData
                        if (!itemId) return value //if itemId is not defined, return the original value
                        return Math.round(normalizedValue[itemId]*1000)/1000
                    }
                    resourceTable.dataTransform.ResourceCost = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                        const { itemId } = rowData
                        if (!itemId) return value //if itemId is not defined, return the original value
                        return BUI.html`
                            <div style="display: flex; flex-direction:row; justify-content:space-between; min-width:75%">
                                <bim-label>${value}</bim-label>
                                <div style="height:1rem; width: 1rem; border-radius:5px; background-color:${colorMap[Number(itemId)]}; color:${colorMap[Number(itemId)]};">.</div>
                            </div>
                        `
                    }
                    resourceTable.dataTransform.Name = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                        const { itemModel, itemId } = rowData
                        if (!itemId) return value //if itemId is not defined, return the original value
                        return BUI.html`
                            <bim-label
                                @click=${() => {highlighter.highlightByID("select", {[itemModel as string]: new Set<number>([itemId as number])}, false, true)}}
                            >${value}</bim-label>
                        `
                    }
                    
                    //removed homogeneous coloring because in does not make sense to use too many color shades, they will be not recognizable each other
                    //here things comes different because to highlight and color elements the model is needed
                    //so, the highlighting is by model but the color and the normal value is kept from the map calculated outside of this loop
                    const groupedColors = groupIdsByNormalizedValuePerModel(normalizedValue as Record<string,number>, model_resources_Map, colorscale)
                    for (const [model,colorMap] of Object.entries(groupedColors)) {
                        const geomItems = await fragments.list.get(model)?.getItemsIdsWithGeometry()
                        onSetTransparency({[model]:new Set(geomItems)})
                        for (const [color,ids] of Object.entries(colorMap)) {
                            const modelIdMap: OBC.ModelIdMap = { [model]: new Set<number>(ids.map(str => Number(str)).filter(n => !isNaN(n))) } //create the model id map
                            highlighter.highlightByID(color,modelIdMap,false,false) //color elements using highlighter
                        }
                    }

                } else if (btn == 'Select') { //if select button is clicked
                    highlighter.highlightByID("select", allSelectedItemsModelIdMap, false, false) //only select elements removing colors
                }

                sortbyResourcesDropdown.addEventListener('change', (e) => {
                    if (!e.target) return
                    onSortTable(e, resourceTable)}
                )
                //step 7: create the panel component to show the table
                const categoryXResourcePanel = BUI.Component.create<BUI.Panel>(() => {
                    //return the UI of the component
                    return BUI.html`
                        <bim-panel
                            style="display:flex; flex-direction:column; gap:10px; margin:10px; background-color:transparent">
                            <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                                <div style="display: flex; gap: 0.5rem;">
                                    <bim-label>Group by:</bim-label>
                                    <bim-button @click=${(e:Event) => onChangeLevelTable(e,resourceTable)} label="Item" style="max-width:fit-content"></bim-button>
                                    <bim-label>Sort by:</bim-label>
                                    ${sortbyResourcesDropdown}
                                    <bim-button @click=${(e:Event) => onExpandTable(e,resourceTable)} label=${resourceTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                                    <bim-button @click=${() => onSetTransparencyToCostColor()} label="Ghost" tooltip-text="Set non-selected elements transparent. No selection = Reset transparency" style="max-width:fit-content; z-index:100"></bim-button>
                                    <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,resourceTable)}}></bim-text-input>
                                    <bim-button @click=${() => {onClearPanel(panelDown),onClearPanel(panelRight)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                                </div>
                                ${resourceTable ? resourceTable : 'Any resource cost found for this cateogory.'}
                            </div>
                        </bim-panel>
                    `
                })
                //step 8: append the component to the down panel
                panelDown.innerHTML=''
                panelDown.appendChild(categoryXResourcePanel)

            } else if (resource == 'TotalCost'){

                const startTime_4 = performance.now(); // Start timer

                await highlighter.clear() //reset previous selections of highlighter
                const model_volume_map: {[key:string]:any} = {}
                const model_cost_map: {[key:string]:any} = {}
                const model_costCount_map: {[key:string]:any} = {}
                const model_category_map: {[key:string]:any} = {}
                for (const [model,costItems] of Object.entries(filteredCostItems)){
                    const category_item_totalCost_map: {[key:string]:{[key:number]:number}} = {}
                    const item_volume_map: {[key:number]:number|undefined} = {}
                    model_costCount_map[model] = {}
                    for (const ci of costItems){
                        const itemId = (((ci.Controls as any)[0] as FRAGS.ItemData)._localId as FRAGS.ItemAttribute).value as number //localId of filtered elements
                        const itemCategory = (((ci.Controls as any)[0] as FRAGS.ItemData)._category as FRAGS.ItemAttribute).value as string //localId of filtered elements
                        const costItemObjectType = (ci['ObjectType'] as FRAGS.ItemAttribute).value as string

                        //create a cost count per each item
                        model_costCount_map[model][itemId] ? model_costCount_map[model][itemId] += 1 : model_costCount_map[model][itemId] = 1
                        //get cost values to get cost item cost
                        const cvId = (ci['CostValues'] as any)[0]._localId.value ? (ci['CostValues'] as any)[0]._localId.value : 'nd'
                        const costValue_Record = await fragments.getData({[model]:new Set<number>([cvId])},{
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: true //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                            }
                        })
                        const costValue = costValue_Record[model][0] as any
                        
                        let costItemCost = ((costValue.AppliedValue as any)[0].ValueComponent as FRAGS.ItemAttribute).value

                        if (normalization == 'Volume'){
                            const itemVolume = await fragments.list.get(model)?.getItemsVolume([itemId])
                            item_volume_map[itemId] = itemVolume
                            costItemCost = itemVolume ? costItemCost/itemVolume : costItemCost
                        }
                        
                        if (costItemObjectType != 'Cost assignment') continue //ATTENTION!!! this value is USERDEFINED so it could be different in projects
                        category_item_totalCost_map[itemCategory] ? category_item_totalCost_map[itemCategory]=category_item_totalCost_map[itemCategory] : category_item_totalCost_map[itemCategory] = {}
                        category_item_totalCost_map[itemCategory][itemId] ? category_item_totalCost_map[itemCategory][itemId]+=costItemCost : category_item_totalCost_map[itemCategory][itemId]=costItemCost
                    }
                    model_cost_map[model] = Object.assign({}, ...Object.values( category_item_totalCost_map )) //remove category level and flat the map
                    model_category_map[model] = category_item_totalCost_map
                    model_volume_map[model] = item_volume_map
                }

                //const model_category_map_flat = flattenModelMap(model_category_map)
                const model_cost_map_flat = flattenModelMap(model_cost_map)
                const model_volume_map_flat = flattenModelMap(model_volume_map)

                const endTime_4 = performance.now(); // End timer
                const loadTime_4 = ((endTime_4 - startTime_4) / 1000).toFixed(2); // seconds
                console.log(`TIME ${loadTime_4} s: whole process of getting total costs data`);

                //normalize cost to get colors and filter according to choosen range
                const normalized_cost: {[key:string]:number} = {}
                let colorMap: Record<string, string>
                let normalizedValue: Record<string, string|number>
                if (normalization=='Volume'){
                    for (const [itemId,cost] of Object.entries(model_cost_map_flat)){
                        normalized_cost[itemId] = cost / model_volume_map_flat[itemId]
                    }
                    [colorMap,normalizedValue] = normalizeAndMapToColor(normalized_cost,colorscale,rangeMin,rangeMax)
                } else {
                    [colorMap,normalizedValue] = normalizeAndMapToColor(model_cost_map_flat,colorscale,rangeMin,rangeMax)
                }

                //filter all the found elements according to the range
                const allSelectedItemsModelIdMap = Object.fromEntries(
                    Object.entries(model_cost_map).map(([k, v]) => [
                        k,
                        new Set(Object.keys(v)
                            .map(Number)
                            .filter(num => Object.keys(colorMap).includes(num.toString()))
                        )
                    ])
                )
                
                //counts filtered elements
                const countItems = Object.values(allSelectedItemsModelIdMap)
                    .reduce((sum, set) => sum + set.size, 0)
                //sums the cost items counts related to selected elements
                const countCostItems = Object.entries(allSelectedItemsModelIdMap)
                    .flatMap(([k, set]) =>
                        Array.from(set)
                        .map(id => model_costCount_map[k]?.[id] ?? 0)
                    )
                    .reduce((a, b) => a + b, 0);

                //update counts labels
                updateCountLabel({
                    countItems:countItems,
                    countCostItems:countCostItems,
                    countResources:0
                })

                if (btn=='Color') {
                    highlighter.highlightByID("select", {}, true, false)
                    
                    const startTime_5 = performance.now(); // Start timer
                    await onOpenElementXCostPanel(allSelectedItemsModelIdMap)
                    const endTime_5 = performance.now(); // End timer
                    const loadTime_5 = ((endTime_5 - startTime_5) / 1000).toFixed(2); // seconds
                    console.log(`TIME ${loadTime_5} s: total time to create and render cost table`);

                    const elementXCostTable = document.getElementById('elementXCostTable') as BUI.Table
                    if (normalization == 'Volume') {
                        elementXCostTable.dataTransform.Cost = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { ItemId } = rowData
                            if (!ItemId) return value //if ItemId is not defined, return the original value
                            return BUI.html`
                                <div style="display: flex; flex-direction:row; justify-content:space-between; min-width:50%">
                                    <bim-label>${value}</bim-label>
                                    <div style="height:1rem; width: 1rem; border-radius:5px; background-color:${colorMap[Number(ItemId)]}; color:${colorMap[Number(ItemId)]};">.</div>
                                </div>
                            `
                        }
                        elementXCostTable.dataTransform.ItemVolume = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { ItemId } = rowData
                            if (!ItemId) return value //if ItemId is not defined, return the original value
                            const volume = model_volume_map_flat[Number(ItemId)]
                            if(!volume) return value
                            return BUI.html`
                                <bim-label>${Math.round(volume*1000)/1000} m³</bim-label>
                            `
                        }
                        elementXCostTable.dataTransform.NormalizedCost = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { ItemId, Currency } = rowData
                            if (!ItemId) return value //if ItemId is not defined, return the original value
                            const normCost = normalized_cost[Number(ItemId)]
                            const normValue = normalizedValue[Number(ItemId)] as number
                            if(normCost==null || normValue==null) return value
                            return BUI.html`
                                <bim-label>${Math.round(normCost*100)/100} ${Currency}/m³ (${Math.round(normValue*100)/100})</bim-label>
                            `
                        }
                        elementXCostTable.hiddenColumns = ['ComponentsCostValues','ItemId', 'Currency', 'IfcClass']
                    } else {
                        elementXCostTable.dataTransform.Cost = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { Model, ItemId } = rowData
                            if (!ItemId) return value //if ItemId is not defined, return the original value
                            return BUI.html`
                                <div style="display: flex; flex-direction:row; justify-content:space-between; min-width:75%">
                                    <bim-label>${value}</bim-label>
                                    <div style="height:1rem; width: 1rem; border-radius:5px; background-color:${colorMap[Number(ItemId)]}; color:${colorMap[Number(ItemId)]};">.</div>
                                </div>
                            `
                        }
                    }
                    
                    //removed homogeneous coloring because in does not make sense to use too many color shades, they will be not recognizable each other
                    const startTime_8 = performance.now(); // Start timer
                    //this is to color items within a range of 5 colors (faster)
                    const groupedColors = groupIdsByNormalizedValuePerModel(normalizedValue as Record<string,number>, model_cost_map, colorscale)
                    for (const [model,colorMap] of Object.entries(groupedColors)) {
                        const geomItems = await fragments.list.get(model)?.getItemsIdsWithGeometry()
                        onSetTransparency({[model]:new Set(geomItems)})
                        for (const [color,ids] of Object.entries(colorMap)) {
                            const modelIdMap: OBC.ModelIdMap = { [model]: new Set<number>(ids.map(str => Number(str)).filter(n => !isNaN(n))) } //create the model id map
                            highlighter.highlightByID(color,modelIdMap,false,false) //color elements using highlighter
                        }
                    }
                    const endTime_8 = performance.now(); // End timer
                    const loadTime_8 = ((endTime_8 - startTime_8) / 1000).toFixed(2); // seconds
                    console.log(`TIME ${loadTime_8} s: color elements using ranges color map (> 100 items)`);

                } else if (btn == 'Select') { //if select button is clicked
                    highlighter.highlightByID("select", allSelectedItemsModelIdMap, false, false) //only select elements removing colors
                    await onOpenElementXCostPanel(allSelectedItemsModelIdMap)
                }
            }
            
            const endTime_tot = performance.now(); // End timer
            const loadTime_tot = ((endTime_tot - startTime_tot) / 1000).toFixed(2); // seconds
            console.log(`TIME ${loadTime_tot} s: total time to complete the whole process of coloring`);
        }
        // #endregion

        // #region UI PANELS   
        const panelLeft = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="BIM PANEL"
                style="background-color:rgba(0,0,0,0.85);">
            </bim-panel>
            `;
        })
        const panelRight = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="Right Panel"
                style="background-color:rgba(0,0,0,0.85);">
            </bim-panel>
            `;
        })
        const panelDown = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="Down Panel"
                style="background-color:rgba(0,0,0,0.85); display:flex">
            </bim-panel>
            `;
        })
        let previousIsolatedMaterialsForPostproduction = world.renderer!.postproduction.basePass.isolatedMaterials
        const panelWorldSettings = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
                <bim-panel
                    label="World Visibility Settings"
                    style="background-color:rgba(0, 0, 0, 0.45);">
                    <bim-panel-section label='Preset Styles'>
                        <bim-button label='Basic'
                            @click="${async () => {
                                const transparencyOpacity = document.getElementById('transparency-opacity') as BUI.NumberInput
                                const transparencyColor = document.getElementById('transparency-color') as BUI.ColorInput
                                const gridVisible = document.getElementById('grid-visible') as BUI.Checkbox
                                const gridColor = document.getElementById('grid-color') as BUI.ColorInput
                                const gridPrimarySize = document.getElementById('grid-primary-size') as BUI.NumberInput
                                const gridSecondarySize = document.getElementById('grid-secondary-size') as BUI.NumberInput
                                const ambientBackgroundColor = document.getElementById('ambient-background-color') as BUI.ColorInput
                                const ambientDirectionalLightsIntensity = document.getElementById('ambient-directional-lights-intensity') as BUI.NumberInput
                                const ambientAmbientLightsIntensity = document.getElementById('ambient-ambient-lights-intensity') as BUI.NumberInput
                                const postproductionEnable = document.getElementById('postproduction-enable') as BUI.Checkbox
                                const postproductionStyle = document.getElementById('postproduction-style') as BUI.Dropdown
                                const postproductionAmbientOcclusionIntensity = document.getElementById('postproduction-ambient-occlusion-intensity') as BUI.NumberInput

                                highlighter.styles.get('transparent')!.opacity = transparencyOpacity.value = 0.5
                                transparencyColor.color = "#7b7b7b"
                                highlighter.styles.get('transparent')!.color = new THREE.Color("#7b7b7b")
                                await highlighter.updateColors()

                                grid.visible = gridVisible.checked = true
                                gridColor.color = "#c1c1c1"
                                grid.config.color = new THREE.Color("#c1c1c1")
                                grid.config.primarySize = gridPrimarySize.value = 1
                                grid.config.secondarySize = gridSecondarySize.value = 10

                                ambientBackgroundColor.color = "#3b3c4f"
                                world.scene.config.backgroundColor = new THREE.Color("#3b3c4f")
                                world.scene.config.directionalLight.intensity = ambientDirectionalLightsIntensity.value = 1.5
                                world.scene.config.ambientLight.intensity = ambientAmbientLightsIntensity.value = 1

                                world.renderer!.postproduction.enabled = postproductionEnable.checked = false
                                postproductionStyle.value = ['Basic']
                                world.renderer!.postproduction.style = OBCF.PostproductionAspect.COLOR
                                
                                postproductionAmbientOcclusionIntensity.value = 0.5
                                setAmbientOcclusionParameters(0.5)
                            }}"
                        ></bim-button>
                        <bim-button label='Ambient Occlusion with Transparency'
                            @click="${async () => {
                                const transparencyOpacity = document.getElementById('transparency-opacity') as BUI.NumberInput
                                const transparencyColor = document.getElementById('transparency-color') as BUI.ColorInput
                                const gridVisible = document.getElementById('grid-visible') as BUI.Checkbox
                                const ambientDirectionalLightsIntensity = document.getElementById('ambient-directional-lights-intensity') as BUI.NumberInput
                                const ambientAmbientLightsIntensity = document.getElementById('ambient-ambient-lights-intensity') as BUI.NumberInput
                                const postproductionEnable = document.getElementById('postproduction-enable') as BUI.Checkbox
                                const postproductionStyle = document.getElementById('postproduction-style') as BUI.Dropdown
                                const postproductionAmbientOcclusionIntensity = document.getElementById('postproduction-ambient-occlusion-intensity') as BUI.NumberInput

                                highlighter.styles.get('transparent')!.opacity = transparencyOpacity.value = 0.06
                                transparencyColor.color = "#d6d6d6"
                                highlighter.styles.get('transparent')!.color = new THREE.Color("#d6d6d6")
                                await highlighter.updateColors()

                                grid.visible = gridVisible.checked = false

                                world.scene.config.directionalLight.intensity = ambientDirectionalLightsIntensity.value = 3.3
                                world.scene.config.ambientLight.intensity = ambientAmbientLightsIntensity.value = 1.1

                                world.renderer!.postproduction.enabled = postproductionEnable.checked = true
                                postproductionStyle.value = ['Color Shadows']
                                world.renderer!.postproduction.style = OBCF.PostproductionAspect.COLOR_SHADOWS
                                
                                postproductionAmbientOcclusionIntensity.value = 0.67
                                setAmbientOcclusionParameters(0.67)
                            }}"
                        ></bim-button>
                    </bim-panel-section>
                    <bim-panel-section label='Transparency'>
                        <bim-number-input 
                            id='transparency-opacity' slider step="0.01" label="Opacity" value="0.5" min="0" max="1"
                            @change="${async ({ target }: { target: BUI.NumberInput }) => {
                                (highlighter.styles.get('transparent') as any).opacity = target.value
                                await highlighter.updateColors()
                            }}">
                        </bim-number-input>
                        <bim-color-input
                            id="transparency-color" label="Color" color="#7b7b7b" 
                            @input="${async ({ target }: { target: BUI.ColorInput }) => {
                                (highlighter.styles.get('transparent') as any).color = new THREE.Color(target.color)
                                await highlighter.updateColors()
                            }}">
                        </bim-color-input>
                    </bim-panel-section>
                    <bim-panel-section label='Grid'>
                        <bim-checkbox
                            id="grid-visible" checked label="Visible"
                            @change="${({ target }: { target: BUI.Checkbox }) => {
                                grid.visible = target.value
                            }}">
                        </bim-checkbox>
                        <bim-color-input
                            id="grid-color" label="Color" color="#c1c1c1"
                            @input="${({ target }: { target: BUI.ColorInput }) => {
                                grid.config.color = new THREE.Color(target.color);
                            }}">
                        </bim-color-input>
                        <bim-number-input 
                            id="grid-primary-size" slider step="0.5" label="Primary size" value="1" min="0.5" max="10" style='min-width:100px'
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                grid.config.primarySize = target.value
                            }}">
                        </bim-number-input>
                        <bim-number-input 
                            id="grid-secondary-size" slider step="1" label="Secondary size" value="10" min="1" max="50"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                grid.config.primarySize = target.value
                            }}">
                        </bim-number-input>
                    </bim-panel-section>
                    <bim-panel-section label='Ambient'>
                        <bim-color-input
                            id="ambient-background-color" label="Background Color" color="#3b3c4f" 
                            @input="${({ target }: { target: BUI.ColorInput }) => {
                                world.scene.config.backgroundColor = new THREE.Color(target.color)
                            }}">
                        </bim-color-input>
                        <bim-number-input 
                            id="ambient-directional-lights-intensity" slider step="0.1" label="Directional lights intensity" value="1.5" min="0.1" max="10"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                world.scene.config.directionalLight.intensity = target.value;
                            }}">
                        </bim-number-input>
                        <bim-number-input 
                            id="ambient-ambient-lights-intensity" slider step="0.1" label="Ambient light intensity" value="1" min="0.1" max="5"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                world.scene.config.ambientLight.intensity = target.value;
                            }}">
                        </bim-number-input>
                    </bim-panel-section>
                    <bim-panel-section label='Postproduction'>
                        <bim-checkbox label="Enable"
                            id="postproduction-enable" @change="${({ target }: { target: BUI.Checkbox }) => {
                                world.renderer!.postproduction.enabled = target.value
                            }}">
                        </bim-checkbox>
                        <bim-dropdown id="postproduction-style" required label="Style"
                                @change="${({ target }: { target: BUI.Dropdown }) => {
                                const result = target.value[0] as OBCF.PostproductionAspect;
                                world.renderer!.postproduction.style = result;
                            }}">
                            <bim-option id="postproduction-style-basic" style="padding:0 0.5rem 0 0.5rem" checked label="Basic" value="${OBCF.PostproductionAspect.COLOR}"></bim-option>
                            <bim-option id="postproduction-style-pen" style="padding:0 0.5rem 0 0.5rem" label="Pen" value="${OBCF.PostproductionAspect.PEN}"></bim-option>
                            <bim-option id="postproduction-style-shadowed-pen" style="padding:0 0.5rem 0 0.5rem" label="Shadowed Pen" value="${OBCF.PostproductionAspect.PEN_SHADOWS}"></bim-option>
                            <bim-option id="postproduction-style-color-pen" style="padding:0 0.5rem 0 0.5rem" label="Color Pen" value="${OBCF.PostproductionAspect.COLOR_PEN}"></bim-option>
                            <bim-option id="postproduction-style-color-shadows" style="padding:0 0.5rem 0 0.5rem" label="Color Shadows" value="${OBCF.PostproductionAspect.COLOR_SHADOWS}"></bim-option>
                            <bim-option id="postproduction-style-color-pen-shadows" style="padding:0 0.5rem 0 0.5rem" label="Color Pen Shadows" value="${OBCF.PostproductionAspect.COLOR_PEN_SHADOWS}"></bim-option>
                        </bim-dropdown>
                        <bim-number-input
                            id="postproduction-ambient-occlusion-intensity" slider step="0.01" label="Ambient occlusion intensity"
                            value="0.5" min="0.1" max="1"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                setAmbientOcclusionParameters(target.value)
                        }}">
                        </bim-number-input>
                    </bim-panel-section>
                </bim-panel>
            `
        })
        // #endregion

        // #region GLOBAL VARIABLES
        // #endregion

        // #region ADVANCED COMPONENTS
        const loadingLabel = BUI.Component.create<BUI.Label>(()=>{
            return BUI.html`
                <bim-label style='padding:20px'>Loading...</bim-label>
            `
        })
        interface countLabelUI {
            countItems: number | 'loading...',
            countCostItems: number | 'loading...',
            countResources: number | 'loading...',
        }
        const [countLabel, updateCountLabel] = BUI.Component.create<HTMLDivElement, countLabelUI>((state: countLabelUI) => {
            const { countItems, countResources, countCostItems } = state
            const resDisplay: string = (countResources==0||countResources=='loading...') ? 'none' : ''
            const colorRangeDisplay : string = (Number(countItems)<100||countItems=='loading...') ? 'none' : ''
            return BUI.html`
                <div style="margin-top:5px; border-top:1px solid var(--bim-ui_bg-contrast-20); padding-top:0.5rem">
                    <bim-label>Elements count: ${countItems}</bim-label>
                    <bim-label>Cost Items count: ${countCostItems}</bim-label>
                    <bim-label style="display:${resDisplay}">Resources count: ${countResources}</bim-label>
                    <bim-label style="display:${colorRangeDisplay}; margin-top: 10px" icon="ion:warning-outline">More than 100 elements: geometries colors remapped in five ranges.</bim-label>
                </div>
            `;
            },
            { countItems: 0, countResources: 0, countCostItems: 0},
        );
        const noCostItemsLabel = BUI.Component.create<BUI.Label>(() => {
            return BUI.html`
                <bim-label style="padding:15px">Any COST ITEM related to selected elements!</bim-label>
            `;
            }
        );
        const modelsListPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [modelsList] = BUIC.tables.modelsList({
                components,
                metaDataTags: ["schema"],
                actions: { download: false },
            });
            return BUI.html`
                <bim-panel-section label="Loaded Models" icon="material-symbols:upload-rounded">
                    ${modelsList}
                </bim-panel-section>
            `
        })
        const spatialTreePanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [spatialTree] = BUIC.tables.spatialTree({
                components,
                models: []
            });
            spatialTree.preserveStructureOnFilter = true
            return BUI.html`
                <bim-panel-section label='Spatial Structure' icon="ri:node-tree">
                    <bim-text-input @input=${(e:Event)=>{onSearch(e,spatialTree)}} placeholder="Search..." debounce="200"></bim-text-input>
                    ${spatialTree}
                </bim-panel-section>
            `
            /*return BUI.html`
                <bim-panel-section label='Spatial Structure' icon="ri:node-tree" collapsed>
                    <bim-label>Disabled ...</bim-label>
                </bim-panel-section>
            `*/
        })
        const [selectedItemsCount, updateSelectedItemsCount] = BUI.Component.create<BUI.Label,{count:number}>((state:{count:number}) => {
            let loadStatement: string = ''
            if (state.count < 6){
                loadStatement = ''
            } else {
                loadStatement = '→ Click the Load button to show properties'
            }
            return BUI.html`
                <bim-label>Selected items count: ${state.count} ${loadStatement}</bim-label>
            `},
            { count: 0 },
        )
        const propertiesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
                components,
                modelIdMap: {},
            });            
            propertiesTable.preserveStructureOnFilter = true;
            propertiesTable.indentationInText = false;
            highlighter.events.select.onHighlight.add((modelIdMap) => {
                const count = Object.values(modelIdMap).reduce((sum, currentSet) => sum + currentSet.size, 0)
                updateSelectedItemsCount({ count })
                if (count < 6){
                    updatePropertiesTable({ modelIdMap })
                } else {
                    updatePropertiesTable({ modelIdMap: {} })
                }
            });
            highlighter.events.select.onClear.add(() => {
                updatePropertiesTable({ modelIdMap: {} })
                updateSelectedItemsCount({ count:0 })
            });
            return BUI.html`
                <bim-panel-section label='Properties' icon="hugeicons:property-new">
                    ${selectedItemsCount}
                    <div style="display: flex; gap: 0.5rem;">
                        <bim-button @click=${() => onLoadTable(updatePropertiesTable)} label="Load" style="max-width:fit-content"></bim-button>
                        <bim-button @click=${(e:Event) => onExpandTable(e,propertiesTable)} label=${propertiesTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                        <bim-text-input @input=${(e:Event)=>{onSearch(e,propertiesTable)}} placeholder="Search..." debounce="200"></bim-text-input>
                    </div>
                    ${propertiesTable}
                </bim-panel-section>
            `
        })        
        const selectElementByGuidPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            function parseCommaSeparatedString(input: string): string[] {
                // Rimuove eventuali spazi prima/dopo ogni elemento
                const trimmed = input.trim();
                // Verifica se ci sono virgole nella stringa
                if (trimmed.includes(',')) {
                    // Divide in base alla virgola ed elimina spazi extra da ogni elemento
                    return trimmed.split(',').map(item => item.trim());
                } else {
                    // Nessuna virgola: restituisce un array con la stringa intera
                    return [trimmed];
                }
            }
            //not used in the viewer because requires too many time to load properties
            const onSelectAllElements = async () => {
                const frMap: OBC.ModelIdMap = {}
                for (const [entry,entryfr] of fragments.list.entries()){
                    const localids = await entryfr.getLocalIds()
                    const singleFrMap: OBC.ModelIdMap = {
                        [entry] : new Set<number>([...localids])
                    }
                    Object.assign(frMap, singleFrMap)
                }
                //highlighter.highlightByID("select", frMap, true, true) //pay attention because too many elements to load their properties
            }
            const onSelectElementByGuid = async () => {
                const target = document.getElementById('search-by-guid') as BUI.TextInput
                const guids = parseCommaSeparatedString(target.value)
                const frMap = await fragments.guidsToModelIdMap(guids)
                console.log(frMap)
                highlighter.highlightByID("select", frMap, true, true)
            }
            return BUI.html`
            <bim-panel-section
                label="Select elements by IfcGuid",
                icon="material-symbols:highlight-mouse-cursor-rounded"
                >
                <bim-label>
                    Separate GUIDs with a comma ( , ) to select multiple elements
                </bim-label>
                <div style="display:flex; flex-direction:row; gap:0.5rem">
                    <bim-text-input
                        id="search-by-guid",
                        placeholder="Type elements IfcGuid..."
                    >
                    </bim-text-input>
                    <bim-button
                        label="Select",
                        @click=${onSelectElementByGuid}
                        style="max-width:fit-content"
                    >
                    </bim-button>
                </div>
            </bim-panel-section>`;
        })

        // #region DROPDOWN MENUS
        //color scale dropdown
        const colorScaleDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="colorScale" label='Color Scale' icon='ic:outline-color-lens' style="min-width:100px">
                <bim-option label='Green-Yellow-Red' value='gnylrd' style="color:black; padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(26, 150, 65, 1),rgba(166, 217, 106, 1),rgba(255, 255, 0, 1),rgba(253, 174, 97, 1),rgba(215, 25, 28, 1))"></bim-option>
                <bim-option label='Yellow-Green-Blue' value='ylgnbu' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(255, 255, 204, 1), rgba(194, 230, 153, 1), rgba(120, 198, 121, 1), rgba(49, 163, 84, 1), rgba(0, 104, 55, 1))"></bim-option>
                <bim-option label='Orange-Red' value='orrd' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(254, 240, 217, 1), rgba(253, 212, 158, 1), rgba(253, 187, 132, 1), rgba(253, 141, 60, 1), rgba(217, 72, 1, 1))"></bim-option>
                <bim-option label='Blues' value='blues' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(239, 243, 255, 1), rgba(189, 215, 231, 1), rgba(107, 174, 214, 1), rgba(33, 113, 181, 1), rgba(8, 69, 148, 1))"></bim-option>
                <bim-option label='Viridis' value='viridis' style="padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(68, 1, 84, 1),rgba(59, 82, 139, 1),rgba(33, 144, 141, 1),rgba(94, 201, 98, 1),rgba(253, 231, 37, 1))"></bim-option>
                <bim-option label='Cividis' value='cividis' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(0, 32, 76, 1), rgba(55, 64, 129, 1), rgba(94, 109, 171, 1), rgba(145, 158, 203, 1), rgba(253, 231, 37, 1))"></bim-option>
            </bim-dropdown>`,
        )
        //sort by resources dropdown menu
        const sortbyResources: string[] = ['ResourceCost (up)','ResourceCost (down)', 'Name (up)', 'Name (down)']
        sortbyResources.sort() //sort resources
        const sortbyResourcesIcon: {[key:string]:string} = {
            'ResourceCost (down)': 'gravity-ui:bars-ascending-align-left-arrow-down',
            'ResourceCost (up)': 'gravity-ui:bars-descending-align-left-arrow-up',
            'Name (down)': 'gravity-ui:bars-ascending-align-left-arrow-down',
            'Name (up)': 'gravity-ui:bars-descending-align-left-arrow-up',
        }
        const sortbyResourcesDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="sortbyResources" style="max-width:fit-content">
                ${sortbyResources.map(
                    (x) => BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px" icon=${sortbyResourcesIcon[x]}></bim-option>`
                )}
            </bim-dropdown>`,
        )
        //sort by total cost dropdown menu
        const sortbyTotalCost: string[] = ['Cost (up)','Cost (down)', 'Name (up)', 'Name (down)']
        sortbyTotalCost.sort() //sort resources
        const sortbyTotalCostIcon: {[key:string]:string} = {
            'Cost (down)': 'gravity-ui:bars-ascending-align-left-arrow-down',
            'Cost (up)': 'gravity-ui:bars-descending-align-left-arrow-up',
            'Name (down)': 'gravity-ui:bars-ascending-align-left-arrow-down',
            'Name (up)': 'gravity-ui:bars-descending-align-left-arrow-up',
        }
        const sortbyTotalCostDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="sortbyTotalCost" style="max-width:fit-content">
                ${sortbyTotalCost.map(
                    (x) => BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px" icon=${sortbyTotalCostIcon[x]}></bim-option>`
                )}
            </bim-dropdown>`,
        )
        //resources dropdown menu
        const resources: string[] = ['TotalCost','Labor','Equipment','Material']
        resources.sort() //sort resources
        const resourcesIcon: {[key:string]:string} = {
            TotalCost: 'ic:round-monetization-on',
            Labor: 'hugeicons:labor',
            Equipment: 'fa-solid:tools',
            Material: 'game-icons:brick-pile',
        }
        const resourcesDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="resources" label='Resource' icon='clarity:resource-pool-outline-alerted'>
                ${resources.map(
                    (x) => BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px" icon=${resourcesIcon[x]}></bim-option>`
                )}
            </bim-dropdown>`,
        );
        //categories dropdown menu
        //capire come aggiungere tutte le categorie
        //const categories = await model.getCategories();
        const categories = ['ALL CATEGORIES', 'IFCWALL','IFCCOLUMN','IFCWINDOW','IFCBUILDINGELEMENTPART', 'IFCBEAM', 'IFCWALLSTANDARDCASE', 'IFCROOF', 'IFCFLOOR', 'IFCRAILING', 'IFCDOOR', 'IFCSITE', 'IFCPROJECT', 'IFCSLAB', 'IFCCEILING', 'IFCFURNITURE', 'IFCBUILDINGELEMENTPROXY', 'IFCFLOWSEGMENT', 'IFCBUILDINGELEMENTPROXY',
            'IFCFLOWFITTING', 'IFCFLOWTERMINAL']
        interface categoriesUI {
            listCategories: string[]
        }
        const [categoriesDropdown,updateCategoriesDropdown] = BUI.Component.create<BUI.Dropdown, categoriesUI>((state: categoriesUI) => {
            const { listCategories } = state
            listCategories.sort()
            return BUI.html`<bim-dropdown name="categories" label='Category' icon='material-symbols:category-rounded' multiple>
                ${listCategories.map((x) => {
                    if (x == 'ALL CATEGORIES') {
                        return BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px; border-bottom: 2px solid black"></bim-option>`
                    } else {
                        return BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px"></bim-option>`
                    }
                }
                )}
            </bim-dropdown>`},
            { listCategories: categories}
        )
        //measure units dropdown menu
        const unitMeasure = ['None','Volume']
        const unitMeasureDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="unitMeasure" label='Normalize Cost By' icon='gravity-ui:chart-area-stacked-normalized'>
                ${unitMeasure.map(
                    (x) => BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px"></bim-option>`,
                )}
            </bim-dropdown>`,
        )
        unitMeasureDropdown.style.display = 'none'
        resourcesDropdown.addEventListener('change', (event) => {
            if (!event.target) return
            if ((event.target as any).value[0] == 'TotalCost'){
                unitMeasureDropdown.style.display = ''
            } else {
                unitMeasureDropdown.style.display = 'none'
            }
        });

        const rangeInputMin = BUI.Component.create<BUI.NumberInput>(() => {
            return BUI.html`
                <bim-number-input slider min='0' max='0.99' value='0' sensitivity='0.3' step='0.01' style='max-width:8.12rem'/>
            `
        })
        rangeInputMin.addEventListener('change', (event) => {
            if (!event.target) return
            const minValue = (event.target as any).value
            if (rangeInputMax.value < minValue) {
                rangeInputMax.value = minValue + 0.01
            }
        });
        const rangeInputMax = BUI.Component.create<BUI.NumberInput>(() => {
            return BUI.html`
                <bim-number-input slider min='0.01' max='1' value='1' sensitivity='0.3' step='0.01' style='max-width:8.12rem'/>
            `
        })
        rangeInputMax.addEventListener('change', (event) => {
            if (!event.target) return
            const maxValue = (event.target as any).value
            if (rangeInputMin.value > maxValue) {
                rangeInputMin.value = maxValue - 0.01
            }
        });

        const colorResourcesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            return BUI.html`
                <bim-panel-section
                    label = "Cost Analysis"
                    icon = "ic:round-format-color-fill">
                    ${colorScaleDropdown}
                    ${resourcesDropdown}
                    ${categoriesDropdown}
                    ${unitMeasureDropdown}
                    <div style="display:flex; gap: 1rem">
                        <bim-label icon='oui:token-range'>Range</bim-label>
                        <bim-button tooltip-text="Info: this range filters the items resulting from the above choices" icon='material-symbols-light:info-outline-rounded' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                        <div style="display:flex; flex-direction:column; gap:0.75rem; flex-grow:1">
                            <div style="display: flex; justify-content:space-between">
                                <bim-label icon = 'material-symbols:line-start-circle-outline-rounded'>Min</bim-label>
                                ${rangeInputMin}
                            </div>
                            <div style="display: flex; justify-content:space-between">
                                <bim-label icon = 'material-symbols:line-end-circle-outline-rounded'>Max</bim-label>
                                ${rangeInputMax}
                            </div>
                        </div>
                    </div>
                    ${countLabel}
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <bim-button label='Color' @click=${onColorByCost}></bim-button>
                        <bim-button label='Select' @click=${onColorByCost}></bim-button>
                    </div>
                </bim-panel-section>
            `
        })
        // #endregion

        //append components in panels
        panelLeft.appendChild(modelsListPanelSection)
        panelLeft.appendChild(selectElementByGuidPanelSection)
        panelLeft.appendChild(spatialTreePanelSection)
        panelLeft.appendChild(propertiesPanelSection)
        panelLeft.appendChild(colorResourcesPanelSection)

        //advanced costs functions and components
        const onOpenElementXCostPanel = async (modelIdMap:OBC.ModelIdMap|undefined=undefined) => {
            //clean panel
            panelDown.innerHTML=''
            panelDown.appendChild(loadingLabel)
            panelDown.label = 'Element X Costs Panel'

            //get selected elements
            //const selection = highlighter.selection.select ? highlighter.selection.select : await getAllItems() //selection = selected items or all items
            let selection: OBC.ModelIdMap = {}
            if (modelIdMap != undefined){
                selection = modelIdMap
            } else {
                selection = highlighter.selection.select
            }
            for (const key in selection) { //remove models if there is any founded cost item
                if (selection[key] instanceof Set && selection[key].size === 0) {
                    delete selection[key];
                }
            }
            const startTime_3 = performance.now(); // Start timer
            const selectionData = await fragments.getData(selection, {
                        attributesDefault: true,
                        relations: {
                            'HasAssignments': {
                                attributes: true,
                                relations: false //ATTENTION: in large models the requesto for relations here could stop the viewer completely !!!
                                //--> these relations allow to read complex attributes of cost items, i.e. cost values.
                                // without these it is not possible to do anything, so it is necessary to take the cost item ID and re-derive the object
                                // with getData from fragments or getItemsData from model (= fragments.list.values())
                        }}
                    })
            const endTime_3 = performance.now(); // End timer
            const loadTime_3 = ((endTime_3 - startTime_3) / 1000).toFixed(2); // seconds
            console.log(`TIME ${loadTime_3} s: get data of selected items (within onOpenElementXCostPanel method)`)
            console.log('selection data: \n', selectionData)

            const startTime_6 = performance.now(); // Start timer
            // #region INITIALIZE TABLES
            //tables types
            type costXelementTableData = {
                Class: string,
                Name: string,
                Cost: string,
                UnitCost: string,
                Quantity: string,
            }
            type elementXcostTableData = {
                ItemId?: number,
                ItemVolume?: number,
                NormalizedCost?: number,
                Currency: string,
                Name: string,
                Description: string,
                Cost: string,
                UnitCost: string,
                Quantity: string,
                ComponentsCostValues: any,
                IfcClass: string,
                Model?: string,
            }
            //tables
            const costXelementTable = document.createElement("bim-table") as BUI.Table<costXelementTableData>
            costXelementTable.data = [{
                data: {
                    Class: '',
                    Name: '',
                    Cost: '',
                    UnitCost: '',
                    Quantity: ''
                }
            }]
            costXelementTable.data = []
            costXelementTable.preserveStructureOnFilter = true

            const elementXcostTable = document.createElement("bim-table") as BUI.Table<elementXcostTableData>
            elementXcostTable.id = 'elementXCostTable'
            elementXcostTable.data = [{
                data: {
                    Name: '',
                    Description: '',
                    Cost: '',
                    NormalizedCost: 0,
                    ItemVolume: 0,
                    UnitCost: '',
                    Quantity: '',
                    ComponentsCostValues: '',
                    Currency: '',
                    IfcClass: '',
                }
            }]
            elementXcostTable.data = []
            elementXcostTable.preserveStructureOnFilter = true
            elementXcostTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
            elementXcostTable.hiddenColumns = ['ComponentsCostValues','ItemId','ItemVolume', 'NormalizedCost', 'Currency', 'IfcClass', 'Model']
            // #endregion

            //get cost data
            let itemId, itemName, itemIfcClass, costItemName, costItemId, costItemDescription, costItemObjectType, costItemTotalCost, costItemUnitBasis, costItemUnitCost //initialize variables
            let hasAssignmentsCheck = false
            for (const [model,selectedItems] of Object.entries(selectionData)) { //loop over models of selected items
                for (const item of selectedItems) { //loop over selected items
                    try { //needed to skip potential errors and do not interrupt the loop over items
                        if (!item['HasAssignments']) continue //checks if item has assignments --> it could have also different assignments
                        hasAssignmentsCheck = true
                        //item identity data
                        itemId = (item['_localId'] as FRAGS.ItemAttribute).value ? (item['_localId'] as FRAGS.ItemAttribute).value : 'nd'
                        itemName = (item['Name'] as FRAGS.ItemAttribute).value ? (item['Name'] as FRAGS.ItemAttribute).value : 'nd'
                        itemIfcClass = (item['_category'] as FRAGS.ItemAttribute).value ? (item['_category'] as FRAGS.ItemAttribute).value : 'nd'
                        let itemTotalCost: number = 0
                        let itemTotalCurrency: string = ''
                        const childrenTable: BUI.TableGroupData<elementXcostTableData>[] = []
                        for (const [a,costItem] of Object.entries(item['HasAssignments'])){ //loop over each assignment of item
                            let row: BUI.TableGroupData<elementXcostTableData> = {
                                data: {},
                            }
                            if (costItem['_category'].value != 'IFCCOSTITEM') continue //checks if the assignment is of IfcCostItem else go to the next one
                            //cost item identity data
                            costItemName = row.data.Name = costItem['Name'].value ? costItem['Name'].value : 'nd'
                            costItemDescription = row.data.Description = costItem['Description'].value ? costItem['Description'].value : 'nd'
                            costItemObjectType = costItem['ObjectType'].value ? costItem['ObjectType'].value : 'nd'

                            //here I have to do what I said before: get the single cost item without relations, otherwise it will get relations also of related elements such as walls ecc
                            costItemId = costItem['_localId'].value ? costItem['_localId'].value : 'nd'
                            const costItemFull_Record = await fragments.getData({[model]:new Set<number>([costItemId])},{
                                attributesDefault: true,
                                relations: {
                                    'CostValues': {
                                        attributes: true,
                                        relations: false //in this way the problem is that it will not read also the complex attributes, such as cost values, so I need to get them below
                                }}
                            })
                            const costItemFull = costItemFull_Record[model][0]

                            for (const [b,cv] of Object.entries(costItemFull['CostValues']) as any){ //technically it will be always one when inspecting cost item as total cost
                                
                                //again: the same thing of before but for cost values of cost item
                                const cvId = cv['_localId'].value ? cv['_localId'].value : 'nd'
                                const costValue_Record = await fragments.getData({[model]:new Set<number>([cvId])},{
                                    attributesDefault: true,
                                    relationsDefault: {
                                        attributes: true,
                                        relations: true //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                                    }
                                })
                                const costValue = costValue_Record[model][0] as any

                                //total cost of item
                                const valueComponent = costValue['AppliedValue'][0]['ValueComponent'].value
                                const costValueAppliedValue = (valueComponent !== undefined && valueComponent !== null) ? valueComponent : 'nd'
                                const costValueUnitComponent = costValue['AppliedValue'][0]['UnitComponent'][0]['Currency'].value ? costValue['AppliedValue'][0]['UnitComponent'][0]['Currency'].value : 'nd'
                                const currency = convertCurrency(costValueUnitComponent)
                                costItemTotalCost = row.data.Cost = `${Math.round(costValueAppliedValue*100)/100} ${currency}`
                                //quantity of item
                                const unitComponent = costValue['UnitBasis'][0]['ValueComponent'].value
                                const costValueUnitBasis = (unitComponent !== undefined && unitComponent !== null) ? unitComponent : 'nd'
                                const costValueUnitMeasure = costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value ? costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value : 'nd'
                                const unitMeasure = convertUnits(costValueUnitMeasure)
                                costItemUnitBasis = row.data.Quantity = `${Math.round(costValueUnitBasis*1000)/1000} ${unitMeasure}`
                                //unit cost of cost item
                                try {
                                    if (costValue['Components'] && costValue['Components'][0]['Category'].value == 'Unit cost'){
                                        const costValueUnitCostAppliedValue = costValue['Components'][0]['AppliedValue'][0]['ValueComponent'].value ? costValue['Components'][0]['AppliedValue'][0]['ValueComponent'].value : 'nd'
                                        const costValueUnitCostUnitComponent = costValue['Components'][0]['AppliedValue'][0]['UnitComponent'][0]['Currency'].value ? costValue['Components'][0]['AppliedValue'][0]['UnitComponent'][0]['Currency'].value : 'nd'
                                        const currency = convertCurrency(costValueUnitCostUnitComponent)
                                        costItemUnitCost = row.data.UnitCost = `${Math.round(costValueUnitCostAppliedValue*100)/100} ${currency}/${unitMeasure}`
                                        row.data.ComponentsCostValues = costValue['Components'][0]['Components']
                                    } else {
                                        row.data.UnitCost = 'nd'
                                        row.data.ComponentsCostValues = 'nd'
                                    }
                                } catch (error) {
                                    console.warn('Error in finding unit cost. Error:\n',error)
                                    row.data.UnitCost = 'nd'
                                    row.data.ComponentsCostValues = 'nd'
                                }
                                itemTotalCost += costValueAppliedValue //element total cost: sum of all cost item related
                                itemTotalCurrency = currency
                            }
                            childrenTable.push(row)
                        }
                        
                        elementXcostTable.data.push({
                            data: {
                                ItemId: itemId,
                                Name: `${itemName}`,
                                Cost: `${Math.round(itemTotalCost*100)/100} ${itemTotalCurrency}`,
                                ItemVolume: 0,
                                NormalizedCost: 0,
                                Currency: itemTotalCurrency,
                                IfcClass: itemIfcClass,
                                Model: model
                            },
                            children: [...childrenTable]
                        })
                        elementXcostTable.dataTransform.UnitCost = (value, rowData) => {
                            const { ComponentsCostValues, Name, Description, UnitCost } = rowData
                            if (UnitCost == 'nd' || !UnitCost) return value
                            return BUI.html`
                            <bim-button
                                label=${value}
                                @click=${() => {onOpenPriceAnalysis(ComponentsCostValues, Name, Description, UnitCost)}}
                                >
                            </bim-button>
                            `
                        }
                        elementXcostTable.dataTransform.Name = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { Model, ItemId } = rowData
                            if (!ItemId) return value //if ItemId is not defined, return the original value
                            return BUI.html`
                                <bim-label
                                    @click=${() => {highlighter.highlightByID("select", {[Model as string]: new Set<number>([ItemId as number])}, false, true)}}
                                >${value}</bim-label>
                            `
                        }

                    } catch (error) {
                        console.warn(error)
                        continue //go to the next item of loop, do not interrupt the loop
                    }
                }
            }
            
            // Raggruppa le righe per IfcClass
            const groupedByIfcClass: { [ifcClass: string]: BUI.TableGroupData<any>[] } = {}
            for (const row of elementXcostTable.data) {
                const ifcClass = row.data.IfcClass || 'Undefined'
                if (!groupedByIfcClass[ifcClass]) { groupedByIfcClass[ifcClass] = [] }
                groupedByIfcClass[ifcClass].push(row)
            }
            // Ricostruisci la tabella con i gruppi
            const groupedTableData: BUI.TableGroupData<any>[] = []
            for (const [ifcClass, rows] of Object.entries(groupedByIfcClass)) {
                let totalCost = 0
                let totalCurrency = ''
                for (const row of rows){
                    const cost = Number((row.data.Cost).split(' ')[0])
                    totalCost += cost
                    totalCurrency = row.data.Currency
                }
                groupedTableData.push({
                    data: {
                        Name: ifcClass,
                        Cost: `${Math.round(totalCost*100)/100} ${totalCurrency}`,
                        IfcClass: ifcClass,
                    },
                    children: rows
                })
            }
            elementXcostTable.data = groupedTableData

            sortbyTotalCostDropdown.addEventListener('change', (e) => {
                if (!e.target) return
                onSortTable(e, elementXcostTable)}
            )
            const elementXCostPanel = BUI.Component.create<BUI.Panel>(() => {
                return BUI.html`
                <bim-panel
                    style="display:flex; flex-direction:column; gap:10px; margin:10px; background-color:transparent">
                    <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                        <div style="display: flex; gap: 0.5rem;">
                            <bim-label>Group by:</bim-label>
                            <bim-button @click=${(e:Event) => onChangeLevelTable(e,elementXcostTable)} label="Item" style="max-width:fit-content"></bim-button>
                            <bim-label>Sort by:</bim-label>
                            ${sortbyTotalCostDropdown}
                            <bim-button @click=${(e:Event) => onExpandTable(e,elementXcostTable)} label=${elementXcostTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                            <bim-button @click=${() => onSetTransparencyToCostColor()} label="Ghost" tooltip-text="Set non-selected elements transparent. No selection = Reset transparency" style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,elementXcostTable)}}></bim-text-input>
                            <bim-button @click=${() => {onClearPanel(panelDown),onClearPanel(panelRight)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                        </div>
                        ${elementXcostTable}
                    </div>
                </bim-panel>`
            })

            panelDown.innerHTML=''
            hasAssignmentsCheck ? panelDown.appendChild(elementXCostPanel) : panelDown.appendChild(noCostItemsLabel)
            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('down')){
                onSetLayout({target:'down'})
            }

            const endTime_6 = performance.now(); // End timer
            const loadTime_6 = ((endTime_6 - startTime_6) / 1000).toFixed(2); // seconds
            console.log(`TIME ${loadTime_6} s: only create and append the cost table (within onOpenElementXCostPanel method)`);
        }

        const onOpenPriceAnalysis = (resourcesCostValues: any, unitCostName:any, unitCostDescription: any, unitCost: any) => {
            //reset panel to update with new values
            panelRight.innerHTML = ''
            panelRight.label = 'Price Analysis'
            //table type
            type PriceAnalysisTableData = {
                Name: string;
                Cost: string;
                Quantity: string;
                Category: string;
            }
            //general unit cost info
            const unitCostInfo = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                <div style=${BUI.styleMap({padding:'5px', fontSize:'var(--bim-ui_size-xs)', color:'var(--bim-ui_bg-contrast-60)'})}>
                    <div style=${BUI.styleMap({margin:'5px'})}>Name: ${unitCostName}</div>
                    <div style=${BUI.styleMap({margin:'5px'})}>Description: ${unitCostDescription}</div>
                    <div style=${BUI.styleMap({margin:'5px'})}>Unit cost: ${unitCost}</div>
                </div>
                `
            })
            panelRight.appendChild(unitCostInfo)

            //div if there is no price analysis
            const noPriceAnalysisDiv = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                <div style=${BUI.styleMap({padding:'5px', fontSize:'var(--bim-ui_size-m)', color:'red'})}>
                    <div style=${BUI.styleMap({margin:'5px'})}>This item does not have price analysis related!</div>
                </div>
                `
            })
            //price analysis table creation
            if (resourcesCostValues){
                const priceAnalysisTable = document.createElement("bim-table") as BUI.Table<PriceAnalysisTableData>
                priceAnalysisTable.data = [
                    {
                        data: {
                            Name: '',
                            Cost: '',
                            Quantity: '',
                            Category: ''
                        },
                    },
                ]
                priceAnalysisTable.data = [] //reset table to remove the previous empty line
                priceAnalysisTable.preserveStructureOnFilter = true
                priceAnalysisTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
                priceAnalysisTable.style.padding = '5px'
                //loop over component of cost item extracting data
                for (const component of resourcesCostValues){
                    let row: BUI.TableGroupData<PriceAnalysisTableData> = {
                        data: {},
                    }
                    row.data.Name = component['Description'].value
                    row.data.Category = component['Category'].value
                    const valueComponent = component['AppliedValue'][0]['ValueComponent'].value
                    const unitComponent = component['AppliedValue'][0]['UnitComponent'][0]['Currency'].value
                    row.data.Cost = `${Math.round(valueComponent*1000)/1000} ${convertCurrency(unitComponent)}`
                    const unitBasisValueComponent = component['UnitBasis'][0]['ValueComponent'].value
                    const unitBasisUnitComponent = component['UnitBasis'][0]['UnitComponent'][0]['Name'].value
                    row.data.Quantity = `${Math.round(unitBasisValueComponent*1000)/1000} ${convertUnits(unitBasisUnitComponent)}`
                    priceAnalysisTable.data.push(row)
                }
                //append table to the panel
                panelRight.appendChild(priceAnalysisTable)
            } else {
                panelRight.appendChild(noPriceAnalysisDiv)
            }
            //update grid layout if panel is closed
            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('right')){
                onSetLayout({target:'right'})
            }
        }
        
        //FLOATING GRID TO HOST THE TOOLBAR
        const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
            return BUI.html`
                <bim-grid
                floating
                style="padding: 20px">
                </bim-grid>
            `;
        })

        //TOOLBAR COMPONENT
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            return BUI.html`
            <bim-toolbar style="justify-self: center">
                <bim-toolbar-section label="Settings">
                    <bim-button
                        id='world'
                        icon="tabler:world-cog"
                        tooltip-title="World visibility settings"
                        @click=${onSetLayout}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Samples">
                    <bim-dropdown verical placeholder="Load...">
                        <bim-option>
                            <bim-button
                                icon="fluent:building-48-regular"
                                label="Only total costs"
                                @click=${() => {
                                        loadFragmentFile("/FRAG/Sample_totalCost.frag")
                                    }}>
                            </bim-button>
                        </bim-option>
                        <bim-option>
                            <bim-button
                                icon="ph:house"
                                label="With price analysis"
                                @click=${() => {
                                        loadFragmentFile("/FRAG/Sample_priceAnalysis.frag")
                                    }}>
                            </bim-button>
                        </bim-option>
                    </bim-dropdown>
                </bim-toolbar-section>
                <bim-toolbar-section label="IFC">
                    <bim-button
                        icon="tabler:cube-plus"
                        tooltip-title="Load IFC model"
                        @click=${onLoadIfc}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Fragments">
                    <bim-button
                        tooltip-title="Import"
                        icon="lucide:upload"
                        @click=${onFragmentsImport}
                    ></bim-button>
                    <bim-button
                        style="display:${devElementsVisibility}"
                        tooltip-title="Export"
                        icon="lucide:download"
                        @click=${onFragmentsExport}
                    ></bim-button>
                    <bim-button
                        style="display:${devElementsVisibility}"
                        tooltip-title="Print on console selected element fragment"
                        icon="carbon:fragments"
                        @click=${onFragmentsPrint}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Dispose all models"
                        icon="tabler:trash"
                        @click=${() => {
                            for (const [modelId] of fragments.list) {
                                fragments.core.disposeModel(modelId);
                            }
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Panels">
                    <bim-button
                        id="left"
                        icon="mynaui:panel-left-open"
                        tooltip-title="Open/Close left panel"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        id="down"
                        icon="mynaui:panel-bottom-open"
                        tooltip-title="Open/Close bottom panel"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        id="right"
                        icon="mynaui:panel-right-open"
                        tooltip-title="Open/Close right panel"
                        @click=${onSetLayout}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Selection">
                    <bim-button
                        icon="tabler:deselect"
                        tooltip-title="Clear Selection"
                        @click=${() => {highlighter.clear()}}>
                    </bim-button>
                    <bim-button
                        icon="weui:previous-filled"
                        tooltip-title="Select Previous"
                        @click=${() => {highlighter.highlightByID('select', previousSelection, false, true)}}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Visibility">
                    <bim-button
                        tooltip-title="Hide Selection"
                        icon="mdi:hide-outline"
                        @click=${onHide}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Isolate Selection"
                        icon="mdi:show-outline"
                        @click=${onIsolate}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Invert Visibility"
                        icon="material-symbols:change-circle-outline-rounded"
                        @click=${onInvertVisibility}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Transparency Selection"
                        icon="mdi:arrange-send-backward"
                        @click=${() => {onSetTransparency()}}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Transparency Non-Selection"
                        icon="mdi:arrange-bring-forward"
                        @click=${() => {onSetTransparencyToNotSelectedElements()}}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Reset Visibility"
                        icon="tabler:sun-filled"
                        @click=${onResetVisibility}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="5D">
                    <bim-button
                        id='elementXCostButton'
                        tooltip-title="Show costs of selected elements"
                        icon="fontisto:dollar"
                        @click=${()=>{onOpenElementXCostPanel()}}
                    ></bim-button>
                    <bim-button
                        style = "display:none"
                        tooltip-title="Open cost assignment panel of selected elements - organized by cost item"
                        icon="tabler:filter-2-dollar"
                        @click=${() => {console.log('TO DO ...')}}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section id="test-section" label="TEST" style="display:${devElementsVisibility}">
                    <bim-button
                        label="Sample"
                        tooltip-title="Load sample IFC models. Only for developers."
                        @click=${() => {
                            loadIfcFile("/assets/Sample_with costs.ifc")
                            loadIfcFile("/assets/SFH_with costs.ifc")
                            }}>
                    </bim-button>
                    <bim-button
                        label='Test'
                        tooltip-title="Print volume of selected item"
                        @click=${getVolume}
                    ></bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })

        const panelDownHeight = '50%'
        const panelLeftWidth = '25%'
        const panelRightWidth = '25%'
        const left_right = {
                template: `
                    "panelLeft toolbar panelRight" auto
                    "panelLeft empty panelRight" 1fr
                    /${panelLeftWidth} 1fr ${panelRightWidth}
                `,
                elements: {
                    panelLeft,
                    panelRight,
                    toolbar
                }
            }
        const left_down = {
                template: `
                    "panelLeft toolbar" auto
                    "panelLeft empty" 1fr
                    "panelLeft panelDown" ${panelDownHeight}
                    /${panelLeftWidth} 1fr
                `,
                elements: {
                    panelLeft,
                    panelDown,
                    toolbar
                }
            }
        const right_down = {
                template: `
                    "toolbar panelRight" auto
                    "empty panelRight" 1fr
                    "panelDown panelRight" ${panelDownHeight}
                    /1fr ${panelRightWidth}
                `,
                elements: {
                    panelRight,
                    panelDown,
                    toolbar
                }
            }
        const left_down_right = {
            template: `
                "panelLeft toolbar panelRight" auto
                "panelLeft empty panelRight" 1fr
                "panelLeft panelDown panelDown" ${panelDownHeight}
                /${panelLeftWidth} 1fr ${panelRightWidth}
            `,
            elements: {
                panelLeft,
                panelRight,
                panelDown,
                toolbar
            }
        }
        //GRID LAYOUT
        floatingGrid.layouts = {
            main: {
                template: `
                    "toolbar" auto
                    "empty" 1fr
                    /1fr
                `,
                elements: {
                    toolbar
                }
            },
            world: {
                template: `
                    "toolbar panelWorldSettings" auto
                    "empty panelWorldSettings" 1fr
                    /1fr ${panelRightWidth}
                `,
                elements: {
                    panelWorldSettings,
                    toolbar
                }
            },
            left: {
                template: `
                    "panelLeft toolbar" auto
                    "panelLeft empty" 1fr
                    /${panelLeftWidth} 1fr
                `,
                elements: {
                    panelLeft,
                    toolbar
                }
            },
            right: {
                template: `
                    "toolbar panelRight" auto
                    "empty panelRight" 1fr
                    /1fr ${panelRightWidth}
                `,
                elements: {
                    panelRight,
                    toolbar
                }
            },
            down: {
                template: `
                    "toolbar" auto
                    "empty" 1fr
                    "panelDown" ${panelDownHeight}
                    /1fr
                `,
                elements: {
                    panelDown,
                    toolbar
                }
            },
            leftright: left_right,
            rightleft: left_right,
            leftdown: left_down,
            downleft: left_down,
            rightdown: right_down,
            downright: right_down,
            leftdownright: left_down_right,
            leftrightdown: left_down_right,
            rightdownleft: left_down_right,
            rightleftdown: left_down_right,
            downrightleft: left_down_right,
            downleftright: left_down_right,
        }
        floatingGrid.layout = "main" as any //set active layout

        const viewerContainer = document.getElementById('main-viewer') as HTMLElement
        if (!viewerContainer) return
        viewerContainer.appendChild(floatingGrid) //append grid to the viewer container
        // #endregion
        
        //stats board
        const stats = new Stats()
        stats.showPanel(2)
        document.body.append(stats.dom)
        stats.dom.style.position = "fixed"
        stats.dom.style.left = "0px"
        stats.dom.style.bottom = "0px"
        stats.dom.style.top = "unset"
        stats.dom.style.right = "unset"
        stats.dom.style.zIndex = "999" // z-index visibile sopra altri elementi, se necessario
        stats.dom.style.display = devElementsVisibility
        world.renderer.onBeforeUpdate.add(() => stats.begin())
        world.renderer.onAfterUpdate.add(() => stats.end())
    }

    // #region FINAL PART
    React.useEffect(() => {
        setViewer() //set the viewer, devMode default = false
        return () => {
            if (components) {
                components.dispose()
            }
        }
    }, [])

    return(
        <>
            <div
            id="overlay"
            style={{
                position: "absolute",
                top: "10%",
                left: "40%",
                width: "20%",
                zIndex: 1000,
                pointerEvents: "none"
            }}>
            </div>
            <bim-viewport
                id="main-viewer"
                className="viewer"
            />
        </>
    )
    // #endregion
}