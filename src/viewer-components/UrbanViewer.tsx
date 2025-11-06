import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as FRAGS from '@thatopen/fragments'
import * as BUIC from '@thatopen/ui-obc'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import { getIFCClassNamesFromCodes } from '../custom-components/ifc-code-converter'
import Stats from 'stats.js'
import { readArrow } from '../custom-components/readArrow'
import { bar_create_LOD0 } from '../custom-components/bar_create_LOD0'
import { bar_create_LOD1 } from '../custom-components/bar_create_LOD1'
import { addOverlay } from '../custom-components/addOverlay'
import { createTable } from '../custom-components/createTable'


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
        const defaultPosition_CameraXYZ = 300
        const defaultPosition_TargetXYZ = 0
        await world.camera.controls.setLookAt(defaultPosition_CameraXYZ,defaultPosition_CameraXYZ,defaultPosition_CameraXYZ,defaultPosition_TargetXYZ,defaultPosition_TargetXYZ,defaultPosition_TargetXYZ) // convenient position for the model we will load
        world.camera.threeOrtho.far = 20000 // distanza massima del clipping plane per vedere gli oggetti: per la camera ortografica
        world.camera.threePersp.far = 20000 // distanza massima del clipping plane per vedere gli oggetti: per la camera prospettica (quella usata di default)
        world.camera.controls.minDistance = 500 //serve per poter continuare a zoommare velocemente anche da distante, tuttavia modifica anche lo zoom quando si seleziona un elemento ma va bene lo stesso
        // #endregion

        // #region COPONENTS GENERAL SETUP
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.distance = 1000
        grid.config.color.set('rgba(28, 28, 28, 1)')
        
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
        const arrowData = await readArrow()
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
            addOverlay(BUI.html`<b><i>${modelId}</i></b> model loaded in <b>${loadTime}</b> seconds.`)
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
        const onSetTransparencyWithColors = async (LOD:number=0) => {
            const frMap: OBC.ModelIdMap = {}
            for (const [entry,entryfr] of fragments.list.entries()){
                if (!entry.includes(`LOD_${LOD}`)) continue
                const localids = await entryfr.getLocalIds()
                localids.forEach((id) => {
                    if (highlighter.selection.color_0_02[entry] && highlighter.selection.color_0_02[entry].has(id)){
                        highlighter.highlightByID('color_0_02_transparent',{[entry] : new Set<number>([id])},false,false)
                    } else if (highlighter.selection.color_02_04[entry] && highlighter.selection.color_02_04[entry].has(id)){
                        highlighter.highlightByID('color_02_04_transparent',{[entry] : new Set<number>([id])},false,false)
                    } else if (highlighter.selection.color_04_06[entry] && highlighter.selection.color_04_06[entry].has(id)){
                        highlighter.highlightByID('color_04_06_transparent',{[entry] : new Set<number>([id])},false,false)
                    } else if (highlighter.selection.color_06_08[entry] && highlighter.selection.color_06_08[entry].has(id)){
                        highlighter.highlightByID('color_06_08_transparent',{[entry] : new Set<number>([id])},false,false)
                    } else if (highlighter.selection.color_08_1[entry] && highlighter.selection.color_08_1[entry].has(id)){
                        highlighter.highlightByID('color_08_1_transparent',{[entry] : new Set<number>([id])},false,false)
                    }
                    //console.log(highlighter.selection)
                })
            }
            highlighter.selection.select = {} //pulisce la selezione
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
            ascending = (direction == '(highest-up)' || direction == '(A-down)') ? false : true
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
        fragments.list.onItemDeleted.add(() => {
            onClearPanel(panelDown) //clear down panel
            onClearPanel(panelRight)
        })
        const loadingLabel = BUI.Component.create<BUI.Label>(()=>{
            return BUI.html`
                <bim-label style='padding:20px'>Loading...</bim-label>
            `
        })
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

        const suburbsDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="suburbs" label='Suburb'>
                <bim-option label="Acton" value="ACTON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Ainslie" value="AINSLIE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Amaroo" value="AMAROO" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Aranda" value="ARANDA" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Banks" value="BANKS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Barton" value="BARTON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Belconnen" value="BELCONNEN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Bonner" value="BONNER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Bonython" value="BONYTHON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Braddon" value="BRADDON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Bruce" value="BRUCE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Calwell" value="CALWELL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Campbell" value="CAMPBELL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Capital hill" value="CAPITAL HILL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Casey" value="CASEY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Chapman" value="CHAPMAN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Charnwood" value="CHARNWOOD" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Chifley" value="CHIFLEY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Chisholm" value="CHISHOLM" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="City" value="CITY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Conder" value="CONDER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Cook" value="COOK" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Coombs" value="COOMBS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Crace" value="CRACE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Curtin" value="CURTIN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Deakin" value="DEAKIN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Denman prospect" value="DENMAN PROSPECT" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Dickson" value="DICKSON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Downer" value="DOWNER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Duffy" value="DUFFY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Dunlop" value="DUNLOP" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Evatt" value="EVATT" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Fadden" value="FADDEN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Farrer" value="FARRER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Fisher" value="FISHER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Florey" value="FLOREY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Flynn" value="FLYNN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Forde" value="FORDE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Forrest" value="FORREST" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Franklin" value="FRANKLIN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Fraser" value="FRASER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Fyshwick" value="FYSHWICK" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Garran" value="GARRAN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Gilmore" value="GILMORE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Giralang" value="GIRALANG" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Gordon" value="GORDON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Gowrie" value="GOWRIE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Greenway" value="GREENWAY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Griffith" value="GRIFFITH" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Gungahlin" value="GUNGAHLIN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Hackett" value="HACKETT" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Hall" value="HALL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Harrison" value="HARRISON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Hawker" value="HAWKER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Higgins" value="HIGGINS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Holder" value="HOLDER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Holt" value="HOLT" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Hughes" value="HUGHES" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Hume" value="HUME" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Isaacs" value="ISAACS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Isabella plains" value="ISABELLA PLAINS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Jacka" value="JACKA" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Kaleen" value="KALEEN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Kambah" value="KAMBAH" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Kingston" value="KINGSTON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Latham" value="LATHAM" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Lawson" value="LAWSON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Lyneham" value="LYNEHAM" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Lyons" value="LYONS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Macarthur" value="MACARTHUR" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Macgregor" value="MACGREGOR" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Macquarie" value="MACQUARIE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Mawson" value="MAWSON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Mckellar" value="MCKELLAR" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Melba" value="MELBA" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Mitchell" value="MITCHELL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Monash" value="MONASH" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Moncrieff" value="MONCRIEFF" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Narrabundah" value="NARRABUNDAH" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Ngunnawal" value="NGUNNAWAL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Nicholls" value="NICHOLLS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="O'connor" value="O'CONNOR" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="O'malley" value="O'MALLEY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Oxley" value="OXLEY" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Page" value="PAGE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Palmerston" value="PALMERSTON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Parkes" value="PARKES" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Pearce" value="PEARCE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Phillip" value="PHILLIP" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Red hill" value="RED HILL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Reid" value="REID" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Richardson" value="RICHARDSON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Rivett" value="RIVETT" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Russell" value="RUSSELL" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Scullin" value="SCULLIN" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Spence" value="SPENCE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Stirling" value="STIRLING" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Theodore" value="THEODORE" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Torrens" value="TORRENS" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Turner" value="TURNER" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Wanniassa" value="WANNIASSA" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Waramanga" value="WARAMANGA" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Watson" value="WATSON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Weetangera" value="WEETANGERA" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Weston" value="WESTON" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Wright" value="WRIGHT" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label="Yarralumla" value="YARRALUMLA" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const paramOneDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="param_one" label='Parameter 1 (height)'>
                <bim-option label='Building height' value="BLDGHEI" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Footprint area' value="grnd_fl" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Gross floor area' value="grss_fl" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Net floor area' value="usbl_fl" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Total tonnes' value="Tonnes" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Aluminium' value="Aluminm" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Bitumen' value="Bitumen" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Carpet' value="Carpet" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ceramics' value="Ceramcs" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Concrete' value="Concret" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Copper' value="Copper" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Glass' value="Glass" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Insulation' value="Insultn" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Paint' value="Paint" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plasterboard' value="Plstrbr" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plastics' value="Plastcs" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Sand' value="Snd_nd_" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Steel' value="Steel" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Timber' value="Timber" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const paramTwoDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="param_two" label='Parameter 2 (color)'>
                <bim-option label='Building height' value="BLDGHEI" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Footprint area' value="grnd_fl" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Gross floor area' value="grss_fl" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Net floor area' value="usbl_fl" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Total tonnes' value="Tonnes" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Aluminium' value="Aluminm" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Bitumen' value="Bitumen" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Carpet' value="Carpet" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Ceramics' value="Ceramcs" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Concrete' value="Concret" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Copper' value="Copper" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Glass' value="Glass" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Insulation' value="Insultn" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Paint' value="Paint" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plasterboard' value="Plstrbr" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Plastics' value="Plastcs" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Sand' value="Snd_nd_" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Steel' value="Steel" style="padding:0 10px 0 10px"></bim-option>
                <bim-option label='Timber' value="Timber" style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        // #endregion



        const previousLoadedSuburbs: string[] = []
        const colorUrbanPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            return BUI.html`
                <bim-panel-section
                    label = "Environmental Urban Analysis"
                    icon = "ic:round-format-color-fill">
                    ${colorScaleDropdown}
                    ${paramOneDropdown}
                    ${paramTwoDropdown}
                    <div style='display:flex; flex-direction:row; gap:1rem'>
                        <bim-label>Levels of Detail:</bim-label>

                        <bim-button label='0' tooltip='Load LOD 0' @click=${async (e:Event)=>{
                            await bar_create_LOD0(world,components,geometryEngine,arrowData,paramOneDropdown.value[0],paramTwoDropdown.value[0]);
                            //(e.target! as BUI.Button).disabled = true
                            await createTable(panelDown,fragments,components,paramOneDropdown.value[0],paramTwoDropdown.value[0])
                            onSetLayout({target:'down'})
                        }}></bim-button>

                        <bim-button label='1' tootltip='Load LOD 1 and hide LOD 0' @click=${async ()=>{
                            await bar_create_LOD1(world,components,geometryEngine,arrowData,paramOneDropdown.value[0],paramTwoDropdown.value[0],previousLoadedSuburbs)
                            onSetTransparencyWithColors(0)
                        }}></bim-button>

                        <bim-button label='2' tootltip='Load LOD 2' @click=${async ()=>{
                            loadFragmentFile("/FRAG/Sample_one-story-house.frag")
                        }}></bim-button>
                        
                        <bim-button label='3'></bim-button>

                        <bim-button label='4'></bim-button>
                    </div>
                    <div style='display:flex; flex-direction:row; gap:1rem'>
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
                            highlighter.styles.set('color_test', {color: new THREE.Color('rgba(26, 150, 65, 1)'),opacity: 1,transparent: false,renderedFaces: 0,})
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
                style="padding: 20px">
                </bim-grid>
            `;
        })

        //TOOLBAR COMPONENT
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            return BUI.html`
            <bim-toolbar style="justify-self: center">
                <bim-toolbar-section label="Scene">
                    <bim-button
                        id='world'
                        icon="tabler:world-cog"
                        tooltip-title="Scene Visibility Settings"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        tooltip-title="Center View"
                        icon="material-symbols:center-focus-weak"
                        @click=${async ()=>{
                            await world.camera.controls.setLookAt(defaultPosition_CameraXYZ,defaultPosition_CameraXYZ,defaultPosition_CameraXYZ,defaultPosition_TargetXYZ,defaultPosition_TargetXYZ,defaultPosition_TargetXYZ)
                            //world.camera.fitToItems()
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Samples">
                    <bim-dropdown verical placeholder="Load...">
                        <bim-option>
                            <bim-button
                                icon="fluent:data-histogram-24-filled"
                                label="Canberra (AU)"
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