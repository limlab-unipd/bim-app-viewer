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
    BUI.Manager.init()
    const components = new OBC.Components()
    // #endregion
    
    const setViewer = async () => {
        //VIEWER COMPONENTS
        const worlds = components.get(OBC.Worlds)
        const finder = components.get(OBC.ItemsFinder)
        const highlighter = components.get(OBCF.Highlighter)
        const ifcLoader = components.get(OBC.IfcLoader)
        const fragments = components.get(OBC.FragmentsManager)

        // #region SET THREE VIEWER
        //SINGLE VIEWER
        const world = worlds.create<
        OBC.SimpleScene,
        OBC.OrthoPerspectiveCamera,
        OBC.SimpleRenderer
        >()
        //SCENE
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = null
        //RENDERER
        const container = document.getElementById("main-viewer")! as HTMLElement
        world.renderer = new OBC.SimpleRenderer(components, container)
        //CAMERA
        world.camera = new OBC.OrthoPerspectiveCamera(components)
        await world.camera.controls.setLookAt(30,30,30,0,0,0) // convenient position for the model we will load
        // #endregion

        // #region COPONENTS GENERAL SETUP
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('#1C1C1C')

        components.get(OBC.Raycasters).get(world);

        highlighter.zoomToSelection = true;
        highlighter.setup({
            world,
            selectMaterialDefinition: {
                // you can change this to define the color of your highligthing
                color: new THREE.Color("#bcf124"),
                opacity: 1,
                transparent: false,
                renderedFaces: 0,
            },
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
            model.useCamera(world.camera.three);
            world.scene.three.add(model.object);
            fragments.core.update(true);
        });
        // #endregion
    
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
                        ${name} loaded in ${loadTime} seconds.
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
        const onFragmentsExport = async () => {
            for (const [, model] of fragments.list) {
                const fragsBuffer = await model.getBuffer(false);
                const file = new File([fragsBuffer], `${model.modelId}.frag`);
                const link = document.createElement("a");
                link.href = URL.createObjectURL(file);
                link.download = file.name;
                link.click();
                URL.revokeObjectURL(link.href);
            }
        }
        const onFragmentsImport = async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.multiple = true
            input.accept = '.frag'
            const fragPaths: string[] = [];
            input.onchange = async (event) => {
                const files = (event.target as HTMLInputElement).files
                if (!files) return
                for (const file of files){
                    fragPaths.push(URL.createObjectURL(file))
                }
                // Promise.all loads models concurrently for faster execution.
                await Promise.all(
                    fragPaths.map(async (path) => {
                    const modelId = path.split("/").pop()?.split(".").shift();
                    if (!modelId) return null;
                    const file = await fetch(path);
                    const buffer = await file.arrayBuffer();
                    // this is the main function to load the fragments
                    return fragments.core.load(buffer, { modelId });
                    }),
                );
            }
            input.click()
        }
        const onFragmentsPrint = async () => { //test function on fragments
            //it doesn't work with non geometric elements (IfcCostItem)
            const selection = highlighter.selection.select //modelIdMap -> association to exp id
            console.log("ModelIdMap: ", selection)
            const itemdata = await fragments.getData(selection) //frags.itemdata -> attributes, guid and expid (localId)
            console.log("ItemData: ", itemdata)
            const modelsIds = fragments.list.values() //loaded models fragments -> models ids
            
            console.log(modelsIds)
            finder.create("IfcCostItems", [{categories: [/COSTITEM/]}])
            const finderQuery = finder.list.get('IfcCostItems')
            const result = await finderQuery?.test()
            console.log('finder query: ', result)


            for (const model of modelsIds){ //loop over each single loaded model
                console.warn(model)
                const item = model.getItem(700100) //get the item from local id
                console.log("getItem: ", item)

                const category = 'IFCWALL'
                const categoryIds = await model.getItemsOfCategories(
                    [new RegExp(`^${category}$`)]
                )
                const localIds = categoryIds[category]
                const data = await model.getItemsData(localIds, {
                    attributesDefault: false,
                    attributes: ["Name"],
                });
                console.log(category, data)

                const [data2] = await model.getItemsData([179], {
                    attributesDefault: false,
                    attributes: ["Name", "NominalValue"],
                    relations: {
                        IsDefinedBy: { attributes: true, relations: true },
                        DefinesOcurrence: { attributes: false, relations: false },
                        HasAssignments: { attributes: true, relations: true },
                    },
                });
                console.log("IsDefinedBy", data2.IsDefinedBy)
                console.log("HasAssignments", data2.HasAssignments)
            }
        }

        //generic functions
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
        const onSetLayout = ({target}: {target: BUI.Button | string}) => {
            const btn = typeof target==='string' ? target : target.id
            const currentLayout = floatingGrid.layout as any
            if (!currentLayout) return
            if (currentLayout == btn) {
                floatingGrid.layout = "main" as any
            } else if (currentLayout == 'main') {
                floatingGrid.layout = btn as any
            } else {
                currentLayout.includes(btn) ? floatingGrid.layout = currentLayout.replace(btn, "") : floatingGrid.layout = currentLayout + btn as any
            }
        }
        const onExpandTable = (e: Event, table:BUI.Table<any>) => {
            const button = e.target as BUI.Button;
            table.expanded = !table.expanded;
            button.label = table.expanded ? "Collapse" : "Expand";
        }
        const onClearPanel = (panel: BUI.Panel) => {
            panel.innerHTML = ''
            panel.label = 'Void Panel'
        }

        //advanced functions
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
        const normalizeAndMapToColor = (map: Record<string, number>): [Record<string, string>,Record<string, number>] => {
            const colorScale: [number, string][] = [
                [0,     'rgba(26, 150, 65, 1)'],      // verde
                [1 / 3, 'rgba(166, 217, 106, 1)'],    // verde chiaro
                [2 / 3, 'rgba(253, 174, 97, 1)'],     // arancio
                [1,     'rgba(215, 25, 28, 1)']       // rosso
            ];

            const parseRGBA = (rgba: string): [number, number, number, number] => {
                const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (!match) throw new Error(`Formato colore non valido: ${rgba}`);
                return [
                parseInt(match[1], 10),
                parseInt(match[2], 10),
                parseInt(match[3], 10),
                parseFloat(match[4] ?? '1')
                ];
            };

            const interpolateColor = (color1: string, color2: string, t: number): string => {
                const [r1, g1, b1, a1] = parseRGBA(color1);
                const [r2, g2, b2, a2] = parseRGBA(color2);
                const r = Math.round(r1 + (r2 - r1) * t);
                const g = Math.round(g1 + (g2 - g1) * t);
                const b = Math.round(b1 + (b2 - b1) * t);
                const a = +(a1 + (a2 - a1) * t).toFixed(3);
                return `rgba(${r}, ${g}, ${b}, ${a})`;
            };

            const getColorForValue = (value: number): string => {
                for (let i = 0; i < colorScale.length - 1; i++) {
                const [v1, c1] = colorScale[i];
                const [v2, c2] = colorScale[i + 1];
                if (value >= v1 && value <= v2) {
                    const t = (value - v1) / (v2 - v1);
                    return interpolateColor(c1, c2, t);
                }
                }
                return colorScale[colorScale.length - 1][1]; // fallback
            };

            const values = Object.values(map);
            const min = Math.min(...values);
            const max = Math.max(...values);
            const range = max - min || 1;

            const result: Record<string, string> = {};
            const resultNormalized: Record<string, number> = {};
            for (const [key, value] of Object.entries(map)) {
                const normalized = (value - min) / range;
                result[key] = getColorForValue(normalized);
                resultNormalized[key] = normalized;
            }

            return [result, resultNormalized];
        }

        const onColorByResource = async ({target}: {target: BUI.Button | string}) => {
            const btn = typeof target === 'string' ? target : target.label //read if the clicked button is "color" or "select"

            const [resource] = resourcesDropdown.value //read the value of the resource dropdown menu (single choice)
            const category = categoriesDropdown.value //read the value of category dropdown menu, list is kept because multiple choices are accepted
            if (!resource || !category) return //if one of the two is not selected return the function (nothing will be done)
            
            onClearPanel(panelDown) //clear down panel
            panelDown.label = `${resource} Resource Cost X Elements` //change the title of the panel
            const gridLayout = floatingGrid.layout as any //change the grid layout
            if (!gridLayout.includes('down')){
                onSetLayout({target:'down'})
            }

            //table type for resource table
            type ResourceTableData = {
                ElemId?: number, //optional because it is not needed in the first row
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
            resourceTable.hiddenColumns = ['ElemId']

            //step 1: find all cost items ids related to all object of the selected category
            finder.create('COSTITEM_REL_CAT', [
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
            const costitem_rel_cat_result = await finder.list.get('COSTITEM_REL_CAT')?.test()
            for (const key in costitem_rel_cat_result) { //remove models if there is any founded cost item
                if (costitem_rel_cat_result[key] instanceof Set && costitem_rel_cat_result[key].size === 0) {
                    delete costitem_rel_cat_result[key];
                }
            }
            if (!costitem_rel_cat_result || Object.keys(costitem_rel_cat_result).length == 0) { //return the function if any cost item is found and print the message in the panel
                panelDown.innerHTML = `<bim-label style="padding:15px">Any COST ITEM related to ${category} category.</bim-label>`
                return
            }

            //step 2: get data of found cost items
            const filteredCostItems = await fragments.getData(costitem_rel_cat_result, {attributesDefault:true,relationsDefault:{attributes:true,relations:true}})

            //initialize some maps needed for the process
            const model_resources_Map: {[key:string]:{[key:number]:number}} = {} //map per each model
            const category_elements_map: {[key:string]:any} = {} //map to associate to each category the related elements
            const elem_resourcesDetails_Map: {[key:number]:{resourceUnitCost:string, elemQuantity:string, resourceDescription:string}[]} = {} //resource details object

            for (const [model,costItems] of Object.entries(filteredCostItems)){ //loop over each model
                let resourceCurrency = 'nd' //default value, here because is supposed that is used always the same currency in the same project
                const elem_resources_Map: {[key:number]:number} = {} //map to associate to each element id the related sum of ALL costs of the choosen resource category
                for (const ci of costItems) { //loop over each filtered cost item (cost items are not ordered)
                    // --> pay attention: multiple cost items could be related to the same object and moreover each cost item could have more than one unit cost of the same category
                    // example: one column with 5 cost items related and each cost item has 1,2,3 or more unit costs of the same category
                    const elemId = (((ci['Controls'] as any)[0] as FRAGS.ItemData)['_localId'] as FRAGS.ItemAttribute).value as number //localId of filtered elements
                    const elemName = (ci['Controls'] as any)[0]['Name'].value //name of the element
                    const elemCategory = (ci['Controls'] as any)[0]['_category'].value //category of the element
                    const elemQuantity = (ci['CostValues'] as any)[0]['UnitBasis'][0]['ValueComponent'].value //quantity of the element used to calculate its cost
                    const elemQuantityUnitMeasure = convertUnits((ci['CostValues'] as any)[0]['UnitBasis'][0]['UnitComponent'][0]['Name'].value) //quantity of the element used to calculate its cost
                    const priceAnalysisComponents = (ci['CostValues'] as any )[0]['Components'][0]['Components'] //components per each unit cost
                    
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
                    }
                    //it does not have any sense to add here object to organize elements because until the end of costitems loops could always be new cost items related to the same element
                }
                //step 3: organize elements by category in a new object
                // this map is needed only for creating the table
                for (const [elemId,resourceCost] of Object.entries(elem_resources_Map)){ //loop over each element id and its total resource cost
                    const item = await fragments.list.get(model)?.getItemsData([Number(elemId)])
                    if (!item) continue //checks if the item exists
                    const elemData = {
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
            }

            //step 5: create the table as:
            // category
            //    |--- elements
            //            |--- resources
            //initialize also NormalizedValue column which will be populated after
            for (const [cat,elements] of Object.entries(category_elements_map)) {
                const tempChildren = []
                for (const elem of elements) {
                    const tempResourceDetailsChildren = []
                    for (const resourceDetails of elem_resourcesDetails_Map[elem.elemId]){
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
                            ElemId: elem.elemId,
                            Name: elem.elemName,
                            ResourceCost: `${Math.round(elem.totalResourceCost*100)/100} ${elem.currency}`,
                            NormalizedValue: '',
                        },
                        children: tempResourceDetailsChildren
                    }
                    tempChildren.push(row)
                }
                resourceTable.data.push({
                    data: {
                        Name: cat,
                    },
                    children: tempChildren
                })
            }

            //step 6: highlight or color element
            await highlighter.clear() //reset previous selections of highlighter
            for (const [model,map] of Object.entries(model_resources_Map)){ //loop over each model, map=[element id : total resource cost]
                //step 6.1: normalize total resource cost to color
                const [colorMap, normalizedValues] = normalizeAndMapToColor(map) //use this function to normalize values between 0 and 1 and return color and normalized value

                //step 6.2: add the normalized value to the table, pay attention: it is only a render value, it will not be saved in the table
                resourceTable.dataTransform.NormalizedValue = (value, rowData) => {
                    const { ElemId } = rowData
                    if (!ElemId) return value //if ElemId is not defined, return the original value
                    return Math.round(normalizedValues[ElemId]*1000)/1000
                }

                //step 6.3: color or select elements
                for (const [elemId,value] of Object.entries(map)){ //getting elem ids from the map to highlight them
                    const modelIdMap: OBC.ModelIdMap = { [model]: new Set<number>([Number(elemId)]) } //create the model id map
                    if (btn == 'Color') { //if color button is clicked
                        const customHighlighterName = elemId //create a new selection with only related elements to associate a different color to each one
                        highlighter.styles.set(customHighlighterName, {
                            color: new THREE.Color(colorMap[elemId]),
                            opacity: 1,
                            transparent: false,
                            renderedFaces: 0,
                        });
                        highlighter.highlightByID(customHighlighterName,modelIdMap,true,false) //color elements using highlighter
                        resourceTable.dataTransform.ResourceCost = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
                            const { ElemId } = rowData
                            if (!ElemId) return value //if ElemId is not defined, return the original value
                            return BUI.html`
                            <bim-label style="color:${colorMap[ElemId]};">${value}</bim-label>
                            `
                        }
                    } else if (btn =='Select') { //if select button is clicked
                        highlighter.highlightByID("select", modelIdMap, false, false) //only select elements removing colors
                    }
                }
            }

            //step 7: create the panel component to show the table
            const categoryXResourcePanel = BUI.Component.create<BUI.Panel>(() => {
                //search text in table to filter in panel
                const onSearch = (e: Event) => {
                    const input = e.target as BUI.TextInput
                    resourceTable.queryString = input.value
                }
                //return the UI of the component
                return BUI.html`
                    <bim-panel
                        style="display:'flex', flex-direction:'column', gap:'10px', margin:'10px'">
                        <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                            <div style="display: flex; gap: 0.5rem;">
                                <bim-button @click=${(e:Event) => onExpandTable(e,resourceTable)} label=${resourceTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                                <bim-text-input 
                                    placeholder="Search..." 
                                    @input=${onSearch}
                                >
                                </bim-text-input>
                                <bim-button @click=${() => {onClearPanel(panelDown)}} label='Clear Panel' style="max-width:fit-content"></bim-button>
                            </div>
                            ${resourceTable ? resourceTable : 'Any resource cost found for this cateogory.'}
                        </div>
                    </bim-panel>
                `
            })
            //step 8: append the component to the down panel
            panelDown.appendChild(categoryXResourcePanel)
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
        // #endregion

        // #region GLOBAL VARIABLES
        // #endregion

        // #region ADVANCED COMPONENTS
        const modelsListPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [modelsList] = BUIC.tables.modelsList({
                components,
                metaDataTags: ["schema"],
                actions: { download: true },
            });
            return BUI.html`
                <bim-panel-section label='Loaded Models' icon="material-symbols:upload-rounded">
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
            const onSearch = (e: Event) => {
                const input = e.target as BUI.TextInput;
                spatialTree.queryString = input.value;
            };
            return BUI.html`
                <bim-panel-section label='Spatial Structure' icon="ri:node-tree">
                    <bim-text-input @input=${onSearch} placeholder="Search..." debounce="200"></bim-text-input>
                    ${spatialTree}
                </bim-panel-section>
            `
        })
        const propertiesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
                components,
                modelIdMap: {},
            });
            propertiesTable.preserveStructureOnFilter = true;
            propertiesTable.indentationInText = false;
            highlighter.events.select.onHighlight.add((modelIdMap) => {
                updatePropertiesTable({ modelIdMap });
            });
            highlighter.events.select.onClear.add(() =>
                updatePropertiesTable({ modelIdMap: {} }),
            );
            const onSearch = (e: Event) => {
                const input = e.target as BUI.TextInput;
                propertiesTable.queryString = input.value !== "" ? input.value : null
            };
            return BUI.html`
                <bim-panel-section label='Properties' icon="hugeicons:property-new">
                    <div style="display: flex; gap: 0.5rem;">
                        <bim-button @click=${(e:Event) => onExpandTable(e,propertiesTable)} label=${propertiesTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                        <bim-text-input @input=${onSearch} placeholder="Search..." debounce="200"></bim-text-input>
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
                    To select multiple elements let's separate guids with a comma
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
                (resource) => BUI.html`<bim-option label=${resource} style="padding:0 10px 0 10px" icon=${resourcesIcon[resource]}></bim-option>`
                )}
            </bim-dropdown>`,
        );
        //categories dropdown menu
        //capire come aggiungere tutte le categorie
        //const categories = await model.getCategories();
        const categories = ['IFCWALL','IFCCOLUMN','IFCWINDOW','IFCBUILDINGELEMENTPART', 'IFCBEAM']
        categories.sort() //sort categories
        const categoriesDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="categories" label='Category' icon='material-symbols:category-rounded' multiple>
                ${categories.map(
                (category) => BUI.html`<bim-option label=${category} style="padding:0 10px 0 10px"></bim-option>`,
                )}
            </bim-dropdown>`,
        );
        const colorResourcesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            return BUI.html`
                <bim-panel-section
                    label = "Cost Resources"
                    icon = "ic:round-format-color-fill">
                    ${resourcesDropdown}
                    ${categoriesDropdown}
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <bim-button label='Color' @click=${onColorByResource}></bim-button>
                        <bim-button label='Select' @click=${onColorByResource}></bim-button>                        
                    </div>
                </bim-panel-section>
            `
        })

        //append components in panels
        panelLeft.appendChild(modelsListPanelSection)
        panelLeft.appendChild(selectElementByGuidPanelSection)
        panelLeft.appendChild(spatialTreePanelSection)
        panelLeft.appendChild(propertiesPanelSection)
        panelLeft.appendChild(colorResourcesPanelSection)

        //advanced costs functions and components
        const onOpenElementXCostPanel = async () => {
            //clean panel
            panelDown.innerHTML = ''
            panelDown.label = 'Element X Costs Panel'

            //get selected elements
            const selection = highlighter.selection.select ? highlighter.selection.select : await getAllItems() //selection = selected items or all items
            const selectionData = await fragments.getData(selection, {
                        attributesDefault: true,
                        relationsDefault: {
                            attributes: true,
                            relations: true
                        }
                    })
            console.log('selection data: \n', selectionData)

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
                Name: string,
                Description: string,
                Cost: string,
                UnitCost: string,
                Quantity: string,
                ComponentsCostValues: any
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
            elementXcostTable.data = [{
                data: {
                    Name: '',
                    Description: '',
                    Cost: '',
                    UnitCost: '',
                    Quantity: '',
                    ComponentsCostValues: ''
                }
            }]
            elementXcostTable.data = []
            elementXcostTable.preserveStructureOnFilter = true
            elementXcostTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
            elementXcostTable.hiddenColumns = ['ComponentsCostValues']
            // #endregion

            //get cost data
            let itemName, itemIfcClass, costItemName, costItemDescription, costItemObjectType, costItemTotalCost, costItemUnitBasis, costItemUnitCost //initialize variables
            for (const [model,selectedItems] of Object.entries(selectionData)) { //loop over models of selected items
                for (const item of selectedItems) { //loop over selected items
                    try { //needed to skip potential errors and do not interrupt the loop over items
                        if (!item['HasAssignments']) continue //checks if item has assignments --> it could have also different assignments
                        //item identity data
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
                            for (const [b,costValue] of Object.entries(costItem['CostValues']) as any){ //technically it will be always one when inspecting cost item as total cost
                                //total cost of item
                                const costValueAppliedValue = costValue['AppliedValue'][0]['ValueComponent'].value ? costValue['AppliedValue'][0]['ValueComponent'].value : 'nd'
                                const costValueUnitComponent = costValue['AppliedValue'][0]['UnitComponent'][0]['Currency'].value ? costValue['AppliedValue'][0]['UnitComponent'][0]['Currency'].value : 'nd'
                                const currency = convertCurrency(costValueUnitComponent)
                                costItemTotalCost = row.data.Cost = `${Math.round(costValueAppliedValue*100)/100} ${currency}`
                                //quantity of item
                                const costValueUnitBasis = costValue['UnitBasis'][0]['ValueComponent'].value ? costValue['UnitBasis'][0]['ValueComponent'].value : 'nd'
                                const costValueUnitMeasure = costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value ? costValue['UnitBasis'][0]['UnitComponent'][0]['Name'].value : 'nd'
                                const unitMeasure = convertUnits(costValueUnitMeasure)
                                costItemUnitBasis = row.data.Quantity = `${Math.round(costValueUnitBasis*1000)/1000} ${unitMeasure}`
                                //unit cost of cost item
                                if (costValue['Components'][0]['Category'].value == 'Unit cost'){
                                    const costValueUnitCostAppliedValue = costValue['Components'][0]['AppliedValue'][0]['ValueComponent'].value ? costValue['Components'][0]['AppliedValue'][0]['ValueComponent'].value : 'nd'
                                    const costValueUnitCostUnitComponent = costValue['Components'][0]['AppliedValue'][0]['UnitComponent'][0]['Currency'].value ? costValue['Components'][0]['AppliedValue'][0]['UnitComponent'][0]['Currency'].value : 'nd'
                                    const currency = convertCurrency(costValueUnitCostUnitComponent)
                                    costItemUnitCost = row.data.UnitCost = `${Math.round(costValueUnitCostAppliedValue*100)/100} ${currency}/${unitMeasure}`
                                }
                                itemTotalCost += costValueAppliedValue
                                itemTotalCurrency = currency
                                row.data.ComponentsCostValues = costValue['Components'][0]['Components']
                            }
                            childrenTable.push(row)
                        }
                        
                        elementXcostTable.data.push({
                            data: {
                                Name: `[${itemIfcClass}] ${itemName}`,
                                Cost: `${Math.round(itemTotalCost*100)/100} ${itemTotalCurrency}`
                            },
                            children: [...childrenTable]
                        })
                        elementXcostTable.dataTransform.UnitCost = (value, rowData) => {
                            const { ComponentsCostValues, Name, Description, UnitCost } = rowData
                            return BUI.html`
                            <bim-button
                                label=${value}
                                @click=${() => {onOpenPriceAnalysis(ComponentsCostValues, Name, Description, UnitCost)}}
                                >
                            </bim-button>
                            `
                        }

                    } catch (error) {
                        console.warn(error)
                        continue //go to the next item of loop, do not interrupt the loop
                    }
                }
            }

            const elementXCostPanel = BUI.Component.create<BUI.Panel>(() => {
                //search text in table to filter in panel
                const onSearch = (e: Event) => {
                    const input = e.target as BUI.TextInput
                    elementXcostTable.queryString = input.value
                }

                return BUI.html`
                <bim-panel
                    style="display:'flex', flex-direction:'column', gap:'10px', margin:'10px'">
                    <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                        <div style="display: flex; gap: 0.5rem;">
                            <bim-button @click=${(e:Event) => onExpandTable(e,elementXcostTable)} label=${elementXcostTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                            <bim-text-input 
                                placeholder="Search..." 
                                @input=${onSearch}
                            >
                            </bim-text-input>
                            <bim-button @click=${() => {onClearPanel(panelDown)}} label='Clear Panel' style="max-width:fit-content"></bim-button>
                        </div>
                        ${elementXcostTable}
                    </div>
                </bim-panel>`
            })

            panelDown.appendChild(elementXCostPanel)
            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('down')){
                onSetLayout({target:'down'})
            }
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
                <bim-toolbar-section label="IFC">
                    <bim-button
                        label="Sample"
                        @click=${() => {
                            loadIfcFile("/assets/Sample elements with costs.ifc")
                            loadIfcFile("/assets/SFH_Single Family House.ifc")
                            }}>
                    </bim-button>
                    <bim-button
                        icon="tabler:cube-plus"
                        tooltip-title="IFC"
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
                        tooltip-title="Export"
                        icon="lucide:download"
                        @click=${onFragmentsExport}
                    ></bim-button>
                    <bim-button
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
                <bim-toolbar-section label="5D">
                    <bim-button
                        tooltip-title="Open cost assignment panel of selected elements - organized by element"
                        icon="tabler:home-dollar"
                        @click=${() => {console.log('TO DO ...')}}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Open cost assignment panel of selected elements - organized by cost item"
                        icon="tabler:filter-2-dollar"
                        @click=${onOpenElementXCostPanel}
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
        const stats = new Stats();
        stats.showPanel(2);
        document.body.append(stats.dom);
        stats.dom.style.left = "0px";
        stats.dom.style.zIndex = "unset";
        world.renderer.onBeforeUpdate.add(() => stats.begin());
        world.renderer.onAfterUpdate.add(() => stats.end());
    }

    // #region FINAL PART
    React.useEffect(() => {
        setViewer() //set the viewer
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