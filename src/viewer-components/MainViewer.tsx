import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as FRAGS from '@thatopen/fragments'
import * as BUIC from '@thatopen/ui-obc'
//import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import { getIFCClassNamesFromCodes } from '../custom-components/ifc-code-converter'
import { convertCurrency, convertUnits, formatNumber, formatNumber_Cost } from '../custom-components/conversion'
import { normalizeAndMapToColor, groupIdsByNormalizedValuePerModel, getColorRangeKeyByColorValue, getNormalizedValueFromColor } from '../custom-components/colors'
import Stats, { Panel } from 'stats.js'

// These constants: 
// - are fundamental for the whole viewer to identify different IfcCostItem and IfcCostValue instances in the IFC model;
// - could be personalized to different uses but must be consistent with the values used in the IFC file;
// - define the labels of the dropdown menus for the cost analysis (so they are consistent with the IFC properties they refer to);
// - define the labels used in the ifc file to identify the different instances of IfcCostItem and IfcCostValue;
// - must be written in UPPPER CASE so the code automatically avoids problems with different capitalizations in the ifc files;
// - must be paid attention to their spelling, included special or space charecters
const IfcFileLabel_CostAssignment = 'COST ASSIGNMENT' // PredefinedType value of IfcCostItem related (through IfcRelAssignsToControl) to model elements
const IfcFileLabel_TotalCost = 'TOTAL COST' // Category attribute value of IfcCostValue inserted within IfcCostItem instances
const IfcFileLabel_UnitCost = 'UNIT COST' // Category attribute value of IfcCostValue insert within IfcCostValue instances of total cost
const IfcFileLabel_PriceAnalysis_Material = 'MATERIAL' // Category attribute value of IfcCostValue insert within IfcCostValue instances of unit cost for materials resource
const IfcFileLabel_PriceAnalysis_Labor = 'LABOR' // Category attribute value of IfcCostValue insert within IfcCostValue instances of unit cost for labor resource
const IfcFileLabel_PriceAnalysis_Equipment = 'EQUIPMENT' // Category attribute value of IfcCostValue insert within IfcCostValue instances of unit cost for equipment resource

