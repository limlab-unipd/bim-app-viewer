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
        // #region SET THREE VIEWER
        //VIEWER COMPONENT
        const worlds = components.get(OBC.Worlds)
        const finder = components.get(OBC.ItemsFinder)
        const highlighter = components.get(OBCF.Highlighter)
        const ifcLoader = components.get(OBC.IfcLoader)
        const fragments = components.get(OBC.FragmentsManager)

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
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('#1C1C1C')

        components.get(OBC.Raycasters).get(world);

        // #region COPONENTS GENERAL SETUP
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
        });
        /*highlighter.events.select.onHighlight.add(async (modelIdMap) => { //event triggered on element selection
            const promises = [];
            for (const [modelId, localIds] of Object.entries(modelIdMap)) {
                const model = fragments.list.get(modelId);
                if (!model) continue;
                promises.push(model.getItemsData([...localIds]));
            }
            const data = (await Promise.all(promises)).flat();
            console.log(data);
        });*/

        await ifcLoader.setup({
            autoSetWasm: false,
            wasm: {
                path: "https://unpkg.com/web-ifc@0.0.69/",
                absolute: true,
            },
        });
        const githubUrl ="./node_modules/@thatopen/fragments/dist/Worker/worker.mjs";
        const fetchedUrl = await fetch(githubUrl);
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
                        WEBIFC.IFCCONTEXTDEPENDENTUNIT
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

        // download fragment files
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
        const onFragmentsPrint = async () => {
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
        const onColorByResource = async () => {
            const [resource] = resourcesDropdown.value
            const [category] = categoriesDropdown.value as string[]
            if (!resource || !category) return
            
            //highlight category
            const customHighlighterName = "Red";
            highlighter.styles.set(customHighlighterName, {
            color: new THREE.Color("red"),
            opacity: 1,
            transparent: false,
            renderedFaces: 0,
            });

            //all the cost values
            const catModIdMap: OBC.ModelIdMap = {}
            for (const [key,model] of fragments.list.entries()){
                const catLocalIds = await model.getItemsOfCategories([new RegExp(`^${category}$`)])
                const cvLocalIds = await model.getItemsOfCategories([/COSTVALUE/])
                
                const singleFrMap: OBC.ModelIdMap = { //items of category
                    [key] : new Set<number>([...catLocalIds[category]])
                }
                Object.assign(catModIdMap, singleFrMap)
                
                const data = await model.getItemsData(cvLocalIds['IFCCOSTVALUE'], { //data of all cost values
                    attributesDefault: true,
                    relationsDefault: {attributes:true,relations:true}
                })                
                console.log('all cost values \n', data)

                highlighter.highlightByID(customHighlighterName,catModIdMap,true,false)
            }

            //filtered cost values by resource (Category attribute)
            finder.create("colorByResource", [
                {
                    categories: [/COSTVALUE/],
                    attributes: { queries: [{ name: /Category/, value: new RegExp(`^${resource}$`) }] }
                },
            ]);
            const result = await finder.list.get('colorByResource')?.test()
            if (!result) return
            const filteredCostValues = await fragments.getData(
                result,
                {
                    attributesDefault:true,
                    relationsDefault:{attributes:true,relations:true}
                    }
                )
            console.log('filtered cost values\n', filteredCostValues)
            
        }
        const onOpenPriceAnalysis = (resourcesCostValues: any, unitCostName:any, unitCostDescription: any, unitCost: any) => {
            //aggiungere if se non sono presenti components
            console.log('resourcesCostValues: ', resourcesCostValues)
            console.log('unitCostName: ', unitCostName)
            console.log('unitCostDescription: ', unitCostDescription)
            console.log('unitCost: ', unitCost)
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
                style="background-color:rgba(0,0,0,0.85);">
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
            const onExpandTable = (e: Event) => {
                const button = e.target as BUI.Button;
                propertiesTable.expanded = !propertiesTable.expanded;
                button.label = propertiesTable.expanded ? "Collapse" : "Expand";
            };
            return BUI.html`
                <bim-panel-section label='Properties' icon="hugeicons:property-new">
                    <div style="display: flex; gap: 0.5rem;">
                        <bim-button @click=${onExpandTable} label=${propertiesTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
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
            //not used in the viewer
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
        const resources: string[] = ['Labor','Equipment','Material']
        const resourcesIcon: {[key:string]:string} = {
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
        const categories = ['IFCWALL','IFCCOLUMN','IFCWINDOW','IFCBUILDINGELEMENTPART']
        const categoriesDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="categories" label='Category' icon='material-symbols:category-rounded'>
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
                    <bim-button label='Color' @click=${onColorByResource}>
                    </bim-button>
                </bim-panel-section>
            `
        })

        //append components in panels
        panelLeft.appendChild(modelsListPanelSection)
        panelLeft.appendChild(selectElementByGuidPanelSection)
        panelLeft.appendChild(spatialTreePanelSection)
        panelLeft.appendChild(propertiesPanelSection)
        panelLeft.appendChild(colorResourcesPanelSection)

        const onOpenCostXElementPanel = async () => {
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
                        elementXcostTable.hiddenColumns = ['ComponentsCostValues']

                    } catch (error) {
                        console.warn(error)
                        continue //go to the next item of loop, do not interrupt the loop
                    }
                }
            }

            const costXElementPanelSection = BUI.Component.create<BUI.Panel>(() => {
                //search text in table to filter in panel
                const onSearch = (e: Event) => {
                    const input = e.target as BUI.TextInput
                    elementXcostTable.queryString = input.value
                }

                return BUI.html`
                <bim-panel
                    style="display:'flex', flex-direction:'column', gap:'10px', margin:'10px'">
                    <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                        <bim-text-input 
                            placeholder="Search..." 
                            @input=${onSearch}
                        >
                        </bim-text-input>
                        ${elementXcostTable}
                    </div>
                </bim-panel>`
            })
            panelDown.appendChild(costXElementPanelSection)
            onSetLayout({target:'down'})
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
                            //loadIfcFile("/assets/SFH_Single Family House.ifc")
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
                    ></bim-button>
                    <bim-button
                        tooltip-title="Open cost assignment panel of selected elements - organized by cost item"
                        icon="tabler:filter-2-dollar"
                        @click=${onOpenCostXElementPanel}
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
                "panelLeft panelDown panelRight" ${panelDownHeight}
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
        //setupUI() //setup the UI of the viewer
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