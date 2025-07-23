import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
//import * as FRAGS from '@thatopen/fragments'
import * as BUIC from '@thatopen/ui-obc'
//import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'

export function MainViewer () {

    // #region GENERAL START
    BUI.Manager.init()
    const components = new OBC.Components()
    // #endregion
    
    const setViewer = async () => {
        // #region SET THREE VIEWER
        //VIEWER COMPONENT
        const worlds = components.get(OBC.Worlds)
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
        const highlighter = components.get(OBCF.Highlighter);
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
        highlighter.events.select.onHighlight.add(async (modelIdMap) => { //event triggered on element selection
            console.log("Something was selected");
            const promises = [];
            console.log('modelidmap',modelIdMap)
            for (const [modelId, localIds] of Object.entries(modelIdMap)) {
                const model = fragments.list.get(modelId);
                if (!model) continue;
                promises.push(model.getItemsData([...localIds]));
                console.log('model',model)
            }
            const data = (await Promise.all(promises)).flat();
            console.log(data);
        });

        const ifcLoader = components.get(OBC.IfcLoader)
        await ifcLoader.setup({
            autoSetWasm: false,
            wasm: {
                path: "https://unpkg.com/web-ifc@0.0.69/",
                absolute: true,
            },
        });
        const githubUrl ="https://thatopen.github.io/engine_fragment/resources/worker.mjs";
        const fetchedUrl = await fetch(githubUrl);
        const workerBlob = await fetchedUrl.blob();
        const workerFile = new File([workerBlob], "worker.mjs", {
            type: "text/javascript",
        });
        const workerURL = URL.createObjectURL(workerFile);
        const fragments = components.get(OBC.FragmentsManager);
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
            await ifcLoader.load(buffer, false, name);
        };
        
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
                    
                    const startTime = performance.now(); // Start timer
                    await loadIfcFile(url);
                    const endTime = performance.now(); // End timer
                    const loadTime = ((endTime - startTime) / 1000).toFixed(2); // seconds
                    console.log(`IFC loaded in ${loadTime} seconds`);

                    target.loading = false; // Set loading state
                    
                    URL.revokeObjectURL(url);
                }
            };
            input.click();
        }
        // #endregion

        // #region UI PANELS   
        const panelLeft = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="PROPERTIES PANEL"
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

        // #region METHOD TO SETUP THE UI OF THE VIEWER (ex. setupUI method)
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
        panelLeft.appendChild(modelsListPanelSection)
        panelLeft.appendChild(spatialTreePanelSection)
        panelLeft.appendChild(propertiesPanelSection)
        
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
            const onSetLayout = ({target}:{target:BUI.Button}) => {
                const btn = target.id
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
                <bim-toolbar-section label="Load">
                    <bim-button
                        label="Sample"
                        @click=${() => {loadIfcFile("/assets/Sample elements with costs.ifc")}}>
                    </bim-button>
                    <bim-button
                        icon="tabler:cube-plus"
                        tooltip-title="IFC"
                        @click=${onLoadIfc}>
                    </bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })

        const left_right = {
                template: `
                    "panelLeft toolbar panelRight" auto
                    "panelLeft empty panelRight" 1fr
                    /20% 1fr 20%
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
                    "panelLeft panelDown" 20%
                    /20% 1fr
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
                    "panelDown panelRight" 20%
                    /1fr 20%
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
                "panelLeft panelDown panelRight" 20%
                /20% 1fr 20%
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
                    /20% 1fr
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
                    /1fr 20%
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
                    "panelDown" 20%
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
        setViewer() //set the viewer
        //setupUI() //setup the UI of the viewer
        return () => {
            if (components) {
                components.dispose()
            }
        }
    }, [])

    return( //return the whole BIM viewer component
        <bim-viewport
            id="main-viewer"
            className="viewer"
        />
    )
    // #endregion
}