export function MainViewer () {

    // #region GENERAL START
    //BUI.Manager.init()
    const components = new OBC.Components()
    const ifcImporter = new FRAGS.IfcImporter
    ifcImporter.addAllAttributes()
    ifcImporter.addAllRelations()
    const importedCategories = getIFCClassNamesFromCodes([...ifcImporter.classes.elements]) //this is only a list of strings of all the imported categories. this is not the FULL list of IFC classes
    importedCategories.push(
        'ALL IFC CLASSES'
    )
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
        const clipper = components.get(OBC.Clipper)
        const casters = components.get(OBC.Raycasters)
        
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
        world.scene.three.background = new THREE.Color('rgb(53, 53, 70)')
        //RENDERER
        const container = document.getElementById("main-viewer")! as BUI.Viewport
        world.renderer = new OBCF.PostproductionRenderer(components, container)
        //world.renderer = new OBC.SimpleRenderer(components, container)
        //CAMERA
        world.camera = new OBC.OrthoPerspectiveCamera(components)
        await world.camera.controls.setLookAt(30,30,30,0,0,0) // convenient position for the model we will load
        // #endregion

        // #region COPONENTS GENERAL SETUP
        //INITIALIZE ALL COMPONENTS
        BUIC.Manager.init()
        //BUI.Manager.init()
        components.init()
        casters.get(world)
        clipper.enabled = true
        container.ondblclick = () => {
            if (clipper.enabled) {
                clipper.create(world)
            }
        }

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('rgba(28, 28, 28, 1)')
        
        world.renderer.postproduction.enabled = true
        world.dynamicAnchor = false

        //VIEW CUBE
        const viewCube = document.createElement("bim-view-cube") as BUIC.ViewCube
        viewCube.camera = world.camera.three
        container.append(viewCube)
        world.camera.controls.addEventListener("update", () => viewCube.updateOrientation())
        viewCube.topText = "TOP"
        viewCube.bottomText = "BOTTOM"
        viewCube.leftText = "LEFT"
        viewCube.rightText = "RIGHT"
        viewCube.frontText = "FRONT"
        viewCube.backText = "BACK"
        const getModelsBoundingSphere = () => {
            const totalBox = new THREE.Box3()
            fragments.list.forEach((model) => {totalBox.union(model.box)})
            if (totalBox.isEmpty()) return null
            const sphere = new THREE.Sphere()
            totalBox.getBoundingSphere(sphere)
            return sphere
        }
        const lookAtModelFromDirection = (direction: THREE.Vector3) => {
            const sphere = getModelsBoundingSphere()
            if (!sphere) return
            const cameraPosition = sphere.center.clone().add(direction.clone().multiplyScalar(sphere.radius))
            world.camera.controls.setLookAt(cameraPosition.x,cameraPosition.y,cameraPosition.z,sphere.center.x,sphere.center.y,sphere.center.z,true)
        }
        viewCube.addEventListener("leftclick", () => {lookAtModelFromDirection(new THREE.Vector3(-1, 0, 0))})
        viewCube.addEventListener("rightclick", () => {lookAtModelFromDirection(new THREE.Vector3(1, 0, 0))})
        viewCube.addEventListener("topclick", () => {lookAtModelFromDirection(new THREE.Vector3(0, 1, 0))})
        viewCube.addEventListener("bottomclick", () => {lookAtModelFromDirection(new THREE.Vector3(0, -1, 0))})
        viewCube.addEventListener("frontclick", () => {lookAtModelFromDirection(new THREE.Vector3(0, 0, 1))})
        viewCube.addEventListener("backclick", () => {lookAtModelFromDirection(new THREE.Vector3(0, 0, -1))})
        viewCube.style.setProperty('--bim-view-cube_x--bgc', 'rgba(59, 60, 79, 0.9)')
        viewCube.style.setProperty('--bim-view-cube_y--bgc', 'rgba(69, 70, 89, 0.9)')
        viewCube.style.setProperty('--bim-view-cube_z--bgc', 'rgba(79, 80, 99, 0.9)')
        viewCube.style.zIndex = '0'
        //END VIEW CUBE

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
        highlighter.events.select.onClear.add((modelIdMap) => {
            previousSelection = structuredClone(modelIdMap)
        })
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
                path: "https://unpkg.com/web-ifc@0.0.75/",
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
            // Remove z fighting
            if (!("isLodMaterial" in material && material.isLodMaterial)) {
                material.polygonOffset = true;
                material.polygonOffsetUnits = 1;
                material.polygonOffsetFactor = Math.random();
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
        const loadIfcFile = async (path: string, fileName: string) => {
            const name = fileName.split('.ifc')[0] || fileName
            const file = await fetch(path);
            const data = await file.arrayBuffer();
            const buffer = new Uint8Array(data);
            const startTime = performance.now(); // Start timer
            //THIS IS THE MOST FUNDAMENTAL THING FOR ADDING CLASSES TO IMPORT.
            //FRAGMENTS 2.0 DOES NOT IMPORT BY DEFAULT ALL THE IFC CLASSES
            //These addAllAttributes and addAllRelations methods were added in new versions of fragments to import everything from IFC schema
            const model = await ifcLoader.load(
                buffer,
                true, //coordinate model
                name,
                {
                    instanceCallback(importer) {
                        importer.addAllAttributes()
                        importer.addAllRelations()
                    }
                }
            )
            // model.getClippingPlanesEvent = () => {
            //     return Array.from(world.renderer!.three.clippingPlanes) || [];
            // };
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
                    await loadIfcFile(url,file.name);
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
                const model = await fragments.core.load(buffer, { modelId: modelId })
                // model.getClippingPlanesEvent = () => {
                //     return Array.from(world.renderer!.three.clippingPlanes) || [];
                // };
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
        fragments.list.onItemSet.add(({value:model}) => {
            model.getClippingPlanesEvent = () => {
                return Array.from(world.renderer!.three.clippingPlanes) || [];
            }
        })

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
        const onSetTransparencyToCostColor = async (e:Event) => {
            const selItems = highlighter.selection.select
            const buttonLabel = (e.target as any as BUI.Button).label
            if (buttonLabel=='Reset'){
                highlighter.highlightByID('color_0_02', highlighter.selection.color_0_02_transparent, false, false)
                highlighter.highlightByID('color_02_04', highlighter.selection.color_02_04_transparent, false, false)
                highlighter.highlightByID('color_04_06', highlighter.selection.color_04_06_transparent, false, false)
                highlighter.highlightByID('color_06_08', highlighter.selection.color_06_08_transparent, false, false)
                highlighter.highlightByID('color_08_1', highlighter.selection.color_08_1_transparent, false, false)    
            } else if (buttonLabel=='Ghost') {
                //quando aggiorneranno i pacchetti sara' da aggiornare usando come prima direttamente il parametro exclude con setItems
                await highlighter.highlightByID('color_0_02_transparent', highlighter.selection.color_0_02, true, false)
                await highlighter.highlightByID('color_02_04_transparent', highlighter.selection.color_02_04, true, false)
                await highlighter.highlightByID('color_04_06_transparent', highlighter.selection.color_04_06, true, false)
                await highlighter.highlightByID('color_06_08_transparent', highlighter.selection.color_06_08, true, false)
                await highlighter.highlightByID('color_08_1_transparent', highlighter.selection.color_08_1, true, false)

                highlighter.highlightByID('color_0_02', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_0_02_transparent,selItems]), false, false)
                highlighter.highlightByID('color_02_04', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_02_04_transparent,selItems]), false, false)
                highlighter.highlightByID('color_04_06', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_04_06_transparent,selItems]), false, false)
                highlighter.highlightByID('color_06_08', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_06_08_transparent,selItems]), false, false)
                highlighter.highlightByID('color_08_1', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_08_1_transparent,selItems]), false, false)
            } else {
                console.log('Analysis still not performed.')
            }
            //console.log(highlighter.selection)
            await highlighter.clear('select')
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
            button.tooltipTitle = table.expanded ? "Collapse" : "Expand";
            button.icon = table.expanded ? "si:expand-less-fill" : "si:expand-more-fill";
        }
        
        const onSortDynamicTable = ( //funziona sia per total che resource cost
            table:BUI.Table<any>,
            field:string,
            ascending:boolean=true,
            totalOrResourceCostPerGroupedTable: {[group: string]: {cost?: number, resourceCost?: number}},
            totalOrResource:string='total'
        ) => {
            function parseValue(value: string | number): number | string {
                const normalizedValue = String(value ?? '')
                const valueParts = normalizedValue.split(' ')
                const numericPart = valueParts.length > 1 ? valueParts.slice(0, -1).join('') : valueParts[0]
                const parsed = Number(numericPart)
                if (!isNaN(parsed) && numericPart) { return parsed }
                return normalizedValue.toLowerCase()
            }

            function getSortSourceValue(row: BUI.TableGroupData<any>) {
                const sortField = field === 'Cost' // se field = Cost sceglie tra total or resource altrimenti ritorna direttamente field
                    ? totalOrResource === 'total' ? 'Cost' : 'ResourceCost'
                    : field
                if (field === 'Cost' && row.children?.length) {
                    const groupKey =
                        row.data.ElementName ||
                        row.data.ResourceName ||
                        row.data.CostItemName ||
                        row.data.ElementIfcClass
                    if (groupKey && totalOrResourceCostPerGroupedTable[groupKey]) {
                        const groupedCost = totalOrResourceCostPerGroupedTable[groupKey]
                        return groupedCost.cost ?? groupedCost.resourceCost ?? ''
                    }
                }
                if ([sortbyTotalCostDropdown_optionOne.label, sortbyResourceDropdown_optionOne.label].includes(`${sortField}Range`) && row.data[sortField] == '') {
                    return row.data[`${sortField}Range`] ?? ''
                }
                return row.data[sortField] ?? ''
            }

            const direction = ascending ? 1 : -1
            const sortValueCache = new WeakMap<BUI.TableGroupData<any>, number | string>()

            const getComparableValue = (row: BUI.TableGroupData<any>) => {
                const cached = sortValueCache.get(row)
                if (cached !== undefined) return cached
                const value = parseValue(getSortSourceValue(row))
                sortValueCache.set(row, value)
                return value
            }

            const compareRows = (a: BUI.TableGroupData<any>, b: BUI.TableGroupData<any>) => {
                const valA = getComparableValue(a)
                const valB = getComparableValue(b)
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * direction
                }
                return valA.toString().localeCompare(valB.toString()) * direction
            }

            const sortRowsRecursively = (rows: BUI.TableGroupData<any>[]) => {
                rows.sort(compareRows)
                for (const row of rows) {
                    if (!row.children?.length) continue
                    sortRowsRecursively(row.children)
                }
            }

            sortRowsRecursively(table.value)
            table.requestUpdate()
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

        // #region
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
        function takeScreenshot() {
            if (!world.renderer) return;
            world.renderer.three.render(world.scene.three, world.camera.three);
            const link = document.createElement("a");
            link.download = "screenshot.png";
            link.href = world.renderer.three.domElement.toDataURL();
            link.click();
        }
        const addOverlay = (sentence:BUI.TemplateResult=BUI.html`Overlay <b>example</b>`) => {
            const overlay = document.getElementById("overlay");
            if (overlay) {
                const label = BUI.Component.create<HTMLDivElement>(() => {
                    return BUI.html`
                    <div style="text-align:center; padding:10px; background:rgba(0,0,0,0.2); border-radius: 10px; margin: 5px">
                        ${sentence}
                    </div>`
                })
                overlay.appendChild(label)
                setTimeout(() => {
                    label.style.display = "none";
                }, 4000); // Nasconde dopo 4 secondi
            }
        }
        // #endregion

        let groupBy_CostRange_Btn: BUI.Button

        const onColorByCost = async ({target}: {target: BUI.Button | string}) => {
            const startTime_tot = performance.now(); // Start timer
            const btn = typeof target === 'string' ? target : target.label //read if the clicked button is "color" or "select"
            let [resource] = resourcesDropdown.value //read the value of the resource dropdown menu (single choice)
            let category = categoriesDropdown.value.includes('ALL IFC CLASSES') ? importedCategories : categoriesDropdown.value //read the value of category dropdown menu, list is kept because multiple choices are accepted
            const [normalization] = unitMeasureDropdown.value //read the value of normalization by button (single choice)
            const [colorscale] = colorScaleDropdown.value ? colorScaleDropdown.value : 'gnylrd'
            const rangeMin = rangeInputMin.value
            const rangeMax = rangeInputMax.value
            const rangeIntervalInOut = rangeInterval.label
            const rangeNormalOrCost = rangeCost.label
            const limitSelection = limitToSelection.checked
            const limitToCostItemNameList = limitToCostItemName.value ? limitToCostItemName.value.split(',').map(s => s.trim()) : []

            resource = resource == undefined ? IfcFileLabel_TotalCost : resource //if any resource selected use TotalCost as default
            category = category.length == 0 ? importedCategories : category  //if any category selected use al categories as default
            
            if (!resource || !category) {
                updateCountLabel({countItems:0, countCostItems:0, countResources:0})
                return //if one of the two is not selected return the function (nothing will be done)
            }
            
            if (btn == 'Color'){
                updateCountLabel({countItems:'loading...', countCostItems:'loading...', countResources:'loading...'})
                onClearPanel(panelDown) //clear down panel
                onClearPanel(panelRight)
                panelDown.appendChild(loadingLabel)
                resource!=IfcFileLabel_TotalCost ? panelDown.label = `${resource} Resource Cost` : panelDown.label = 'Elements Total Cost' //change the title of the panel
                const gridLayout = floatingGrid.layout as any //change the grid layout
                if (!gridLayout.includes('down')){
                    onSetLayout({target:'down'})
                }
            }

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
            finder.create('COSTITEM_REL_CATEGORY_CODE', [
                {
                    categories: [/COSTITEM/],
                    attributes: {
                        queries: [{
                            name: /^Name$/,
                            value: limitToCostItemNameList.map(v => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
                        }]
                    },
                    relation: {
                        name: "Controls",
                        query: {
                            categories: Array.isArray(category) ? category.map(c => new RegExp(`^${c}$`)) : [new RegExp(`^${category}$`)]
                        }
                    }
                },
            ])

            // ora è possibile colorare solo gli elementi selezionati se la spunta per questo filtro è attiva
            const modelsList = Array.from(fragments.list.keys())
            let final_costitem_ids: OBC.ModelIdMap | undefined = {}
            modelsList.forEach((model) => {
                if (final_costitem_ids) {
                    final_costitem_ids[model] = new Set<number>()
                }
            }) //initialize the map with empty sets for each model --> needed to transparency other models if do not have cost items

            if (limitSelection) {
                const selection = highlighter.selection.select
                const selectionData = await fragments.getData(selection, { relations: { 'HasAssignments': { attributes: true, relations: false } } })
                for (const [model, elements] of Object.entries(selectionData)) {
                    const costItemIds = new Set<number>()
                    for (const element of elements) {
                        const assignments = (element as any)?.['HasAssignments'] as any[] | undefined
                        if (!assignments?.length) continue
                        for (const assignment of assignments) {
                            const isCostItem = assignment?._category?.value === "IFCCOSTITEM"
                            const localId = assignment?._localId?.value
                            const costItemName = assignment?.Name?.value as string
                            if (limitToCostItemNameList.length > 0 && !limitToCostItemNameList.includes(costItemName)) {
                                continue //skip this cost item if its name is not in the list of allowed names
                            }
                            if (isCostItem && typeof localId === 'number') {
                                costItemIds.add(localId)
                            }
                        }
                    }
                    final_costitem_ids[model] = costItemIds
                }
            } else {
                //here query is executed
                const startTime_1 = performance.now(); // Start timer
                limitToCostItemNameList.length == 0 ?
                    final_costitem_ids = await finder.list.get('COSTITEM_REL_CATEGORY')?.test() :
                    final_costitem_ids = await finder.list.get('COSTITEM_REL_CATEGORY_CODE')?.test()
                const endTime_1 = performance.now(); // End timer
                const loadTime_1 = ((endTime_1 - startTime_1) / 1000).toFixed(2); // seconds
                console.log(`TIME ${loadTime_1} s: find localIds of all cost items related to selected categories`);
            }

            if (!final_costitem_ids || Object.keys(final_costitem_ids).length == 0) { //return the function if any cost item is found and print the message in the panel
                if (limitSelection) {
                    panelDown.innerHTML = `
                        <bim-label style="padding:1rem; padding-bottom:0.25rem;"><strong>ATTENTION: "Limit to selected elements" setting is enabled BUT no elements are selected</strong></bim-label>
                    `
                } else {
                    panelDown.innerHTML = `
                        <bim-label style="padding:1rem; padding-bottom:0.25rem;"><strong>Any COST ITEM related to:</strong></bim-label>
                        <bim-label style="display:flex; padding:1rem; padding-top:0px; white-space:normal">${category.join(", ").replace("ALL IFC CLASSES, ", "")}.</bim-label>
                    `
                }
                updateCountLabel({countItems:0, countCostItems:0, countResources:0})
                return
            }

            //step 2: get data of found cost items
            const startTime_2 = performance.now(); // Start timer
            const filteredCostItems = await fragments.getData(final_costitem_ids, {
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

            if (resource != IfcFileLabel_TotalCost){ //this means that a resource is selected
                type elemDataType = {
                    elemModel: string,
                    elemId: number,
                    elemName: string,
                    totalResourceCost: number,
                    currency: string,
                    category: string,
                }
                //initialize some maps needed for the process
                const model_resources_Map: {[key:string]:{[key:number]:number}} = {} //map per each model
                const model_costCount_Map: {[key:string]:{[key:number]:number}} = {} //map per each model
                const elementsData_Array: elemDataType[] = [] //array to stock data of each element to be shown in the table
                const elem_resourcesDetails_Map: {[key:number]:{resourceUnitCost:string, elemQuantity:string, resourceDescription:string, resourceName:string}[]} = {} //resource details object
                const getLocalId = (item: any) => item?._localId?.value as number | undefined
                const mapItemsByLocalId = (items: any[] = []) => {
                    const itemsMap: {[key:number]:any} = {}
                    for (const item of items) {
                        const localId = getLocalId(item)
                        if (typeof localId === 'number') itemsMap[localId] = item
                    }
                    return itemsMap
                }

                const startTime_resourceCostData = performance.now(); // Start timer
                for (const [model,costItems] of Object.entries(filteredCostItems)){ //loop over each model
                    let resourceCurrency = 'nd' //default value, here because is supposed that is used always the same currency in the same project
                    const elem_resources_Map: {[key:number]:number} = {} //map to associate to each element id the related sum of ALL costs of the chosen resource category
                    const elem_costCount_Map: {[key:number]:number} = {} //map to associate to each element id the number of related cost items
                    const costItemMeta = costItems.map((ci) => {
                        // --> pay attention: multiple cost items could be related to the same object and moreover each cost item could have more than one unit cost of the same category
                        // example: one column with 5 cost items related and each cost item has 1,2,3 or more unit costs of the same category
                        const elemId = (((ci['Controls'] as any)[0] as FRAGS.ItemData)['_localId'] as FRAGS.ItemAttribute).value as number //localId of filtered elements
                        const cvId = (ci['CostValues'] as any)[0]._localId.value ? (ci['CostValues'] as any)[0]._localId.value : 'nd'
                        return typeof cvId === 'number' ? { ci, elemId, cvId } : null
                    }).filter(Boolean) as {ci:any, elemId:number, cvId:number}[]

                    const costValueIds = new Set<number>(costItemMeta.map(({ cvId }) => cvId))
                    const costValueRecord = costValueIds.size === 0 ? null : await fragments.getData({[model]: costValueIds},{
                        attributesDefault: true,
                        relationsDefault: {
                            attributes: true,
                            relations: false //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                        }
                    })
                    const costValuesById = mapItemsByLocalId(costValueRecord?.[model] as any[] ?? [])

                    const unitBasisIds = new Set<number>()
                    const componentIds = new Set<number>()
                    const elementIds = new Set<number>()
                    for (const { elemId, cvId } of costItemMeta) {
                        elementIds.add(elemId)
                        const costValue = costValuesById[cvId]
                        const unitBasisId = getLocalId(costValue?.['UnitBasis']?.[0])
                        const componentId = getLocalId(costValue?.['Components']?.[0])
                        if (typeof unitBasisId === 'number') unitBasisIds.add(unitBasisId)
                        if (typeof componentId === 'number') componentIds.add(componentId)
                    }

                    const unitBasisRecord = unitBasisIds.size === 0 ? null : await fragments.getData({[model]: unitBasisIds},{
                        attributesDefault: true,
                        relationsDefault: {
                            attributes: true,
                            relations: false
                        }
                    })
                    const unitBasisById = mapItemsByLocalId(unitBasisRecord?.[model] as any[] ?? [])

                    const componentsRecord = componentIds.size === 0 ? null : await fragments.getData({[model]: componentIds},{
                        attributesDefault: true,
                        relationsDefault: {
                            attributes: true,
                            relations: true
                        }
                    })
                    const componentsById = mapItemsByLocalId(componentsRecord?.[model] as any[] ?? [])

                    const priceAnalysisComponentIds = new Set<number>()
                    for (const component of Object.values(componentsById)) {
                        const priceAnalysisComponents = (component as any)?.['Components']
                        if (!priceAnalysisComponents) continue
                        for (const priceAnalysisComponent of priceAnalysisComponents) {
                            const pacId = getLocalId(priceAnalysisComponent)
                            if (typeof pacId === 'number') priceAnalysisComponentIds.add(pacId)
                        }
                    }

                    const priceAnalysisComponentRecord = priceAnalysisComponentIds.size === 0 ? null : await fragments.getData({[model]: priceAnalysisComponentIds},{
                        attributesDefault: true,
                        relationsDefault: {
                            attributes: true,
                            relations: true
                        }
                    })
                    const priceAnalysisComponentById = mapItemsByLocalId(priceAnalysisComponentRecord?.[model] as any[] ?? [])

                    const modelItems = elementIds.size === 0
                        ? []
                        : await fragments.list.get(model)?.getItemsData([...elementIds]) ?? []
                    const modelItemsById = mapItemsByLocalId(modelItems as any[])

                    for (const { elemId, cvId } of costItemMeta) { //loop over each filtered cost item (cost items are not ordered)
                        const costValue = costValuesById[cvId]
                        if (!costValue) continue

                        const elemQuantity = costValue['UnitBasis']?.[0]?.['ValueComponent']?.value //quantity of the element used to calculate its cost
                        if (typeof elemQuantity !== 'number') continue

                        const unitBasisId = getLocalId(costValue['UnitBasis']?.[0])
                        const unitBasis = typeof unitBasisId === 'number' ? unitBasisById[unitBasisId] : null
                        const elemQuantityUnitMeasure = unitBasis
                            ? convertUnits(unitBasis['UnitComponent']?.[0]?.['Name']?.value)
                            : 'nd'

                        const componentId = getLocalId(costValue['Components']?.[0])
                        const component = typeof componentId === 'number' ? componentsById[componentId] : null
                        if (!component?._category?.value) continue //check if there is unit cost --> if no unit cost means no price analysis means go to the nex cot item

                        const priceAnalysisComponents = component['Components'] //components per each unit cost
                        if (priceAnalysisComponents == undefined) continue //check if there is price analysis related to unit cost --> if no price analysis means go to the next cost item

                        elem_resourcesDetails_Map[elemId] = elem_resourcesDetails_Map[elemId] || [] //initialize the array if it does not exist
                        
                        const resourceValuesArray: any[] = [] //array is needed if there are more then one components with the same resource category within the same unitary cost item
                        for (const p of priceAnalysisComponents){ //loop over each component of single cost item --> so to keep together the more unit costs related to the same resource category
                            const pacId = getLocalId(p)
                            if (!pacId) continue
                            const pac = priceAnalysisComponentById[pacId] as any
                            if (!pac) continue
                            if (!pac['Category']) continue //checks if the component has a category
                            if ((pac['Category'].value as string).toUpperCase() == (resource as string).toUpperCase()){ //checks the correspondance between components resource category and the one selected
                                const getPacValue = (propertyName: string) => {
                                    try {
                                        return pac[propertyName]?.value ?? 'nd'
                                    } catch (error) {
                                        return 'nd'
                                    }
                                }
                                const resourceDescription = getPacValue('Description') //description of the resource
                                const resourceName = getPacValue('Name') //name of the resource
                                let resourceUnitCost
                                try {
                                    resourceUnitCost = pac['AppliedValue'][0]['ValueComponent'].value //unit cost of the resource
                                } catch (error) {
                                    continue
                                }
                                resourceCurrency = convertCurrency(pac['AppliedValue'][0]['UnitComponent'][0]['Currency'].value) //currency of the resource unit cost
                                resourceValuesArray.push(resourceUnitCost*elemQuantity) //multiply the single resource with the quantity to obtain the element specific resource cost
                                elem_resourcesDetails_Map[elemId].push({ //save in the object the details of the single resource
                                    resourceUnitCost: `${resourceUnitCost} ${resourceCurrency}`,
                                    elemQuantity: `${Math.round(elemQuantity*100)/100} ${elemQuantityUnitMeasure}`, //round the quantity to 2 decimal places
                                    resourceDescription: resourceDescription,
                                    resourceName: resourceName,
                                })
                            }
                        }
                        if (resourceValuesArray.length !== 0){ //checks if the array is not empty (empty = no resources found)
                            //case 1a: more than one resource of the chosen category within the same unit cost item: sums all of the values
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
                    const startTime_elementsArray = performance.now(); // Start timer
                    for (const [elemId,resourceCost] of Object.entries(elem_resources_Map)){ //loop over each element id and its total resource cost
                        const item = [modelItemsById[Number(elemId)]]
                        if (!item[0]) continue //checks if the item exists
                        const elemData : elemDataType = {
                            elemModel: model,
                            elemId: Number(elemId),
                            elemName: (item as any)[0]['Name'].value,
                            totalResourceCost: resourceCost,
                            currency: resourceCurrency,
                            category: (item as any)[0]['_category'].value
                        }
                        elementsData_Array.push(elemData)
                    }
                    const endTime_elementsArray = performance.now(); // End timer
                    const loadTime_elementsArray = ((endTime_elementsArray - startTime_elementsArray) / 1000).toFixed(2); // seconds
                    console.log(`TIME ${loadTime_elementsArray} s: elementsData_Array`)
                    //step 4: associate to each model the map of element id and total resource cost
                    //category map is not needed here, because this one is used for selecting and color elements
                    model_resources_Map[model] = elem_resources_Map
                    model_costCount_Map[model] = elem_costCount_Map
                }
                const endTime_resourceCostData = performance.now(); // End timer
                const loadTime_resourceCostData = ((endTime_resourceCostData - startTime_resourceCostData) / 1000).toFixed(2); // seconds
                console.log(`TIME ${loadTime_resourceCostData} s: get resource cost data`)
                
                const allSelectedItemsModelIdMap = Object.fromEntries(
                    Object.entries(model_resources_Map).map(([k, v]) => [k, new Set(Object.keys(v).map(Number))])
                )

                //step 6: highlight or color element
                //color rows indipendentely from models
                //time to do next if very low
                if (btn == 'Color'){
                    //this step is moved here to handle with ranges, in this way the localIdToColor_map contains only item within the range
                    //step 5.0.1: normalize total resource cost to color across models
                    const [modelTo_localIdToColor_map, modelTo_localIdToNormalizedValue_map] = normalizeAndMapToColor(model_resources_Map,colorscale,rangeMin,rangeMax,rangeIntervalInOut,rangeNormalOrCost) //use this function to normalize values between 0 and 1 and return color and normalized value

                    //step 5: RESOURCE TABLE CREATION
                    //table type for resource table
                    type dynamicResourceTableData = {
                        Model: string,
                        ItemId?: number, //optional because it is not needed in the first row
                        ElementName: string,
                        ElementIfcClass: string,
                        ResourceName: string,
                        ResourceDescription: string,
                        ResourceCost: string,
                        ResourceCostRange?: string,
                        ResourceUnitCost: string,
                        ElementQuantity: string,
                        NormalizedValue: string,
                    }
                    //resource table
                    const dynamicResourceTable = document.createElement("bim-table") as BUI.Table<dynamicResourceTableData>
                    dynamicResourceTable.data = [{
                        data: {
                            ElementName: '',
                            ElementIfcClass: '',
                            ResourceName: '',
                            ResourceDescription: '',
                            ResourceCost: '',
                            NormalizedValue: '',
                            ResourceUnitCost: '',
                            ElementQuantity: '',
                        }
                    }]
                    dynamicResourceTable.data = [] //initialize the table and some settings
                    dynamicResourceTable.preserveStructureOnFilter = true
                    dynamicResourceTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
                    dynamicResourceTable.hiddenColumns = ['Model','ItemId']
                    //create the table:
                    //initialize also NormalizedValue column which will be populated after

                    const onVisibleColumnsResourceChange = (e: Event) => {
                        const dropdown = e.currentTarget as BUI.Dropdown
                        const checkedFields = [...dropdown.value]
                        dynamicResourceTable.visibleColumns = checkedFields
                        dynamicResourceTable.data = [...dynamicResourceTable.data]
                        dynamicResourceTable.requestUpdate()
                    }
                    visibleColumnsResourceDropdown_ResourceGroup.addEventListener('change', (e) => {
                        onVisibleColumnsResourceChange(e)
                    })
                    visibleColumnsResourceDropdown_classicGroups.addEventListener('change', (e) => {
                        onVisibleColumnsResourceChange(e)
                    })
                    
                    //time to do next operations very low
                    let countItems = 0, countResources = 0, countCostItems = 0
                    let totalResourceCost = 0
                    let totalResourceCurrency = ''
                    //this works with more models because this map does not divide items by model
                    //so the table is correctly created
                    for (const elem of elementsData_Array) {
                        const elemColor = modelTo_localIdToColor_map[elem.elemModel]?.[elem.elemId]
                        if (!elemColor) continue //checks if the item id is outside of the selected form the range or not
                        countItems += 1
                        countCostItems += model_costCount_Map[elem.elemModel]?.[elem.elemId] || 0 //sum all the count of cost items only of the items within the range
                        
                        for (const resourceDetails of elem_resourcesDetails_Map[elem.elemId]){
                            countResources += 1
                            const resourceRowCost = Math.round((Number(resourceDetails.resourceUnitCost.split(' ')[0])*Number(resourceDetails.elemQuantity.split(' ')[0]))*100)/100
                            totalResourceCost += resourceRowCost
                            totalResourceCurrency = elem.currency
                            dynamicResourceTable.data.push({
                                data: {
                                    Model: elem.elemModel,
                                    ItemId: elem.elemId,
                                    ElementName: elem.elemName,
                                    ElementIfcClass: elem.category,
                                    ResourceName: resourceDetails.resourceName,
                                    ResourceDescription: resourceDetails.resourceDescription,
                                    ResourceCost: `${resourceRowCost} ${elem.currency}`,
                                    ResourceCostRange: getColorRangeKeyByColorValue(elemColor), //this is the range key to which the resource cost belongs based on its color
                                    ResourceUnitCost: resourceDetails.resourceUnitCost,
                                    ElementQuantity: resourceDetails.elemQuantity,
                                    NormalizedValue: '',
                                }
                            })
                        }
                    }
    
                    await highlighter.clear() //reset previous selections of highlighter
                    updateCountLabel({countItems:countItems, countCostItems:countCostItems, countResources:countResources})
                    //6.1: color model before table creation
                    //removed homogeneous coloring because in does not make sense to use too many color shades, they will be not recognizable each other
                    //here things comes different because to highlight and color elements the model is needed
                    //so, the highlighting is by model but the color and the normal value is kept from the map calculated outside of this loop
                    const groupedColors = groupIdsByNormalizedValuePerModel(components, modelTo_localIdToNormalizedValue_map, model_resources_Map, colorscale)
                    for (const [model,modelTo_localIdToColor_map] of Object.entries(groupedColors)) {
                        const geomItems = await fragments.list.get(model)?.getItemsIdsWithGeometry()
                        onSetTransparency({[model]:new Set(geomItems)})
                        for (const [color,ids] of Object.entries(modelTo_localIdToColor_map)) {
                            const modelIdMap: OBC.ModelIdMap = { [model]: new Set<number>(ids.map(str => Number(str)).filter(n => !isNaN(n))) } //create the model id map
                            highlighter.highlightByID(color,modelIdMap,false,false) //color elements using highlighter
                        }
                    }

                    //step 6.2: add the normalized value to the table, pay attention: it is only a render value, it will not be saved in the table
                    //changing this value here is independent from model
                    dynamicResourceTable.dataTransform.NormalizedValue = (value, rowData) => {
                        const { Model, ItemId } = rowData
                        if (!Model || !ItemId) return value //if Model or ItemId is not defined, return the original value
                        return Math.round(modelTo_localIdToNormalizedValue_map[Model]?.[ItemId]*1000)/1000
                    }
                    //document.getElementById('resource_groupby_costrange')!.click()

                    sortbyResourceDropdown.addEventListener('change', (e) => {
                        if (!e.target) return
                        const field = (e.target as BUI.Dropdown).value[0]
                        const ascending = sortbyDirectionResourceCost.icon=='meteor-icons:arrow-up' ? false : true
                        onSortDynamicTable(dynamicResourceTable, field, ascending, resourceCostPerGroupedTable, 'resource')}
                    )
                    const sortbyDirectionResourceCost = BUI.Component.create<BUI.Dropdown>(
                        () => BUI.html`
                            <bim-button icon='meteor-icons:arrow-up' style="max-width:fit-content; z-index:100" tooltip-text='Ascending or descending order'
                                @click="${(e:Event) => {
                                    if (!e.target) return
                                    const button = e.target as BUI.Button
                                    button.icon = button.icon=='meteor-icons:arrow-up' ? 'meteor-icons:arrow-down' : 'meteor-icons:arrow-up'
                                    const ascending = button.icon=='meteor-icons:arrow-up' ? false : true
                                    onSortDynamicTable(dynamicResourceTable, sortbyResourceDropdown.value[0], ascending, resourceCostPerGroupedTable, 'resource')}}">
                        </bim-button>`,
                    )
                    const groupResourceIfcClasses = new Set<string>()
                    const groupResourceElements = new Set<string>()
                    const groupResourceNames = new Set<string>()
    
                    const resourceCostPerGroupedTable: {[group: string]: {resourceCost: number, currency: string, resourceDescription?: string, resourceUnitCost?: string, model?:string, itemId?: number}} = {}
                    
                    for (const row of dynamicResourceTable.data){
                        const groupIfcClass = row.data.ElementIfcClass
                        const groupElement = row.data.ElementName
                        const groupResourceName = row.data.ResourceName
                        if (!groupIfcClass || !groupElement || !groupResourceName) continue
                        const cost = Number((row.data.ResourceCost as string).split(' ')[0])
                        const currency = (row.data.ResourceCost as string).split(' ')[1]
                        const itemId = row.data.ItemId
                        const model = row.data.Model
    
                        // if (modelTo_localIdToColor_map && itemId) {
                        //     const colorValue = modelTo_localIdToColor_map[Number(itemId)]
                        //     row.data.ResourceCostRange = colorValue ? getColorRangeKeyByColorValue(colorValue) ?? colorValue : colorValue
                        // }
    
                        if (!resourceCostPerGroupedTable[groupIfcClass]) {
                            resourceCostPerGroupedTable[groupIfcClass] = { resourceCost: 0, currency, model }
                        }
                        resourceCostPerGroupedTable[groupIfcClass].resourceCost += cost
                        groupResourceIfcClasses.add(groupIfcClass)
    
                        if (!resourceCostPerGroupedTable[groupElement]) {
                            resourceCostPerGroupedTable[groupElement] = { resourceCost: 0, currency, model, itemId}
                        }
                        resourceCostPerGroupedTable[groupElement].resourceCost += cost
                        groupResourceElements.add(groupElement)
    
                        if (!resourceCostPerGroupedTable[groupResourceName]) {
                            resourceCostPerGroupedTable[groupResourceName] = { resourceCost: 0, currency, model, resourceDescription: row.data.ResourceDescription, resourceUnitCost: row.data.ResourceUnitCost}
                        }
                        resourceCostPerGroupedTable[groupResourceName].resourceCost += cost
                        groupResourceNames.add(groupResourceName)
                    }
                    dynamicResourceTable.dataTransform = {
                        ResourceCost: (value, rowData) => {
                            const { ElementName, ElementIfcClass, ResourceName } = rowData
                            if (!ElementName && !ResourceName && ElementIfcClass) {
                                if (value!='') return value
                                return formatNumber_Cost(Math.round(resourceCostPerGroupedTable[ElementIfcClass]?.resourceCost*100)/100)+' '+resourceCostPerGroupedTable[ElementIfcClass]?.currency
                            } else if (!ElementName && ResourceName && !ElementIfcClass) {
                                if (value!='') return value
                                return formatNumber_Cost(Math.round(resourceCostPerGroupedTable[ResourceName]?.resourceCost*100)/100)+' '+resourceCostPerGroupedTable[ResourceName]?.currency
                            } else if (ElementName && !ResourceName && !ElementIfcClass) {
                                if (value!='') return value
                                if (modelTo_localIdToColor_map) {
                                    return BUI.html`
                                        <div style="display: flex; flex-direction:row; gap:1rem; min-width:100%">
                                            <div style="height:1rem; width: 1rem; margin-left: 2rem; border-radius:5px; 
                                                background-color:${modelTo_localIdToColor_map[resourceCostPerGroupedTable[ElementName]?.model ?? '']?.[Number(resourceCostPerGroupedTable[ElementName]?.itemId)]};
                                                color:${modelTo_localIdToColor_map[resourceCostPerGroupedTable[ElementName]?.model ?? '']?.[Number(resourceCostPerGroupedTable[ElementName]?.itemId)]};">.</div>
                                            <bim-label>${formatNumber_Cost(Math.round(resourceCostPerGroupedTable[ElementName]?.resourceCost*100)/100)+' '+resourceCostPerGroupedTable[ElementName]?.currency}</bim-label>
                                        </div>
                                    `
                                } else {
                                    return formatNumber_Cost(Math.round(resourceCostPerGroupedTable[ElementName]?.resourceCost*100)/100)+' '+resourceCostPerGroupedTable[ElementName]?.currency
                                }
                            } else {
                                return formatNumber_Cost(value)
                            }
                        },
                        ResourceDescription: (value, rowData) => {
                            const { ElementName, ElementIfcClass, ResourceName } = rowData
                            if (!ElementName && ResourceName && !ElementIfcClass) {
                                if (value!='') return value
                                return resourceCostPerGroupedTable[ResourceName]?.resourceDescription ? resourceCostPerGroupedTable[ResourceName].resourceDescription : value
                            } else {
                                return value
                            }
                        },
                        ElementName: (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { Model, ItemId } = rowData
                            let id = ItemId
                            let m = Model
                            // grouped rows do not have Model and ItemId, so I need to get them from the resourceCostPerGroupedTable using the group name (value)
                            if (!ItemId) id = Number(resourceCostPerGroupedTable[value]?.itemId)
                            if (!Model) m = resourceCostPerGroupedTable[value]?.model
                            return BUI.html`
                                <bim-label
                                    @click=${async () => {
                                        highlighter.highlightByID("select", {[m as string]: new Set<number>([id as number])}, false, true)
                                        const guid = await fragments.modelIdMapToGuids({[m as string]: new Set<number>([id as number])})
                                        await navigator.clipboard.writeText(guid[0])
                                        }}
                                    @mouseover=${({target}:{target:BUI.Label}) => {target.style.color = "rgba(36, 241, 234, 1)"}}
                                    @mouseleave=${({target}:{target:BUI.Label}) => {target.style.removeProperty('color')}}
                                >${value}</bim-label>`
                        },
                        ResourceName: (value, rowData) => {
                            const { ElementIfcClass, ElementName } = rowData
                            if (!ElementName && !ElementIfcClass) {
                                return BUI.html`
                                    <bim-label
                                        @mouseover=${({currentTarget}: {currentTarget: BUI.Label}) => {
                                            const label = currentTarget
                                            const contextMenu = label.querySelector<BUI.ContextMenu>('bim-context-menu')
                                            if (!contextMenu) return
                                            contextMenu.visible = true
                                            label.style.color = "rgba(36, 241, 234, 1)"
    
                                            const closeWhenPointerLeavesLabel = (event: PointerEvent) => {
                                                const rect = label.getBoundingClientRect()
                                                const isStillOverLabel =
                                                    event.clientX >= rect.left &&
                                                    event.clientX <= rect.right &&
                                                    event.clientY >= rect.top &&
                                                    event.clientY <= rect.bottom
    
                                                if (isStillOverLabel) return
    
                                                label.style.removeProperty('color')
                                                BUI.ContextMenu.removeMenus()
                                                document.removeEventListener('pointermove', closeWhenPointerLeavesLabel, true)
                                            }
    
                                            requestAnimationFrame(() => {
                                                document.addEventListener('pointermove', closeWhenPointerLeavesLabel, true)
                                            })
                                        }}>
                                        ${value}
                                        <bim-context-menu id="bim-context-menu-resource" style="max-width: 30rem; padding: 0.75rem;" class="blur-background-context-menu">
                                            <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                                ${resourceCostPerGroupedTable[value]?.resourceUnitCost ? `Unit Cost: ${resourceCostPerGroupedTable[value].resourceUnitCost}` : 'No unit cost available'}
                                            </bim-label>
                                            <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                                ${resourceCostPerGroupedTable[value]?.resourceDescription ? `Description: ${resourceCostPerGroupedTable[value].resourceDescription}` : 'No description available'}
                                            </bim-label>
                                        </bim-context-menu>
                                    </bim-label>`
                            } else {
                                return value
                            }
                        }
                    }
    
                    dynamicResourceTable.groupedBy = ['ElementName']
                    dynamicResourceTable.columns = ['ElementName']
                    dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue']
                    
                    const onCreateResourceChart_IfcClass = () => {
                        const groupIfcClassLabels = [...groupResourceIfcClasses]
                        chartPrimary.colors = ['rgb(200, 200, 200)','rgb(138, 138, 138)']
                        chartPrimary.transparentBackground = true
                        chartPrimary.borderColor = 'transparent'
                        chartPrimary.label = `${resource} resource cost per IfcClass`
                        setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                        chartPrimary.inputData = {
                            labels: groupIfcClassLabels,
                            datasets: {
                                ResourceCost: groupIfcClassLabels.map((groupIfcClass) => ({
                                    value: Math.round((resourceCostPerGroupedTable[groupIfcClass]?.resourceCost ?? 0)*100)/100
                                }))
                            }
                        }
                    }
    
                    const onCreateResourceChart_Element = () => {
                        if (modelTo_localIdToColor_map) {
                            const resourceCostPerColor: Record<string, { items: number; cost: number }> = {}
    
                            for (const groupElement of groupResourceElements) {
                                const itemId = resourceCostPerGroupedTable[groupElement]?.itemId
                                const model = resourceCostPerGroupedTable[groupElement]?.model
                                const color = model && itemId !== undefined ? modelTo_localIdToColor_map[model]?.[Number(itemId)] : undefined
                                if (!color) continue
                                if (!resourceCostPerColor[color]) {
                                    resourceCostPerColor[color] = { items: 0, cost: 0 }
                                }
                                resourceCostPerColor[color].cost += resourceCostPerGroupedTable[groupElement]?.resourceCost ?? 0
                                resourceCostPerColor[color].items += 1
                            }
    
                            const orderedColorsWithValue = Object.keys(resourceCostPerColor)
                                .map((color) => ({
                                    color: color,
                                    rangeValue: getNormalizedValueFromColor(color, colorscale) ?? 0,
                                    rangeLabel: getColorRangeKeyByColorValue(color)?.slice(3) ?? color,
                                    totalCost: Math.round(resourceCostPerColor[color].cost*100)/100,
                                    itemsNumber: resourceCostPerColor[color].items
                                }))
                                .sort((a, b) => b.rangeValue - a.rangeValue)
    
                            chartPrimary.colors = orderedColorsWithValue.length==1 ? 
                                [orderedColorsWithValue[0].color,orderedColorsWithValue[0].color] : 
                                orderedColorsWithValue.map(({ color }) => color)
                            chartPrimary.transparentBackground = true
                            chartPrimary.borderColor = 'rgba(0, 0, 0, 0.2)'
                            chartPrimary.label = 'Total cost and Number of items per Cost range'
                            setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                            chartPrimary.inputData = {
                                labels:  orderedColorsWithValue.map(({ rangeLabel }) => rangeLabel),
                                datasets: {
                                    ResourceCost: orderedColorsWithValue.map(({ totalCost }) => ({
                                        value: totalCost
                                    })),
                                    NumberOfItems: orderedColorsWithValue.map(({ itemsNumber }) => ({
                                        value: itemsNumber
                                    }))
                                }
                            }
                        } else {
                            const groupElementsNoColor = [...groupResourceElements]
                            chartPrimary.colors = ['rgb(200, 200, 200)','rgb(138, 138, 138)']
                            chartPrimary.transparentBackground = true
                            chartPrimary.borderColor = 'transparent'
                            chartPrimary.label = `${resource} resource cost per Element`
                            setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                            chartPrimary.inputData = {
                                labels: groupElementsNoColor,
                                datasets: {
                                    ResourceCost: groupElementsNoColor.map((groupElement) => ({
                                        value: Math.round((resourceCostPerGroupedTable[groupElement]?.resourceCost ?? 0)*100)/100
                                    }))
                                }
                            }
                        }
                    }
    
                    const onCreateResourceChart_Resource = () => {
                        const groupResourceLabels = [...groupResourceNames]
                        chartPrimary.colors = ['rgb(200, 200, 200)','rgb(138, 138, 138)']
                        chartPrimary.transparentBackground = true
                        chartPrimary.borderColor = 'transparent'
                        chartPrimary.label = `${resource} resource cost per Resource`
                        setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                        chartPrimary.inputData = {
                            labels: groupResourceLabels,
                            datasets: {
                                ResourceCost: groupResourceLabels.map((groupResourceName) => ({
                                    value: Math.round((resourceCostPerGroupedTable[groupResourceName]?.resourceCost ?? 0)*100)/100
                                }))
                            }
                        }
                    }
    
                    onCreateResourceChart_Element()
    
                    //step 7: create the panel component to show the table
                    const resourceCostPanelControls = BUI.Component.create<HTMLDivElement>(() => {
                        return BUI.html`
                            <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px 10px 5px 10px'})}>
                                <div style="display: flex; gap: 0.5rem;">
                                    <bim-button @click=${(e:Event) => onExpandTable(e,dynamicResourceTable)} tooltip-title=${dynamicResourceTable.expanded ? "Collapse" : "Expand" } icon=${dynamicResourceTable.expanded ? "si:expand-less-fill" : "si:expand-more-fill"} style="max-width:fit-content"></bim-button>
                                    <bim-label>Group by:</bim-label>
                                    <bim-button @click=${({target}:{target:BUI.Button}) => {
                                        onCreateResourceChart_IfcClass()
                                        target.style.backgroundColor = 'var(--background-200)';
                                        document.getElementById('resource_groupby_element')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_resource')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_costrange')!.style.removeProperty('background-color');
                                        sortbyResourceDropdown_optionOne.label = 'ElementIfcClass'
                                        sortbyResourceDropdown.value = []
                                        dynamicResourceTable.groupedBy = ['ElementIfcClass','ElementName']
                                        dynamicResourceTable.columns = ['ElementIfcClass','ElementName']
                                        dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue','ResourceCostRange']
                                        setVisibleColumnsResourceDropdown(visibleColumnsResourceDropdown_classicGroups)
                                        dynamicResourceTable.visibleColumns = currentVisibleColumnsResourceDropdown.value
                                    }} id="resource_groupby_ifcclass" label="IFC Class" style="max-width:fit-content"></bim-button>
                                    <bim-button @click=${({target}:{target:BUI.Button}) => {
                                        onCreateResourceChart_Element()
                                        target.style.backgroundColor = 'var(--background-200)';
                                        document.getElementById('resource_groupby_ifcclass')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_resource')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_costrange')!.style.removeProperty('background-color');
                                        sortbyResourceDropdown_optionOne.label = 'ElementName'
                                        sortbyResourceDropdown.value = []
                                        dynamicResourceTable.groupedBy = ['ElementName']
                                        dynamicResourceTable.columns = ['ElementName']
                                        dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue','ResourceCostRange']
                                        setVisibleColumnsResourceDropdown(visibleColumnsResourceDropdown_classicGroups)
                                        dynamicResourceTable.visibleColumns = currentVisibleColumnsResourceDropdown.value
                                    }} id="resource_groupby_element"  label="Element" style="max-width:fit-content; background-color:var(--background-200)"></bim-button>
                                    <bim-button @click=${({target}:{target:BUI.Button}) => {
                                        onCreateResourceChart_Element()
                                        target.style.backgroundColor = 'var(--background-200)';
                                        document.getElementById('resource_groupby_ifcclass')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_element')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_resource')!.style.removeProperty('background-color');
                                        sortbyResourceDropdown_optionOne.label = 'ResourceCostRange'
                                        sortbyTotalCostDropdown.value = []
                                        dynamicResourceTable.groupedBy = ['ResourceCostRange','ElementName']
                                        dynamicResourceTable.columns = ['ElementName']
                                        dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue','ResourceCostRange']
                                        setVisibleColumnsResourceDropdown(visibleColumnsResourceDropdown_classicGroups)
                                        dynamicResourceTable.visibleColumns = currentVisibleColumnsResourceDropdown.value
                                    }} id="resource_groupby_costrange"  label="Cost Range" style="max-width:fit-content"></bim-button>
                                    <bim-button @click=${({target}:{target:BUI.Button}) => {
                                        onCreateResourceChart_Resource()
                                        target.style.backgroundColor = 'var(--background-200)';
                                        document.getElementById('resource_groupby_ifcclass')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_element')!.style.removeProperty('background-color');
                                        document.getElementById('resource_groupby_costrange')!.style.removeProperty('background-color');
                                        sortbyResourceDropdown_optionOne.label = 'ResourceName'
                                        sortbyResourceDropdown.value = []
                                        dynamicResourceTable.groupedBy = ['ResourceName']
                                        dynamicResourceTable.columns = ['ResourceName']
                                        dynamicResourceTable.hiddenColumns = ['Model','ItemId','ResourceName','NormalizedValue','ResourceDescription','ResourceUnitCost','ResourceCostRange']
                                        setVisibleColumnsResourceDropdown(visibleColumnsResourceDropdown_ResourceGroup)
                                        dynamicResourceTable.visibleColumns = currentVisibleColumnsResourceDropdown.value
                                        dynamicResourceTable.visibleColumns = visibleColumnsResourceDropdown_ResourceGroup.value.length > 0 ? visibleColumnsResourceDropdown_ResourceGroup.value : ['ResourceName', 'ElementIfcClass', 'ResourceCost', 'ElementQuantity']
                                    }} id="resource_groupby_resource"  label="Resource" style="max-width:fit-content"></bim-button>
                                    <bim-label>Sort by:</bim-label>
                                    ${sortbyResourceDropdown}
                                    ${sortbyDirectionResourceCost}
                                    <bim-label>Columns:</bim-label>
                                    ${currentVisibleColumnsResourceDropdown}
                                    <bim-label>Ghost mode:</bim-label>
                                    <bim-button 
                                        id='ghost-mode' 
                                        @click=${async (e:Event) => {
                                            await onSetTransparencyToCostColor(e);
                                            (e.target as any).label = (e.target as any).label=='Ghost' ? 'Reset' : 'Ghost'
                                        }} 
                                        label="Ghost"
                                        tooltip-text="Set transparency to non-selected items. On the side, you can set their opacity. Ghost mode works only on cost analysis colored items."
                                        style="max-width:fit-content; z-index:100">
                                    </bim-button>
                                    <bim-number-input
                                        id='ghost-mode-opacity' slider step="0.01"value="0.5" min="0" max="1"
                                        style="max-width:fit-content; z-index:100"
                                        @change="${async ({ target }: { target: BUI.NumberInput }) => {
                                            (highlighter.styles.get('color_0_02_transparent') as any).opacity = target.value;
                                            (highlighter.styles.get('color_02_04_transparent') as any).opacity = target.value;
                                            (highlighter.styles.get('color_04_06_transparent') as any).opacity = target.value;
                                            (highlighter.styles.get('color_06_08_transparent') as any).opacity = target.value;
                                            (highlighter.styles.get('color_08_1_transparent') as any).opacity = target.value;
                                            await highlighter.updateColors()
                                        }}">
                                    </bim-number-input>
                                    <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,dynamicResourceTable)}} debounce="300"></bim-text-input>
                                    <bim-button @click=${() => {onClearPanel(panelDown),onClearPanel(panelRight)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                                </div>
                            </div>`
                    })
                    const resourceCostPanel = BUI.Component.create<BUI.Panel>(() => {
                        //return the UI of the component
                        return BUI.html`
                            <bim-panel style="background:none; height:100%; min-height:0;">
                                <div style="display:grid; grid-template-columns:80% 20%; gap:10px; margin:5px 15px 5px 15px; background-color:transparent; flex:1; height:100%; min-height:0;">
                                    <div style="display:grid; grid-template-rows:1fr 2rem; gap:2px; background-color:transparent; flex:1; height:100%; min-height:0;">
                                        ${dynamicResourceTable ? dynamicResourceTable : 'Any resource cost found for this cateogory.'}
                                        <bim-label style="font-size:var(--bim-ui_size-sm); border-top:1px solid var(--bim-ui_bg-contrast-20); padding-left:0.5rem">TOTAL: ${formatNumber_Cost(Math.round(totalResourceCost*100)/100)} ${totalResourceCurrency}</bim-label>
                                    </div>
                                    <div style="background:none; height:90%; min-height:0;">
                                        ${chartPrimary}
                                        <bim-checkbox
                                            label='Display labels'
                                            style="padding:0.5rem"
                                            ?checked=${chartPrimaryLabelsVisible}
                                            @change=${({ target }: { target: BUI.Checkbox }) => {
                                                setChartPrimaryLabelsVisible(target.value)
                                            }}>
                                        </bim-checkbox>
                                    </div>
                                </div>
                            </bim-panel>
                        `
                    })
                    //step 8: append the component to the down panel
                    panelDown.innerHTML=''
                    panelDown.appendChild(resourceCostPanelControls)
                    panelDown.appendChild(resourceCostPanel)
    
                    document.getElementById('resource_groupby_costrange')!.click() //trigger the default grouping and coloring
                    dynamicResourceTable.visibleColumns = currentVisibleColumnsResourceDropdown.value.length > 0 ? currentVisibleColumnsResourceDropdown.value : ['ResourceName','ResourceDescription','ResourceCost','ResourceUnitCost','ElementQuantity']

                } else if (btn == 'Select') { //if select button is clicked
                    highlighter.highlightByID("select", allSelectedItemsModelIdMap, false, false) //only select elements removing colors
                    updateCountLabel({countItems: 0,countCostItems: 0,countResources: 0})
                }

            } else if (resource == IfcFileLabel_TotalCost){ //if the analysis is on total costs

                const startTime_4 = performance.now() // Start timer

                await highlighter.clear() //reset previous selections of highlighter
                const model_volume_map: {[key:string]:any} = {}
                const model_cost_map: {[key:string]:{[key: number]: number}} = {}
                const model_costCount_map: {[key:string]:any} = {}
                const getLocalId = (item: any) => item?._localId?.value as number | undefined
                const mapItemsByLocalId = (items: any[] = []) => { // qui crea solo la mappa localId-item
                    const itemsMap: {[key:number]:any} = {}
                    for (const item of items) {
                        const localId = getLocalId(item)
                        if (typeof localId === 'number') itemsMap[localId] = item
                    }
                    return itemsMap
                }
                for (const [model,costItems] of Object.entries(filteredCostItems)){
                    const item_totalCost_map: {[key:number]:number} = {}
                    const item_volume_map: {[key:number]:number|undefined} = {}
                    model_costCount_map[model] = {}
                    const costItemMeta = costItems.map((ci) => {
                        const itemId = (((ci.Controls as any)[0] as FRAGS.ItemData)._localId as FRAGS.ItemAttribute).value as number //localId of filtered elements
                        const costItemObjectType = ((ci['ObjectType'] as FRAGS.ItemAttribute).value as string).toUpperCase()
                        const cvId = (ci['CostValues'] as any)[0]._localId.value ? (ci['CostValues'] as any)[0]._localId.value : 'nd'
                        return typeof cvId === 'number' ? { itemId, costItemObjectType, cvId } : null
                    }).filter(Boolean) as {itemId:number, costItemObjectType:string, cvId:number}[]

                    const costValueIds = new Set<number>(costItemMeta.map(({ cvId }) => cvId))
                    const costValueRecord = costValueIds.size === 0 ? null : await fragments.getData({[model]: costValueIds},{
                        attributesDefault: true,
                        relations: {
                            "AppliedValue": {
                                attributes: true,
                                relations: false //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                            }
                        }
                    })
                    const costValuesById = mapItemsByLocalId(costValueRecord?.[model] as any[] ?? [])

                    const modelItemIds = [...new Set(costItemMeta.map(({ itemId }) => itemId))]
                    //console.log(modelItemIds)
                    if (normalization == 'Volume' && modelItemIds.length > 0){
                        const itemVolumes: number[] = []
                        for (const i of modelItemIds) {
                            const vol = await fragments.list.get(model)?.getItemsVolume([i])
                            itemVolumes.push(vol ? vol : 1)
                        }
                        //console.log('itemVolumes',itemVolumes)
                        if (Array.isArray(itemVolumes)) {
                            modelItemIds.forEach((itemId, index) => {
                                item_volume_map[itemId] = itemVolumes[index]
                            })
                        } else if (typeof itemVolumes === 'number' && modelItemIds.length === 1) {
                            item_volume_map[modelItemIds[0]] = itemVolumes
                        }
                    }

                    for (const { itemId, costItemObjectType, cvId } of costItemMeta){

                        //create a cost count per each item
                        model_costCount_map[model][itemId] ? model_costCount_map[model][itemId] += 1 : model_costCount_map[model][itemId] = 1
                        const costValue = costValuesById[cvId] as any
                        if (!costValue?.AppliedValue?.[0]?.ValueComponent) continue
                        
                        let costItemCost = ((costValue.AppliedValue as any)[0].ValueComponent as FRAGS.ItemAttribute).value

                        if (normalization == 'Volume'){
                            const itemVolume = item_volume_map[itemId]
                            costItemCost = itemVolume ? costItemCost/itemVolume : costItemCost
                        }
                        
                        if (costItemObjectType != IfcFileLabel_CostAssignment) continue //ATTENTION!!! this value is USERDEFINED so it could be different in projects
                        item_totalCost_map[itemId] ? item_totalCost_map[itemId] += costItemCost : item_totalCost_map[itemId] = costItemCost
                    }
                    model_cost_map[model] = item_totalCost_map
                    model_volume_map[model] = item_volume_map

                }

                const endTime_4 = performance.now(); // End timer
                const loadTime_4 = ((endTime_4 - startTime_4) / 1000).toFixed(2); // seconds
                console.log(`TIME ${loadTime_4} s: whole process of getting total costs data`);

                //normalize cost to get colors and filter according to chosen range
                const normalized_cost: {[key:string]:{[key:string]:number}} = {}
                let modelTo_localIdToColor_map: {[key:string]: Record<string, string>} = {}
                let modelTo_localIdToNormalizedValue_map: {[key:string]: Record<string, number>} = {}

                if (normalization=='Volume'){
                    for (const [model, cost_map] of Object.entries(model_cost_map)) {
                        normalized_cost[model] = {}
                        for (const [itemId,cost] of Object.entries(cost_map)){
                            const volume = model_volume_map[model][itemId]
                            if (volume == 0) continue //very important to not consider non geometrical items, otherwise the normalization of cost is infinite, coloring all elements in green
                            normalized_cost[model][itemId] = cost / volume
                        }
                    }
                    [modelTo_localIdToColor_map,modelTo_localIdToNormalizedValue_map] = normalizeAndMapToColor(normalized_cost,colorscale,rangeMin,rangeMax,rangeIntervalInOut,rangeNormalOrCost)
                } else {
                    [modelTo_localIdToColor_map,modelTo_localIdToNormalizedValue_map] = normalizeAndMapToColor(model_cost_map,colorscale,rangeMin,rangeMax,rangeIntervalInOut,rangeNormalOrCost)
                }

                //filter all the found elements according to the range
                const allSelectedItemsModelIdMap = Object.fromEntries(
                    Object.entries(model_cost_map).map(([k, v]) => [
                        k,
                        new Set(Object.keys(v)
                            .map(Number)
                            .filter(num => Boolean(modelTo_localIdToColor_map[k]?.[num]))
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

                    //removed homogeneous coloring because in does not make sense to use too many color shades, they will be not recognizable each other
                    const startTime_8 = performance.now(); // Start timer
                    //this is to color items within a range of 5 colors (faster)
                    //for (const [model, {localIdToColor_map, normalizedValue}] of Object.entries(modelTo_localIdToColor_map_normalizedValue_map)) {
                    const groupedColors = groupIdsByNormalizedValuePerModel(components, modelTo_localIdToNormalizedValue_map, model_cost_map, colorscale)
                    for (const [model,localIdToColor_map] of Object.entries(groupedColors)) {
                        const geomItems = await fragments.list.get(model)?.getItemsIdsWithGeometry()
                        onSetTransparency({[model]:new Set(geomItems)})
                        for (const [color,ids] of Object.entries(localIdToColor_map)) {
                            const modelIdMap: OBC.ModelIdMap = { [model]: new Set<number>(ids.map(str => Number(str)).filter(n => !isNaN(n))) } //create the model id map
                            highlighter.highlightByID(color,modelIdMap,false,false) //color elements using highlighter
                        }
                    }
                    const endTime_8 = performance.now(); // End timer
                    const loadTime_8 = ((endTime_8 - startTime_8) / 1000).toFixed(2); // seconds
                    console.log(`TIME ${loadTime_8} s: color elements using ranges color map (> 100 items)`)
                    
                    const startTime_5 = performance.now(); // Start timer
                    const norm = normalization == 'Volume' ? true : false
                    const dynamicCostTable = await onOpenElementXCostPanel(allSelectedItemsModelIdMap,norm,modelTo_localIdToColor_map,limitToCostItemNameList)
                    const endTime_5 = performance.now(); // End timer
                    const loadTime_5 = ((endTime_5 - startTime_5) / 1000).toFixed(2); // seconds
                    console.log(`TIME ${loadTime_5} s: total time to create and render cost table`);

                    if (normalization == 'Volume' && dynamicCostTable) {
                        dynamicCostTable.dataTransform.ItemVolume = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            //if (!value) return ''
                            const { ItemId, Model } = rowData
                            if (!ItemId || !Model) return '' //if ItemId or Model is not defined, return the original value
                            const volume = model_volume_map[Model][Number(ItemId)]
                            if(!volume) return ''
                            return BUI.html`
                                <bim-label>${Math.round(volume*1000)/1000} m³</bim-label>
                            `
                        }
                        dynamicCostTable.dataTransform.NormalizedCost = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { ItemId, Currency, Model } = rowData
                            if (!ItemId || !Model) return '' //if ItemId or Model is not defined, return the original value
                            const normCost = normalized_cost[Model]?.[Number(ItemId)]
                            const normValue = modelTo_localIdToNormalizedValue_map[Model]?.[Number(ItemId)]
                            if(normCost==null || normValue==null) return ''
                            return BUI.html`
                                <bim-label>${Math.round(normCost*100)/100} ${Currency}/m³ (${Math.round(normValue*100)/100})</bim-label>
                            `
                        }
                    }
                    //}
                    //document.getElementById('groupby_costrange')!.click() //trigger the click on the cost range grouping button to show colors in the table
                    groupBy_CostRange_Btn.disabled = false

                } else if (btn == 'Select') { //if select button is clicked
                    highlighter.highlightByID("select", allSelectedItemsModelIdMap, false, false) //only select elements removing colors
                    updateCountLabel({countItems: 0,countCostItems: 0,countResources: 0})
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
                class="blur-background-container">
            </bim-panel>
            `;
        })
        const panelRight = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="Right Panel"
                class="blur-background-container">
            </bim-panel>
            `;
        })
        const panelDown = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="Down Panel"
                class="blur-background-container">
            </bim-panel>
            `;
        })
        let previousIsolatedMaterialsForPostproduction = world.renderer!.postproduction.basePass.isolatedMaterials
        const panelWorldSettings = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
                <bim-panel
                    label="Scene Visibility Settings"
                    class="blur-background-container">
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

        // #region ADVANCED COMPONENTS
        fragments.list.onItemDeleted.add(() => {
            onClearPanel(panelDown) //clear down panel
            onClearPanel(panelRight)
            updateCountLabel({countItems:0, countCostItems:0, countResources:0})
        })
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
                    <!-- <bim-label style="display:${colorRangeDisplay}; margin-top: 10px" icon="ion:warning-outline">More than 100 elements: geometries colors remapped in five ranges.</bim-label> -->
                </div>
            `;
            },
            { countItems: 0, countResources: 0, countCostItems: 0},
        );
        const noCostItemsLabel = BUI.Component.create<BUI.Label>(() => {
            return BUI.html`
                <bim-label style="padding:15px">Any COST ITEM available for the selected elements!</bim-label>
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
                    <bim-text-input @input=${(e:Event)=>{onSearch(e,spatialTree)}} placeholder="Search..." debounce="300"></bim-text-input>
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
        
        type dynamicPropertiesTableData = {
            itemName: string,
            itemId: number,
            modelId: string,
            propertySetName?: string,
            propertyType?: string,
            propertyName?: string,
            propertyValue?: string,
        }
        //tables
        const dynamicPropertiesTable = document.createElement("bim-table") as BUI.Table<dynamicPropertiesTableData>
        dynamicPropertiesTable.id = 'dynamicPropertiesTable'
        dynamicPropertiesTable.data = [{
                data: {
                    itemName: '',
                    itemId: 0,
                    modelId: '',
                    propertySetName: '',
                    propertyType: '',
                    propertyName: '',
                    propertyValue: ''

                }}]
        dynamicPropertiesTable.data = []
        dynamicPropertiesTable.preserveStructureOnFilter = true
        dynamicPropertiesTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
        dynamicPropertiesTable.headersHidden = true
        const convertDataName: {[key:string]:string} = {
            '_category': 'IFC Class',
            '_guid': 'GlobalId',
            '_localId': 'StepId',
        }
        let loadingLabelProps: BUI.Label
        const onLoadAttributesTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relationsDefault: { attributes: false, relations: false }}) //questi sono gli attributi
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (Array.isArray(itemDataEntry)) continue
                        const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                            data: {},
                        }
                        rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                        rowData.data.itemId = itemId
                        rowData.data.modelId = modelId
                        rowData.data.propertyName = convertDataName[itemDataEntryName] ? convertDataName[itemDataEntryName] : itemDataEntryName
                        rowData.data.propertySetName = 'Attributes'
                        rowData.data.propertyType = 'Attribute'
                        const value = itemDataEntryName=='_localId' ?
                            '#'+itemDataEntry.value :
                            Number(itemDataEntry.value) ?
                                Math.round(Number(itemDataEntry.value)*100)/100 :
                                itemDataEntry.value
                        rowData.data.propertyValue = value
                        if (!rowData.data.propertyName) continue
                        dynamicPropertiesTable.data.push(rowData)
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadRelationsTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relationsDefault: { attributes: true, relations: false }}) //questi sono gli attributi
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (['IsDefinedBy'].includes(itemDataEntryName)) continue
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                data: {},
                            }
                            rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                            rowData.data.itemId = itemId
                            rowData.data.modelId = modelId
                            rowData.data.propertyType = 'Relation'
                            rowData.data.propertySetName = itemDataEntryName
                            rowData.data.propertyName = (relItemData._category as FRAGS.ItemAttribute).value
                            rowData.data.propertyValue = relItemData.Name ? (relItemData.Name as FRAGS.ItemAttribute).value : ''
                            if (!rowData.data.propertyName) continue
                            dynamicPropertiesTable.data.push(rowData)
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName','propertySetName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadMaterialsTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relations: {'HasAssociations': { attributes: true, relations: false }}}) //mettendo false su relations è molto più veloce ma poi bisogna riusare getData per ottenere quelle relations
            console.log(itemsData)
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIALLAYERSETUSAGE'){
                                const localId = (relItemData._localId as FRAGS.ItemAttribute).value as number
                                const associations = await fragments.getData({[modelId]:new Set<number>([localId])}, {attributesDefault:true, relations: {'ForLayerSet': { attributes: true, relations: true }}})
                                const materialsLayers = (associations[modelId][0].ForLayerSet as FRAGS.ItemData[])[0].MaterialLayers as FRAGS.ItemData[]
                                for (const layer of materialsLayers) {
                                    const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                        data: {},
                                    }
                                    const materialId = (layer._localId as FRAGS.ItemAttribute).value
                                    const material = await fragments.getData({[modelId]:new Set<number>([materialId])}, {attributesDefault:true, relationsDefault: { attributes: true, relations: true }})
                                    const materialName = (((material[modelId] as FRAGS.ItemData[])[0].Material as FRAGS.ItemData[])[0].Name as FRAGS.ItemAttribute).value
                                    const layerThickness = (layer.LayerThickness as FRAGS.ItemAttribute).value
                                    rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                    rowData.data.itemId = itemId
                                    rowData.data.modelId = modelId
                                    rowData.data.propertyType = 'Relation'
                                    rowData.data.propertySetName = itemDataEntryName
                                    rowData.data.propertyName = materialName
                                    rowData.data.propertyValue = layerThickness
                                    if (!rowData.data.propertyName) continue
                                    dynamicPropertiesTable.data.push(rowData)
                                }
                            } else if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIALLIST'){
                                const localId = (relItemData._localId as FRAGS.ItemAttribute).value as number
                                const associations = await fragments.getData({[modelId]:new Set<number>([localId])}, {attributesDefault:true,relationsDefault:{ attributes: true, relations: false }})
                                for (const material of ((associations[modelId] as FRAGS.ItemData[])[0].Materials as FRAGS.ItemData[])){
                                    const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                        data: {},
                                    }
                                    const materialName = (material.Name as FRAGS.ItemAttribute).value
                                    rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                    rowData.data.itemId = itemId
                                    rowData.data.modelId = modelId
                                    rowData.data.propertyType = 'Relation'
                                    rowData.data.propertySetName = itemDataEntryName
                                    rowData.data.propertyName = materialName
                                    rowData.data.propertyValue = ''
                                    if (!rowData.data.propertyName) continue
                                    dynamicPropertiesTable.data.push(rowData)                                    
                                }
                            } else if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIALCONSTITUENTSET'){
                                const localId = (relItemData._localId as FRAGS.ItemAttribute).value as number
                                const associations = await fragments.getData({[modelId]:new Set<number>([localId])}, {attributesDefault:true, relations: {'MaterialConstituents': { attributes: true, relations: false }}})
                                for (const material of ((associations[modelId] as FRAGS.ItemData[])[0].MaterialConstituents as FRAGS.ItemData[])){
                                    const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                        data: {},
                                    }
                                    const materialName = (material.Name as FRAGS.ItemAttribute).value
                                    rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                    rowData.data.itemId = itemId
                                    rowData.data.modelId = modelId
                                    rowData.data.propertyType = 'Relation'
                                    rowData.data.propertySetName = itemDataEntryName
                                    rowData.data.propertyName = materialName
                                    rowData.data.propertyValue = ''
                                    if (!rowData.data.propertyName) continue
                                    dynamicPropertiesTable.data.push(rowData)                                    
                                }
                            } else if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIALPROFILESET'){
                                const localId = (relItemData._localId as FRAGS.ItemAttribute).value as number
                                const associations = await fragments.getData({[modelId]:new Set<number>([localId])}, {attributesDefault:true, relations: {'MaterialProfiles': { attributes: true, relations: false }}})
                                for (const material of ((associations[modelId] as FRAGS.ItemData[])[0].MaterialProfiles as FRAGS.ItemData[])){
                                    const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                        data: {},
                                    }
                                    const materialName = (material.Name as FRAGS.ItemAttribute).value
                                    rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                    rowData.data.itemId = itemId
                                    rowData.data.modelId = modelId
                                    rowData.data.propertyType = 'Relation'
                                    rowData.data.propertySetName = itemDataEntryName
                                    rowData.data.propertyName = materialName
                                    rowData.data.propertyValue = ''
                                    if (!rowData.data.propertyName) continue
                                    dynamicPropertiesTable.data.push(rowData)                                    
                                }
                            } else if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIAL'){
                                const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                    data: {},
                                }
                                const materialName = (relItemData.Name as FRAGS.ItemAttribute).value
                                rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                rowData.data.itemId = itemId
                                rowData.data.modelId = modelId
                                rowData.data.propertyType = 'Relation'
                                rowData.data.propertySetName = itemDataEntryName
                                rowData.data.propertyName = materialName
                                rowData.data.propertyValue = ''
                                if (!rowData.data.propertyName) continue
                                dynamicPropertiesTable.data.push(rowData)      
                            }
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadPropertiesTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relations: {'IsDefinedBy': {attributes: true, relations: true}}})
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (itemDataEntryName != 'IsDefinedBy') continue
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            if (!relItemData.HasProperties) continue
                            for (const [, relPropertyData] of Object.entries(relItemData.HasProperties)){
                                const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                    data: {},
                                }
                                rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                rowData.data.itemId = itemId
                                rowData.data.modelId = modelId
                                rowData.data.propertyType = 'Relation'
                                rowData.data.propertySetName = (relItemData.Name as FRAGS.ItemAttribute).value
                                rowData.data.propertyName = (relPropertyData.Name as FRAGS.ItemAttribute).value
                                rowData.data.propertyValue = (relPropertyData.NominalValue as FRAGS.ItemAttribute).value
                                if (!rowData.data.propertyName) continue
                                dynamicPropertiesTable.data.push(rowData)
                            }
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName','propertySetName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadQuantitiesTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relations: {'IsDefinedBy': {attributes: true, relations: true}}}) //questi sono gli attributi
            const IfcPhisicalSimpleQuantities = ['AreaValue','CountValue','LengthValue','NumberValue','TimeValue','VolumeValue','WeightValue']
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (itemDataEntryName != 'IsDefinedBy') continue
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            if ((relItemData.Name as FRAGS.ItemAttribute).value != 'BaseQuantities') continue
                            for (const [, relPropertyData] of Object.entries(relItemData.Quantities)){
                                const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                    data: {},
                                }
                                rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                rowData.data.itemId = itemId
                                rowData.data.modelId = modelId
                                rowData.data.propertyType = 'Relation'
                                rowData.data.propertySetName = (relItemData.Name as FRAGS.ItemAttribute).value
                                rowData.data.propertyName = (relPropertyData.Name as FRAGS.ItemAttribute).value
                                for (const phisicalQuantity of IfcPhisicalSimpleQuantities){
                                    if (!relPropertyData[phisicalQuantity]) continue
                                    const unit = relPropertyData.Unit ? (relPropertyData.Unit as FRAGS.ItemAttribute).value : null
                                    const value = (relPropertyData[phisicalQuantity] as FRAGS.ItemAttribute).value
                                    rowData.data.propertyValue = unit ? value + ' ' + unit : value
                                }
                                if (!rowData.data.propertyName) continue
                                dynamicPropertiesTable.data.push(rowData)
                            }
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }

        const chartPrimary = BUI.Component.create<BUI.Chart>(() => {
            return BUI.html`<bim-chart type="doughnut"></bim-chart>`
        })
        let chartPrimaryLabelsVisible = true
        const setChartPrimaryLabelsVisible = (visible: boolean) => {
            chartPrimaryLabelsVisible = visible
            if (chartPrimary.displayLabels === visible) {
                chartPrimary.displayLabels = !visible
            }
            chartPrimary.displayLabels = visible
        }
        chartPrimary.inputData = {
            labels: [],
            datasets: {
                TotalCost: []
            }
        }
        chartPrimary.borderColor = 'transparent'
        setChartPrimaryLabelsVisible(true)

        const propertiesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            // const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
            //     components,
            //     modelIdMap: {},
            // });
            // propertiesTable.preserveStructureOnFilter = true;
            // propertiesTable.indentationInText = false;
            highlighter.events.select.onHighlight.add((modelIdMap) => {
                const count = Object.values(modelIdMap).reduce((sum, currentSet) => sum + currentSet.size, 0)
                updateSelectedItemsCount({ count })
                if (count < 6){
                    //updatePropertiesTable({ modelIdMap })
                    const currentLayout = floatingGrid.layout as any
                    if (!currentLayout) return
                    !currentLayout.includes('left') ? onSetLayout({ target: 'left' }) : null
                    onLoadAttributesTable()
                    onSetGroupingBtnColor(btn_Attributes)
                } else {
                    //updatePropertiesTable({ modelIdMap: {} })
                    dynamicPropertiesTable.data = []
                }
            });
            highlighter.events.select.onClear.add(() => {
                //updatePropertiesTable({ modelIdMap: {} })
                updateSelectedItemsCount({ count:0 })
                dynamicPropertiesTable.data = []
            });
            fragments.list.onItemDeleted.add(() => {
                //updatePropertiesTable({ modelIdMap: {} })
                updateSelectedItemsCount({ count:0 })
                dynamicPropertiesTable.data = []
            })
            const onSetGroupingBtnColor = (clickedBtn: BUI.Button) => {
                btn_Attributes.style.backgroundColor = ''
                btn_Properties.style.backgroundColor = ''
                btn_Quantities.style.backgroundColor = ''
                btn_Materials.style.backgroundColor = ''
                btn_Relations.style.backgroundColor = ''
                clickedBtn.style.backgroundColor = 'var(--background-200)'
            }
            let btn_Attributes: BUI.Button
            let btn_Properties: BUI.Button
            let btn_Quantities: BUI.Button
            let btn_Materials: BUI.Button
            let btn_Relations: BUI.Button
            return BUI.html`
                <bim-panel-section id='bim-panel-section-properties' label='Properties' icon="hugeicons:property-new">
                    ${selectedItemsCount}
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <bim-button @click=${(e:Event) => {onLoadAttributesTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Attributes = el as BUI.Button})} id="groupingPropsBtn-Attributes" label="Attributes" icon="material-symbols:user-attributes-rounded" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadPropertiesTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Properties = el as BUI.Button})} id="groupingPropsBtn-Properties" label="Properties" icon="ic:round-list" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadQuantitiesTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Quantities = el as BUI.Button})} id="groupingPropsBtn-Quantities" label="Quantities" icon="tabler:ruler-measure" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadMaterialsTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Materials = el as BUI.Button})} id="groupingPropsBtn-Materials" label="Materials" icon="game-icons:materials-science" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadRelationsTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Relations = el as BUI.Button})} id="groupingPropsBtn-Relations" label="Relations" icon="flowbite:link-outline" style="flex:1"></bim-button>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <bim-button @click=${(e:Event) => onExpandTable(e,dynamicPropertiesTable)} tooltip-title=${dynamicPropertiesTable.expanded ? "Collapse" : "Expand"} icon=${dynamicPropertiesTable.expanded ? "si:expand-less-fill" : "si:expand-more-fill"} style="max-width:fit-content"></bim-button>
                        <bim-button @click=${async () => {
                            const guid = await fragments.modelIdMapToGuids(highlighter.selection.select)
                            if (guid.length==1){
                                await navigator.clipboard.writeText(guid[0])
                            } else {
                                await navigator.clipboard.writeText(guid.join(','))
                            }
                        }} icon='uil:copy' tooltip-text="Copy IfcGlobalIds of selected elements to clipboard" style="max-width:fit-content; z-index:100"></bim-button>
                        <bim-text-input @input=${(e:Event)=>{onSearch(e,dynamicPropertiesTable)}} placeholder="Search..." debounce="300"></bim-text-input>
                    </div>\
                    <bim-label ${BUI.ref((el) => {loadingLabelProps = el as BUI.Label})} style="display:none; padding:20px">Loading...</bim-label>
                    ${dynamicPropertiesTable}
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
                label="Select elements by IfcGlobalId",
                icon="material-symbols:highlight-mouse-cursor-rounded"
                >
                <bim-label>
                    Separate GUIDs with a comma ( , ) to select multiple elements
                </bim-label>
                <div style="display:flex; flex-direction:row; gap:0.5rem">
                    <bim-text-input
                        id="search-by-guid",
                        placeholder="Type elements IfcGlobalId..."
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
        const sortbyResourceDropdown_optionOne = BUI.Component.create<BUI.Option>(
            () => BUI.html`<bim-option label='ElementName' style="padding:0 10px 0 10px" icon='qlementine-icons:rename-16'></bim-option>`
        )
        const sortbyResourceDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="sortbyResources" style="max-width:fit-content">
                ${sortbyResourceDropdown_optionOne}
                <bim-option id="sortbyResourceCostDropdown-cost" label='Cost' style="padding:0 10px 0 10px" icon='solar:dollar-linear'></bim-option>
            </bim-dropdown>`,
        )
        //sort by total cost dropdown menu
        const sortbyTotalCostDropdown_optionOne = BUI.Component.create<BUI.Option>(
            () => BUI.html`<bim-option label='ElementName' style="padding:0 10px 0 10px" icon='qlementine-icons:rename-16'></bim-option>`
        )
        const sortbyTotalCostDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="sortbyTotalCost" style="max-width:fit-content">
                ${sortbyTotalCostDropdown_optionOne}
                <bim-option id="sortbyTotalCostDropdown-cost" label='Cost' style="padding:0 10px 0 10px" icon='solar:dollar-linear'></bim-option>
            </bim-dropdown>`,
        )
        const visibleColumnsDropdown_classicGroups = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="visibleColumnsDropdown_classicGroups" style="max-width:fit-content" multiple>
                <bim-option checked id="visibleColumnsDropdown_classicGroups-CostItemName" label='CostItemName' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_classicGroups-CostItemDescription" label='CostItemDescription' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_classicGroups-Cost" label='Cost' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_classicGroups-Quantity" label='Quantity' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_classicGroups-CostItemUnitCost" label='CostItemUnitCost' style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const visibleColumnsDropdown_CostItemGroup = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="visibleColumnsDropdown_CostItemGroup" style="max-width:fit-content" multiple>
                <bim-option checked id="visibleColumnsDropdown_CostItemGroup-ElementName" label='ElementName' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_CostItemGroup-ElementIfcClass" label='ElementIfcClass' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_CostItemGroup-Cost" label='Cost' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsDropdown_CostItemGroup-Quantity" label='Quantity' style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        let currentVisibleColumnsDropdown = visibleColumnsDropdown_classicGroups
        const setVisibleColumnsDropdown = (nextDropdown: BUI.Dropdown) => {
            if (currentVisibleColumnsDropdown === nextDropdown) return
            currentVisibleColumnsDropdown.replaceWith(nextDropdown)
            currentVisibleColumnsDropdown = nextDropdown
        }
        const visibleColumnsResourceDropdown_classicGroups = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="visibleColumnsResourceDropdown_classicGroups" style="max-width:fit-content" multiple>
                <bim-option checked id="visibleColumnsResourceDropdown_classicGroups-ResourceName" label='ResourceName' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_classicGroups-ResourceDescription" label='ResourceDescription' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_classicGroups-ResourceCost" label='ResourceCost' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_classicGroups-ResourceUnitCost" label='ResourceUnitCost' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_classicGroups-ElementQuantity" label='ElementQuantity' style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        const visibleColumnsResourceDropdown_ResourceGroup = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="visibleColumnsResourceDropdown_ResourceGroup" style="max-width:fit-content" multiple>
                <bim-option checked id="visibleColumnsResourceDropdown_ResourceGroup-ResourceName" label='ResourceName' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_ResourceGroup-ElementIfcClass" label='ElementIfcClass' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_ResourceGroup-ResourceCost" label='ResourceCost' style="padding:0 10px 0 10px"></bim-option>
                <bim-option checked id="visibleColumnsResourceDropdown_ResourceGroup-ElementQuantity" label='ElementQuantity' style="padding:0 10px 0 10px"></bim-option>
            </bim-dropdown>`
        )
        let currentVisibleColumnsResourceDropdown = visibleColumnsResourceDropdown_classicGroups
        const setVisibleColumnsResourceDropdown = (nextDropdown: BUI.Dropdown) => {
            if (currentVisibleColumnsResourceDropdown === nextDropdown) return
            currentVisibleColumnsResourceDropdown.replaceWith(nextDropdown)
            currentVisibleColumnsResourceDropdown = nextDropdown
        }
        //resources dropdown menu
        const resources: string[] = [IfcFileLabel_TotalCost, IfcFileLabel_PriceAnalysis_Labor, IfcFileLabel_PriceAnalysis_Equipment, IfcFileLabel_PriceAnalysis_Material]
        resources.sort() //sort resources
        const resourcesIcon: {[key:string]:string} = {
            [IfcFileLabel_TotalCost]: 'ic:round-monetization-on',
            [IfcFileLabel_PriceAnalysis_Labor]: 'hugeicons:labor',
            [IfcFileLabel_PriceAnalysis_Equipment]: 'fa-solid:tools',
            [IfcFileLabel_PriceAnalysis_Material]: 'game-icons:brick-pile',
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
        interface categoriesUI {
            listCategories: string[]
        }
        const [categoriesDropdown, updateCategoriesDropdown] = BUI.Component.create<BUI.Dropdown, categoriesUI>((state: categoriesUI) => {
            const { listCategories } = state
            return BUI.html`<bim-dropdown name="categories" label='IFC Class' icon='material-symbols:category-rounded' multiple>
                ${listCategories.map((x) => {
                    if (x == 'ALL IFC CLASSES') {
                        return BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px; border-bottom: 1px solid dimgray; border-radius: 0px"></bim-option>`
                    } else {
                        return BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px"></bim-option>`
                    }
                }
                )}
            </bim-dropdown>`},
            { listCategories: importedCategories}
        )
        categoriesDropdown.searchBox = true
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
            if ((event.target as any).value[0] == IfcFileLabel_TotalCost){
                //unitMeasureDropdown.style.display = ''
                limitToCostItemName.style.display = ''
            } else {
                //unitMeasureDropdown.style.display = 'none'
                limitToCostItemName.style.display = 'none'
                limitToCostItemName.value = ''
            }
        })

        const rangeInputMin = BUI.Component.create<BUI.NumberInput>(() => {
            return BUI.html`
                <bim-number-input slider min='0' max='0.99' value='0' sensitivity='0.3' step='0.01' style='max-width:8.12rem;margin-left:0.75rem'/>
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
                <bim-number-input slider min='0.01' max='1' value='1' sensitivity='0.3' step='0.01' style='max-width:8.12rem;margin-left:0.75rem'/>
            `
        })
        rangeInputMax.addEventListener('change', (event) => {
            if (!event.target) return
            const maxValue = (event.target as any).value
            if (rangeInputMin.value > maxValue) {
                rangeInputMin.value = maxValue - 0.01
            }
        });
        const rangeInterval = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button 
                    @click=${(e:Event) => {
                        (e.target as BUI.Button).label = (e.target as BUI.Button).label=='Inside'?'Outside':'Inside';
                        (e.target as BUI.Button).icon = (e.target as BUI.Button).label=='Inside'?'iconoir:arrow-separate':'iconoir:arrow-union'
                    }} 
                    label='Inside'
                    tooltip-text='Click to filter elements inside or outside the chosen range'
                    style='width:8.12rem'
                    icon='iconoir:arrow-separate'
                >
                </bim-button>
            `
        })
        const limitToSelection = BUI.Component.create<BUI.Checkbox>(() => {
            return BUI.html`
                <bim-checkbox
                    label='Limit to selected elements'
                    tooltip-text='Click to limit the filter to the currently selected elements'
                    icon='hugeicons:cursor-circle-selection-01'
                    @change=${(e:Event) => {
                        if ((e.target as BUI.Checkbox).checked){
                            categoriesDropdown.style.display = 'none'
                        } else {
                            categoriesDropdown.style.display = ''
                        }
                    }}
                >
                </bim-checkbox>
            `
        })
        const limitToCostItemName = BUI.Component.create<BUI.TextInput>(() => {
            return BUI.html`
                <bim-text-input
                    label='Limit to cost items (by Name attribute)'
                    tooltip-text='Type cost item names to limit the analysis to items with these cost items'
                    icon='fluent:rename-a-20-regular'
                    placeholder='Use comma to separate'
                >
                </bim-text-input>
            `
        })
        const rangeCost = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button 
                    @click=${(e:Event) => {
                        if ((e.target as BUI.Button).label=='Percentile'){
                            (e.target as BUI.Button).label = 'Cost';
                            (e.target as BUI.Button).icon = 'mynaui:dollar-square'
                            rangeInputMax.max = 100000
                            rangeInputMin.max = 99999
                            rangeInputMax.min = 1
                            rangeInputMax.value = 100000
                            rangeInputMax.step = 10
                            rangeInputMin.step = 10
                            rangeInputMax.suffix = '$'
                            rangeInputMin.suffix = '$'
                            rangeInputMax.sensitivity = 100
                            rangeInputMin.sensitivity = 100
                        } else {
                            (e.target as BUI.Button).label = 'Percentile';
                            (e.target as BUI.Button).icon = 'ant-design:field-binary-outlined'
                            rangeInputMax.max = 1
                            rangeInputMin.max = 0.99
                            rangeInputMax.min = 0.01
                            rangeInputMax.value = 1
                            rangeInputMax.step = 0.01
                            rangeInputMin.step = 0.01
                            rangeInputMax.suffix = ''
                            rangeInputMin.suffix = ''
                            rangeInputMax.sensitivity = 0.3
                            rangeInputMin.sensitivity = 0.3
                        }
                    }} 
                    label='Percentile'
                    tooltip-text='Click to filter elements using range between 0 and 1 or the cost itself'
                    style='width:8.12rem'
                    icon='ant-design:field-binary-outlined'
                >
                </bim-button>
            `
        })

        const colorResourcesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            return BUI.html`
                <bim-panel-section
                    label = "Cost Analysis"
                    icon = "ic:round-format-color-fill">
                    ${colorScaleDropdown}
                    ${resourcesDropdown}
                    ${limitToSelection}
                    ${limitToCostItemName}
                    ${categoriesDropdown}
                    ${unitMeasureDropdown}
                    <div style="display:flex; gap: 1rem; align-items:center">
                        <bim-label icon='mdi:slider'>Range</bim-label>
                        <bim-button tooltip-text="Info: this range filters the items resulting from the above choices" icon='material-symbols-light:info-outline-rounded' style="max-width:fit-content; height:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                        <div style="display:flex; flex-direction:column; gap:0.75rem; flex-grow:1; align-items:center">
                            ${rangeInterval}
                            ${rangeCost}
                        </div>
                        <div style="display:flex; flex-direction:column; gap:0.75rem; flex-grow:1">
                            <div style="display: flex; justify-content:end">
                                <bim-label icon='material-symbols:line-start-circle-outline-rounded'>Min</bim-label>
                                ${rangeInputMin}
                            </div>
                            <div style="display: flex; justify-content:end">
                                <bim-label icon='material-symbols:line-end-circle-outline-rounded'>Max</bim-label>
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
        const onOpenElementXCostPanel = async (modelIdMap:OBC.ModelIdMap|undefined=undefined,normalization:boolean=false,modelTo_localIdToColor_map?:{[key: string]: Record<string, string>},limitToCostItemNameList:string[]=[]) => {
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
            //console.log('selection data: \n', selectionData)

            const startTime_6 = performance.now(); // Start timer
            // #region INITIALIZE TABLES
            //tables types
            type dynamicCostTableData = {
                ElementName: string,
                ElementIfcClass: string,
                Cost: number|string,
                CostRange?: string,
                Quantity: number|string,
                Currency: string,
                CostItemName: string,
                CostItemDescription: string,
                CostItemUnitCost: number|string,
                ComponentsCostValues: any,
                Model: string,
                ItemId?: number,
                ItemVolume?: number,
                NormalizedCost?: number,
            }
            //tables
            const dynamicCostTable = document.createElement("bim-table") as BUI.Table<dynamicCostTableData>
            dynamicCostTable.id = 'dynamicCostTable'
            dynamicCostTable.data = [{
                    data: {
                        Model: '',
                        ElementName: '',
                        ElementIfcClass: '',
                        Cost: '',
                        NormalizedCost: 0,
                        ItemVolume: 0,
                        Quantity: '',
                        Currency: '',
                        CostItemName: '',
                        CostItemDescription: '',
                        CostItemUnitCost: '',
                        ComponentsCostValues: '',
                    }}]
            dynamicCostTable.data = []
            dynamicCostTable.preserveStructureOnFilter = true
            dynamicCostTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
            // #endregion

            //get cost data
            let itemId, itemName, itemIfcClass, costItemName, costItemId, costItemDescription, costItemObjectType, costItemTotalCost, costItemUnitBasis, costItemUnitCost //initialize variables
            const getLocalId = (item: any) => item?._localId?.value as number | undefined
            const mapItemsByLocalId = (items: any[] = []) => {
                const itemsMap: {[key:number]:any} = {}
                for (const item of items) {
                    const localId = getLocalId(item)
                    if (typeof localId === 'number') itemsMap[localId] = item
                }
                return itemsMap
            }

            let totalCost: number = 0
            let totalCurrency: string = ''

            for (const [model,selectedItems] of Object.entries(selectionData)) { //loop over models of selected items
                const assignedCostItemIds = new Set<number>()
                for (const item of selectedItems) {
                    const assignments = item['HasAssignments']
                    if (!assignments) continue
                    for (const costItem of Object.values(assignments) as any[]) {
                        if (costItem?._category?.value !== 'IFCCOSTITEM') continue
                        const assignedCostItemId = getLocalId(costItem)
                        if (typeof assignedCostItemId === 'number') assignedCostItemIds.add(assignedCostItemId)
                    }
                }

                const costItemsRecord = assignedCostItemIds.size === 0 ? null : await fragments.getData({[model]: assignedCostItemIds},{
                    attributesDefault: true,
                    relations: {
                        'CostValues': {
                            attributes: true,
                            relations: false
                        }
                    }
                })
                const costItemsById = mapItemsByLocalId(costItemsRecord?.[model] as any[] ?? [])

                const costValueIds = new Set<number>()
                for (const costItem of Object.values(costItemsById)) {
                    const costValues = (costItem as any)?.['CostValues']
                    if (!costValues) continue
                    for (const cv of Object.values(costValues) as any[]) {
                        const cvId = getLocalId(cv)
                        if (typeof cvId === 'number') costValueIds.add(cvId)
                    }
                }

                const costValuesRecord = costValueIds.size === 0 ? null : await fragments.getData({[model]: costValueIds},{
                    attributesDefault: true,
                    relationsDefault: {
                        attributes: true,
                        relations: true //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
                    }
                })
                const costValuesById = mapItemsByLocalId(costValuesRecord?.[model] as any[] ?? [])

                for (const item of selectedItems) { //loop over selected items
                    try { //needed to skip potential errors and do not interrupt the loop over items
                        if (!item['HasAssignments']) continue //checks if item has assignments --> it could have also different assignments
                        //item identity data
                        itemId = (item['_localId'] as FRAGS.ItemAttribute).value ? (item['_localId'] as FRAGS.ItemAttribute).value : 'nd'
                        itemName = (item['Name'] as FRAGS.ItemAttribute).value ? (item['Name'] as FRAGS.ItemAttribute).value : 'nd'
                        itemIfcClass = (item['_category'] as FRAGS.ItemAttribute).value ? (item['_category'] as FRAGS.ItemAttribute).value : 'nd'
                        let itemTotalCost: number = 0
                        let itemTotalCurrency: string = ''
                        for (const [a,costItem] of Object.entries(item['HasAssignments'])){ //loop over each assignment of item
                            let dynamicRow: BUI.TableGroupData<dynamicCostTableData> = {
                                data: {},
                            }
                            dynamicRow.data.Model = model
                            dynamicRow.data.ElementName = itemName
                            dynamicRow.data.ElementIfcClass = itemIfcClass
                            dynamicRow.data.Model = model
                            dynamicRow.data.ItemId = itemId
                            if (costItem['_category'].value != 'IFCCOSTITEM') continue //checks if the assignment is of IfcCostItem else go to the next one

                            //cost item identity data
                            if (limitToCostItemNameList.length > 0 && !limitToCostItemNameList.includes(costItem['Name'].value)) continue

                            costItemName = dynamicRow.data.CostItemName = costItem['Name'].value ? costItem['Name'].value : 'nd'
                            costItemDescription = dynamicRow.data.CostItemDescription = costItem['Description'].value ? costItem['Description'].value : 'nd'
                            costItemObjectType = costItem['ObjectType'].value ? (costItem['ObjectType'].value as string).toUpperCase() : 'nd'

                            costItemId = costItem['_localId'].value ? costItem['_localId'].value : 'nd'
                            const costItemFull = typeof costItemId === 'number' ? costItemsById[costItemId] : null
                            if (!costItemFull?.['CostValues']) continue

                            for (const [b,cv] of Object.entries(costItemFull['CostValues']) as any){ //technically it will be always one when inspecting cost item as total cost
                                
                                const cvId = cv['_localId'].value ? cv['_localId'].value : 'nd'
                                const costValue = (typeof cvId === 'number' ? costValuesById[cvId] : null) as any
                                if (!costValue) continue

                                //total cost of item
                                const valueComponent = costValue['AppliedValue'][0]['ValueComponent'].value
                                const costValueAppliedValue = (valueComponent !== undefined && valueComponent !== null) ? valueComponent : 'nd'
                                const costValueUnitComponent = costValue['AppliedValue'][0]['UnitComponent'][0]['Currency'].value ? costValue['AppliedValue'][0]['UnitComponent'][0]['Currency'].value : 'nd'
                                const currency = convertCurrency(costValueUnitComponent)
                                costItemTotalCost = dynamicRow.data.Cost = `${Math.round(costValueAppliedValue*100)/100} ${currency}`
                                //quantity of item
                                const unitComponent = costValue['UnitBasis'][0]['ValueComponent'].value
                                const costValueUnitBasis = (unitComponent !== undefined && unitComponent !== null) ? unitComponent : 'nd'
                                const costValueUnitMeasure = costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value ? costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value : 'nd'
                                const unitMeasure = convertUnits(costValueUnitMeasure)
                                costItemUnitBasis = dynamicRow.data.Quantity = `${Math.round(costValueUnitBasis*1000)/1000} ${unitMeasure}`
                                //unit cost of cost item
                                try {
                                    if (costValue['Components'] && (costValue['Components'][0]['Category'].value as string).toUpperCase() == IfcFileLabel_UnitCost){
                                        const costValueUnitCostAppliedValue = costValue['Components'][0]['AppliedValue'][0]['ValueComponent'].value ? costValue['Components'][0]['AppliedValue'][0]['ValueComponent'].value : 'nd'
                                        const costValueUnitCostUnitComponent = costValue['Components'][0]['AppliedValue'][0]['UnitComponent'][0]['Currency'].value ? costValue['Components'][0]['AppliedValue'][0]['UnitComponent'][0]['Currency'].value : 'nd'
                                        const currency = convertCurrency(costValueUnitCostUnitComponent)
                                        costItemUnitCost = dynamicRow.data.CostItemUnitCost = `${Math.round(costValueUnitCostAppliedValue*100)/100} ${currency}/${unitMeasure}`
                                        dynamicRow.data.ComponentsCostValues = costValue['Components'][0]['Components']
                                    } else {
                                        dynamicRow.data.CostItemUnitCost = 'nd'
                                        dynamicRow.data.ComponentsCostValues = dynamicRow.data.ComponentsCostValues = 'nd'
                                    }
                                } catch (error) {
                                    console.warn('Error in finding unit cost. Error:\n',error)
                                    dynamicRow.data.CostItemUnitCost = 'nd'
                                    dynamicRow.data.ComponentsCostValues = dynamicRow.data.ComponentsCostValues = 'nd'
                                }
                                itemTotalCost += costValueAppliedValue //element total cost: sum of all cost item related
                                itemTotalCurrency = currency
                            }
                            dynamicRow.data.NormalizedCost = 0
                            dynamicRow.data.ItemVolume = 0
                            dynamicRow.data.CostRange = 'nd'
                            dynamicCostTable.data.push(dynamicRow)
                        }
                        totalCost += itemTotalCost
                        totalCurrency = itemTotalCurrency
                    } catch (error) {
                        console.warn(error)
                        continue //go to the next item of loop, do not interrupt the loop
                    }
                }
            }

            sortbyTotalCostDropdown.addEventListener('change', (e) => {
                if (!e.currentTarget) return
                const field = (e.currentTarget as BUI.Dropdown).value[0]
                const ascending = sortbyDirectionTotalCost.icon=='meteor-icons:arrow-up' ? false : true
                onSortDynamicTable(dynamicCostTable, field, ascending, totalCostPerGroupedTable)}
            )
            const onVisibleColumnsChange = (e: Event) => {
                const dropdown = e.currentTarget as BUI.Dropdown
                const checkedFields = [...dropdown.value]
                dynamicCostTable.visibleColumns = checkedFields
                dynamicCostTable.data = [...dynamicCostTable.data]
                dynamicCostTable.requestUpdate()
            }
            visibleColumnsDropdown_CostItemGroup.addEventListener('change', (e) => {
                onVisibleColumnsChange(e)
            })
            visibleColumnsDropdown_classicGroups.addEventListener('change', (e) => {
                onVisibleColumnsChange(e)
            })
            const sortbyDirectionTotalCost = BUI.Component.create<BUI.Dropdown>(
                () => BUI.html`
                    <bim-button icon='meteor-icons:arrow-up' style="max-width:fit-content; z-index:100" tooltip-text='Ascending or descending order'
                        @click="${(e:Event) => {
                            if (!e.currentTarget) return
                            const button = e.currentTarget as BUI.Button
                            button.icon = button.icon=='meteor-icons:arrow-up' ? 'meteor-icons:arrow-down' : 'meteor-icons:arrow-up'
                            const ascending = button.icon=='meteor-icons:arrow-up' ? false : true
                            onSortDynamicTable(dynamicCostTable, sortbyTotalCostDropdown.value[0], ascending,totalCostPerGroupedTable)
                        }}">
                    </bim-button>`,
            )

            const totalCostPerGroupedTable: {[group: string]: {cost: number, quantity: number, currency: string, um: string, model:string, itemId?: number, costItemUnitCost?: string|number, costItemDescription?: string, ComponentsValue?: any}} = {}
            const groupIfcClasses = new Set<string>()
            const groupElements = new Set<string>()
            const groupCostItems = new Set<string>()
            for (const row of dynamicCostTable.data){
                const groupIfcClass = row.data.ElementIfcClass
                const groupElement = row.data.ElementName
                const groupCostItem = row.data.CostItemName
                if (!groupIfcClass || !groupElement || !groupCostItem) continue
                const cost = Number((row.data.Cost as string).split(' ')[0])
                const quantity = Number((row.data.Quantity as string).split(' ')[0])
                const currency = (row.data.Cost as string).split(' ')[1]
                const um = (row.data.Quantity as string).split(' ')[1] //unit of measure
                const itemId = row.data.ItemId
                const model = row.data.Model

                if (modelTo_localIdToColor_map && itemId && model) {
                    const colorValue = modelTo_localIdToColor_map[model]?.[Number(itemId)]
                    row.data.CostRange = colorValue ? getColorRangeKeyByColorValue(colorValue) ?? colorValue : colorValue
                }

                if (!model) continue
                if (!totalCostPerGroupedTable[groupIfcClass]) {
                    totalCostPerGroupedTable[groupIfcClass] = { cost: 0, quantity: 0, currency, um, model }
                }
                totalCostPerGroupedTable[groupIfcClass].cost += cost
                groupIfcClasses.add(groupIfcClass)

                if (!totalCostPerGroupedTable[groupElement]) {
                    totalCostPerGroupedTable[groupElement] = { cost: 0, quantity: 0, currency, um, model, itemId}
                }
                totalCostPerGroupedTable[groupElement].cost += cost
                groupElements.add(groupElement)

                if (!totalCostPerGroupedTable[groupCostItem]) {
                    totalCostPerGroupedTable[groupCostItem] = { cost: 0, quantity: 0, currency, um, model, costItemUnitCost: row.data.CostItemUnitCost, costItemDescription: row.data.CostItemDescription, ComponentsValue: row.data.ComponentsCostValues }
                }
                totalCostPerGroupedTable[groupCostItem].cost += cost
                totalCostPerGroupedTable[groupCostItem].quantity += quantity
                groupCostItems.add(groupCostItem)
            }

            dynamicCostTable.dataTransform = {
                Cost: (value, rowData) => {
                    const { ElementName, ElementIfcClass, CostItemName } = rowData
                    if (!ElementName && !CostItemName && ElementIfcClass) {
                        if (value!='') return value
                        return formatNumber_Cost(Math.round(totalCostPerGroupedTable[ElementIfcClass]?.cost*100)/100)+' '+totalCostPerGroupedTable[ElementIfcClass]?.currency
                    } else if (!ElementName && CostItemName && !ElementIfcClass) {
                        if (value!='') return value
                        return formatNumber_Cost(Math.round(totalCostPerGroupedTable[CostItemName]?.cost*100)/100)+' '+totalCostPerGroupedTable[CostItemName]?.currency
                    } else if (ElementName && !CostItemName && !ElementIfcClass) {
                        if (value!='') return value
                        const m = totalCostPerGroupedTable[ElementName]?.model // this is needed only here because the Element grouping is the only one with colors
                        if (modelTo_localIdToColor_map) {
                            return BUI.html`
                                <div style="display: flex; flex-direction:row; gap:1rem; min-width:100%">
                                    <div style="height:1rem; width: 1rem; margin-left: 2rem; border-radius:5px; 
                                        background-color:${modelTo_localIdToColor_map[m!]?.[Number(totalCostPerGroupedTable[ElementName]?.itemId)]};
                                        color:${modelTo_localIdToColor_map[m!]?.[Number(totalCostPerGroupedTable[ElementName]?.itemId)]};">.</div>
                                    <bim-label>${formatNumber_Cost(Math.round(totalCostPerGroupedTable[ElementName]?.cost*100)/100)+' '+totalCostPerGroupedTable[ElementName]?.currency}</bim-label>
                                </div>
                            `
                        } else {
                            return formatNumber_Cost(Math.round(totalCostPerGroupedTable[ElementName]?.cost*100)/100)+' '+totalCostPerGroupedTable[ElementName]?.currency
                        }
                    } else {
                        return formatNumber_Cost(value)
                    }
                },
                Quantity: (value, rowData) => {
                    const { ElementName, ElementIfcClass, CostItemName } = rowData
                    if (!ElementName && CostItemName && !ElementIfcClass) {
                        if (value!='') return value
                        return formatNumber_Cost(Math.round(totalCostPerGroupedTable[CostItemName]?.quantity*100)/100)+' '+totalCostPerGroupedTable[CostItemName]?.um
                    } else {
                        return formatNumber_Cost(value)
                    }
                },
                CostItemUnitCost: (value, rowData) => {
                    const { ComponentsCostValues, CostItemName, CostItemDescription, CostItemUnitCost } = rowData
                    if (CostItemUnitCost == 'nd' || !CostItemUnitCost) return value
                    return BUI.html`
                    <bim-button
                        label=${value}
                        style="background-color:rgba(0,0,0,0.1)"
                        @click=${() => {
                            onOpenPriceAnalysis(ComponentsCostValues, CostItemName, CostItemDescription, CostItemUnitCost)
                            }}
                        >
                    </bim-button>
                    `
                },
                ElementName: (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                    const { Model, ItemId } = rowData
                    let id = ItemId
                    let m = Model
                    // grouped rows do not have Model and ItemId, so I need to get them from the totalCostPerGroupedTable using the group name (value)
                    if (!ItemId) id = Number(totalCostPerGroupedTable[value]?.itemId)
                    if (!Model) m = totalCostPerGroupedTable[value]?.model
                    return BUI.html`
                        <bim-label
                            @click=${async () => {
                                highlighter.highlightByID("select", {[m as string]: new Set<number>([id as number])}, false, true)
                                const guid = await fragments.modelIdMapToGuids({[m as string]: new Set<number>([id as number])})
                                await navigator.clipboard.writeText(guid[0])
                                }}
                            @mouseover=${({target}:{target:BUI.Label}) => {target.style.color = "rgba(36, 241, 234, 1)"}}
                            @mouseleave=${({target}:{target:BUI.Label}) => {target.style.removeProperty('color')}}
                        >${value}</bim-label>`
                },
                CostItemName: (value, rowData) => {
                    const { ElementIfcClass, ElementName } = rowData
                    if (!ElementName && !ElementIfcClass) {
                        return BUI.html`
                            <bim-label
                                @mouseover=${({currentTarget}: {currentTarget: BUI.Label}) => {
                                    const label = currentTarget
                                    const contextMenu = label.querySelector<BUI.ContextMenu>('bim-context-menu')
                                    if (!contextMenu) return
                                    contextMenu.visible = true
                                    label.style.color = "rgba(36, 241, 234, 1)"

                                    const closeWhenPointerLeavesLabel = (event: PointerEvent) => {
                                        const rect = label.getBoundingClientRect()
                                        const isStillOverLabel =
                                            event.clientX >= rect.left &&
                                            event.clientX <= rect.right &&
                                            event.clientY >= rect.top &&
                                            event.clientY <= rect.bottom

                                        if (isStillOverLabel) return

                                        label.style.removeProperty('color')
                                        BUI.ContextMenu.removeMenus()
                                        document.removeEventListener('pointermove', closeWhenPointerLeavesLabel, true)
                                    }

                                    requestAnimationFrame(() => {
                                        document.addEventListener('pointermove', closeWhenPointerLeavesLabel, true)
                                    })
                                }}>
                                ${value}
                                <bim-context-menu id="bim-context-menu-resource" style="max-width: 30rem; padding: 0.75rem;">
                                    <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                        ${totalCostPerGroupedTable[value]?.costItemUnitCost ? `Unit Cost: ${totalCostPerGroupedTable[value].costItemUnitCost}` : 'No unit cost available'}
                                    </bim-label>
                                    <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                        ${totalCostPerGroupedTable[value]?.costItemDescription ? `Description: ${totalCostPerGroupedTable[value].costItemDescription}` : 'No description available'}
                                    </bim-label>
                                </bim-context-menu>
                            </bim-label>`
                    } else {
                        return value
                    }
                }
            }
            
            dynamicCostTable.groupedBy = ['ElementName']
            dynamicCostTable.columns = ['ElementName']
            normalization ? 
                dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','CostRange'] :
                dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','CostRange','ItemVolume','NormalizedCost']
            dynamicCostTable.visibleColumns = currentVisibleColumnsDropdown.value.length > 0 ? currentVisibleColumnsDropdown.value : ['CostItemName','CostItemDescription','Cost','Quantity','CostItemUnitCost']

            const onCreateChart_IfcClass = () => {
                const groupIfcClassLabels = [...groupIfcClasses]
                chartPrimary.colors = ['rgb(200, 200, 200)','rgb(138, 138, 138)']
                chartPrimary.transparentBackground = true
                chartPrimary.borderColor = 'transparent'
                chartPrimary.label = 'Total cost per IfcClass'
                setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                chartPrimary.inputData = {
                    labels: groupIfcClassLabels,
                    datasets: {
                        TotalCost: groupIfcClassLabels.map((groupIfcClass) => ({
                            value: Math.round((totalCostPerGroupedTable[groupIfcClass]?.cost ?? 0)*100)/100
                        }))
                    }
                }
            }
            const onCreateChart_Element = () => {
                if (modelTo_localIdToColor_map) {
                    const totalCostPerColor: Record<string, {items:number, cost:number}> = {}
                    for (const groupElement of groupElements) {
                        const itemId = totalCostPerGroupedTable[groupElement]?.itemId
                        const model = totalCostPerGroupedTable[groupElement]?.model
                        if (!model || !itemId) continue
                        const color = itemId !== undefined ? modelTo_localIdToColor_map[model]?.[Number(itemId)] : undefined
                        if (!color) continue
                        totalCostPerColor[color] = totalCostPerColor[color] ? totalCostPerColor[color] : { items: 0, cost: 0 }
                        totalCostPerColor[color].cost = (totalCostPerColor[color].cost ?? 0) + (totalCostPerGroupedTable[groupElement]?.cost ?? 0)
                        totalCostPerColor[color].items = (totalCostPerColor[color].items ?? 0) + 1
                    }

                    const [colorscale] = colorScaleDropdown.value ? colorScaleDropdown.value : 'gnylrd'
                    const orderedColorsWithValue = Object.keys(totalCostPerColor)
                        .map((color) => ({
                            color: color,
                            rangeValue: getNormalizedValueFromColor(color, colorscale) ?? 0,
                            rangeLabel: getColorRangeKeyByColorValue(color)?.slice(3) ?? color,
                            totalCost: Math.round(totalCostPerColor[color].cost*100)/100,
                            itemsNumber: totalCostPerColor[color].items
                        }))
                        .sort((a, b) => b.rangeValue - a.rangeValue)

                    chartPrimary.colors = orderedColorsWithValue.length==1 ? 
                        [orderedColorsWithValue[0].color,orderedColorsWithValue[0].color] : 
                        orderedColorsWithValue.map(({ color }) => color)
                    chartPrimary.transparentBackground = true
                    chartPrimary.borderColor = 'rgba(0, 0, 0, 0.2)'
                    chartPrimary.label = 'Total cost and Number of items per Cost range'
                    setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                    chartPrimary.inputData = {
                        labels:  orderedColorsWithValue.map(({ rangeLabel }) => rangeLabel),
                        datasets: {
                            TotalCost: orderedColorsWithValue.map(({ totalCost }) => ({
                                value: totalCost
                            })),
                            NumberOfItems: orderedColorsWithValue.map(({ itemsNumber }) => ({
                                value: itemsNumber
                            }))
                        }
                    }
                } else {
                    const groupElementsNoColor = [...groupElements]
                    chartPrimary.colors = ['rgb(200, 200, 200)','rgb(138, 138, 138)']
                    chartPrimary.transparentBackground = true
                    chartPrimary.borderColor = 'transparent'
                    chartPrimary.label = 'Total cost per Element'
                    setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                    chartPrimary.inputData = {
                        labels: groupElementsNoColor,
                        datasets: {
                            TotalCost: groupElementsNoColor.map((groupElement) => ({
                                value: Math.round((totalCostPerGroupedTable[groupElement]?.cost ?? 0)*100)/100
                            }))
                        }
                    }
                }
            }
            const onCreateChart_CostItem = () => {
                const groupCostItemLabels = [...groupCostItems]
                chartPrimary.colors = ['rgb(200, 200, 200)','rgb(138, 138, 138)']
                chartPrimary.transparentBackground = true
                chartPrimary.borderColor = 'transparent'
                chartPrimary.label = 'Total cost per Cost item'
                setChartPrimaryLabelsVisible(chartPrimaryLabelsVisible)
                chartPrimary.inputData = {
                    labels: groupCostItemLabels,
                    datasets: {
                        TotalCost: groupCostItemLabels.map((groupCostItem) => ({
                            value: Math.round((totalCostPerGroupedTable[groupCostItem]?.cost ?? 0)*100)/100
                        }))
                    }
                }
            }

            onCreateChart_Element()
            
            const elementXCostPanelControls = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                    <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px 10px 5px 10px'})}>
                        <div style="display: flex; gap: 0.5rem;">
                            <bim-button @click=${(e:Event) => onExpandTable(e,dynamicCostTable)} tooltip-title=${dynamicCostTable.expanded ? "Collapse" : "Expand"} icon=${dynamicCostTable.expanded ? "si:expand-less-fill" : "si:expand-more-fill"} style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-label>Group by:</bim-label>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                onCreateChart_IfcClass()
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_element')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costitem')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costrange')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'ElementIfcClass'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['ElementIfcClass','ElementName']
                                dynamicCostTable.columns = ['ElementIfcClass','ElementName']
                                normalization ?
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementIfcClass','Currency','ElementName','CostRange'] :
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementIfcClass','Currency','ElementName','ItemVolume','NormalizedCost','CostRange']
                                setVisibleColumnsDropdown(visibleColumnsDropdown_classicGroups)
                                dynamicCostTable.visibleColumns = currentVisibleColumnsDropdown.value
                            }} id="groupby_ifcclass" label="IFC Class" style="max-width:fit-content"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                onCreateChart_Element()
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costitem')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costrange')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'ElementName'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['ElementName']
                                dynamicCostTable.columns = ['ElementName']
                                normalization ? 
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','CostRange'] :
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','CostRange','ItemVolume','NormalizedCost']
                                setVisibleColumnsDropdown(visibleColumnsDropdown_classicGroups)
                                dynamicCostTable.visibleColumns = currentVisibleColumnsDropdown.value
                            }} id="groupby_element" label="Element" style="max-width:fit-content; background-color:var(--background-200)"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                onCreateChart_Element()
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costitem')!.style.removeProperty('background-color');
                                document.getElementById('groupby_element')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'CostRange'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['CostRange','ElementName']
                                dynamicCostTable.columns = ['ElementName']
                                normalization ? 
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','CostRange'] :
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','CostRange','ItemVolume','NormalizedCost']
                                setVisibleColumnsDropdown(visibleColumnsDropdown_classicGroups)
                                dynamicCostTable.visibleColumns = currentVisibleColumnsDropdown.value
                            }} id="groupby_costrange" ${BUI.ref((el) => {groupBy_CostRange_Btn = el as BUI.Button})} tooltip-text="Enabled only for cost analysis coloured panel" label="Cost Range" style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                onCreateChart_CostItem()
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('groupby_element')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costrange')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'CostItemName'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['CostItemName']
                                dynamicCostTable.columns = ['CostItemName']
                                normalization ?
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','CostItemDescription','CostItemUnitCost','CostItemName','Currency','CostRange'] :
                                    dynamicCostTable.hiddenColumns = ['ComponentsCostValues','Model','ItemId','CostItemDescription','CostItemUnitCost','CostItemName','Currency','ItemVolume','NormalizedCost','CostRange']
                                setVisibleColumnsDropdown(visibleColumnsDropdown_CostItemGroup)
                                dynamicCostTable.visibleColumns = visibleColumnsDropdown_CostItemGroup.value.length > 0 ? visibleColumnsDropdown_CostItemGroup.value : ['ElementName', 'ElementIfcClass', 'Cost', 'Quantity']
                            }} id="groupby_costitem" label="Cost Item" style="max-width:fit-content"></bim-button>
                            <bim-label>Sort by:</bim-label>
                            ${sortbyTotalCostDropdown}
                            ${sortbyDirectionTotalCost}
                            <bim-label>Columns:</bim-label>
                            ${currentVisibleColumnsDropdown}
                            <bim-label>Ghost mode:</bim-label>
                            <bim-button 
                                id='ghost-mode' 
                                @click=${async (e:Event) => {
                                    await onSetTransparencyToCostColor(e);
                                    (e.target as any).label = (e.target as any).label=='Ghost' ? 'Reset' : 'Ghost'
                                }} 
                                label="Ghost"
                                tooltip-text="Set transparency to non-selected items. On the side, you can set their opacity. Ghost mode works only on cost analysis colored items."
                                style="max-width:fit-content; z-index:100">
                            </bim-button>
                            <bim-number-input
                                id='ghost-mode-opacity' slider step="0.01" value="0.5" min="0" max="1"
                                style="max-width:fit-content; z-index:100"
                                @change="${async ({ target }: { target: BUI.NumberInput }) => {
                                    (highlighter.styles.get('color_0_02_transparent') as any).opacity = target.value;
                                    (highlighter.styles.get('color_02_04_transparent') as any).opacity = target.value;
                                    (highlighter.styles.get('color_04_06_transparent') as any).opacity = target.value;
                                    (highlighter.styles.get('color_06_08_transparent') as any).opacity = target.value;
                                    (highlighter.styles.get('color_08_1_transparent') as any).opacity = target.value;
                                    await highlighter.updateColors()
                                }}">
                            </bim-number-input>
                            <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,dynamicCostTable)}} debounce="300"></bim-text-input>
                            <bim-button @click=${() => {onClearPanel(panelDown),onClearPanel(panelRight)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                        </div>
                    </div>
                `
            })
            const hasCostItemsCheck = dynamicCostTable.data.length > 0
            const elementXCostPanel = BUI.Component.create<BUI.Panel>(() => {
                return BUI.html`
                <bim-panel style="background:none; height:100%; min-height:0;">
                    <div style="display:grid; grid-template-columns:80% 20%; gap:10px; margin:5px 15px 5px 15px; background-color:transparent; flex:1; height:100%; min-height:0;">
                        <div style="display:grid; grid-template-rows:1fr 2rem; gap:2px; background-color:transparent; flex:1; height:100%; min-height:0;">
                            ${dynamicCostTable}
                            <bim-label style="font-size:var(--bim-ui_size-sm); border-top:1px solid var(--bim-ui_bg-contrast-20); padding-left:0.5rem">TOTAL: ${formatNumber_Cost(Math.round(totalCost*100)/100)} ${totalCurrency}</bim-label>
                        </div>
                        <div style="background:none; height:90%; min-height:0;">
                            ${chartPrimary}
                            <bim-checkbox
                                label='Display labels'
                                style="padding:0.5rem"
                                ?checked=${chartPrimaryLabelsVisible}
                                @change=${({ target }: { target: BUI.Checkbox }) => {
                                    setChartPrimaryLabelsVisible(target.value)
                                }}>
                            </bim-checkbox>
                        </div>
                    </div>
                </bim-panel>`
            })

            panelDown.innerHTML=''

            hasCostItemsCheck ? panelDown.appendChild(elementXCostPanelControls) : null
            hasCostItemsCheck ? panelDown.appendChild(elementXCostPanel) : panelDown.appendChild(noCostItemsLabel)
            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('down')){
                onSetLayout({target:'down'})
            }

            const endTime_6 = performance.now(); // End timer
            const loadTime_6 = ((endTime_6 - startTime_6) / 1000).toFixed(2); // seconds
            console.log(`TIME ${loadTime_6} s: only create and append the cost table (within onOpenElementXCostPanel method)`);
            return dynamicCostTable
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
                    row.data.Name = component['Name'] ? component['Name'].value : component['Description'] ? component['Description'].value : 'nd'
                    row.data.Category = component['Category'] ? (component['Category'].value as string).toUpperCase() : 'nd'
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
                    style="padding: 5px; gap: 5px">
                </bim-grid>
            `;
        })
        floatingGrid.resizeableAreas = true

        //TOOLBAR COMPONENT
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            return BUI.html`
            <bim-toolbar style="justify-self:center; align-content:center; background: rgba(0,0,0,0.5); z-index:50" class="blur-background-container">
                <bim-toolbar-section id="test-section" label="TEST" style="display:${devElementsVisibility}">
                    <bim-button
                        label="Sample"
                        tooltip-title="Load sample IFC models. Only for developers."
                        @click=${() => {
                            loadIfcFile("/assets/Sample_with costs.ifc",'Sample_with costs')
                            loadIfcFile("/assets/SFH_with costs.ifc",'SFH_with costs')
                            }}>
                    </bim-button>
                    <bim-button
                        label='Volume'
                        tooltip-title="Print volume of selected item"
                        @click=${getVolume}
                    ></bim-button>
                    <bim-button
                        label='Categories'
                        tooltip-title="Print all categories in loaded models"
                        @click=${async () => {
                            const categories = await getAllCategories()
                            const lC = new Set(categories)
                            const filteredCategories = [...new Set(importedCategories.filter(x => lC.has(x)))]
                            filteredCategories.push('ALL IFC CLASSES')
                            console.log(filteredCategories)
                            categoriesDropdown.innerHTML = ''
                            categoriesDropdown.innerHTML = `<bim-option label='ciao' style="padding:0 10px 0 10px"></bim-option>`
                            updateCategoriesDropdown({listCategories:filteredCategories})
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Scene">
                    <bim-button
                        id='world'
                        icon="tabler:world-cog"
                        tooltip-title="Scene Visibility Settings"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        id='screenshot'
                        icon="material-symbols:add-a-photo-outline-rounded"
                        tooltip-title="Screenshot"
                        @click=${takeScreenshot}>
                    </bim-button>
                    <bim-button
                        tooltip-title="Center View"
                        icon="mdi:image-filter-centre-focus"
                        @click=${async ()=>{
                            await world.camera.controls.setLookAt(30,30,30,0,0,0)
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Samples">
                    <bim-dropdown placeholder="Load..." style="align-items: flex-start;">
                        <bim-option
                            style="padding:0 10px 0 10px"
                            icon="boxicons:building-small"
                            label="Sample ARC Small"
                            @click=${async ({target}:{target:BUI.Option}) => {
                                    await loadFragmentFile("/FRAG/Sample_ARC_small.frag")
                                    target.checked = false
                                }}>
                        </bim-option>
                        <bim-option
                            style="padding:0 10px 0 10px"
                            icon="lucide:building"
                            label="Sample ARC Medium"
                            @click=${async ({target}:{target:BUI.Option}) => {
                                    await loadFragmentFile("/FRAG/Sample_ARC_medium.frag")
                                    target.checked = false
                                }}>
                        </bim-option>
                        <bim-option
                            style="padding:0 10px 0 10px"
                            icon="ph:pipe-light"
                            label="Sample MEP"
                            @click=${async ({target}:{target:BUI.Option}) => {
                                    await loadFragmentFile("/FRAG/Sample_MEP.frag")
                                    target.checked = false
                                }}>
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
                        tooltip-title="Open left panel"
                        @click=${({target}: { target: BUI.Button}) => {
                            onSetLayout({target: target.id})
                            target.icon = target.icon?.includes('open') ? 'mynaui:panel-left-close' : 'mynaui:panel-left-open'
                            target.tooltipTitle = target.tooltipTitle?.includes('Open') ? 'Close left panel' : 'Open left panel'
                        }}>
                    </bim-button>
                    <bim-button
                        id="down"
                        icon="mynaui:panel-bottom-open"
                        tooltip-title="Open bottom panel"
                        @click=${({target}: { target: BUI.Button}) => {
                            onSetLayout({target: target.id})
                            target.icon = target.icon?.includes('open') ? 'mynaui:panel-bottom-close' : 'mynaui:panel-bottom-open'
                            target.tooltipTitle = target.tooltipTitle?.includes('Open') ? 'Close bottom panel' : 'Open bottom panel'
                        }}>
                    </bim-button>
                    <bim-button
                        id="right"
                        icon="mynaui:panel-right-open"
                        tooltip-title="Open right panel"
                        @click=${({target}: { target: BUI.Button}) => {
                            onSetLayout({target: target.id})
                            target.icon = target.icon?.includes('open') ? 'mynaui:panel-right-close' : 'mynaui:panel-right-open'
                            target.tooltipTitle = target.tooltipTitle?.includes('Open') ? 'Close right panel' : 'Open right panel'
                        }}>
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
                        @click=${() => {highlighter.highlightByID('select', previousSelection, true, true)}}>
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
                <bim-toolbar-section label="Clipping">
                    <bim-button
                        id="disable-clipper"
                        tooltip-title="Disable clipping planes"
                        tooltip-text="Double-click on a surface to place a plane"
                        icon="bi:pause-btn"
                        @click=${({target}: { target: BUI.Button}) => { 
                            if (target.id === 'enable-clipper') {
                                clipper.enabled = true 
                                clipper.visible = true
                                target.id = 'disable-clipper'
                                target.tooltipTitle = "Disable clipping planes"
                                target.icon = "bi:pause-btn"
                            } else {
                                clipper.enabled = false
                                clipper.visible = false
                                target.id = 'enable-clipper'
                                target.tooltipTitle = "Enable clipping planes"
                                target.icon = "bi:play-btn"
                            }
                        }}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Delete all clipping planes"
                        icon="streamline:delete-keyboard-remix"
                        @click=${() => {
                            clipper.deleteAll() 
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="5D">
                    <bim-button
                        id='elementXCostButton'
                        tooltip-title="Show costs of selection"
                        icon="fontisto:dollar"
                        @click=${async ()=>{
                            await onOpenElementXCostPanel()
                            groupBy_CostRange_Btn.disabled = true
                        }}
                    ></bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })

        const panelDownHeight = '50%'
        const panelLeftWidth = '25.5%'
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

    //#region FINAL PART
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
    //#endregion
}
