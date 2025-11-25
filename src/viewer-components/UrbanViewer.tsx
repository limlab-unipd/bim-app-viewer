import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as FRAGS from '@thatopen/fragments'
import * as BUIC from '@thatopen/ui-obc'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import { getIFCClassNamesFromCodes } from '../custom-components/ifc-code-converter'
import { readArrow } from '../custom-components/readArrow'
import { addOverlay } from '../custom-components/addOverlay'
import { createTable } from '../custom-components/createTable'
import { suburbsBoundaries } from '../custom-components/suburbsBoundaries'
import { setHighlighterStyles } from '../custom-components/colors'
import { create_LOD0 } from '../custom-components/create_LOD0'
import { create_LOD1 } from '../custom-components/create_LOD1'
import { create_LOD20 } from '../custom-components/create_LOD20'
import { create_LOD3 } from '../custom-components/create_LOD3'
import Stats from 'stats.js'
import { create_LOD21 } from '../custom-components/create_LOD21'
import { normalizationHeight } from '../custom-components/parametersForGrouping'


export function UrbanViewer () {
    // #region GENERAL START
    //BUI.Manager.init()
    const components = new OBC.Components()
    const ifcImporter = new FRAGS.IfcImporter
    const importedCategories = getIFCClassNamesFromCodes([...ifcImporter.classes.elements]) //this is only a list of strings of all the imported categories. this is not the FULL list of IFC classes
    importedCategories.push(
        'ALL CLASSES',
        'IFCBUILTSYSTEM')
    importedCategories.sort()
    const marker = components.get(OBCF.Marker)
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
        const def_camera = {x:13000, y:22200, z:22000}
        const def_target = {x:9200, y:13200, z:15000}
        await world.camera.controls.setLookAt(def_camera.x,def_camera.y,def_camera.z,def_target.x,def_target.y,def_target.z) // convenient position for the model we will load: (cameraX,Y,Z,targetX,Y,Z)
        world.camera.threeOrtho.far = 1000000 // distanza massima del clipping plane per vedere gli oggetti: per la camera ortografica
        world.camera.threePersp.far = 1000000 // distanza massima del clipping plane per vedere gli oggetti: per la camera prospettica (quella usata di default)
        world.camera.controls.minDistance = 2500 //serve per poter continuare a zoommare velocemente anche da distante, tuttavia modifica anche lo zoom quando si seleziona un elemento ma va bene lo stesso
        //world.camera.controls.minDistance = 20000 //serve per poter continuare a zoommare velocemente anche da distante, tuttavia modifica anche lo zoom quando si seleziona un elemento ma va bene lo stesso
        world.camera.controls.truckSpeed = 12
        world.camera.controls.dollySpeed = 2
        // #endregion

        // #region COPONENTS GENERAL SETUP
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.distance = 1000
        grid.config.color.set('rgba(28, 28, 28, 1)')
        grid.visible = false
        
        world.renderer.postproduction.enabled = true
        world.dynamicAnchor = false

        //components.get(OBC.Raycasters).get(world);

        const axes = new THREE.AxesHelper(1);
        world.scene.three.add(axes);

        highlighter.zoomToSelection = true;
        highlighter.setup({
            world,
            selectMaterialDefinition: {
                // you can change this to define the color of your highligthing
                color: new THREE.Color("rgba(36, 241, 234, 1)"),
                opacity: 1,
                transparent: false,
                renderedFaces: 1,
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
            renderedFaces: 1, //render only front side
        })

        await ifcLoader.setup({
            autoSetWasm: false,
            wasm: {
                path: "https://unpkg.com/web-ifc@0.0.72/",
                absolute: true,
            },
        });
        const workerUrl ="/Worker/worker.mjs";
        //const workerUrl ="https://thatopen.github.io/engine_fragment/resources/worker.mjs";
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
        //read arrow file
        let arrowData
        let populationArrowData
        let environmentalArrowData
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
                    importer.classes['elements'].add(
                        WEBIFC.IFCBUILTSYSTEM //remember to add these classes also above in the importedClasses in the initial part of the script !!!
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
            addOverlay(BUI.html`<i><b>${name}</i></b> loaded in <b>${loadTime}</b> seconds.`)
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
        const loadFragmentFile = async (path:string): Promise<FRAGS.FragmentsModel> => {
            const startTime = performance.now() // Start timer
            const modelId = path.split("/").pop()?.split(".").shift()
            let model: FRAGS.FragmentsModel
            if (modelId) {
                const file = await fetch(path)
                const buffer = await file.arrayBuffer()
                model = await fragments.core.load(buffer, { modelId: modelId })
            }
            const endTime = performance.now() // End timer
            const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
            console.log(`Fragments loaded in ${loadTime} seconds`)
            addOverlay(BUI.html`<b><i>${modelId}</i></b> model loaded in <b>${loadTime}</b> seconds.`)
            return model!
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
            console.log('Selection:',selection)
            for (const [model,items] of Object.entries(selection)){
                const entryModelIdMap : OBC.ModelIdMap = {[model]:items}
                console.log('Entry:', entryModelIdMap)
                console.log("ModelIdMap: ", entryModelIdMap)
                const itemdata = await fragments.getData(entryModelIdMap) //frags.itemdata -> attributes, guid and expid (localId)
                console.log("ItemData: ", itemdata)
                const bboxes = await fragments.getBBoxes(entryModelIdMap)
                console.log("Bboxes:", bboxes)
            }
        }

        //generic functions
        //Visibility
        const onHideLodModels = async (target:BUI.Button, uvl:string) => {
            if (!target) return
            const visibility = target.icon == 'mdi:eye'
            target.loading = true
            for (const [modelName,model] of fragments.list.entries()) {
                if (model.isDeltaModel) continue
                if (modelName.includes(`LOD_${uvl}`)) {
                    if (visibility) {
                        await model.setVisible(undefined, false)
                    } else {
                        await model.setVisible(undefined, true)
                    }
                }
            }
            target.loading = false
            visibility ? target.icon = 'mdi:eye-off' : target.icon = 'mdi:eye'
        }
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
        const onSetTransparencyWithColors = async (LOD:number=0) => {
            highlighter.selection.select = {} //pulisce la selezione
            const opacity: {[lod:string]:number} = {
                'LOD_0': 0.05,
                'LOD_1': 0.10,
                'LOD_2': 0.15,
            }
            highlighter.styles.get(`LOD_${LOD}_color_0_02`)!.opacity = opacity[`LOD_${LOD}`]
            highlighter.styles.get(`LOD_${LOD}_color_02_04`)!.opacity = opacity[`LOD_${LOD}`]
            highlighter.styles.get(`LOD_${LOD}_color_04_06`)!.opacity = opacity[`LOD_${LOD}`]
            highlighter.styles.get(`LOD_${LOD}_color_06_08`)!.opacity = opacity[`LOD_${LOD}`]
            highlighter.styles.get(`LOD_${LOD}_color_08_1`)!.opacity = opacity[`LOD_${LOD}`]
            highlighter.selection.select = {}
            highlighter.updateColors()
        }
        const onSetTransparencyToNotSelectedElements = async () => {
            const allItems = await getAllItems()
            const selectedItems = highlighter.selection.select
            highlighter.highlightByID('transparent', allItems, true, false, selectedItems)
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
            return [...new Set(list.flat().sort())]
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
        const onSetCameraUVL = (uvl:number) => {
            let uvlFactor = 1
            switch (uvl) {
                case 0: 
                    uvlFactor=1
                    world.camera.controls.truckSpeed = 10
                    break;
                case 1: 
                    world.camera.controls.truckSpeed = 7
                    uvlFactor=2.5
                    break;
                case 2: 
                    world.camera.controls.truckSpeed = 5
                    uvlFactor=25
                    break;
                case 3: 
                    world.camera.controls.truckSpeed = 2
                    uvlFactor=1000
                    break;
            }
            world.camera.controls.minDistance = 2500/uvlFactor
            centerViewButton.addEventListener('click', async (e) => {
                await world.camera.controls.setLookAt(def_camera.x/uvlFactor,def_camera.y/uvlFactor,def_camera.z/uvlFactor,def_target.x/uvlFactor,def_target.y/uvlFactor,def_target.z/uvlFactor)
            })
        }
        const onExpandTable = (e: Event, table:BUI.Table<any>) => {
            const button = e.target as BUI.Button;
            table.expanded = !table.expanded;
            button.label = table.expanded ? "Collapse" : "Expand";
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
            }
        }


        //#region geometry creation
        const api = new WEBIFC.IfcAPI();
        api.SetWasmPath("https://unpkg.com/web-ifc@0.0.72/", true);
        await api.Init();
        const geometryEngine = new FRAGS.GeometryEngine(api);
        // #endregion

        // #endregion

        // #region UI PANELS   
        const panelLeft = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                id='panel-left'
                label="BIM PANEL"
                style="background-color:rgba(0,0,0,0.85); z-index:200">
            </bim-panel>
            `;
        })
        const panelRight = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                id="panel-right"
                label="Right Panel"
                style="background-color:rgba(0,0,0,0.85); z-index:200">
            </bim-panel>
            `;
        })
        const panelDown = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                id = "panel-down"
                label="Down Panel"
                style="background-color:rgba(0,0,0,0.85); display:flex; z-index:200">
            </bim-panel>
            `;
        })

        //CREATE THE TABLE
        type uvlVisualizationTableType = {
            UVL: string,
            Visibility: string,
            Opacity: string,
            ColorScale: string,
            NormHeight: number | string,
        }
        const uvlVisualizationTable = document.createElement("bim-table") as BUI.Table<uvlVisualizationTableType>
        uvlVisualizationTable.id = 'uvl-visualization-table'
        uvlVisualizationTable.data = [{
            data: {
                UVL: '0',
                Visibility: '',
                Opacity: '',
                ColorScale: '',
                NormHeight: 5000,
            }
        },{
            data: {
                UVL: '1',
                Visibility: '',
                Opacity: '',
                ColorScale: '',
                NormHeight: 1000,
            }
        },{
            data: {
                UVL: '2',
                Visibility: '',
                Opacity: '',
                ColorScale: '',
                NormHeight: 300,
            }
        },{
            data: {
                UVL: '3',
                Visibility: '',
                Opacity: '',
                ColorScale: '',
                NormHeight: '',
            }
        }]
        const columns: (keyof uvlVisualizationTableType | BUI.ColumnData)[] = [
            { name:'UVL', width:'3rem'},
            { name:'Visibility', width:'4rem'},
            { name:'Opacity', width:'5rem'},
        ]
        uvlVisualizationTable.columns = columns;
        uvlVisualizationTable.preserveStructureOnFilter = true
        uvlVisualizationTable.dataTransform.Visibility = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
            const { UVL } = rowData
            if (!UVL) return value
            return BUI.html`
                <bim-button icon='mdi:eye' @click=${async ({target}:{target:BUI.Button})=>{await onHideLodModels(target,UVL)}}></bim-button>`
        }
        uvlVisualizationTable.dataTransform.Opacity = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
            const { UVL } = rowData
            if (!UVL) return value
            return BUI.html`
                <bim-number-input 
                    id="transparency-opacity-uvl-${UVL}" slider step="0.05" value="0.05" min="0" max="1"
                    @change="${async ({ target }: { target: BUI.NumberInput }) => {
                        highlighter.styles.get(`LOD_${UVL}_color_0_02`)!.opacity = target.value
                        highlighter.styles.get(`LOD_${UVL}_color_02_04`)!.opacity = target.value
                        highlighter.styles.get(`LOD_${UVL}_color_04_06`)!.opacity = target.value
                        highlighter.styles.get(`LOD_${UVL}_color_06_08`)!.opacity = target.value
                        highlighter.styles.get(`LOD_${UVL}_color_08_1`)!.opacity = target.value
                        await highlighter.updateColors()
                    }}">
                </bim-number-input>`
        }
        uvlVisualizationTable.dataTransform.ColorScale = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
            const { UVL } = rowData
            if (!UVL) return value
            return BUI.html`
                <bim-dropdown
                    @change="${async ({target}:{target:BUI.Dropdown}) => {
                        const colorScale = target.value[0]
                        setHighlighterStyles(components,colorScale,Number(UVL))
                        await highlighter.updateColors()
                    }}">
                    <bim-option label='Green-Yellow-Red' value='gnylrd' style="color:black; padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(26, 150, 65, 1),rgba(166, 217, 106, 1),rgba(255, 255, 0, 1),rgba(253, 174, 97, 1),rgba(215, 25, 28, 1))"></bim-option>
                    <bim-option label='Yellow-Green-Blue' value='ylgnbu' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(255, 255, 204, 1), rgba(194, 230, 153, 1), rgba(120, 198, 121, 1), rgba(49, 163, 84, 1), rgba(0, 104, 55, 1))"></bim-option>
                    <bim-option label='Orange-Red' value='orrd' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(254, 240, 217, 1), rgba(253, 212, 158, 1), rgba(253, 187, 132, 1), rgba(253, 141, 60, 1), rgba(217, 72, 1, 1))"></bim-option>
                    <bim-option label='Blues' value='blues' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(239, 243, 255, 1), rgba(189, 215, 231, 1), rgba(107, 174, 214, 1), rgba(33, 113, 181, 1), rgba(8, 69, 148, 1))"></bim-option>
                    <bim-option label='Viridis' value='viridis' style="padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(68, 1, 84, 1),rgba(59, 82, 139, 1),rgba(33, 144, 141, 1),rgba(94, 201, 98, 1),rgba(253, 231, 37, 1))"></bim-option>
                    <bim-option label='Cividis' value='cividis' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(0, 32, 76, 1), rgba(55, 64, 129, 1), rgba(94, 109, 171, 1), rgba(145, 158, 203, 1), rgba(253, 231, 37, 1))"></bim-option>
                </bim-dropdown>`
        }
        uvlVisualizationTable.dataTransform.NormHeight = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
            const { UVL } = rowData
            if (!UVL) return value
            if (UVL=='0') {
                return BUI.html`
                    <bim-number-input 
                        id="normalization-height-uvl-${UVL}" slider step="200" value=${normalizationHeight.lod0} min="100" max="10000"
                        @change="${async ({ target }: { target: BUI.NumberInput }) => {
                            normalizationHeight.lod0 = target.value
                        }}">
                    </bim-number-input>`
            } else if (UVL=='1') {
                return BUI.html`
                    <bim-number-input 
                        id="normalization-height-uvl-${UVL}" slider step="100" value=${normalizationHeight.lod1} min="50" max="5000"
                        @change="${async ({ target }: { target: BUI.NumberInput }) => {
                            normalizationHeight.lod1 = target.value
                        }}">
                    </bim-number-input>`
            } else if (UVL=='2') {
                return BUI.html`
                    <bim-number-input 
                        id="normalization-height-uvl-${UVL}" slider step="40" value=${normalizationHeight.lod2} min="20" max="2000"
                        @change="${async ({ target }: { target: BUI.NumberInput }) => {
                            normalizationHeight.lod2 = target.value
                        }}">
                    </bim-number-input>`
            }
            else {
                return ''
            }

        }

        const panelWorldSettings = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
                <bim-panel
                    label="World Visibility Settings"
                    style="background-color:rgba(0, 0, 0, 0.65); z-index:200">
                    <bim-panel-section label='UVL Settings'>
                        <bim-label style="display:flex; white-space:normal" icon='fluent:scan-camera-20-regular'>Change zoom and pan speeds, and default position of camera</bim-label>
                        <bim-dropdown label='Camera UVL' style="padding-left:1.5rem"
                            @change="${(e:Event) => {
                                if (!e.target) return
                                const target = e.target as BUI.Dropdown
                                const uvl = target.value[0]
                                onSetCameraUVL(uvl)
                            }}">
                            <bim-option style="padding:0 0.5rem 0 0.5rem" label='UVL-0' value='0'></bim-option>
                            <bim-option style="padding:0 0.5rem 0 0.5rem" label='UVL-1' value='1'></bim-option>
                            <bim-option style="padding:0 0.5rem 0 0.5rem" label='UVL-2' value='2'></bim-option>
                            <bim-option style="padding:0 0.5rem 0 0.5rem" label='UVL-3' value='3'></bim-option>
                        </bim-dropdown>
                        <bim-label style="display:flex; white-space:normal" icon='mdi:circle-opacity'>Change visualization settings of each UVL</bim-label>
                        ${uvlVisualizationTable}
                    </bim-panel-section>
                    <bim-panel-section collapsed label='General Ambient Settings' style='padding:0'>
                        <bim-panel-section label='Ambient Preset Styles'  style='padding:-1rem'>
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
                                id="grid-visible" label="Visible"
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
                    </bim-panel-section>
                </bim-panel>
            `
        })
        // #endregion

        // #region GLOBAL VARIABLES
        // #endregion

        // #region ADVANCED COMPONENTS
        fragments.list.onItemDeleted.add(() => {
            //onClearPanel(panelDown) //clear down panel
            //onClearPanel(panelRight)
        })
        const loadingLabel = BUI.Component.create<BUI.Label>(()=>{
            return BUI.html`
                <bim-label style='padding:20px'>Loading...</bim-label>
            `
        })
        const modelsListPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [modelsList,updateModelsList] = BUIC.tables.modelsList({
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
            fragments.list.onItemDeleted.add(() => {
                updatePropertiesTable({ modelIdMap: {} })
                updateSelectedItemsCount({ count:0 })
            })
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

        const collapsePanelSections = (() => {
            const modelsListPanelSectionHeader = modelsListPanelSection.shadowRoot?.children[0].children[0] as HTMLDivElement
            modelsListPanelSectionHeader.click()
            const spatialTreePanelSectionHeader = spatialTreePanelSection.shadowRoot?.children[0].children[0] as HTMLDivElement
            spatialTreePanelSectionHeader.click()
            const selectElementByGuidPanelSectionHeader = selectElementByGuidPanelSection.shadowRoot?.children[0].children[0] as HTMLDivElement
            selectElementByGuidPanelSectionHeader.click()
        })

        const centerViewButton = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button
                    tooltip-title="Center View"
                    icon="material-symbols:center-focus-weak"
                    @click=${async ()=>{
                        await world.camera.controls.setLookAt(def_camera.x,def_camera.y,def_camera.z,def_target.x,def_target.y,def_target.z)
                        //world.camera.fitToItems()
                    }}
                ></bim-button>`
        })

        // #region DROPDOWN MENUS
        //color scale dropdown
        const colorScaleDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown id='color-scale-dropdown' name="colorScale" label='Color Scale' icon='ic:outline-color-lens' style="min-width:100px">
                <bim-option label='Green-Yellow-Red' value='gnylrd' style="color:black; padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(26, 150, 65, 1),rgba(166, 217, 106, 1),rgba(255, 255, 0, 1),rgba(253, 174, 97, 1),rgba(215, 25, 28, 1))"></bim-option>
                <bim-option label='Yellow-Green-Blue' value='ylgnbu' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(255, 255, 204, 1), rgba(194, 230, 153, 1), rgba(120, 198, 121, 1), rgba(49, 163, 84, 1), rgba(0, 104, 55, 1))"></bim-option>
                <bim-option label='Orange-Red' value='orrd' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(254, 240, 217, 1), rgba(253, 212, 158, 1), rgba(253, 187, 132, 1), rgba(253, 141, 60, 1), rgba(217, 72, 1, 1))"></bim-option>
                <bim-option label='Blues' value='blues' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(239, 243, 255, 1), rgba(189, 215, 231, 1), rgba(107, 174, 214, 1), rgba(33, 113, 181, 1), rgba(8, 69, 148, 1))"></bim-option>
                <bim-option label='Viridis' value='viridis' style="padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(68, 1, 84, 1),rgba(59, 82, 139, 1),rgba(33, 144, 141, 1),rgba(94, 201, 98, 1),rgba(253, 231, 37, 1))"></bim-option>
                <bim-option label='Cividis' value='cividis' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(0, 32, 76, 1), rgba(55, 64, 129, 1), rgba(94, 109, 171, 1), rgba(145, 158, 203, 1), rgba(253, 231, 37, 1))"></bim-option>
            </bim-dropdown>`
        )
        const paramOneDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="param_one">
                <bim-option label='1' value='1' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Urban area (km²)' value='Urban area (km²)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Population (number)' value="Population (number)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building height (m)' value="Building height (m)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building footprint area (m²)' value="Building footprint area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building gross floor area (m²)' value="Building gross floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building net floor area (m²)' value="Building net floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building weight (tonnes)' value="Building weight (tonnes)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Aluminium' value="Aluminium" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Bitumen' value="Bitumen" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Carpet' value="Carpet" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ceramics' value="Ceramics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Concrete' value="Concrete" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Copper' value="Copper" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Glass' value="Glass" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Insulation' value="Insulation" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Paint' value="Paint" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plasterboard' value="Plasterboard" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plastics' value="Plastics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Sand' value="Sand" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Steel' value="Steel" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Timber' value="Timber" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const paramOneBDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="param_one_b">
                <bim-option checked label='1' value='1' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Urban area (km²)' value='Urban area (km²)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Population (number)' value="Population (number)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building height (m)' value="Building height (m)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building footprint area (m²)' value="Building footprint area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building gross floor area (m²)' value="Building gross floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building net floor area (m²)' value="Building net floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building weight (tonnes)' value="Building weight (tonnes)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Aluminium' value="Aluminium" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Bitumen' value="Bitumen" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Carpet' value="Carpet" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ceramics' value="Ceramics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Concrete' value="Concrete" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Copper' value="Copper" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Glass' value="Glass" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Insulation' value="Insulation" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Paint' value="Paint" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plasterboard' value="Plasterboard" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plastics' value="Plastics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Sand' value="Sand" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Steel' value="Steel" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Timber' value="Timber" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const paramTwoDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="param_two">
                <bim-option label='1' value='1' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Urban area (km²)' value='Urban area (km²)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Population (number)' value="Population (number)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building height (m)' value="Building height (m)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building footprint area (m²)' value="Building footprint area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building gross floor area (m²)' value="Building gross floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building net floor area (m²)' value="Building net floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building weight (tonnes)' value="Building weight (tonnes)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Aluminium' value="Aluminium" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Bitumen' value="Bitumen" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Carpet' value="Carpet" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ceramics' value="Ceramics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Concrete' value="Concrete" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Copper' value="Copper" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Glass' value="Glass" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Insulation' value="Insulation" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Paint' value="Paint" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plasterboard' value="Plasterboard" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plastics' value="Plastics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Sand' value="Sand" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Steel' value="Steel" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Timber' value="Timber" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const paramTwoBDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="param_two_b">
                <bim-option checked label='1' value='1' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Urban area (km²)' value='Urban area (km²)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Population (number)' value="Population (number)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building height (m)' value="Building height (m)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building footprint area (m²)' value="Building footprint area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building gross floor area (m²)' value="Building gross floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building net floor area (m²)' value="Building net floor area (m²)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Building weight (tonnes)' value="Building weight (tonnes)" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Aluminium' value="Aluminium" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Bitumen' value="Bitumen" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Carpet' value="Carpet" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ceramics' value="Ceramics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Concrete' value="Concrete" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Copper' value="Copper" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Glass' value="Glass" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Insulation' value="Insulation" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Paint' value="Paint" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plasterboard' value="Plasterboard" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plastics' value="Plastics" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Sand' value="Sand" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Steel' value="Steel" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Timber' value="Timber" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const paramLabelToValue = ((value:string|undefined) => {
            const paramConversionMap: Record<string, string> = {
                '1': '1',
                'Urban area (km²)': 'Urban area (km²)',
                'Population (number)': 'Population',
                'Building height (m)': 'BLDGHEI',
                'Building footprint area (m²)': 'grnd_fl',
                'Building gross floor area (m²)': 'grss_fl',
                'Building net floor area (m²)': 'usbl_fl',
                'Building weight (tonnes)': 'Tonnes',
                'Aluminium': 'Aluminm',
                'Bitumen': 'Bitumen',
                'Carpet': 'Carpet',
                'Ceramics': 'Ceramcs',
                'Concrete': 'Concret',
                'Copper': 'Copper',
                'Glass': 'Glass',
                'Insulation': 'Insultn',
                'Paint': 'Paint',
                'Plasterboard': 'Plstrbr',
                'Plastics': 'Plastcs',
                'Sand': 'Snd_nd_',
                'Steel': 'Steel',
                'Timber': 'Timber',
                'Weight (tonnes)': 'weight',
                'Global Warming Potential (kg CO₂ eq)': 'Global warming (GWP100a)',
                'Abiotic Depletion - elem., econ. reserve (kg SB eq)': 'Abiotic depletion (elem., econ. reserve)',
                'Abiotic depletion - fossil fuels (MJ NCV)': 'Abiotic depletion (Fossil fuels)',
                'Ozone Layer Depletion (kg CFC-11 eq)': 'Ozone layer depletion (ODP)',
                'Photochemical Oxidation (kg C2H4 eq)': 'Photochemical oxidation',
                'Acidification (kg SO2 eq)': 'Acidification',
                'Eutrophication (kg PO4--- eq)': 'Eutrophication',
                'Particulate Matter (kg PM2.5)': 'Particulate matter',
                'Human toxicity - cancer (CTUh)': 'Human toxicity, cancer',
                'Human toxicit - non-cancer (CTUh)': 'Human toxicity, non-cancer',
                'Freshwater Ecotoxicity (CTUe)': 'Freshwater ecotoxicity',
                'Ionizing Radiation H (kBq U235 eq)': 'Ionizing radiation HH',
                'Water Scarcity (m3 eq)': 'Water Scarcity',
            }
            return value ? paramConversionMap[value] : undefined
        })

        const normalizationCheckbox = BUI.Component.create<BUI.Checkbox>(
            () => BUI.html`
            <bim-checkbox checked label='Normalize bars height' icon='fluent:column-triple-20-filled' id='normalization-checkbox' style="border-bottom: 1px solid var(--bim-ui_bg-contrast-20); padding-bottom:0.5rem"
                @change="${(e:Event) => {
                    if (!e.target) return
                    const chekcbox = e.target as BUI.Checkbox   
                    chekcbox.icon = chekcbox.checked ? 'fluent:column-triple-20-filled' : 'heroicons:chart-bar-16-solid'
                }}">
            </bim-checkbox>`
        )
        const materialsImpactsDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="materials-impacts" icon='mdi:recycle' label='Materials Impacts'>
                <bim-option label='Weight (tonnes)' value='Weight (tonnes)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked label='Global Warming Potential (kg CO₂ eq)' value='Global Warming Potential (kg CO₂ eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Abiotic Depletion - elem., econ. reserve (kg SB eq)' value='Abiotic Depletion - elem., econ. reserve (kg SB eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Abiotic depletion - fossil fuels (MJ NCV)' value='Abiotic depletion - fossil fuels (MJ NCV)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ozone Layer Depletion (kg CFC-11 eq)' value='Ozone Layer Depletion (kg CFC-11 eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Photochemical Oxidation (kg C2H4 eq)' value='Photochemical Oxidation (kg C2H4 eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Acidification (kg SO2 eq)' value='Acidification (kg SO2 eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Eutrophication (kg PO4--- eq)' value='Eutrophication (kg PO4--- eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Particulate Matter (kg PM2.5)' value='Particulate Matter (kg PM2.5)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Human toxicity - cancer (CTUh)' value='Human toxicity - cancer (CTUh)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Human toxicit - non-cancer (CTUh)' value='Human toxicit - non-cancer (CTUh)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Freshwater Ecotoxicity (CTUe)' value='Freshwater Ecotoxicity (CTUe)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ionizing Radiation H (kBq U235 eq)' value='Ionizing Radiation H (kBq U235 eq)' style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Water Scarcity (m3 eq)' value='Water Scarcity (m3 eq)' style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        // #endregion



        const previousLoadedSuburbs: string[] = []
        let urbanTable: BUI.Table
        let historyTable: BUI.Table<any> | null

        const colorUrbanPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            return BUI.html`
                <bim-panel-section
                    label = "Environmental Urban Analysis"
                    icon = "ic:round-format-color-fill">
                    <bim-label style="display:flex; white-space:normal">Select a bar, choose options below, then load its next UVL (example: select a UVL-1 bar then click button to load its UVL-2).</bim-label>
                    <bim-label style="display:flex; white-space:normal">Set:</bim-label>
                    ${colorScaleDropdown}
                    <bim-label icon='icon-park-outline:one-key' style='margin-right:1rem'>Parameter 1 (bar height)</bim-label>
                    <div style='display:flex; flex-direction:row; gap:0.5rem; flex:0; align-items:center; margin-left:1.5rem'>
                        ${paramOneDropdown}
                        <bim-label style='font-size:1.5rem'>/</bim-label>
                        ${paramOneBDropdown}
                    </div>
                    <bim-label icon='icon-park-outline:two-key' style='margin-right:1rem'>Parameter 2 (bar color)</bim-label>
                    <div style='display:flex; flex-direction:row; gap:0.5rem; flex:0; align-items:center; margin-left:1.5rem'>
                        ${paramTwoDropdown}
                        <bim-label style='font-size:1.5rem'>/</bim-label>
                        ${paramTwoBDropdown}
                    </div>
                    ${materialsImpactsDropdown}
                    ${normalizationCheckbox}
                    <bim-label icon='solar:city-bold-duotone'>Urban Visualization Level</bim-label>
                    <div style='display:flex; flex-direction:row; gap:0.5rem; align-items:center'>
                        <bim-label style="display:flex; white-space:normal">Load:</bim-label>

                        <bim-button label='0' tooltip='Load UVL-0' style="flex:1" @click=${async ({target}:{target:BUI.Button})=>{
                            target.loading = true
                            let result_0 = false;
                            const paramOne = paramLabelToValue(paramOneDropdown.value[0]);
                            const paramOneB = paramLabelToValue(paramOneBDropdown.value[0]);
                            const paramTwo = paramLabelToValue(paramTwoDropdown.value[0]);
                            const paramTwoB = paramLabelToValue(paramTwoBDropdown.value[0]);
                            const paramEnv = paramLabelToValue(materialsImpactsDropdown.value[0]);
                            const paramOneFullNameLabel = `${paramOneDropdown.value[0]}${paramOneBDropdown.value[0]=='1'?'':`/${paramOneBDropdown.value[0]}`}`
                            const paramTwoFullNameLabel = `${paramTwoDropdown.value[0]}${paramTwoBDropdown.value[0]=='1'?'':`/${paramTwoBDropdown.value[0]}`}`;
                            [result_0,historyTable] = await create_LOD0(world,components,geometryEngine,arrowData!,populationArrowData!,environmentalArrowData!,paramOne,paramOneB,paramTwo,paramTwoB,paramEnv!,panelRight,paramOneFullNameLabel,paramTwoFullNameLabel);
                            if (result_0) {
                                urbanTable = await createTable(panelDown,fragments,components,paramOneFullNameLabel,paramTwoFullNameLabel)
                                if (floatingGrid.layout && !(floatingGrid.layout as string).includes('down')) {
                                    onSetLayout({target:'down'})
                                }
                                if (floatingGrid.layout && !(floatingGrid.layout as string).includes('right')) {
                                    onSetLayout({target:'right'})
                                    panelRight.label = 'History of UVLs loadings'
                                }
                            }
                            target.loading = false
                        }}></bim-button>
                        <bim-label>></bim-label>

                        <bim-button label='1' tootltip='Load UVL-1 and hide UVL-0' style="flex:1" @click=${async ({target}:{target:BUI.Button})=>{
                            target.loading = true
                            const paramOne = paramLabelToValue(paramOneDropdown.value[0]);
                            const paramOneB = paramLabelToValue(paramOneBDropdown.value[0]);
                            const paramTwo = paramLabelToValue(paramTwoDropdown.value[0]);
                            const paramTwoB = paramLabelToValue(paramTwoBDropdown.value[0]);
                            const paramEnv = paramLabelToValue(materialsImpactsDropdown.value[0]);
                            const paramOneFullNameLabel = `${paramOneDropdown.value[0]}${paramOneBDropdown.value[0]=='1'?'':`/${paramOneBDropdown.value[0]}`}`
                            const paramTwoFullNameLabel = `${paramTwoDropdown.value[0]}${paramTwoBDropdown.value[0]=='1'?'':`/${paramTwoBDropdown.value[0]}`}`;
                            const result_1 = await create_LOD1(world,components,geometryEngine,arrowData!,populationArrowData!,environmentalArrowData!,paramOne,paramOneB,paramTwo,paramTwoB,paramEnv!,previousLoadedSuburbs,paramOneFullNameLabel,paramTwoFullNameLabel,urbanTable,historyTable)
                            result_1 ? await onSetTransparencyWithColors(0) : ''
                            if (floatingGrid.layout && !(floatingGrid.layout as string).includes('down')) {
                                onSetLayout({target:'down'})
                            }
                            //onSetCameraUVL(1)
                            target.loading = false
                        }}></bim-button>
                        <bim-label>></bim-label>

                        <div style='display:flex; flex-direction: column; gap:0.5rem; flex:1'>
                            <bim-button label='2.0' tootltip='Load UVL-2.0' @click=${async ({target}:{target:BUI.Button})=>{
                                target.loading = true
                                const paramOne = paramLabelToValue(paramOneDropdown.value[0]);
                                const paramOneB = paramLabelToValue(paramOneBDropdown.value[0]);
                                const paramTwo = paramLabelToValue(paramTwoDropdown.value[0]);
                                const paramTwoB = paramLabelToValue(paramTwoBDropdown.value[0]);
                                const paramEnv = paramLabelToValue(materialsImpactsDropdown.value[0]);
                                const paramOneFullNameLabel = `${paramOneDropdown.value[0]}${paramOneBDropdown.value[0]=='1'?'':`/${paramOneBDropdown.value[0]}`}`
                                const paramTwoFullNameLabel = `${paramTwoDropdown.value[0]}${paramTwoBDropdown.value[0]=='1'?'':`/${paramTwoBDropdown.value[0]}`}`;
                                const result_2 = await create_LOD20(world,components,geometryEngine,arrowData!,environmentalArrowData!,paramOne,paramOneB,paramTwo,paramTwoB,paramEnv!,previousLoadedSuburbs,paramOneFullNameLabel,paramTwoFullNameLabel,urbanTable,historyTable)
                                result_2 ? await onSetTransparencyWithColors(1) : ''
                                if (floatingGrid.layout && !(floatingGrid.layout as string).includes('down')) {
                                    onSetLayout({target:'down'})
                                }
                                //onSetCameraUVL(2)
                                target.loading = false
                            }}></bim-button>
                            <bim-button label='2.1' tootltip='Load UVL-2.1' @click=${async ({target}:{target:BUI.Button})=>{
                                const contextMenu = target.querySelector<BUI.ContextMenu>('bim-context-menu')
                                if (!contextMenu) return
                                contextMenu.visible = true
                            }}>
                                <bim-context-menu>
                                    <div style='display:flex; gap:0.5rem; padding:0.5rem'>
                                        <bim-label>Choose one parameter to continue: </bim-label>
                                        <bim-button style='flex:0;' label="Param1" @click=${async ({target}:{target:BUI.Button})=>{
                                            target.loading = true
                                            const paramChoice = 'Param1'
                                            const paramOne = paramLabelToValue(paramOneDropdown.value[0]);
                                            const paramOneB = paramLabelToValue(paramOneBDropdown.value[0]);
                                            const paramTwo = paramLabelToValue(paramTwoDropdown.value[0]);
                                            const paramTwoB = paramLabelToValue(paramTwoBDropdown.value[0]);
                                            const paramEnv = paramLabelToValue(materialsImpactsDropdown.value[0]);
                                            const paramOneFullNameLabel = `${paramOneDropdown.value[0]}${paramOneBDropdown.value[0]=='1'?'':`/${paramOneBDropdown.value[0]}`}`
                                            const paramTwoFullNameLabel = `${paramTwoDropdown.value[0]}${paramTwoBDropdown.value[0]=='1'?'':`/${paramTwoBDropdown.value[0]}`}`;
                                            const result_2 = await create_LOD21(world,components,geometryEngine,arrowData!,environmentalArrowData!,paramOne,paramOneB,paramTwo,paramTwoB,paramEnv!,previousLoadedSuburbs,paramOneFullNameLabel,paramTwoFullNameLabel,urbanTable,historyTable,paramChoice)
                                            result_2 ? await onSetTransparencyWithColors(1) : ''
                                            if (floatingGrid.layout && !(floatingGrid.layout as string).includes('down')) {
                                                onSetLayout({target:'down'})
                                            }
                                            //onSetCameraUVL(2)
                                            target.loading = false
                                        }}></bim-button>
                                        <bim-button style='flex:0' label="Param2" @click=${async ({target}:{target:BUI.Button})=>{
                                            target.loading = true
                                            const paramChoice = 'Param2'
                                            const paramOne = paramLabelToValue(paramOneDropdown.value[0]);
                                            const paramOneB = paramLabelToValue(paramOneBDropdown.value[0]);
                                            const paramTwo = paramLabelToValue(paramTwoDropdown.value[0]);
                                            const paramTwoB = paramLabelToValue(paramTwoBDropdown.value[0]);
                                            const paramEnv = paramLabelToValue(materialsImpactsDropdown.value[0]);
                                            const paramOneFullNameLabel = `${paramOneDropdown.value[0]}${paramOneBDropdown.value[0]=='1'?'':`/${paramOneBDropdown.value[0]}`}`
                                            const paramTwoFullNameLabel = `${paramTwoDropdown.value[0]}${paramTwoBDropdown.value[0]=='1'?'':`/${paramTwoBDropdown.value[0]}`}`;
                                            const result_2 = await create_LOD21(world,components,geometryEngine,arrowData!,environmentalArrowData!,paramOne,paramOneB,paramTwo,paramTwoB,paramEnv!,previousLoadedSuburbs,paramOneFullNameLabel,paramTwoFullNameLabel,urbanTable,historyTable,paramChoice)
                                            result_2 ? await onSetTransparencyWithColors(1) : ''
                                            if (floatingGrid.layout && !(floatingGrid.layout as string).includes('down')) {
                                                onSetLayout({target:'down'})
                                            }
                                            //onSetCameraUVL(2)
                                            target.loading = false
                                        }}></bim-button>
                                    </div>
                                </bim-context-menu>
                            </bim-button>
                        </div>
                        <bim-label>></bim-label>
                        
                        <bim-button label='3' tootltip='Load UVL-3' style="flex:1" @click=${async ({target}:{target:BUI.Button})=>{
                            target.loading = true
                            onSetLayout({target:'down'})
                            const result_3 = await create_LOD3(components,loadFragmentFile,world)
                            result_3[0] ? await onSetTransparencyWithColors(2) : ''
                            onSetCameraUVL(3)
                            if (result_3[1]) {
                                await world.camera.controls.setLookAt(result_3[1].x+100,result_3[1].y+100,result_3[1].z+100,result_3[1].x,result_3[1].y,result_3[1].z)
                            }
                            target.loading = false
                        }}></bim-button>
                        <bim-label>></bim-label>

                        <bim-button label='4' style="flex:1" @click=${async ({target}:{target:BUI.Button})=>{
                            target.loading = true
                            target.loading = false
                        }}></bim-button>
                    </div>
                    <div style='display:none; flex-direction:row; gap:1rem'>
                        <bim-button label='Log selection' @click=${()=>{
                            console.log(highlighter.selection.select)
                            console.log(fragments.list)
                        }}></bim-button>
                        <bim-button label='Log model' @click=${async ()=>{
                            for (const [k,m] of fragments.list.entries()){
                                console.log('model:',m)
                                console.log('coordinates:',await m.getCoordinates())
                                console.log('matrix:',await m.getCoordinationMatrix())
                            }
                        }}></bim-button>
                        <bim-button label='Log models' @click=${async ()=>{
                            for (const [m,n] of fragments.list.entries()){
                                console.log(m)
                                console.log(await n.getLocalIds())
                                console.log()
                            }
                        }}></bim-button>
                        <bim-button label='Color' @click=${async ()=>{
                            highlighter.styles.set('color_test', {color: new THREE.Color('rgba(26, 150, 65, 1)'),opacity: 1,transparent: false,renderedFaces: 1,})
                            highlighter.highlightByID('color_test', highlighter.selection.select, true, false)
                            console.log(highlighter.selection.select)
                        }}></bim-button>
                    </div>
                </bim-panel-section>
            `
        })

        //append components in panels
        panelLeft.appendChild(modelsListPanelSection)
        panelLeft.appendChild(selectElementByGuidPanelSection)
        panelLeft.appendChild(spatialTreePanelSection)
        panelLeft.appendChild(propertiesPanelSection)
        panelLeft.appendChild(colorUrbanPanelSection)
        
        //FLOATING GRID TO HOST THE TOOLBAR
        const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
            return BUI.html`
                <bim-grid
                    floating
                    style="padding: 0.5rem">
                </bim-grid>
            `;
        })

        //TOOLBAR COMPONENT
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            return BUI.html`
            <bim-toolbar style="justify-self: center; z-index:200">
                <bim-toolbar-section label="Scene">
                    <bim-button
                        id='world'
                        icon="tabler:world-cog"
                        tooltip-title="Scene Visibility Settings"
                        @click=${onSetLayout}>
                    </bim-button>
                    ${centerViewButton}
                    <bim-button
                        tooltip-title="Hide Markers"
                        icon="mdi:map-marker-remove-outline"
                        @click=${(e:Event)=>{
                            marker.list.forEach((entry)=>{
                                entry.forEach((marker) => {
                                    marker.label.visible = marker.label.visible ? false : true
                                })
                            })
                            const target = e.target as BUI.Button
                            target.icon = target.icon=="mdi:map-marker-remove-outline" ? "mdi:map-marker-outline" : "mdi:map-marker-remove-outline"
                            target.tooltipTitle = target.tooltipTitle=='Hide Markers' ? 'Show Markers' : 'Hide Markers'
                        }}
                    ></bim-button>
                    <bim-button
                        style="display:${devElementsVisibility}"
                        tooltip-title="Print on console position and target of the camera"
                        icon="streamline-flex:camera-tripod-remix"
                        @click=${()=>{
                            console.log('Camera position:', world.camera.controls.getPosition(new THREE.Vector3))
                            console.log('Camera target', world.camera.controls.getTarget(new THREE.Vector3))
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Samples">
                    <bim-dropdown verical placeholder="Load...">
                        <bim-option>
                            <bim-button
                                icon="fluent:data-histogram-24-filled"
                                label="Canberra (AU)"
                                @click=${async ({target}:{target:BUI.Button}) => {
                                        onSetLayout({target:'left'})
                                        target.loading = true
                                        arrowData = await readArrow('materials')
                                        populationArrowData = await readArrow('population')
                                        environmentalArrowData = await readArrow('environmental')
                                        await suburbsBoundaries(world,components,arrowData!)
                                        collapsePanelSections()
                                        target.loading = false
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
                <bim-toolbar-section id="test-section" label="TEST" style="display:${devElementsVisibility}">
                    <bim-button
                        label="Sample"
                        tooltip-title="Load sample IFC models."
                        @click=${() => {
                            loadIfcFile("/assets/Sample_with costs.ifc")
                            //loadIfcFile("/assets/SFH_with costs.ifc")
                            }}>
                    </bim-button>
                    <bim-button
                        label='Volume'
                        tooltip-title="Print volume of selected item"
                        @click=${() => {
                                //getVolume
                                console.log(highlighter.selection.select)
                            }}
                    ></bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })

        const panelDownHeight = '40%'
        const panelLeftWidth = '20%'
        const panelRightWidth = '20%'
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